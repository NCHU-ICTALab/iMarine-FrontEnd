# Twin 頁原生化改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 LiDAR 引擎與高雄港場景整包搬進本 repo，twin 頁改為原生直繪的雙分頁戰情室（即時回放/未來推演），刪除 iframe 與第二 server 依賴。

**Architecture:** LiDAR `src/` 複製為 vendored `src/twin-engine/`；範例 app 程式碼與 ~8.5MB runtime 資料搬進 `src/screens/twin/`；`main.ts`（404 行）改包成 `initTwinScene(canvas)` 回傳握把；UI 殼（twin.html/twin.css/index.ts/panels.ts）全新，右 rail + 底部時間軸 + 頁面級雙分頁。

**Tech Stack:** Vite + vanilla TS、three@0.171、three-mesh-bvh、troika-three-text、Liquid Glass Kit（shell 既有）、vitest。

**Spec:** `docs/superpowers/specs/2026-07-04-twin-native-redesign-design.md`（本計畫的唯一需求來源）
**視覺基準:** `docs/preview/preview-twin-redesign.html`（mockup v4，版面/文案/互動以此為準）

## Global Constraints

- 上游 `~/Desktop/LiDAR` 唯讀：只 `cp` 複製，絕不修改上游檔案。
- 搬入的引擎/場景/演算法程式碼**逐字不動**；唯一允許的機械式修改＝import 路徑（`../src/` → `../twin-engine/`）。
- 玻璃元件一律 Liquid Glass Kit；禁止手寫 `backdrop-filter`；小型元件用 `lg-static`。
- 禁止 emoji（程式碼、註解、文案皆然）。
- 大型資料檔（航跡/底圖/船模）只允許被 `src/screens/twin/` 底下模組 import；`src/data/exchange/` 等開機即載模組只准動態 `import()`。
- 模組色 `#7FB4FF`；Kit 主色 `--lg-accent:#35E0A6` 全站不變，twin 專屬覆寫一律 scope 到 `#s-twin`。
- **每個 Task 結尾是檢查點：由使用者自行 commit**（不要替使用者跑 `git commit`）。
- 驗收一律 `npx tsc --noEmit`、`npx vitest run`、必要時 `npm run build` + Chromium 實測。

---

### Task 1: 依賴安裝 + tsconfig 對齊 + vendored 引擎複製

**Files:**
- Modify: `package.json`（dependencies/devDependencies）
- Modify: `tsconfig.json:2-11`（compilerOptions）
- Create: `src/twin-engine/`（整包複製，約 20 檔）

**Interfaces:**
- Produces: `src/twin-engine/index.ts` 的既有匯出（`LidarEngine`、`PointCloud`、`buildCategoryLUT` 等），供 Task 2/3 的搬入程式碼 import。

- [ ] **Step 1: 安裝依賴**

```bash
npm install three@^0.171.0 three-mesh-bvh@^0.8.3 troika-three-text@^0.52.4
npm install -D @types/three@^0.171.0
```

- [ ] **Step 2: tsconfig 對齊上游（兩個安全超集設定）**

LiDAR 程式碼在 `esModuleInterop:true` + 顯式 `lib` 下撰寫；本 repo 需補齊才能編過。
兩者對既有程式碼皆為安全超集（不會改變既有檔案的型別判定結果）。

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "esModuleInterop": true,
    "types": ["vite/client"],
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: 複製引擎**

```bash
cp -R ~/Desktop/LiDAR/src "/Users/charles88/Desktop/2026航港大數據創意應用競賽/iMarine-FrontEnd/src/twin-engine"
```

複製後確認結構：`src/twin-engine/{index.ts,env.d.ts,core/,emitters/,ramps/,scannables/,shaders/}`。
內容一個字都不改（vendored 唯讀副本，地位同 `src/ui/liquid-glass.*`）。

- [ ] **Step 4: 驗證**

Run: `npx tsc --noEmit`
Expected: 0 errors（引擎自帶完整型別；若報 `three/examples` 路徑錯誤，檢查 @types/three 版本是否 ^0.171.0）

Run: `npx vitest run`
Expected: 既有 10 tests 全 PASS（本 task 未動任何被測程式碼）

- [ ] **Step 5: 檢查點——請使用者 commit**

建議訊息：`Twin 原生化 Task 1: three 依賴 + tsconfig 對齊 + vendored lidar-engine`

---

### Task 2: 場景模組與 runtime 資料搬入

**Files:**
- Create: `src/screens/twin/palette.ts`、`src/screens/twin/troika.d.ts`、`src/screens/twin/berths.ts`
  （berths.ts 為 `scene/portPoints.ts` 的傳遞依賴，執行時補入——原清單漏列，僅依賴已複製的 `data/osm`）
- Create: `src/screens/twin/geo/{projection.ts,tiles.ts}`
- Create: `src/screens/twin/scene/{portPoints,shipModels,layers,textLabels,orient,portZones,meshSampling,meshTriangles,viewCarving,landmarks,landmarkModels}.ts`
- Create: `src/screens/twin/time/{ais-replay.ts,occupancy.ts,playback.ts}`
- Create: `src/screens/twin/data/{ais.ts,twport.ts,join.ts,osm.ts,berthGeometry.ts}`
- Create: `src/screens/twin/data/`（資料檔，見 Step 2 清單）

**Interfaces:**
- Consumes: `src/twin-engine/index.ts`（Task 1）。
- Produces: Task 3 的 `scene-init.ts` 所需的全部模組，簽名與上游一致，重點：
  - `time/occupancy.ts`: `buildIntervals(vessels: VesselRecord[]): BerthInterval[]`、`interface BerthInterval { berthNo: number; vessel: VesselRecord; startMs: number; endMs: number }`
  - `time/ais-replay.ts`: `positionAt(track: AisTrack, tMs: number): ResolvedPos | null`、`vesselsInPortAt(tracks: AisTrack[], tMs: number): number`
  - `time/playback.ts`: `advancePerFrame(rangeMs: number, step: number): number`
  - `palette.ts`: `SHIP_CATEGORIES`（10 類）、`SHIP_CATEGORY_COLORS: RGB[]`、`shipCategoryIndex(shipType: string): number`、`type ShipCategory`
  - `data/berthGeometry.ts`: `shortBerthLabel(code: string): string`、`interface BerthMarker`
  - `geo/projection.ts`: `createProjection`、`KAOHSIUNG_ORIGIN`、`WORLD_SCALE`

- [ ] **Step 1: 複製程式碼模組**

```bash
SRC=~/Desktop/LiDAR/examples/kaohsiung-port
DST="/Users/charles88/Desktop/2026航港大數據創意應用競賽/iMarine-FrontEnd/src/screens/twin"
cp "$SRC/palette.ts" "$SRC/troika.d.ts" "$SRC/berths.ts" "$DST/"
cp -R "$SRC/geo" "$SRC/scene" "$SRC/time" "$DST/"
mkdir -p "$DST/data"
cp "$SRC/data/ais.ts" "$SRC/data/twport.ts" "$SRC/data/join.ts" "$SRC/data/osm.ts" "$SRC/data/berthGeometry.ts" "$DST/data/"
```

（`berths.ts`、`main.ts`、`ui/` 不在此 task；資料抓取腳本 `fetch-*.ts` 等一律不搬。）

- [ ] **Step 2: 複製 runtime 資料檔（共 ~8.5MB）**

```bash
SRC=~/Desktop/LiDAR/examples/kaohsiung-port/data
DST="/Users/charles88/Desktop/2026航港大數據創意應用競賽/iMarine-FrontEnd/src/screens/twin/data"
mkdir -p "$DST/ais-tracks" "$DST/snapshots" "$DST/ship-models" "$DST/fonts"
cp "$SRC/ais-tracks/khh-2026-06-19.json" "$DST/ais-tracks/"          # 4.6MB，只搬這一天
cp "$SRC/snapshots/khh-2026-06-19.json" "$DST/snapshots/"            # 97KB
cp "$SRC/ship-models/"*.json "$DST/ship-models/"                     # 11 檔 1.3MB
cp "$SRC/basemap-khh.jpg" "$SRC/basemap-khh.json" "$DST/"            # 2.1MB
cp "$SRC/osm-khh.json" "$SRC/berths-khh.json" "$SRC/crane-orient.json" "$DST/"
cp "$SRC/fonts/zones-subset.woff" "$DST/fonts/"
```

**不搬**：`models/`（423MB GLB 離線素材）、`ais-tracks/khh-2026-06-18.json`、
`_probe-sample.json`、`land-sea-boundary.json`、所有 `.ts` 抓取腳本。

- [ ] **Step 3: 機械式改寫 import 路徑（唯一允許的修改）**

搬入檔案中所有指向上游引擎的相對路徑，`../src/…` 段改為 `../twin-engine/…`：

```bash
DST="/Users/charles88/Desktop/2026航港大數據創意應用競賽/iMarine-FrontEnd/src/screens/twin"
grep -rln "\.\./src/" "$DST" --include="*.ts" | while read f; do
  sed -i '' 's|\.\./src/|../twin-engine/|g' "$f"
done
grep -rn "twin-engine" "$DST" --include="*.ts"   # 逐檔目視確認改寫結果與層數正確
```

注意層數：`src/screens/twin/palette.ts` 原 `../../src/core/types` → `../../twin-engine/core/types`
（sed 規則已涵蓋）；`src/screens/twin/scene/*.ts` 原 `../../../src/index` → `../../../twin-engine/index`。
若有檔案 import 不存在的鄰居（如 scene 檔 import `../data/twport`），路徑相對關係與上游相同，不需改。

- [ ] **Step 4: 驗證**

Run: `npx tsc --noEmit`
Expected: 0 errors。若報「找不到模組」，回 Step 3 檢查該檔的相對層數。

