# Twin 停船朝向穩定化 + 船隻跟隨模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修掉 twin 頁停船（泊位/錨地）原地打轉，並新增 Cities: Skylines 式船隻跟隨相機（同船再點一次進入、Esc/點空白/點別船退出）。

**Architecture:** 載入時對每條 AIS 軌跡預算「逐點穩定朝向 + 靠泊鎖定」（純函式，任一時刻朝向是 tMs 的確定性函式），`updateShips` 改查表；跟隨模式全部做在 `src/screens/twin/` 層（engine 已暴露 `camera3D`/`controls.target`/`addUpdate()`），每幀把 target 與相機等量平移到船位、不覆蓋使用者環繞/縮放。

**Tech Stack:** Vite + vanilla TS、three.js（OrbitControls）、vitest。spec：`docs/superpowers/specs/2026-07-14-twin-heading-follow-design.md`。

## Global Constraints

- **禁止**改 `src/twin-engine/`（vendored 上游資產）。
- **禁止**順手清理/型別補強/typo 修正無關程式碼（CLAUDE.md CORE RULE）；**禁止** emoji。
- 註解風格照現有檔案：繁中 + 英文術語，密度比照周邊程式碼。
- Commit：訊息**不加任何 Claude/Anthropic 署名**；依 CLAUDE.md，commit 前需使用者同意（執行 session 開始時確認一次性授權即可；未授權則以「待 commit」狀態交付並在報告註明）。
- 世界座標慣例（`geo/projection.ts`）：**North = -z、East = +x**；世界朝向 `h = atan2(dz, dx)`；AIS headingDeg（0=N 順時針）→ `h = atan2(-cosθ, sinθ)`（與 `updateShips` 原轉換一致）。
- 本資料源（MPB feed）**無 AIS heading**（`path[i][3]` 恆為 -1），heading 分支仍要實作（契約如此）但主路徑是點間方位角。
- 既有常數重用：`STATIONARY_U`、`PIER_SNAP_MAX`（300m）、`WORLD_SCALE`（0.025）、`S = WORLD_SCALE/0.01`。
- 驗收基線：`npm run check`（tsc 0 + vitest 全綠 + build ok）；改動前 vitest 為 29 檔 143 tests。

---

### Task 1: `heading.ts` 純函式（穩定化預算 + 查詢）— TDD

**Files:**
- Create: `src/screens/twin/time/heading.ts`
- Test: `tests/twin-heading.test.ts`

**Interfaces:**
- Consumes: `AisPathPoint`（`src/screens/twin/data/ais.ts`：`[lat, lon, tMs, hdgDeg]`，hdg 缺 = -1）。
- Produces（Task 2/3 依賴，簽名固定）:
  - `interface HeadingAux { stableHeadingRad: Float32Array; berthLocked: Uint8Array }`
  - `interface StabilizeOpts { toWorld(lat,lon):{x,z}; nearestPier(x,z):{headingRad,distU}; pierSnapMaxU:number; worldScale:number; stopKn?:number }`
  - `stabilizeTrackHeadings(path: AisPathPoint[], opts: StabilizeOpts): HeadingAux`
  - `headingAt(path, aux, tMs): number | null`（世界 rad；超出軌跡範圍 → null）
  - `berthLockedAt(path, aux, tMs): boolean`
  - 輔助（也 export 供測試）：`lerpAngleRad(a,b,t)`、`aisDegToWorldRad(deg)`、`alignTangent(tangentRad, refRad)`

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/twin-heading.test.ts
import { describe, it, expect } from 'vitest';
import {
  stabilizeTrackHeadings, headingAt, berthLockedAt,
  lerpAngleRad, aisDegToWorldRad, alignTangent,
} from '../src/screens/twin/time/heading';
import type { AisPathPoint } from '../src/screens/twin/data/ais';

// 測試投影：1 世界單位 = 1 公尺；lat/lon 直接當公尺用（North=-z, East=+x）
const toWorld = (lat: number, lon: number) => ({ x: lon, z: -lat });
const farPier = () => ({ headingRad: 0, distU: Infinity });
const OPTS = { toWorld, nearestPier: farPier, pierSnapMaxU: 150, worldScale: 1 };
const MIN = 60_000;
// path 建構器：[北向公尺, 東向公尺, 分鐘, hdgDeg]
const P = (n: number, e: number, min: number, hdg = -1): AisPathPoint => [n, e, min * MIN, hdg];

