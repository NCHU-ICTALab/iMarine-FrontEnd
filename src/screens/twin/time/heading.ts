/* 停船朝向穩定化（spec: docs/superpowers/specs/2026-07-14-twin-heading-follow-design.md §1）。
   載入時逐軌跡預算「逐點穩定朝向 + 靠泊鎖定」：停止點沿用最後移動航向（開頭就停的
   回填第一段移動航向），停止且貼碼頭的點鎖碼頭切線（取不掉頭的方向）。任一時刻的
   朝向是 tMs 的純函式 → scrub 亂跳/倒轉/重播完全一致。
   世界朝向慣例：h = atan2(dz,dx)（North=-z, East=+x）；AIS headingDeg(0=N,順時針)
   → atan2(-cosθ, sinθ)，與 scene-init updateShips 原轉換一致。 */
import type { AisPathPoint } from '../data/ais';

export interface HeadingAux {
  /** 每 path 點的世界朝向（rad，footprint 長軸方向） */
  stableHeadingRad: Float32Array;
  /** 每 path 點是否靠泊鎖定（停止且貼近碼頭） */
  berthLocked: Uint8Array;
}

export interface StabilizeOpts {
  toWorld(lat: number, lon: number): { x: number; z: number };
  /** 最近碼頭切線（世界 rad，無向 ±π）與垂距（世界單位） */
  nearestPier(x: number, z: number): { headingRad: number; distU: number };
  pierSnapMaxU: number;  // 靠泊鎖定的碼頭距離門檻（世界單位）
  worldScale: number;    // 世界單位/公尺
  stopKn?: number;       // 停止門檻（節，預設 0.5）
}

const KN_TO_MPS = 0.514444;
const TAU = Math.PI * 2;

/** Shortest-arc angular interpolation in radians. */
export function lerpAngleRad(a: number, b: number, t: number): number {
  const d = ((b - a + Math.PI * 3) % TAU) - Math.PI;
  return a + d * t;
}

/** AIS headingDeg（0=N，順時針）→ 世界朝向 rad。 */
export function aisDegToWorldRad(deg: number): number {
  const th = (deg * Math.PI) / 180;
  return Math.atan2(-Math.cos(th), Math.sin(th));
}

/** 無向切線 ±π 消歧：取與 refRad 夾角較小的方向（靠泊對齊不掉頭）。回傳正規化到 (-π, π]。 */
export function alignTangent(tangentRad: number, refRad: number): number {
  const d = Math.abs(((refRad - tangentRad + Math.PI * 3) % TAU) - Math.PI);
  const h = d <= Math.PI / 2 ? tangentRad : tangentRad + Math.PI;
  return Math.atan2(Math.sin(h), Math.cos(h));
}

export function stabilizeTrackHeadings(path: AisPathPoint[], opts: StabilizeOpts): HeadingAux {
  const n = path.length;
  const stable = new Float32Array(n);
  const locked = new Uint8Array(n);
  if (n === 0) return { stableHeadingRad: stable, berthLocked: locked };
  const stopMps = (opts.stopKn ?? 0.5) * KN_TO_MPS;

  const w = path.map((p) => opts.toWorld(p[0], p[1]));
  // 每段：世界方位 + 是否移動（段速 ≥ 門檻）
  const segH = new Float32Array(Math.max(0, n - 1));
  const segMoving: boolean[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = w[i + 1].x - w[i].x, dz = w[i + 1].z - w[i].z;
    const distM = Math.hypot(dx, dz) / opts.worldScale;
    const dtS = Math.max(1e-3, (path[i + 1][2] - path[i][2]) / 1000);
    segMoving.push(distM / dtS >= stopMps);
    segH[i] = Math.atan2(dz, dx);
  }
  // 點級動靜：任一相鄰段在動即為移動（邊界點看單側）
  const ptMoving = (i: number): boolean =>
    (i > 0 ? segMoving[i - 1] : false) || (i < n - 1 ? segMoving[i] : false);
  // 移動點朝向：AIS heading 優先；否則取「相鄰的移動段」方位——「移動→停止」邊界點的
  // 下一段已是抖動段，其方位是垃圾值，必須偏好在動的那一段。
  const movingH = (i: number): number => {
    if (path[i][3] >= 0) return aisDegToWorldRad(path[i][3]);
    if (i < n - 1 && segMoving[i]) return segH[i];
    if (i > 0 && segMoving[i - 1]) return segH[i - 1];
    return segH[Math.min(i, n - 2)];
  };

  let firstMoving = -1;
  for (let i = 0; i < n; i++) if (ptMoving(i)) { firstMoving = i; break; }
  if (firstMoving < 0) {
    // 全程沒動：AIS heading（第一個有效）→ 否則碼頭切線（無參考、原樣採用）
    let h: number | null = null;
    for (const p of path) if (p[3] >= 0) { h = aisDegToWorldRad(p[3]); break; }
    stable.fill(h ?? opts.nearestPier(w[0].x, w[0].z).headingRad);
  } else {
    let last = Number.NaN;
    for (let i = 0; i < n; i++) {
      if (ptMoving(i)) { last = movingH(i); stable[i] = last; }
      else stable[i] = Number.isNaN(last) ? movingH(firstMoving) : last; // 開頭停 → 回填
    }
  }
  // 停止且貼碼頭 → 鎖切線（消歧取不掉頭方向）
  for (let i = 0; i < n; i++) {
    if (firstMoving >= 0 && ptMoving(i)) continue;
    const np = opts.nearestPier(w[i].x, w[i].z);
    if (np.distU < opts.pierSnapMaxU) { locked[i] = 1; stable[i] = alignTangent(np.headingRad, stable[i]); }
  }
  return { stableHeadingRad: stable, berthLocked: locked };
}

/** 夾住 tMs 的左端點 index 與插值比例（與 positionAt 同走法）；範圍外 → null。 */
function bracket(path: AisPathPoint[], tMs: number): { i: number; f: number } | null {
  const n = path.length;
  if (n === 0) return null;
  if (n === 1) return tMs === path[0][2] ? { i: 0, f: 0 } : null;
  if (tMs < path[0][2] || tMs > path[n - 1][2]) return null;
  let i = 0;
  while (i < n - 2 && path[i + 1][2] < tMs) i++;
  const span = path[i + 1][2] - path[i][2];
  return { i, f: span > 0 ? (tMs - path[i][2]) / span : 0 };
}

/** tMs 時刻的世界朝向（最短弧插值）；超出軌跡範圍 → null。 */
export function headingAt(path: AisPathPoint[], aux: HeadingAux, tMs: number): number | null {
  const b = bracket(path, tMs);
  if (!b) return null;
  if (path.length === 1) return aux.stableHeadingRad[0];
  return lerpAngleRad(aux.stableHeadingRad[b.i], aux.stableHeadingRad[b.i + 1], b.f);
}

/** tMs 時刻是否靠泊鎖定（取較近的 path 點旗標）；超出範圍 → false。 */
export function berthLockedAt(path: AisPathPoint[], aux: HeadingAux, tMs: number): boolean {
  const b = bracket(path, tMs);
  if (!b) return false;
  if (path.length === 1) return aux.berthLocked[0] === 1;
  return aux.berthLocked[b.f < 0.5 ? b.i : b.i + 1] === 1;
}