Run: `npx vitest run`
Expected: 既有 10 tests 全 PASS。

- [ ] **Step 5: 檢查點——請使用者 commit**

建議訊息：`Twin 原生化 Task 2: 場景模組 + 8.5MB runtime 資料搬入`

---

### Task 3: scene-init.ts（main.ts 改包）+ 篩選感知在港數的單元測試

**Files:**
- Create: `src/screens/twin/scene-init.ts`（上游 `main.ts` 404 行改包）
- Test: `tests/twin-scene.test.ts`

**Interfaces:**
- Consumes: Task 2 全部模組。
- Produces（Task 4-8 依賴，簽名固定）：

```ts
// 模組層匯出（純資料，import 即可用，不需 WebGL）
export const fromMs: number;            // 回放窗口起點（真實 epoch ms）
export const toMs: number;              // 回放窗口終點
export const nowMs: number;             // 預設開場時刻（在港數峰值時刻）
export const peakInPort: number;
export const capturedAtMs: number;      // TWPort 快照基準時刻（甘特 0-24h 軸原點）
export const occupancy: BerthInterval[];// buildIntervals(berthing + forecast)
export function inPortAt(tMs: number, enabled?: Set<ShipCategory>): number;
export function categoryCounts(): number[];  // 依 SHIP_CATEGORIES 順序的航跡數
export function fmtClock(ms: number): string; // 'MM/DD HH:mm'（台北時區）

// 場景握把（mount 時呼叫，需要真實 canvas/WebGL）
export interface ShipPickInfo {
  name: string; category: ShipCategory; catIndex: number;
  state: string;              // '靠泊 · N 泊位' | '錨泊 · 待泊' | '航行中'
  speedKn: number;
}
export type ViewPreset = 'all' | 'pier' | 'mouth';
export interface TwinScene {
  engine: LidarEngine;                       // .start()/.pause()/.resize()/.dispose()
  refresh(tMs: number): void;                // 回放 scrub（updateShips + 記錄 currentMs）
  setFilter(enabled: Set<ShipCategory>): void;
  setDensity(on: boolean): void;
  flyTo(preset: ViewPreset): void;
  pickShipAt(clientX: number, clientY: number): ShipPickInfo | null;
}
export function initTwinScene(canvas: HTMLCanvasElement): TwinScene;
```

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/twin-scene.test.ts
import { describe, it, expect } from 'vitest';
import {
  fromMs, toMs, nowMs, peakInPort, occupancy, inPortAt, categoryCounts, fmtClock,
} from '../src/screens/twin/scene-init';
import { SHIP_CATEGORIES } from '../src/screens/twin/palette';
import type { ShipCategory } from '../src/screens/twin/palette';