describe('twin heading 穩定化（純函式）', () => {
  it('aisDegToWorldRad：0°(北)→-π/2、90°(東)→0', () => {
    expect(aisDegToWorldRad(0)).toBeCloseTo(-Math.PI / 2, 6);
    expect(aisDegToWorldRad(90)).toBeCloseTo(0, 6);
  });
  it('lerpAngleRad 走最短弧（跨 ±π）', () => {
    expect(Math.cos(lerpAngleRad(Math.PI - 0.1, -Math.PI + 0.1, 0.5))).toBeCloseTo(-1, 6);
  });
  it('alignTangent：與參考夾角 >90° 時翻轉 180°', () => {
    expect(Math.cos(alignTangent(Math.PI, 0))).toBeCloseTo(1, 6);   // π vs 0 → 翻成 0(≡2π)
    expect(alignTangent(Math.PI / 6, 0)).toBeCloseTo(Math.PI / 6, 6); // 30° ≤ 90° → 保留
  });

  it('錨地抖動：停止段保持進來的航向（不再逐點亂轉）', () => {
    // 東行 60m/min(≈1.94kn) 3 段 → 之後 ±2m 抖動（0.02m/s，停止）
    const path = [
      P(0, 0, 0), P(0, 60, 1), P(0, 120, 2), P(0, 180, 3),
      P(2, 181, 4), P(-1, 179, 5), P(1, 182, 6), P(-2, 180, 7),
    ];
    const aux = stabilizeTrackHeadings(path, OPTS);
    // 進來航向 = 正東 = 世界 rad 0
    for (const min of [4, 4.5, 5, 6, 6.9]) {
      expect(headingAt(path, aux, min * MIN)).toBeCloseTo(0, 4);
    }
    expect(berthLockedAt(path, aux, 5 * MIN)).toBe(false); // 離碼頭遠 → 不鎖泊
  });

  it('近碼頭停止：鎖碼頭切線，且取不掉頭的方向', () => {
    // 進來正東(0)；碼頭切線給 π（無向）→ 應翻成 0
    const nearPier = () => ({ headingRad: Math.PI, distU: 50 });
    const path = [
      P(0, 0, 0), P(0, 60, 1), P(0, 120, 2),
      P(1, 121, 3), P(-1, 120, 4), P(0, 122, 5),
    ];
    const aux = stabilizeTrackHeadings(path, { ...OPTS, nearestPier: nearPier });
    expect(headingAt(path, aux, 4 * MIN)).toBeCloseTo(0, 4);
    expect(berthLockedAt(path, aux, 4 * MIN)).toBe(true);
    expect(berthLockedAt(path, aux, 0.5 * MIN)).toBe(false); // 移動段不鎖
  });

  it('移動段：AIS heading 優先，缺則點間方位角', () => {
    // 位移朝北（bearing 北 → 世界 -π/2），但 AIS hdg=90(東) → 應採 AIS → 0
    const withHdg = [P(0, 0, 0, 90), P(60, 0, 1, 90), P(120, 0, 2, 90)];
    const auxH = stabilizeTrackHeadings(withHdg, OPTS);
    expect(headingAt(withHdg, auxH, 1 * MIN)).toBeCloseTo(0, 4);
    const noHdg = [P(0, 0, 0), P(60, 0, 1), P(120, 0, 2)];
    const auxB = stabilizeTrackHeadings(noHdg, OPTS);
    expect(headingAt(noHdg, auxB, 1 * MIN)).toBeCloseTo(-Math.PI / 2, 4);
  });

  it('開頭就停：回填第一段移動航向', () => {
    const path = [P(0, 0, 0), P(1, 1, 1), P(0, 0, 2), P(60, 0, 3), P(120, 0, 4)]; // 先抖 2 分鐘再北行
    const aux = stabilizeTrackHeadings(path, OPTS);
    expect(headingAt(path, aux, 0.5 * MIN)).toBeCloseTo(-Math.PI / 2, 4);
  });

  it('確定性 + 範圍外 null', () => {
    const path = [P(0, 0, 0), P(0, 60, 1), P(1, 61, 2), P(0, 60, 3)];
    const aux = stabilizeTrackHeadings(path, OPTS);
    expect(headingAt(path, aux, 2.5 * MIN)).toBe(headingAt(path, aux, 2.5 * MIN));
    expect(headingAt(path, aux, -MIN)).toBeNull();
    expect(headingAt(path, aux, 10 * MIN)).toBeNull();
    expect(berthLockedAt(path, aux, 10 * MIN)).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/twin-heading.test.ts`
Expected: FAIL（Cannot find module '../src/screens/twin/time/heading'）

- [ ] **Step 3: 實作 `heading.ts`**

```ts
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
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/twin-heading.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 5: 全量測試無回歸**

Run: `npx vitest run`
Expected: 30 檔 151 tests 全綠（基線 29/143 + 本檔 8）

- [ ] **Step 6: Commit（依 Global Constraints 的授權規則）**

```bash
git add src/screens/twin/time/heading.ts tests/twin-heading.test.ts
git commit -m "feat(twin): 停船朝向穩定化純函式——逐點預算+靠泊鎖定+最短弧查詢"
```

---

### Task 2: scene-init 接線（朝向查表 + pickShipAt 增強）

**Files:**
- Modify: `src/screens/twin/scene-init.ts`
  - 模組層 `trackMeta` 迴圈區（約 91-106 行）
  - `ShipPickInfo` 介面（約 38-44 行）
  - `updateShips` 朝向分支（約 183-187 行）
  - `pickShipAt` 狀態判定（約 484-500 行）
  - `__twin` debug handles（約 397-412 行）

**Interfaces:**
- Consumes（Task 1）: `stabilizeTrackHeadings` / `headingAt` / `berthLockedAt` / `HeadingAux`。
- Produces（Task 3/4 依賴）:
  - `ShipPickInfo` 新增 `mmsi: string` 欄位。
  - 模組層 `const trackByMmsi: Map<string, AisTrack>`、`const headingAux: Map<string, HeadingAux>`（initTwinScene 閉包內可用）。
  - `__twin.headingAux` 與 `__twin.headingAtOf(mmsi, tMs)`（Task 5 headless 驗證用）。

- [ ] **Step 1: 模組層預算 headingAux + trackByMmsi**

import 區加：

```ts
import { stabilizeTrackHeadings, headingAt, berthLockedAt, type HeadingAux } from './time/heading';
```

`trackMeta` 迴圈（91-106 行）改為（**移除** `pierAligned`/`pierH` 欄位與 `STATIONARY_U`、`stationary`、`np` 的計算——逐點預算取代整段一刀切；`PIER_SNAP_MAX` 與 `nearestPierTangent`、`pierSegs` 保留給 headingAux 用）：

```ts
// Per-track 預算快取(類別 / TWPort join)—— 靜態資料不該每幀重算(M1)。
// 朝向改由 headingAux 逐點預算（見下），不再整段一刀切。
interface TrackMeta { category: ShipCategory; vessel: VesselRecord | null; }
const trackMeta = new Map<string, TrackMeta>();
const PIER_SNAP_MAX = 300 * WORLD_SCALE; // 靠泊船離最近碼頭 < 300m 才對齊朝向;更遠(錨地)維持航向、不亂指
for (const t of tracks) {
  trackMeta.set(t.mmsi, { category: categoryForTrack(t, allVessels), vessel: joinTwport(t, allVessels) });
}
const trackByMmsi = new Map(tracks.map((t) => [t.mmsi, t] as const));

// 逐點穩定朝向 + 靠泊鎖定預算（修停船原地打轉；spec 2026-07-14）。
const headingAux = new Map<string, HeadingAux>();
for (const t of tracks) {
  headingAux.set(t.mmsi, stabilizeTrackHeadings(t.path, {
    toWorld: (lat, lon) => proj.toWorld(lat, lon),
    nearestPier: (x, z) => nearestPierTangent(x, z, pierSegs),
    pierSnapMaxU: PIER_SNAP_MAX,
    worldScale: WORLD_SCALE,
  }));
}
```

注意：原 `STATIONARY_U` 常數（95 行）一併移除（唯一用途是被取代的 `stationary` 判定）。

- [ ] **Step 2: `updateShips` 朝向改查表**

183-187 行的朝向分支：

```ts
      // 朝向:靠泊船對齊最近碼頭線(L2);移動船用 AIS heading/COG 近似(此 feed 無 heading →
      // positionAt 回傳點間方位角)。heading(0=N,順時針)→ footprint headingRad,長軸對齊 (sinθ,-cosθ)。
      let h: number;
      if (meta.pierAligned) h = meta.pierH;
      else { const theta = rp.headingDeg * Math.PI / 180; h = Math.atan2(-Math.cos(theta), Math.sin(theta)); }
```

改為：

```ts
      // 朝向:載入時預算的逐點穩定朝向(停船不再抖動;靠泊段已鎖碼頭切線)。rp 非 null
      // 保證 tMs 在軌跡範圍內,headingAt 不會回 null;?? 0 僅為型別安全。
      const h = headingAt(t.path, headingAux.get(t.mmsi)!, tMs) ?? 0;
```

- [ ] **Step 3: `ShipPickInfo` 加 mmsi、`pickShipAt` 改逐時刻狀態**

介面（38-44 行）：

```ts
export interface ShipPickInfo {
  mmsi: string;
  name: string;
  category: ShipCategory;
  catIndex: number;
  state: string;              // '靠泊 · N 泊位' | '錨泊 · 待泊' | '航行中'
  speedKn: number;
}
```

`pickShipAt` 尾段（493-500 行）：

```ts
    const state = meta.pierAligned
      ? `靠泊 · ${vessel?.berthNo != null ? vessel.berthNo + ' 泊位' : '碼頭'}`
      : speedKn < 0.5 ? '錨泊 · 待泊' : '航行中';
    return {
      name: vessel?.nameZh || track.name || '未識別船舶',
      category: meta.category, catIndex: SHIP_CATEGORIES.indexOf(meta.category),
      state, speedKn,
    };
```

改為：

```ts
    const locked = berthLockedAt(track.path, headingAux.get(track.mmsi)!, currentMs);
    const state = locked
      ? `靠泊 · ${vessel?.berthNo != null ? vessel.berthNo + ' 泊位' : '碼頭'}`
      : speedKn < 0.5 ? '錨泊 · 待泊' : '航行中';
    return {
      mmsi: track.mmsi,
      name: vessel?.nameZh || track.name || '未識別船舶',
      category: meta.category, catIndex: SHIP_CATEGORIES.indexOf(meta.category),
      state, speedKn,
    };
```

- [ ] **Step 4: `__twin` debug handles 補驗證鉤子**

`(window as any).__twin = {` 物件內（397 行起）`trackMeta,` 之後加：

```ts
    headingAux,
    headingAtOf: (mmsi: string, tMs: number) => {
      const t = trackByMmsi.get(mmsi); const a = headingAux.get(mmsi);
      return t && a ? headingAt(t.path, a, tMs) : null;
    },
```

- [ ] **Step 5: 三綠燈**

Run: `npm run check`
Expected: tsc 0（`pierAligned`/`pierH`/`STATIONARY_U` 引用已全數移除）、vitest 30 檔 151 tests 全綠（`twin-scene.test.ts` 只用模組層純資料 API，不受影響）、build ok。

- [ ] **Step 6: Commit**

```bash
git add src/screens/twin/scene-init.ts
git commit -m "feat(twin): updateShips 朝向改查穩定化預算——修停船原地打轉"
```

---

### Task 3: scene-init 跟隨模式（follow / unfollow + 每幀鎖定）

**Files:**
- Modify: `src/screens/twin/scene-init.ts`
  - `TwinScene` 介面（約 46-53 行）
  - `flyTo`（約 427 行）首行加 `unfollow()`
  - `flyTo` 定義之後、`setDensity` 之前插入跟隨區塊
  - return 物件（最末行）

**Interfaces:**
- Consumes: Task 2 的 `trackByMmsi`；既有 `positionAt`、`proj`、`ctrl`（OrbitControls，約 415 行）、`engine.addUpdate`、`engine.camera3D`、`prefersReduced`、`TYPE_DIMS_M`、`filter`、`currentMs`、`S`。
- Produces（Task 4 依賴）:
  - `TwinScene.follow(mmsi: string, onEnd?: () => void): void` — 進場 tween 後每幀鎖定；**無法跟隨（找不到船/當前時刻無資料/無 controls）時立即呼叫 `onEnd` 並返回**。
  - `TwinScene.unfollow(): void` — 冪等；結束跟隨並觸發 `onEnd`。
  - 自動退出（內部呼叫 `unfollow`）：船在 currentMs 無軌跡資料、該船種被篩掉。

- [ ] **Step 1: `TwinScene` 介面加兩方法**

```ts
export interface TwinScene {
  engine: LidarEngine;                       // .start()/.pause()/.resize()/.dispose()
  refresh(tMs: number): void;                // 回放 scrub（updateShips + 記錄 currentMs）
  setFilter(enabled: Set<ShipCategory>): void;
  setDensity(on: boolean): void;
  flyTo(preset: ViewPreset): void;
  pickShipAt(clientX: number, clientY: number): ShipPickInfo | null;
  follow(mmsi: string, onEnd?: () => void): void;
  unfollow(): void;
}
```

- [ ] **Step 2: `flyTo` 開頭退出跟隨（視角預設鈕的退出不變式收在 scene 層）**

```ts
  function flyTo(preset: ViewPreset): void {
    unfollow();
    const to = PRESETS[preset];
    ...
```

- [ ] **Step 3: 跟隨實作（插在 flyTo 區塊之後）**

```ts
  // ── 船隻跟隨（Cities: Skylines 式;spec 2026-07-14 §2）──
  // 進場:重用 flyTo 的 650ms ease tween,終點每幀追船的當下位置。之後每幀把
  // controls.target 與相機「等量平移」到船位——使用者的環繞角度/縮放距離不被覆蓋。
  let followMmsi: string | null = null;
  let followEnd: (() => void) | null = null;
  let followTween = 0; // rAF id;>0 表示進場 tween 中

  function shipWorldAt(mmsi: string, tMs: number): { x: number; z: number } | null {
    const t = trackByMmsi.get(mmsi);
    if (!t) return null;
    const rp = positionAt(t, tMs);
    return rp ? proj.toWorld(rp.lat, rp.lon) : null;
  }

  function unfollow(): void {
    if (followTween) { cancelAnimationFrame(followTween); followTween = 0; }
    if (!followMmsi) return;
    followMmsi = null;
    const cb = followEnd; followEnd = null;
    cb?.();
  }

  function follow(mmsi: string, onEnd?: () => void): void {
    const w0 = shipWorldAt(mmsi, currentMs);
    if (!ctrl || !w0) { onEnd?.(); return; }   // 無法跟隨 → 立即結束,讓 UI 同步
    unfollow();
    followMmsi = mmsi; followEnd = onEnd ?? null;
    // 取景距離:船長×4,下限 ~400m(與 cameraMinDistance 註解的貼近尺度一致)
    const track = trackByMmsi.get(mmsi)!;
    const meta = trackMeta.get(mmsi)!;
    const loaU = (track.loaM ?? TYPE_DIMS_M[meta.category].loa) * WORLD_SCALE;
    const viewDist = Math.max(loaU * 4, 4 * S);
    const cam = engine.camera3D;
    // 保留現在的環繞方位,拉到 viewDist、仰角至少 ~30°
    const dir = cam.position.clone().sub(ctrl.target);
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 1);
    dir.normalize();
    if (dir.y < 0.5) { dir.y = 0.5; dir.normalize(); }
    const offset = dir.multiplyScalar(viewDist);
    if (prefersReduced()) {
      ctrl.target.set(w0.x, 0, w0.z);
      cam.position.set(w0.x + offset.x, offset.y, w0.z + offset.z);
      return;
    }
    const fp = cam.position.clone(), ft = ctrl.target.clone();
    const t0 = performance.now(), DUR = 650;
    const step = (now: number) => {
      if (!followMmsi) { followTween = 0; return; }        // tween 中被 unfollow
      const wNow = shipWorldAt(followMmsi, currentMs);
      if (!wNow) { followTween = 0; unfollow(); return; }  // tween 中船失去資料
      const k = Math.min(1, (now - t0) / DUR);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      ctrl!.target.set(ft.x + (wNow.x - ft.x) * e, ft.y + (0 - ft.y) * e, ft.z + (wNow.z - ft.z) * e);
      cam.position.set(
        fp.x + (wNow.x + offset.x - fp.x) * e,
        fp.y + (offset.y - fp.y) * e,
        fp.z + (wNow.z + offset.z - fp.z) * e,
      );
      followTween = k < 1 ? requestAnimationFrame(step) : 0;
    };
    followTween = requestAnimationFrame(step);
  }

  // 每幀鎖定(tween 結束後生效)。scrub/播放/倍速皆持續追;船失去資料或被篩掉 → 自動退出。
  engine.addUpdate(() => {
    if (!followMmsi || followTween || !ctrl) return;
    if (!filter.has(trackMeta.get(followMmsi)!.category)) { unfollow(); return; }
    const w = shipWorldAt(followMmsi, currentMs);
    if (!w) { unfollow(); return; }
    const dx = w.x - ctrl.target.x, dz = w.z - ctrl.target.z;
    if (dx === 0 && dz === 0) return;
    ctrl.target.x += dx; ctrl.target.z += dz;
    engine.camera3D.position.x += dx; engine.camera3D.position.z += dz;
  });
```

注意：`ctrl` 在 415 行才宣告，本區塊必須放在其後（flyTo 區塊之後即符合）；`flyTo` 內呼叫 `unfollow` 靠 function declaration hoisting，合法。

- [ ] **Step 4: return 與 `__twin` 補上**

```ts
  return { engine, refresh, setFilter, setDensity, flyTo, pickShipAt, follow, unfollow };
```

`__twin` 物件內加一行（debug 用）：

```ts
    follow, unfollow,
```

- [ ] **Step 5: 三綠燈**

Run: `npm run check`
Expected: tsc 0、vitest 30/151 全綠、build ok。（follow 邏輯在 initTwinScene 閉包內、需 WebGL canvas，無法單測——runtime 行為由 Task 5 驗收，如實分野。）

- [ ] **Step 6: Commit**

```bash
git add src/screens/twin/scene-init.ts
git commit -m "feat(twin): 船隻跟隨模式——tween 進場+每幀等量平移鎖定,環繞/縮放不受覆蓋"
```

---

### Task 4: index.ts 交互接線 + chip 跟隨態樣式

**Files:**
- Modify: `src/screens/twin/index.ts`（點船 chip 區塊，約 47-71 行）
- Modify: `src/screens/twin/twin.css`（`#shipchip` 區塊後，約 91 行後）

**Interfaces:**
- Consumes: Task 2 `ShipPickInfo.mmsi`；Task 3 `scene.follow(mmsi, onEnd)` / `scene.unfollow()`（unfollow 冪等；follow 失敗會立即回呼 onEnd）。
- Produces: 無（終端 UI 層）。

- [ ] **Step 1: chip 骨架加提示行**

50 行 `chip.innerHTML` 改為（尾端多 `.hint`）：

```ts
    chip.innerHTML = '<b></b><span class="row"><i></i><span class="c-cat"></span><span>·</span><span class="c-st"></span><span>·</span><span class="c-kn"></span></span><span class="hint"></span>';
```

`chipKn` 宣告後加：

```ts
    const chipHint = chip.querySelector<HTMLElement>('.hint')!;
```

- [ ] **Step 2: 點擊邏輯改為「選取 → 再點跟隨」狀態機**

56-68 行（`hideChip` 宣告 + click listener）改為：

```ts
    let selectedMmsi: string | null = null;
    let following = false;
    const hideChip = () => { chip.hidden = true; };
    // 跟隨結束（Esc/點空白/換船/自動退出）時同步 UI;交給 scene.follow 的 onEnd 統一觸發。
    const endFollowUi = () => { following = false; selectedMmsi = null; chip.classList.remove('follow'); hideChip(); };
    canvas.addEventListener('click', (e) => {
      const info = scene!.pickShipAt(e.clientX, e.clientY);
      if (!info) { scene!.unfollow(); endFollowUi(); return; }        // 點空白 → 退出+收 chip
      if (info.mmsi === selectedMmsi && !following) {
        following = true;                                              // 同船再點 → 進入跟隨
        chip.classList.add('follow');
        chipHint.textContent = 'Esc 退出跟隨';
        scene!.follow(info.mmsi, endFollowUi);
        return;
      }
      scene!.unfollow();                                               // 換船 → 先退出既有跟隨
      following = false; selectedMmsi = info.mmsi;
      const c = SHIP_CATEGORY_COLORS[info.catIndex];
      chipName.textContent = info.name;
      chipDot.style.background = `rgb(${c.join(',')})`;
      chipCat.textContent = info.category;
      chipSt.textContent = info.state;
      chipKn.textContent = `${info.speedKn.toFixed(1)} kn`;
      chipHint.textContent = '再點一次跟隨';
      chip.classList.remove('follow');
      chip.style.left = `${e.clientX}px`; chip.style.top = `${e.clientY}px`;
      chip.hidden = false;
    });
```

注意順序：`scene.unfollow()` 會經 onEnd 觸發 `endFollowUi`（清 selectedMmsi/收 chip），之後才填新船資料，不衝突。`.follow` 態的定位交給 CSS（Step 4），故進入跟隨時不動 `style.left/top`。

- [ ] **Step 3: Esc / scrub / 分頁切換的退出接線**

69-71 行（`timeline.onScrub(hideChip); modeApi.onChange(hideChip); ...vbtn... hideChip`）改為：

```ts
    timeline.onScrub(() => { if (!following) hideChip(); });          // 跟隨中 scrub 不收指示
    modeApi.onChange(() => { scene!.unfollow(); endFollowUi(); });    // 切未來推演 → 退出
    el.querySelectorAll('.vbtn').forEach((b) => b.addEventListener('click', () => {
      endFollowUi();                                                   // flyTo 內部已 unfollow(Task 3)
    }));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && el.classList.contains('active')) scene!.unfollow();
    });
```

（keydown 用 `active` class 守衛，比照本檔既有 resize handler 慣例；screen 不會 unmount，不需解除監聽。）

- [ ] **Step 4: twin.css 跟隨態樣式**

`#shipchip .row i{...}`（91 行）之後加：

```css
#shipchip .hint{display:block;margin-top:3px;font-size:10px;color:var(--ink-60);font-family:var(--mono);}
#shipchip.follow{left:50% !important;top:auto !important;bottom:112px;transform:translate(-50%,0);}
```

（`bottom:112px` 目標是停在時間軸上方；Task 5 目視後可微調。）

- [ ] **Step 5: 三綠燈**

Run: `npm run check`
Expected: tsc 0、vitest 30/151 全綠、build ok。

- [ ] **Step 6: Commit**

```bash
git add src/screens/twin/index.ts src/screens/twin/twin.css
git commit -m "feat(twin): 點船再點跟隨/Esc 點空白換船退出+chip 跟隨態"
```

---

### Task 5: 全站驗收（headless 朝向斷言 + 跟隨目視清單 + HANDOFF）

**Files:**
- Create: scratchpad 驗證腳本（不進版控）
- Modify: `HANDOFF.md`（收尾記錄）

**Interfaces:**
- Consumes: Task 2 的 `__twin.headingAux` / `__twin.headingAtOf`；devDeps 既有 `playwright`。

- [ ] **Step 1: `npm run check` 三綠燈**

Run: `npm run check`
Expected: tsc 0、vitest 30 檔 151 tests、build ok。

- [ ] **Step 2: headless 朝向恆定斷言（照 twin-headless-verify 手法：headless Chromium + SwiftShader，勿加 `--disable-gpu`）**

起獨立 dev server（勿動使用者的 :5173）：`npx vite --port 5321 --strictPort`（背景）。
腳本存 scratchpad（例 `verify-twin-heading.mjs`）：

```js
// 腳本在 scratchpad(repo 外),ESM 解析 node_modules 是相對腳本位置——必須用 repo 絕對路徑 import
import { chromium } from '/Users/charles88/Desktop/2026航港大數據創意應用競賽/iMarine-FrontEnd/node_modules/playwright/index.mjs';
const browser = await chromium.launch(); // headless 預設 SwiftShader;勿加 --disable-gpu
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://127.0.0.1:5321/#/twin');
await page.waitForFunction(() => !!window.__twin, null, { timeout: 30_000 });
const r = await page.evaluate(() => {
  const tw = window.__twin;
  // 找一艘「動過且有連續靠泊鎖定段 ≥ 10 分鐘」的船（= 開進來再靠泊,原本會打轉的案例）
  for (const [mmsi, aux] of tw.headingAux) {
    const L = aux.berthLocked;
    let hasMove = false;
    for (let i = 0; i < L.length; i++) if (!L[i]) { hasMove = true; break; }
    if (!hasMove) continue;
    // 最長連續鎖定 run
    let bi = -1, bl = 0, ci = -1, cl = 0;
    for (let i = 0; i <= L.length; i++) {
      if (i < L.length && L[i]) { if (ci < 0) ci = i; cl++; }
      else { if (cl > bl) { bi = ci; bl = cl; } ci = -1; cl = 0; }
    }
    if (bi < 0 || bl < 3) continue;
    const track = tw.tracks.find((t) => t.mmsi === mmsi);
    const t0 = track.path[bi][2], t1 = track.path[bi + bl - 1][2];
    if (t1 - t0 < 10 * 60_000) continue;
    const hs = [];
    for (let k = 0; k <= 4; k++) hs.push(tw.headingAtOf(mmsi, t0 + ((t1 - t0) * k) / 4));
    return { mmsi, hs };
  }
  return null;
});
if (!r) throw new Error('找不到「動過且靠泊 ≥10min」的船 — 檢查 berthLocked 預算');
const spread = Math.max(...r.hs) - Math.min(...r.hs);
console.log(`[verify] mmsi=${r.mmsi} 靠泊段 5 取樣朝向 spread=${spread.toExponential(2)} rad`);
if (spread > 1e-4) throw new Error(`靠泊段朝向不恆定: ${r.hs.join(', ')}`);
if (errors.length) throw new Error(`pageerror: ${errors.join(' | ')}`);
console.log('[verify] PASS — 靠泊段朝向恆定、零 pageerror');
await browser.close();
```

Run: `node <scratchpad>/verify-twin-heading.mjs`
Expected: `[verify] PASS`。跑畢 kill dev server、`lsof -ti tcp:5321` 確認 port clean。

- [ ] **Step 3: 跟隨模式目視清單（人工或 MCP 瀏覽器；headless 無法完全代驗互動）**

在 `npm run dev`（:5173）的 twin 頁逐項確認：
1. 點一艘航行中的船 → chip 出現，含「再點一次跟隨」提示行。
2. 再點同一艘 → 相機 650ms tween 飛至船側，chip 移到畫面下方中央、顯示「Esc 退出跟隨」。
3. 按播放 → 相機隨船移動；拖曳可環繞、滾輪可縮放，且持續跟隨。
4. scrub 時間軸 → 相機跟著船跳，不退出。
5. Esc → 退出跟隨、chip 收起；點空白同效；跟隨中點另一艘 → 退出並顯示新船 chip。
6. 跟隨中把該船種篩掉 / scrub 到該船無資料時段 → 自動退出、chip 收起。
7. 切「未來推演」分頁、按視角預設鈕（全港/碼頭/港嘴）→ 退出跟隨。
8. 泊位邊的船（原本打轉的）在播放時朝向穩定、貼齊碼頭。

- [ ] **Step 4: 更新 HANDOFF.md**

在「最後更新」段記錄本輪：spec/plan 路徑、落地內容（heading.ts 預算/updateShips 查表/follow 模式/chip 交互）、驗收證據（check 三綠燈、headless 朝向斷言輸出、目視清單結果）、殘留與待使用者項（如 chip `bottom` 位置微調結論）。

- [ ] **Step 5: Commit**

```bash
git add HANDOFF.md
git commit -m "docs(handoff): twin 停船朝向穩定化+跟隨模式收尾"
```