describe('twin scene-init（模組層純資料）', () => {
  it('回放窗口為真實 24.2hr 錄製', () => {
    expect(toMs - fromMs).toBeGreaterThan(24 * 3600_000);
    expect(toMs - fromMs).toBeLessThan(25 * 3600_000);
    expect(nowMs).toBeGreaterThanOrEqual(fromMs);
    expect(nowMs).toBeLessThanOrEqual(toMs);
  });
  it('峰值時刻在港數 = 無篩選 inPortAt(nowMs)', () => {
    expect(inPortAt(nowMs)).toBe(peakInPort);
    expect(peakInPort).toBeGreaterThan(0);
  });
  it('篩選會單調減少在港數，且全類別=無篩選', () => {
    const all = new Set<ShipCategory>(SHIP_CATEGORIES);
    expect(inPortAt(nowMs, all)).toBe(inPortAt(nowMs));
    const none = new Set<ShipCategory>();
    expect(inPortAt(nowMs, none)).toBe(0);
    const onlyContainer = new Set<ShipCategory>(['貨櫃']);
    expect(inPortAt(nowMs, onlyContainer)).toBeLessThanOrEqual(inPortAt(nowMs));
  });
  it('categoryCounts 長度=10 且總和=航跡總數（每軌恰一類）', () => {
    const counts = categoryCounts();
    expect(counts).toHaveLength(SHIP_CATEGORIES.length);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(443);
  });
  it('occupancy 含 108-115 範圍的真實佔用區間', () => {
    expect(occupancy.length).toBeGreaterThan(0);
    expect(occupancy.some((it) => it.berthNo >= 108 && it.berthNo <= 115)).toBe(true);
  });
  it('fmtClock 輸出 MM/DD HH:mm', () => {
    expect(fmtClock(fromMs)).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/twin-scene.test.ts`
Expected: FAIL——`Cannot find module '../src/screens/twin/scene-init'`

- [ ] **Step 3: 建立 scene-init.ts（機械改包，演算法逐字保留）**

以 `~/Desktop/LiDAR/examples/kaohsiung-port/main.ts` 為底稿建立
`src/screens/twin/scene-init.ts`，變換規則（除下列外一字不改）：

1. **import 調整**：
   - `from '../../src/index'` → `from '../../twin-engine/index'`；其餘相對 import 不變
     （scene-init 與 main.ts 的相對層數相同：都在 kaohsiung-port/ ≡ twin/ 根層）。
   - 刪除 `import { createOverlay } from './ui/overlay'`（overlay 不搬）。
   - 自 `./ui/overlay` 內聯搬入 `fmtClock`（連同 `TAIPEI_MS`/`pad` 兩個小 helper，
     逐字複製）並 `export`。
2. **模組層 vs 函式體切分**（精確行段，原 main.ts 行號）：
   - **留在模組層**：第 26-36 行（`Snapshot` interface、snaps/snapshot/osm、
     trackFiles/tracksFile/tracks、allVessels）與第 42-81 行（`proj`、`S`、
     `fromMs`/`toMs`、`nowMs`/`peakInPort` 峰值掃描、`forecastIntervals`/
     `incomingRefMs`/`INCOMING_WINDOW`、`pierSegs`、`TrackMeta` interface 與
     `trackMeta` 預算迴圈）——這些全是純資料運算，無 DOM/WebGL。補上 `export`
     （`fromMs`/`toMs`/`nowMs`/`peakInPort`）。`forecastIntervals` 等三個變數
     失去消費者（overlay 已刪）但照原樣保留（本 repo tsconfig 未開
     `noUnusedLocals`，不報錯）。
   - **刪除**：第 38-40 行（`const canvas = document.getElementById('view')` 與
     `fit()` 定義+呼叫——canvas 改收參數，尺寸交給 twin.css）。
   - **包進 `export function initTwinScene(canvas: HTMLCanvasElement): TwinScene`**：
     第 83 行（`LAYERS`）起至檔尾的其餘語句（layerHandles、shipPC、`AisCenter`/
     `shipCenters`/`updateShips`、`frameOf` 與 `cx/cz/dist`、engine 建構、basemap、
     berths/labels、dev tools、`__twin`）。`interface AisCenter` 放函式內合法
     （TS 允許區域 interface），照原位置搬。
3. **刪除**（iframe 時代 / 由殼接手的職責）：
   - `function fit()` 與兩處呼叫（canvas 尺寸由 twin.css 控制）。
   - `window.addEventListener('resize', ...)`（Task 4 的 index.ts 接手）。
   - 兩個 `canvas.addEventListener('click', ...)`（船隻點選改為 `pickShipAt` 供外部呼叫；
     trace dev-tool 的 click 監聽保留但包進 `__twin.trace.start()` 才掛）。
     ——若 trace 監聽拆掛太糾結，允許整段 trace click 監聽照原樣保留（它有 `if (!trace.on) return` 守門，無副作用）。
   - overlay 相關：`const overlay = createOverlay(...)`、`overlay.setKpi/setClock/
     setTrend/setTimeRange/setIncoming/showVessel/hideVessel` 呼叫全部刪除；
     `refresh()` 保留但只剩 `currentMs = tMs; updateShips(tMs, 'type', filter);`。
4. **新增模組層匯出**（新程式碼，附於檔尾模組層）：

```ts
export const capturedAtMs = snapshot.capturedAtMs;
export const occupancy: BerthInterval[] = buildIntervals(allVessels);

export function inPortAt(tMs: number, enabled?: Set<ShipCategory>): number {
  if (!enabled) return vesselsInPortAt(tracks, tMs);
  let n = 0;
  for (const t of tracks) {
    if (!enabled.has(trackMeta.get(t.mmsi)!.category)) continue;
    if (positionAt(t, tMs)) n++;
  }
  return n;
}

export function categoryCounts(): number[] {
  const counts = SHIP_CATEGORIES.map(() => 0);
  for (const t of tracks) counts[SHIP_CATEGORIES.indexOf(trackMeta.get(t.mmsi)!.category)]++;
  return counts;
}
```

（`buildIntervals` 需補 import 自 `./time/occupancy`；`BerthInterval` type import 同檔。）

5. **initTwinScene 內新增**（新程式碼，放在原 main.ts 語句之後、return 之前）：

```ts
  // ── 視角預設（學 OPTICS viewpoint jump；tween camera + controls.target）──
  const ctrl = (engine as unknown as { controls?: { target: THREE.Vector3 } }).controls;
  const berthWorld = berths
    .filter((b) => { const n = parseInt(b.code, 10); return n >= 108 && n <= 115; })
    .map((b) => proj.toWorld(b.lat, b.lon));
  const bf = frameOf(berthWorld.length ? berthWorld : [{ x: cx, z: cz }]);
  const mouthW = proj.toWorld(22.555, 120.32); // 高雄港港嘴概略座標；Chromium 實測時調構圖
  const PRESETS: Record<ViewPreset, { pos: [number, number, number]; tgt: [number, number, number] }> = {
    all:   { pos: [cx, dist * 0.85, cz + dist * 0.75], tgt: [cx, 0, cz] },
    pier:  { pos: [bf.cx, (bf.radius + 8) * 0.9, bf.cz + (bf.radius + 8) * 0.8], tgt: [bf.cx, 0, bf.cz] },
    mouth: { pos: [mouthW.x, 22, mouthW.z + 20], tgt: [mouthW.x, 0, mouthW.z] },
  };
  let flyRaf = 0;
  function flyTo(preset: ViewPreset): void {
    const to = PRESETS[preset];
    const cam = engine.camera3D;
    const fp = cam.position.clone();
    const ft = ctrl ? ctrl.target.clone() : new THREE.Vector3(...to.tgt);
    if (flyRaf) cancelAnimationFrame(flyRaf);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cam.position.set(...to.pos); ctrl?.target.set(...to.tgt); return;
    }
    const t0 = performance.now(), DUR = 650;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / DUR);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      cam.position.set(fp.x + (to.pos[0] - fp.x) * e, fp.y + (to.pos[1] - fp.y) * e, fp.z + (to.pos[2] - fp.z) * e);
      ctrl?.target.set(ft.x + (to.tgt[0] - ft.x) * e, ft.y + (to.tgt[1] - ft.y) * e, ft.z + (to.tgt[2] - ft.z) * e);
      if (k < 1) flyRaf = requestAnimationFrame(step); else flyRaf = 0;
    };
    flyRaf = requestAnimationFrame(step);
  }

  // ── 航跡密度圖層（學 MPA 密度熱圖；443 條航跡全點疊加，懶初始化）──
  let densityPC: PointCloud | null = null;
  function setDensity(on: boolean): void {
    if (on && !densityPC) {
      const pos: number[] = []; const val: number[] = [];
      for (const t of tracks) {
        for (const [lat, lon] of t.path) {
          const w = proj.toWorld(lat, lon);
          pos.push(w.x, 0.005 * S, w.z); val.push(0.5);
        }
      }
      // 實測 443 條航跡 path 頂點總數 = 114,799 點（遠低於 shipPC 的 1.5M 容量），
      // 全量疊加無效能疑慮，不需再取樣稀釋。
      densityPC = new PointCloud({
        capacity: val.length, ramp: buildCategoryLUT([[80, 200, 170]]),
        persistence: 'accumulate', colorMode: 'value', sizeAttenuation: false,
        pointSize: 1.5, maxPointSize: 2,
      });
      densityPC.setBrightness(0.3); // 疊加處自然增亮＝密度視覺；太亮調此值
      densityPC.addPoints(new Float32Array(pos), new Float32Array(val));
      engine.addLayer(densityPC.points, { bloom: 3 });
    }
    if (densityPC) densityPC.points.visible = on;
  }

  // ── 點船資訊（學 OPTICS click-to-inspect；沿用原 screen-space 最近船心判定）──
  function pickShipAt(clientX: number, clientY: number): ShipPickInfo | null {
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    let best: { c: AisCenter; d: number } | null = null;
    for (const c of shipCenters) {
      const p = new THREE.Vector3(c.x, c.y, c.z).project(engine.camera3D);
      const sx = (p.x * 0.5 + 0.5) * rect.width, sy = (-p.y * 0.5 + 0.5) * rect.height;
      const d = Math.hypot(sx - mx, sy - my);
      if (p.z < 1 && (!best || d < best.d)) best = { c, d };
    }
    if (!best || best.d >= 28) return null;
    const { track, vessel } = best.c;
    const meta = trackMeta.get(track.mmsi)!;
    // 航速：前後 60 秒位置差估算（world 單位 → 公尺 → 節）
    const a = positionAt(track, currentMs - 60_000), b = positionAt(track, currentMs);
    let speedKn = 0;
    if (a && b) {
      const wa = proj.toWorld(a.lat, a.lon), wb = proj.toWorld(b.lat, b.lon);
      speedKn = (Math.hypot(wb.x - wa.x, wb.z - wa.z) / WORLD_SCALE) / 60 * 1.9438;
    }
    const state = meta.pierAligned
      ? `靠泊 · ${vessel?.berthNo != null ? vessel.berthNo + ' 泊位' : '碼頭'}`
      : speedKn < 0.5 ? '錨泊 · 待泊' : '航行中';
    return {
      name: vessel?.nameZh || track.name || '未識別船舶',
      category: meta.category, catIndex: SHIP_CATEGORIES.indexOf(meta.category),
      state, speedKn,
    };
  }

  return { engine, refresh, setFilter, setDensity, flyTo, pickShipAt };
```

配套：原 `let filter = new Set<string>(SHIP_CATEGORIES)` 與 overlay 的 `onFilter`
handler 改為具名函式（放 initTwinScene 內）：

```ts
  let filter = new Set<ShipCategory>(SHIP_CATEGORIES);
  function setFilter(enabled: Set<ShipCategory>): void { filter = enabled; refresh(currentMs); }
```

`AisCenter` interface 原本就在 main.ts（第 116 行），照搬即可。`buildCategoryLUT`、
`PointCloud` 已在原 import（第 3 行）。`ShipPickInfo`/`ViewPreset`/`TwinScene`
interface 定義放檔案頂部 export。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/twin-scene.test.ts`
Expected: 6 tests PASS（模組層載入 4.6MB JSON 約需數秒屬正常）

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 errors；全部測試 PASS（10 舊 + 6 新）

- [ ] **Step 5: 檢查點——請使用者 commit**

建議訊息：`Twin 原生化 Task 3: scene-init（main.ts 改包 + 握把 API）+ 單元測試`

---

### Task 4: 新版面骨架（twin.html/twin.css）+ index.ts 生命週期 + 視角/分頁 bar

**Files:**
- Rewrite: `src/screens/twin/twin.html`（整檔取代）
- Create: `src/screens/twin/twin.css`
- Rewrite: `src/screens/twin/index.ts`（整檔取代）

**Interfaces:**
- Consumes: `initTwinScene(canvas): TwinScene`、`nowMs`（Task 3）。
- Produces: DOM 骨架 id/class（Task 5-8 的掛載點）：`#twinView`（canvas）、
  `.viewbar .vbtn[data-view]`、`.tabsbar .mtab[data-tab]`、`#railFilters`（篩選卡容器）、
  `[data-mode-panel="replay"|"future"]` 面板區、`#tlLabel`/`#tclock`/`#tslider`/`#play`/
  `#spDn`/`#spUp`/`#spVal`、`#shipchip`；`body[data-tmode]` 由本 task 的分頁切換維護。
  mount closure 內建立 `type TabMode = 'replay' | 'future'` 與
  `modeApi: { get(): TabMode; onChange(fn: (m: TabMode) => void): void }`——**以參數
  傳給 Task 5-6 的 init 函式，不做跨模組 export**（避免 index ⇄ timeline 循環 import）；
  模組層 `let stopPlayback: (() => void) | null`（Task 6 填入，`hide()` 呼叫）。

- [ ] **Step 1: twin.html 整檔取代**

```html
<div class="full">
  <canvas id="twinView"></canvas>

  <nav class="viewbar lg" data-lg aria-label="視角預設">
    <button class="vbtn on" data-view="all">全港鳥瞰</button>
    <button class="vbtn" data-view="pier">碼頭近景</button>
    <button class="vbtn" data-view="mouth">港嘴</button>
  </nav>

  <nav class="tabsbar lg" data-lg aria-label="模式切換">
    <button class="mtab on" data-tab="replay">即時回放</button>
    <button class="mtab" data-tab="future">未來推演</button>
  </nav>

  <aside class="trail">
    <!-- 船型篩選（兩分頁共用；Task 5 填 #railFilters 與密度開關） -->
    <section class="panel lg anim" data-lg style="--d:.1s">
      <h4>船型篩選 <span class="tag">10 類 · 圖例</span></h4>
      <div id="railFilters"></div>
      <label class="frow densrow"><input type="checkbox" id="densToggle">
        <span class="cdot cdot-dens"></span>航跡密度圖層<span class="cnt">24 HR</span></label>
    </section>
    <!-- 即時回放：在港趨勢（Task 5） -->
    <section class="panel lg anim" data-lg data-mode-panel="replay" style="--d:.15s">
      <h4>在港船舶趨勢 <span class="tag">過去 24 HR</span></h4>
      <svg id="trend" viewBox="0 0 264 110" preserveAspectRatio="none" role="img"
           aria-label="過去 24 小時在港船舶數趨勢"></svg>
      <div class="tread"><span>回放時刻在港</span><span><b id="trNow">--</b> 艘</span></div>
    </section>
    <!-- 未來推演：情境切換（Task 7） -->
    <section class="panel lg lg-static anim" data-mode-panel="future" style="--d:.1s">
      <h4>情境切換 <span class="tag">沙盤參數</span></h4>
      <div class="scnrow">
        <button class="scn" data-f="0.96">油價 +10%</button>
        <button class="scn" data-f="0.93">EUA +20%</button>
        <button class="scn" data-f="1.08">颱風偏移 50km</button>
        <button class="scn on" data-f="1">基準情境</button>
      </div>
    </section>
    <!-- 未來推演：泊位甘特（Task 7；窗範圍資料驅動，tag 由 JS 填） -->
    <section class="panel lg anim" data-lg data-mode-panel="future" style="--d:.15s">
      <h4>泊位甘特 <span class="tag" id="gTag"></span></h4>
      <div class="gantt" id="gantt"><div id="gnow"></div></div>
      <div class="gaxis"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
    </section>
    <!-- 未來推演：KPI 在港船數（Task 7） -->
    <section class="panel lg anim" data-lg data-mode-panel="future" style="--d:.2s">
      <h4>KPI · 在港船數 <span class="tag">推演值</span></h4>
      <div class="kpirow"><span id="kpiCount">0</span><span class="unit">艘（NOW+<span id="kpiT">00:00</span>）</span></div>
      <p class="kpinote">以過去 24hr 真實在港曲線為基底，乘上 <b id="kpiScn">基準情境</b> 係數推估；非即時觀測值。</p>
    </section>
  </aside>

  <div class="tline lg" data-lg>
    <div class="lab"><span id="tlLabel"></span><span id="tclock"></span></div>
    <div class="trow2">
      <div class="mstep" aria-label="播放速度">
        <button id="spDn" aria-label="減速">−</button><span id="spVal">×5</span><button id="spUp" aria-label="加速">＋</button>
      </div>
      <button id="play" aria-label="播放/暫停">▶</button>
      <div class="lg lg-slider" data-lg>
        <input class="lg-slider__input" id="tslider" type="range" aria-label="時間軸">
      </div>
    </div>
  </div>

  <div id="shipchip" class="lg lg-static" hidden></div>
</div>
```

- [ ] **Step 2: twin.css 建立（版面與 mockup 逐字對齊；玻璃交給 Kit，不手寫 backdrop-filter）**

```css
/* Twin 頁專屬版面（雙分頁戰情室）。玻璃效果一律 Kit（data-lg / lg-static），
   本檔只寫定位/排版/配色；#s-twin scope 確保不外漏。 */
#s-twin .full{position:absolute;inset:0;}
#s-twin #twinView{position:absolute;inset:0;width:100%;height:100%;display:block;background:#08111c;}

#s-twin .viewbar{position:absolute;left:104px;top:22px;z-index:7;display:flex;gap:6px;padding:6px;border-radius:14px;}
#s-twin .vbtn{font-size:11.5px;padding:5px 14px;border-radius:10px;border:1px solid transparent;cursor:pointer;
  background:transparent;color:var(--ink-60);font-family:inherit;transition:.2s;}
#s-twin .vbtn:hover{color:var(--ink-90);}
#s-twin .vbtn.on{color:#7FB4FF;border-color:rgba(127,180,255,.4);background:rgba(127,180,255,.08);}
#s-twin .vbtn:focus-visible{outline:2px solid #7FB4FF;outline-offset:2px;}

#s-twin .tabsbar{position:absolute;right:22px;top:22px;z-index:7;display:flex;gap:6px;padding:6px;border-radius:14px;}
#s-twin .mtab{font-size:12px;padding:6px 18px;border-radius:10px;border:1px solid transparent;cursor:pointer;
  background:transparent;color:var(--ink-60);font-family:inherit;letter-spacing:.04em;transition:.2s;}
#s-twin .mtab:hover{color:var(--ink-90);}
#s-twin .mtab.on{color:#7FB4FF;border-color:rgba(127,180,255,.4);background:rgba(127,180,255,.08);}
#s-twin .mtab:focus-visible{outline:2px solid #7FB4FF;outline-offset:2px;}

#s-twin .trail{position:absolute;right:22px;top:74px;bottom:96px;width:300px;z-index:6;
  display:flex;flex-direction:column;gap:12px;overflow-y:auto;scrollbar-width:none;}
#s-twin .trail::-webkit-scrollbar{display:none;}
#s-twin .trail>.panel{flex:none;}
#s-twin .panel h4 .tag{margin-left:auto;font-size:9.5px;font-family:var(--mono);letter-spacing:.08em;
  color:var(--ink-40);border:1px solid var(--hair);border-radius:999px;padding:1px 8px;}

/* 分頁面板顯示切換（body[data-tmode] 由 index.ts 維護） */
#s-twin [data-mode-panel]{display:none;}
body[data-tmode="replay"] #s-twin [data-mode-panel="replay"]{display:block;}
body[data-tmode="future"] #s-twin [data-mode-panel="future"]{display:block;}

/* 船型篩選（兩欄；勾選列＝圖例） */
#s-twin #railFilters{display:grid;grid-template-columns:1fr 1fr;column-gap:14px;}
#s-twin .frow{display:flex;align-items:center;gap:8px;font-size:12px;padding:3px 0;cursor:pointer;color:var(--ink-90);}
#s-twin .frow .cdot{width:10px;height:10px;border-radius:50%;flex:none;}
#s-twin .frow .cnt{margin-left:auto;font-family:var(--mono);font-size:11px;color:var(--ink-40);font-variant-numeric:tabular-nums;}
#s-twin .frow input{appearance:none;width:15px;height:15px;margin:0;border-radius:5px;border:1px solid rgba(255,255,255,.25);
  background:transparent;cursor:pointer;position:relative;flex:none;transition:.15s;}
#s-twin .frow input:checked{background:rgba(127,180,255,.25);border-color:#7FB4FF;}
#s-twin .frow input:checked::after{content:'';position:absolute;inset:3px;border-radius:2px;background:#7FB4FF;}
#s-twin .frow input:focus-visible{outline:2px solid #7FB4FF;outline-offset:2px;}
#s-twin .densrow{margin-top:8px;padding-top:9px;border-top:1px solid var(--hair);}
#s-twin .cdot-dens{background:linear-gradient(90deg,#35E0A6,#F5A54A,#F0648C);}

/* 在港趨勢 */
#s-twin #trend{width:100%;height:110px;display:block;}
#s-twin .tread{display:flex;justify-content:space-between;font-size:11px;font-family:var(--mono);
  color:var(--ink-40);margin-top:6px;font-variant-numeric:tabular-nums;}
#s-twin .tread b{color:#7FB4FF;font-weight:600;}

/* 情境切換（.scn 樣式沿用 tokens.css 既有規則；此處只排版） */
#s-twin .scnrow{display:flex;gap:8px;flex-wrap:wrap;}

/* 泊位甘特（.gantt/.grow_/.gtrack/.gbar/.gaxis 沿用 tokens.css 既有規則） */
#s-twin .gaxis{padding-left:32px;}
#s-twin #gnow{position:absolute;top:-2px;bottom:-2px;width:1.5px;background:var(--lg-accent);
  box-shadow:0 0 6px var(--lg-accent);left:32px;transition:left .1s linear;pointer-events:none;z-index:1;}

/* KPI 在港船數 */
#s-twin .kpirow{display:flex;align-items:baseline;gap:10px;}
#s-twin #kpiCount{font-family:var(--mono);font-size:30px;font-weight:600;color:var(--ink-90);font-variant-numeric:tabular-nums;}
#s-twin .kpirow .unit{font-size:12px;color:var(--ink-40);}
#s-twin .kpinote{margin:6px 0 0;font-size:11px;color:var(--ink-40);line-height:1.7;}
#s-twin .kpinote b{color:var(--lg-accent);font-weight:600;}

/* 底部時間軸（取代 tokens.css 舊 .tline 的 left/right，其餘沿用） */
#s-twin .tline{position:absolute;left:104px;bottom:22px;right:346px;padding:12px 18px;border-radius:16px;z-index:6;}
#s-twin .tline .lab{display:flex;justify-content:space-between;font-size:11px;font-family:var(--mono);
  letter-spacing:.04em;color:var(--ink-40);margin-bottom:8px;font-variant-numeric:tabular-nums;}
#s-twin .tline .lab #tclock{color:var(--ink-60);}
#s-twin .trow2{display:flex;align-items:center;gap:12px;}
#s-twin .mstep{display:flex;align-items:center;gap:2px;border:1px solid var(--hair);border-radius:10px;padding:2px 4px;}
#s-twin .mstep button{width:22px;height:22px;border:0;background:transparent;color:var(--ink-60);cursor:pointer;
  font-size:14px;font-family:var(--mono);border-radius:6px;line-height:1;}
#s-twin .mstep button:hover{color:var(--ink-90);background:rgba(255,255,255,.06);}
#s-twin .mstep span{font-family:var(--mono);font-size:11px;color:var(--ink-60);min-width:26px;text-align:center;font-variant-numeric:tabular-nums;}
#s-twin #play{width:30px;height:30px;border-radius:10px;border:1px solid var(--hair);background:rgba(255,255,255,.04);
  color:var(--ink-90);cursor:pointer;font-size:12px;line-height:1;transition:.2s;flex:none;}
#s-twin #play:hover{border-color:rgba(127,180,255,.45);color:#7FB4FF;}
#s-twin #play:focus-visible{outline:2px solid #7FB4FF;outline-offset:2px;}
#s-twin .lg-slider{flex:1;}
#s-twin .lg-slider .lg-slider__input{width:100%;}

/* 點船資訊 chip（.lg.lg-static 玻璃；fixed 定位需逃出 section 排版流，
   selector 用全域唯一 id 即已足夠 scope） */
#shipchip{position:fixed;z-index:12;pointer-events:none;padding:8px 12px;border-radius:12px;
  font-size:11.5px;line-height:1.6;color:var(--ink-90);transform:translate(-50%,calc(-100% - 14px));}
#shipchip b{font-size:12.5px;display:block;}
#shipchip .row{display:flex;gap:8px;color:var(--ink-60);font-family:var(--mono);font-size:10.5px;}
#shipchip .row i{width:8px;height:8px;border-radius:50%;align-self:center;}
```

- [ ] **Step 3: index.ts 整檔取代（生命週期 + viewbar/tabsbar；時間軸/面板細節由 Task 5-8 填入）**

```ts
/* Twin screen 外殼膠合 — 原生化改版。
   LiDAR 場景由 scene-init.ts 直繪於本 section 的 canvas（不再 iframe）；
   本檔負責：版面注入、engine 生命週期（mount/show/hide）、視角預設 bar、
   雙分頁切換骨架。右 rail 面板與時間軸的資料綁定在 panels.ts / timeline.ts
   （Task 5-8），mode 狀態以 modeApi 參數下發，不做跨模組 export。 */

import type { Screen } from '../types';
import template from './twin.html?raw';
import './twin.css';
import { initTwinScene, nowMs, type TwinScene, type ViewPreset } from './scene-init';

type TabMode = 'replay' | 'future';

let scene: TwinScene | null = null;
let stopPlayback: (() => void) | null = null; // Task 6 指派 timeline.stop；切走時停播

const s: Screen = {
  mount(el, ctx) {
    el.innerHTML = template;
    document.body.setAttribute('data-tmode', 'replay');

    const canvas = el.querySelector<HTMLCanvasElement>('#twinView')!;
    scene = initTwinScene(canvas);
    scene.refresh(nowMs);
    scene.engine.start();

    // 分頁狀態（closure 持有；Task 5-6 經參數取用）
    let mode: TabMode = 'replay';
    const modeListeners: Array<(m: TabMode) => void> = [];
    const modeApi = {
      get: () => mode,
      onChange: (fn: (m: TabMode) => void) => { modeListeners.push(fn); },
    };

    // 視角預設
    el.querySelectorAll<HTMLButtonElement>('.vbtn').forEach((btn) => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.vbtn').forEach((x) => x.classList.toggle('on', x === btn));
        scene!.flyTo(btn.dataset.view as ViewPreset);
      });
    });

    // 分頁切換
    el.querySelectorAll<HTMLButtonElement>('.mtab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.tab as TabMode;
        if (next === mode) return;
        el.querySelectorAll('.mtab').forEach((x) => x.classList.toggle('on', x === btn));
        mode = next;
        document.body.setAttribute('data-tmode', mode);
        modeListeners.forEach((fn) => fn(mode));
      });
    });

    // 本頁 active 時的視窗 resize（對齊 dispatch/epidemic 定案手法）
    window.addEventListener('resize', () => {
      if (el.classList.contains('active')) scene?.engine.resize();
    });

    // ctx 與 modeApi 由 Task 5-8 接手（本 repo tsconfig 未開 noUnusedLocals/
    // noUnusedParameters，暫時未使用不報錯）
  },
  show() {
    scene?.engine.start();
    scene?.engine.resize();
  },
  hide() {
    stopPlayback?.();
    scene?.engine.pause();
  },
};

export default s;
```

- [ ] **Step 4: 驗證**

Run: `npx tsc --noEmit`
Expected: 0 errors（`ctx.data.twin.url` 的舊參照已隨整檔取代消失）

Run: `npm run dev` 後 Chromium 開 `http://localhost:5173/#/twin`（**確保埠 5174 沒有任何服務**）：
- 真實 3D 港區直接渲染（航照底圖、泊位標籤、船舶點雲），無 OFFLINE 卡、無 iframe。
- viewbar 三顆按鈕運鏡正常；tabsbar 切換時右 rail 面板組正確互換（面板內容此時仍是空殼/靜態，屬預期）。
- 切到 `#/carbon` 再切回：畫面尺寸正確、切走時 GPU 停止（DevTools Performance 確認無持續 rAF）。
- console 無錯誤。
- **右 rail 玻璃折射檢查**：若面板只剩平面 tint、無折射（Kit feImage 非同步解碼 race，
  LiDAR overlay.ts 註解記載過此問題），把上游 `ui/overlay.ts` 的 `reviveGlass`
  函式（第 235-285 行）搬進 panels.ts 於 mount 後補跑；折射正常則不搬（spec §9 後手條款）。

- [ ] **Step 5: 檢查點——請使用者 commit**

建議訊息：`Twin 原生化 Task 4: 新版面骨架 + 生命週期 + 視角/分頁 bar`

---

### Task 5: panels.ts（船型篩選 + 密度開關 + 在港趨勢）

**Files:**
- Create: `src/screens/twin/panels.ts`
- Modify: `src/screens/twin/index.ts`（mount 內呼叫 `initPanels`）

**Interfaces:**
- Consumes: Task 3 的 `inPortAt/categoryCounts/fromMs/toMs/scene 握把`；Task 4 的 DOM 骨架。
- Produces: `initPanels(el: HTMLElement, ctx: ScreenCtx, scene: TwinScene): PanelsApi`，
  `interface PanelsApi { renderTrend(tMs: number): void; enabled: Set<ShipCategory>; onFilterChange(fn: () => void): void; }`
  （Task 6 在 scrub 時呼叫 `renderTrend`；Task 7 讀 `enabled` 算 KPI/甘特淡化。）

- [ ] **Step 1: 建立 panels.ts**

```ts
/* 右 rail 面板：資料綁定與渲染。版面 markup 在 twin.html，本檔只填內容與掛事件。 */
import type { ScreenCtx } from '../types';
import { SHIP_CATEGORIES, SHIP_CATEGORY_COLORS, type ShipCategory } from './palette';
import { inPortAt, categoryCounts, fromMs, toMs, type TwinScene } from './scene-init';

const rgb = (i: number, a = 1) =>
  `rgba(${SHIP_CATEGORY_COLORS[i][0]},${SHIP_CATEGORY_COLORS[i][1]},${SHIP_CATEGORY_COLORS[i][2]},${a})`;

export interface PanelsApi {
  renderTrend(tMs: number): void;
  enabled: Set<ShipCategory>;
  onFilterChange(fn: () => void): void;
}

export function initPanels(el: HTMLElement, ctx: ScreenCtx, scene: TwinScene): PanelsApi {
  const enabled = new Set<ShipCategory>(SHIP_CATEGORIES);
  const filterListeners: Array<() => void> = [];

  // ── 船型篩選（勾選列＝圖例；計數為該類真實航跡數）──
  const counts = categoryCounts();
  const filters = el.querySelector<HTMLElement>('#railFilters')!;
  SHIP_CATEGORIES.forEach((name, i) => {
    const row = document.createElement('label');
    row.className = 'frow';
    row.innerHTML = `<input type="checkbox" checked><span class="cdot" style="background:${rgb(i)};box-shadow:0 0 6px ${rgb(i, 0.45)}"></span>${name}<span class="cnt">${counts[i]}</span>`;
    row.querySelector('input')!.addEventListener('change', (e) => {
      if ((e.target as HTMLInputElement).checked) enabled.add(name); else enabled.delete(name);
      scene.setFilter(new Set(enabled));
      filterListeners.forEach((fn) => fn());
    });
    filters.appendChild(row);
  });

  // ── 航跡密度圖層開關 ──
  el.querySelector<HTMLInputElement>('#densToggle')!.addEventListener('change', (e) => {
    scene.setDensity((e.target as HTMLInputElement).checked);
  });

  // ── 在港趨勢（單一序列：折線 + 面積 + 淡格線 + 回放游標；48 取樣點）──
  const trendSvg = el.querySelector<SVGElement>('#trend')!;
  const trNow = el.querySelector<HTMLElement>('#trNow')!;
  function renderTrend(tMs: number): void {
    const N = 48, w = 264, h = 110, pad = 6;
    const ys: number[] = [];
    for (let i = 0; i <= N; i++) ys.push(inPortAt(fromMs + ((toMs - fromMs) * i) / N, enabled));
    const ymax = Math.max(4, ...ys);
    const X = (i: number) => pad + ((w - 2 * pad) * i) / N;
    const Y = (v: number) => h - pad - ((h - 2 * pad - 14) * v) / ymax;
    let line = '', area = `M ${X(0)} ${h - pad}`;
    ys.forEach((v, i) => { const seg = `${X(i)} ${Y(v)}`; line += (i ? ' L ' : 'M ') + seg; area += ' L ' + seg; });
    area += ` L ${X(N)} ${h - pad} Z`;
    const k = (tMs - fromMs) / (toMs - fromMs);
    const cx = X(k * N), cy = Y(inPortAt(tMs, enabled));
    const grid = [0.25, 0.5, 0.75].map((g) =>
      `<line x1="${pad}" x2="${w - pad}" y1="${Y(ymax * g)}" y2="${Y(ymax * g)}" stroke="rgba(255,255,255,.06)" stroke-width="1"/>`).join('');
    trendSvg.innerHTML = `${grid}
      <path d="${area}" fill="rgba(127,180,255,.16)"/>
      <path d="${line}" fill="none" stroke="#7FB4FF" stroke-width="2" stroke-linejoin="round"/>
      <line x1="${cx}" x2="${cx}" y1="${pad}" y2="${h - pad}" stroke="rgba(53,224,166,.55)" stroke-width="1.5"/>
      <circle cx="${cx}" cy="${cy}" r="3.5" fill="#35E0A6"/>
      <text x="${pad + 1}" y="${Y(ymax) - 3}" fill="rgba(170,184,200,.42)" font-size="9" font-family="ui-monospace,monospace">${ymax}</text>`;
    trNow.textContent = String(inPortAt(tMs, enabled));
  }

  void ctx; // Task 7 用 ctx.ui.toast
  return { renderTrend, enabled, onFilterChange: (fn) => filterListeners.push(fn) };
}
```

- [ ] **Step 2: index.ts 接上**

在 `mount` 的 `modeApi` 宣告之後加：

```ts
    const panels = initPanels(el, ctx, scene);
    panels.renderTrend(nowMs);
    panels.onFilterChange(() => panels.renderTrend(nowMs)); // Task 6 把 nowMs 換成 timeline.currentReplayMs()
```

import 補 `initPanels`。（第三行的 `nowMs` 是暫時值，Task 6 **就地修改**該行，
不另加第二個 listener——避免重複註冊。）

- [ ] **Step 3: 驗證**

Run: `npx tsc --noEmit`（0 errors）→ Chromium `#/twin`：
- 篩選卡 10 列，色點/名稱/計數正確（計數總和 443）；勾掉「貨櫃」場景貨櫃船消失、
  趨勢曲線下移；全部勾掉場景無船、趨勢貼零。
- 密度開關開啟：航道與錨地浮現暗青疊加拖尾（重疊處增亮）；關閉即消失；開關過程幀率無明顯掉落。
- 趨勢圖渲染：面積+折線+3 條格線+青綠游標+ymax 標記。

- [ ] **Step 4: 檢查點——請使用者 commit**

建議訊息：`Twin 原生化 Task 5: 篩選/密度/趨勢面板`

---

### Task 6: 時間軸（回放 scrub + 播放/倍速 + 分頁語意切換）

**Files:**
- Create: `src/screens/twin/timeline.ts`
- Modify: `src/screens/twin/index.ts`（接上 initTimeline；Task 5 暫用 `nowMs` 的 listener 改讀時間軸實值）

**Interfaces:**
- Consumes: Task 3 `fromMs/toMs/nowMs/fmtClock/scene.refresh`；Task 4 mount closure 的 `modeApi`（參數傳入）；Task 5 `panels.renderTrend`。
- Produces: `initTimeline(el: HTMLElement, scene: TwinScene, panels: PanelsApi, modeApi: { get(): 'replay' | 'future'; onChange(fn: (m: 'replay' | 'future') => void): void }): TimelineApi`，
  `interface TimelineApi { currentReplayMs(): number; currentFutureMin(): number; frozenMs(): number; onScrub(fn: (m: 'replay' | 'future') => void): void; stop(): void; }`
  （Task 7 讀 `frozenMs/currentFutureMin` 算 KPI 與甘特現在線；Task 8 在 scrub 時收 chip；
  index.ts 把 `stop` 指派給模組層 `stopPlayback` 供 `hide()` 停播。）

- [ ] **Step 1: 建立 timeline.ts**

```ts
/* 底部時間軸：一條 slider、兩種語意。
   即時回放：value=真實 epoch ms，scrub → scene.refresh + 趨勢游標。
   未來推演：value=NOW+分鐘（0-1440），場景凍結（不 refresh），只推 KPI/甘特。
   播放/倍速沿用上游 playback.advancePerFrame——純比例公式 rangeMs*step/4800，
   單位無關，回放（ms）與推演（分鐘）兩種軸都適用。
   mode 狀態由 index.ts 以 modeApi 參數注入（不 import './index'，避免循環相依）。 */
import { advancePerFrame } from './time/playback';
import { fromMs, toMs, nowMs, fmtClock, type TwinScene } from './scene-init';
import type { PanelsApi } from './panels';

type TabMode = 'replay' | 'future';
export interface ModeApi { get(): TabMode; onChange(fn: (m: TabMode) => void): void; }
export interface TimelineApi {
  currentReplayMs(): number;
  currentFutureMin(): number;
  frozenMs(): number;
  onScrub(fn: (m: TabMode) => void): void;
  stop(): void;
}

const FUTURE_MIN = 1440;
const pad2 = (n: number) => String(n).padStart(2, '0');
const fmtFuture = (min: number) => `NOW +${pad2(Math.floor(min / 60))}:${pad2(Math.round(min % 60))}`;

export function initTimeline(el: HTMLElement, scene: TwinScene, panels: PanelsApi, modeApi: ModeApi): TimelineApi {
  const slider = el.querySelector<HTMLInputElement>('#tslider')!;
  const tclock = el.querySelector<HTMLElement>('#tclock')!;
  const tlLabel = el.querySelector<HTMLElement>('#tlLabel')!;
  const playBtn = el.querySelector<HTMLButtonElement>('#play')!;
  const spVal = el.querySelector<HTMLElement>('#spVal')!;

  let replayMs = nowMs, futureMin = 0, frozen = nowMs;
  let speed = 5, playing = false, raf = 0;
  const scrubListeners: Array<(m: TabMode) => void> = [];

  // Kit 的 slider 填色只在 input 事件重繪；播放時程式改值需手動補（沿用上游 paintFill 手法）。
  // #tslider 是掛載後才入 DOM，Kit 開機掃描掃不到，補跑一次 behaviors.slider（同 carbon 手法；
  // lg.d.ts 已於複審 Fix 7 補齊 slider 型別，不需 cast）。
  try {
    window.LiquidGlass.behaviors.slider?.(slider);
  } catch { /* Kit 缺 behaviors.slider 時原生 range 仍可用 */ }
  const paintFill = () => {
    const mn = +slider.min, mx = +slider.max;
    slider.style.setProperty('--lg-fill', `${mx > mn ? ((+slider.value - mn) / (mx - mn)) * 100 : 0}%`);
  };

  function applyModeToSlider(): void {
    if (modeApi.get() === 'replay') {
      slider.min = String(fromMs); slider.max = String(toMs); slider.step = '60000';
      slider.value = String(replayMs);
      tlLabel.textContent = `AIS 回放 · 過去 24 小時（${fmtClock(fromMs)} → ${fmtClock(toMs)}）`;
    } else {
      slider.min = '0'; slider.max = String(FUTURE_MIN); slider.step = '1';
      slider.value = String(futureMin);
      tlLabel.textContent = '沙盤推演 · 未來 24 小時（NOW = 回放凍結時刻）';
    }
    sync();
  }

  function sync(): void {
    if (modeApi.get() === 'replay') {
      replayMs = +slider.value;
      tclock.textContent = fmtClock(replayMs);
      scene.refresh(replayMs);
      panels.renderTrend(replayMs);
    } else {
      futureMin = +slider.value;
      tclock.textContent = fmtFuture(futureMin);
    }
    paintFill();
    scrubListeners.forEach((fn) => fn(modeApi.get()));
  }

  function stopPlay(): void { playing = false; playBtn.textContent = '▶'; if (raf) cancelAnimationFrame(raf); }

  slider.addEventListener('input', () => { stopPlay(); sync(); });
  playBtn.addEventListener('click', () => {
    if (raf) cancelAnimationFrame(raf);
    playing = !playing; playBtn.textContent = playing ? '⏸' : '▶';
    const step = () => {
      if (!playing) return;
      let v = +slider.value + advancePerFrame(+slider.max - +slider.min, speed);
      if (v > +slider.max) v = +slider.min;
      slider.value = String(v); sync();
      raf = requestAnimationFrame(step);
    };
    if (playing) raf = requestAnimationFrame(step);
  });
  el.querySelector('#spUp')!.addEventListener('click', () => { speed = Math.min(10, speed + 1); spVal.textContent = `×${speed}`; });
  el.querySelector('#spDn')!.addEventListener('click', () => { speed = Math.max(1, speed - 1); spVal.textContent = `×${speed}`; });

  modeApi.onChange((m) => {
    stopPlay();
    if (m === 'future') frozen = replayMs; // 場景凍結在切換當下時刻
    applyModeToSlider();
  });

  applyModeToSlider();
  return {
    currentReplayMs: () => replayMs,
    currentFutureMin: () => futureMin,
    frozenMs: () => frozen,
    onScrub: (fn) => scrubListeners.push(fn),
    stop: stopPlay,
  };
}
```

- [ ] **Step 2: index.ts 接上**

mount 內、`initPanels` 之後：

```ts
    const timeline = initTimeline(el, scene, panels, modeApi);
    stopPlayback = timeline.stop;
```

並**就地修改** Task 5 加入的那行 listener（換掉 `nowMs`，不要另加一行）：

```ts
    panels.onFilterChange(() => panels.renderTrend(timeline.currentReplayMs()));
```

（timeline.ts 不 import `./index`——mode 狀態經 `modeApi` 參數注入，無循環相依。）

- [ ] **Step 3: 驗證**

Chromium `#/twin`：
- 開場時鐘顯示峰值時刻（`06/20 06:44` 前後）；拖曳 → 船位/趨勢游標/在港讀數同步。
- `▶` 播放：船隊沿真實航跡移動、時鐘走動、slider 填色跟進；`−`/`＋` 倍速 ×1-×10 生效；到端點循環。
- 切「未來推演」：label/時鐘換成 NOW +HH:MM、slider 歸推演值、場景凍結（船不動）；
  切回「即時回放」：回放時刻與播放狀態正確保留（播放中切頁會停播，屬預期）。
- `npx tsc --noEmit` 0 errors；`npx vitest run` 全 PASS。

- [ ] **Step 4: 檢查點——請使用者 commit**

建議訊息：`Twin 原生化 Task 6: 時間軸（回放/播放/倍速/分頁語意）`

---

### Task 7: 未來推演面板（情境切換 + 泊位甘特 + KPI 在港船數）

**Files:**
- Modify: `src/screens/twin/panels.ts`（加 `initFuturePanels`）
- Modify: `src/screens/twin/index.ts`（接上）

**Interfaces:**
- Consumes: Task 3 `occupancy/capturedAtMs/inPortAt/fromMs/toMs`；Task 5 `PanelsApi.enabled/onFilterChange`；Task 6 `TimelineApi`；`ctx.ui.toast`。
- Produces: 無（終端消費者）。

- [ ] **Step 1: panels.ts 加入未來推演區塊**

```ts
// ── 未來推演面板（情境/甘特/KPI）。追加於 panels.ts；由 index.ts 在 initTimeline 之後呼叫。──
import { occupancy, capturedAtMs } from './scene-init';
import { shipCategoryIndex } from './palette';
import type { TimelineApi } from './timeline';

export function initFuturePanels(
  el: HTMLElement, ctx: ScreenCtx, panels: PanelsApi, timeline: TimelineApi,
): void {
  // 情境切換（mock 係數；文案沿用既有 toast）
  let scnFactor = 1, scnName = '基準情境';
  const kpiScn = el.querySelector<HTMLElement>('#kpiScn')!;
  el.querySelectorAll<HTMLButtonElement>('.scn').forEach((btn) => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.scn').forEach((x) => x.classList.toggle('on', x === btn));
      scnFactor = parseFloat(btn.dataset.f!); scnName = btn.textContent!;
      kpiScn.textContent = scnName;
      updateKpi();
      ctx.ui.toast({ title: '情境已套用', message: `「${scnName}」重新推演未來 24 小時` });
    });
  });

  // 泊位甘特：真實佔用區間（TWPort 快照），軸 = capturedAtMs 起 24 小時。
  // 窗範圍資料驅動：挑重疊區間數最大的連續 8 泊位（本快照實測為 63-70，15 筆；
  // 原 mockup 的 108-115 實查僅 108-110 有資料，寫死會有 5 條空軌，故改為動態）。
  const DAY = 24 * 3600_000;
  const live = occupancy.filter((it) => it.endMs > capturedAtMs && it.startMs < capturedAtMs + DAY);
  const byNo = new Map<number, number>();
  live.forEach((it) => byNo.set(it.berthNo, (byNo.get(it.berthNo) ?? 0) + 1));
  const allNos = [...byNo.keys()];
  let lo = Math.min(...allNos);
  {
    let bestC = -1;
    for (let s0 = Math.min(...allNos); s0 <= Math.max(...allNos) - 7; s0++) {
      let c = 0;
      for (let n = s0; n < s0 + 8; n++) c += byNo.get(n) ?? 0;
      if (c > bestC) { bestC = c; lo = s0; }
    }
  }
  el.querySelector<HTMLElement>('#gTag')!.textContent = `${lo}-${lo + 7}`;
  const gantt = el.querySelector<HTMLElement>('#gantt')!;
  const gnow = el.querySelector<HTMLElement>('#gnow')!;
  for (let no = lo; no < lo + 8; no++) {
    const bars = live
      .filter((it) => it.berthNo === no)
      .map((it) => {
        const a = Math.max(0, (it.startMs - capturedAtMs) / DAY);
        const b = Math.min(1, (it.endMs - capturedAtMs) / DAY);
        const ci = shipCategoryIndex(it.vessel.shipType);
        return `<div class="gbar" data-cat="${ci}" style="left:${a * 100}%;width:${(b - a) * 100}%;background:rgba(${SHIP_CATEGORY_COLORS[ci].join(',')},1)"></div>`;
      }).join('');
    const row = document.createElement('div');
    row.className = 'grow_';
    row.innerHTML = `<span>${no}</span><div class="gtrack">${bars}</div>`;
    gantt.appendChild(row);
  }
  function dimGantt(): void { // 被濾掉船種的 bar 淡化（不移除）
    gantt.querySelectorAll<HTMLElement>('.gbar').forEach((bar) => {
      const name = SHIP_CATEGORIES[+bar.dataset.cat!];
      bar.style.opacity = panels.enabled.has(name) ? '.85' : '.12';
    });
  }
  panels.onFilterChange(() => { dimGantt(); updateKpi(); });

  // KPI 在港船數（推演值 = 真實曲線基底 × 情境係數；彈簧數字）
  const kpiCount = el.querySelector<HTMLElement>('#kpiCount')!;
  const kpiT = el.querySelector<HTMLElement>('#kpiT')!;
  let shown = 0, target = 0, tick = 0;
  function updateKpi(): void {
    const win = toMs - fromMs;
    const baseMs = fromMs + (((timeline.frozenMs() - fromMs) + timeline.currentFutureMin() * 60_000) % win);
    target = Math.max(0, Math.round(inPortAt(baseMs, panels.enabled) * scnFactor));
    if (tick) return;
    const step = () => {
      shown += (target - shown) * 0.18;
      if (Math.abs(target - shown) < 0.05) { shown = target; kpiCount.textContent = String(target); tick = 0; return; }
      kpiCount.textContent = String(Math.round(shown));
      tick = requestAnimationFrame(step);
    };
    tick = requestAnimationFrame(step);
  }

  // 推演軸 scrub → 現在線 + KPI 時刻
  timeline.onScrub((m) => {
    if (m !== 'future') return;
    const f = timeline.currentFutureMin() / 1440;
    gnow.style.left = `calc(32px + ${f} * (100% - 32px))`; // 32px = 泊位編號欄寬
    const min = timeline.currentFutureMin();
    kpiT.textContent = `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;
    updateKpi();
  });

  updateKpi(); dimGantt();
}
```

（`SHIP_CATEGORIES`/`SHIP_CATEGORY_COLORS`/`ScreenCtx` 等 import 於 panels.ts 頂部已有或補上。）

- [ ] **Step 2: index.ts 接上**

`initTimeline` 之後：

```ts
    initFuturePanels(el, ctx, panels, timeline);
```

- [ ] **Step 3: 驗證**

Chromium `#/twin` 切「未來推演」：
- 甘特 tag 顯示 `63-70`（本快照的最忙窗）、8 列中至少 7 列有真實佔用 bar（合計 15 筆；
  色=該船船種色；與快照 `berthing/forecast` 對照抽查 2 列正確）。
- 推演軸拖曳：綠色現在線沿軌道移動（起點對齊 00 刻度）、KPI 的 NOW+HH:MM 跟進、數字彈簧變化。
- 點「颱風偏移 50km」：toast 跳出、KPI 上調（×1.08）；「基準情境」復原。
- 勾掉「散雜」：該色甘特 bar 淡化至 0.12、KPI 基數下降；勾回復原。
- `npx tsc --noEmit` 0 errors；`npx vitest run` 全 PASS。

- [ ] **Step 4: 檢查點——請使用者 commit**

建議訊息：`Twin 原生化 Task 7: 情境/甘特/KPI 未來推演面板`

---

### Task 8: 點船資訊 chip

**Files:**
- Modify: `src/screens/twin/index.ts`（canvas click → chip 渲染）

**Interfaces:**
- Consumes: Task 3 `scene.pickShipAt`；Task 4 `#shipchip` DOM 與 mount closure 的 `modeApi`；Task 6 `timeline.onScrub`。

- [ ] **Step 1: index.ts mount 內加 chip 邏輯**（`initFuturePanels` 之後）：

```ts
    // 點船資訊 chip（學 OPTICS click-to-inspect；輕量、點空白或 scrub 即收）。
    // 骨架用固定 innerHTML，動態文字（含 AIS 船名）一律 textContent 塞入。
    const chip = el.querySelector<HTMLElement>('#shipchip')!;
    chip.innerHTML = '<b></b><span class="row"><i></i><span class="c-cat"></span><span>·</span><span class="c-st"></span><span>·</span><span class="c-kn"></span></span>';
    const chipName = chip.querySelector('b')!;
    const chipDot = chip.querySelector<HTMLElement>('.row i')!;
    const chipCat = chip.querySelector('.c-cat')!;
    const chipSt = chip.querySelector('.c-st')!;
    const chipKn = chip.querySelector('.c-kn')!;
    const hideChip = () => { chip.hidden = true; };
    canvas.addEventListener('click', (e) => {
      const info = scene!.pickShipAt(e.clientX, e.clientY);
      if (!info) { hideChip(); return; }
      const c = SHIP_CATEGORY_COLORS[info.catIndex];
      chipName.textContent = info.name;
      chipDot.style.background = `rgb(${c.join(',')})`;
      chipCat.textContent = info.category;
      chipSt.textContent = info.state;
      chipKn.textContent = `${info.speedKn.toFixed(1)} kn`;
      chip.style.left = `${e.clientX}px`; chip.style.top = `${e.clientY}px`;
      chip.hidden = false;
    });
    timeline.onScrub(hideChip);
    modeApi.onChange(hideChip);
    el.querySelectorAll('.vbtn').forEach((b) => b.addEventListener('click', hideChip));
```

（`SHIP_CATEGORY_COLORS` 自 `./palette` import 補上。）

- [ ] **Step 2: 驗證**

Chromium `#/twin`：
- 點靠泊船：chip 顯示船名/船種色點/「靠泊 · N 泊位」/0.0 kn；點航行中船：「航行中」+ 合理航速（5-20 kn 區間）。
- 點空白處、拖時間軸、切分頁、切視角 → chip 收起。
- 未來推演（凍結場景）點船亦可。
- `npx tsc --noEmit` 0 errors。

- [ ] **Step 3: 檢查點——請使用者 commit**

建議訊息：`Twin 原生化 Task 8: 點船資訊 chip`

---

### Task 9: provider 改寫（TDD）+ 開機路徑清理

**Files:**
- Rewrite: `tests/twin-provider.test.ts`
- Rewrite: `src/data/exchange/twin.ts`
- Modify: `src/main.ts:25`（`createTwinProvider()` 無參數）
- Modify: `.env.example`（刪 `VITE_TWIN_URL` 行）
- Delete: `public/data/berths-khh.json`
- Modify: `README.md`（twin 前置段落）

**Interfaces:**
- Consumes: Task 2 的 `data/berths-khh.json`、`data/ais-tracks/khh-2026-06-19.json`。
- Produces: `createTwinProvider(): Provider<TwinSnapshot>`（不再有 `url` 屬性）。

- [ ] **Step 1: 改寫測試（先跑到 FAIL）**

```ts
// tests/twin-provider.test.ts — 原生化後不再 fetch，直接驗打包資料的映射
import { describe, it, expect } from 'vitest';
import { createTwinProvider } from '../src/data/exchange/twin';

describe('twin provider（原生資料版）', () => {
  it('source 為 live 且不再暴露 url', () => {
    const p = createTwinProvider();
    expect(p.source).toBe('live');
    expect('url' in p).toBe(false);
  });
  it('snapshot 映射 72 筆泊位與 443 條真實航跡數', async () => {
    const s = await createTwinProvider().snapshot();
    expect(s.berths).toHaveLength(72);
    expect(typeof s.berths[0].id).toBe('string');
    expect(typeof s.berths[0].name).toBe('string');
    expect(s.trackCount).toBe(443);
  });
});
```

Run: `npx vitest run tests/twin-provider.test.ts`
Expected: FAIL（舊 provider 需要 url 參數 + fetch stub 已移除）

- [ ] **Step 2: 改寫 provider**

```ts
import type { Provider, TwinSnapshot } from '../types';
/* Twin live provider — 原生化版。
   berths（12KB）靜態 import 無妨；航跡檔 4.6MB 只准動態 import()（snapshot() 被叫到才載），
   守住「大型資料不進開機主 bundle」的懶載入邊界（spec §5/§10）。 */
import berthsData from '../../screens/twin/data/berths-khh.json';

export function createTwinProvider(): Provider<TwinSnapshot> {
  return {
    source: 'live',
    async snapshot() {
      try {
        const tracks = await import('../../screens/twin/data/ais-tracks/khh-2026-06-19.json');
        const list = (berthsData.berths ?? []).map((b: { code: string; nameZh: string }) =>
          ({ id: b.code, name: b.nameZh }));
        return { berths: list, trackCount: (tracks.default as { ships: unknown[] }).ships.length };
      } catch { return { berths: [], trackCount: 0 }; }
    },
  };
}
```

- [ ] **Step 3: 開機路徑清理**

- `src/main.ts`：`twin: createTwinProvider(env.VITE_TWIN_URL)` → `twin: createTwinProvider()`；
  若 `env` 因此不再被使用則保留給 carbon（`VITE_CARBON_API` 仍在用，勿動）。
- `.env.example`：刪除 `VITE_TWIN_URL` 行（含註解）。
- `rm public/data/berths-khh.json`（資料已隨 twin 打包；`public/data/` 若因此為空，目錄一併移除）。
- `README.md`：「Twin live 前置」段落改為一句：「twin 模組已內建 LiDAR 引擎與真實
  AIS/泊位資料，`npm run dev` 即可，無需額外服務。」保留 carbon 前置不動。

- [ ] **Step 4: 驗證**

Run: `npx vitest run`
Expected: 全 PASS（twin-provider 2 新 + twin-scene 6 + 其餘既有）

Run: `npx tsc --noEmit && npm run build`
Expected: 0 errors；build 成功。**檢查 build 輸出**：`dist/assets/` 中主 entry chunk
不含 4.6MB 航跡（航跡應在獨立 chunk / twin chunk），用
`ls -la dist/assets | sort -k5 -n | tail` 目視確認尺寸分佈。

- [ ] **Step 5: 檢查點——請使用者 commit**

建議訊息：`Twin 原生化 Task 9: provider 原生資料版 + 開機路徑清理`

---

### Task 10: 樣式殘留清理 + 文件更新 + 全站驗收

**Files:**
- Modify: `src/ui/tokens.css:167-182`（孿生區段舊選擇器）
- Modify: `src/ui/tokens.css:286-292`（窄螢幕保底的 `.float-r`/`.tline` 參照）
- Modify: `CLAUDE.md`（§2 相鄰工作區、§3 twin 狀態列）
- Modify: `HANDOFF.md`（完成記錄 + 殘留事項）

**Interfaces:** 無（收尾）。

- [ ] **Step 1: tokens.css 清理**

先確認無他頁使用：

```bash
grep -rn "float-tl\|float-r" src --include="*.ts" --include="*.html" | grep -v twin
```

Expected: 無輸出。然後刪除 `tokens.css` 孿生區段中的 `.float-tl`（169-171）、
`.float-r`（172-175）兩組規則與 `@media(max-width:900px)` 內的 `.float-r{display:none;}`；
`#s-twin .full`、`.tline`、`.gantt`/`.grow_`/`.gtrack`/`.gbar`、`.scn` 保留
（twin.css 與 twin.html 仍在用；`.tline` 的 left/right 已被 twin.css 的
`#s-twin .tline` 覆寫，基礎樣式沿用）。

- [ ] **Step 2: 文件更新**

- `CLAUDE.md` §2 表格「數位孿生」列：註明「引擎+場景已 vendored 進 `src/twin-engine/`
  與 `src/screens/twin/`，上游 LiDAR repo 仍唯讀、僅供資產再生成」；§3 twin 列狀態改
  「live（原生直繪，無外部依賴）」。
- `HANDOFF.md`：第 1 節記錄本次改版完成（雙分頁/三學習功能/驗收結果）；第 5 節殘留
  事項移除「twin 需先起 LiDAR server」相關字句；demo checklist 僅剩 carbon 前置。

- [ ] **Step 3: 全站驗收（對照 spec §13）**

1. `npx tsc --noEmit`、`npx vitest run`、`npm run build` 三綠燈。
2. **埠 5174 淨空**（`lsof -nP -iTCP:5174` 無輸出；有舊 dev server 先殺掉）後
   Chromium 冷啟動 `#/twin`：3D 直繪、無任何 5174 請求（`list_network_requests` 確認）。
3. 即時回放全互動：scrub/播放/倍速/篩選/密度/點船/三視角/趨勢連動。
4. 未來推演全互動：語意切換/凍結/甘特/KPI/情境 toast/篩選連動；切回狀態保留。
5. 「切走→resize→切回」尺寸正確；切走後 GPU 停（Performance 面板無 twin rAF）；
   其他頁按方向鍵無異狀。
6. 鍵盤 `0`-`6`/`Enter` 全站導覽正常；hero/carbon/policy/dispatch/epidemic/alert
   六頁逐一到達、console 全程零錯誤。
7. `prefers-reduced-motion: reduce`：視角預設直接跳定、頁面完整渲染。

- [ ] **Step 4: 檢查點——請使用者 commit**

建議訊息：`Twin 原生化 Task 10: 樣式清理 + 文件 + 全站驗收`

---

## Self-Review 記錄（第二輪：程式碼假設逐項對上游/資料實測）

**Spec 覆蓋**：§4 檔案結構（T1-T4）、§5 資料清單（T2）與懶載入邊界（T9 Step 4 驗 build
chunk）、§6 畫面組成與分頁行為表（T4-T7）、§7 三功能（T5 密度/T8 chip/T3+T4 視角）、
§8 生命週期（T4）、§9 樣式隔離（T4 twin.css scope + T10 清理；折射後手見 T4 Step 4）、
§10 provider（T9）、§11 刪除清單（T4 覆寫即刪 iframe/探測/fallback/setTwinOffset；
README T9；CLAUDE/HANDOFF T10）、§12 錯誤處理（上游行為隨 T3 逐字保留；WebGL throw
交給 router Fix 4）、§13 驗收（各 task 驗證 + T10 總驗）。無缺口。

**資料事實實測**（2026-07-04，直接跑上游資料驗證，計畫斷言以此為據）：
- `khh-2026-06-19.json`：443 艘、24.2hr、path 頂點總數 **114,799**（密度層全量無效能疑慮）、
  path 每點 4 欄（`[lat, lon, …]` 解構前兩欄成立）。
- 快照 berthNo 108-115 窗僅 108/109/110 有重疊區間（共 8 筆、5 軌全空）→ 甘特改
  **資料驅動選窗**（最忙連續 8 泊位，本快照 = 63-70、15 筆），spec §6 已同步修訂。
- `advancePerFrame(range, step) = range*step/4800`：純比例、單位無關 → 回放（ms）與
  推演（分鐘）共用成立。
- `shortBerthLabel('1108') → '108'`：視角預設 `parseInt(b.code)` 過濾 108-115 成立。
- TWPort `shipType`（如「油駁船」）在 `palette.ts` 的 `TYPE_TO_CATEGORY` 有對應。

**本輪修正**（相對第一版計畫）：
1. T3 行段切分規則原自相矛盾（26-81 與「38 行起」重疊）→ 改精確三段：模組層 26-36 +
   42-81、刪 38-40、函式體 83-檔尾。
2. index ⇄ timeline 循環 import → 消除：mode 狀態收進 mount closure，以 `modeApi`
   參數注入 timeline（`ModeApi` 型別隨 T6 定義）。
3. `TimelineApi` 增 `stop()`；index.ts `hide()` 經模組層 `stopPlayback` 停播，
   避免切走後 rAF 空轉推 scrub。
4. 甘特窗 108-115 寫死 → 資料驅動（見上）；`#gTag` 動態填。
5. T5/T6 的 `onFilterChange` 原會重複註冊 → T6 改「就地修改 T5 那行」。
6. chip：class 修正為 `lg lg-static`；動態文字（含 AIS 船名）全改 `textContent` 塞入。
7. twin.css 移除誤植的 `#s-twin-chip-host` 殘行；index.ts 移除無消費者的
   `sectionEl`/`scene`/`getMode`/`onModeChange` 匯出。
8. T4 驗證步驟補「折射空白 → 搬 reviveGlass」後手（spec §9 條款落地）。
9. behaviors.slider 呼叫去掉多餘 cast（lg.d.ts 複審 Fix 7 已含型別）。

**型別一致性**：`TwinScene`/`ShipPickInfo`/`ViewPreset`（T3 定義，T4/T8 消費）、
`PanelsApi`（T5 定義，T6/T7 消費）、`TimelineApi`/`ModeApi`（T6 定義，T7/T8/index 消費）
名稱與簽名逐一核對相符；無跨 task 名稱漂移。

**Placeholder 掃描**：無 TBD/TODO；「照上游逐字」步驟均附精確變換規則與錨點行號；
所有驗證步驟附具體指令與預期結果。
