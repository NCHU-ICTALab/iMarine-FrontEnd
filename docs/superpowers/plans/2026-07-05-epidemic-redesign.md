# Epidemic 頁改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 epidemic 頁從單船靜態 mock 改版為「進高雄港船隊總覽 → 下鑽單船」的疫情自動追溯頁：Mapbox 真實地圖上的 AIS 停靠序列 × 疫情通報時序交叉比對，規則式評分，四互動 + 自動化管線演出。

**Architecture:** 資料契約改為 `fleet[] + pipeline[] + inflowPool[]` 的 `EpidemicSnapshot`；分數與時空命中由純函式 `correlate.ts`（可 TDD）從 factors/ports/events 算出（單一真相來源）；中央主視覺是 Mapbox 真實地圖（`worldmap.ts`）+ Epi-Gantt 雙泳道（`swimlane.ts`），共用時間游標；screen 膠合層 `index.ts` 管四互動（點船下鑽／時間游標／管線進場+點開／模擬偵測）。視覺與互動基準：`docs/preview/preview-epidemic-redesign.html`（headless CDP 已驗證：mapReady/canvas/tiles、船標經緯度隨游標插值、下鑽+模擬兩發、0 warning 0 error）。spec：`docs/superpowers/specs/2026-07-05-epidemic-redesign-design.md`。

**Tech Stack:** Vite + vanilla TS；Liquid Glass Kit（`src/ui/liquid-glass.css/js`）；**Mapbox GL JS**（新依賴）；vitest（純邏輯測試）；headless Chrome + CDP（UI/互動驗證，比照 dispatch/policy 前例）。

## Global Constraints

- **內容規範**：全頁禁止任何真實具名事件/船隻/公司（船名一律中性虛構，如 HORIZON 217）；禁止解釋性散文（重點用數據/chip/色彩呈現）。港名為真實地理位置、可用。
- **引導性配色**：常態元素壓灰去飽和（`opacity:.5`、綠級圓點 `#3a4757`），風險/命中才發亮發光。風險色：紅玫紅 `#F0648C`、橙琥珀 `#F5A54A`、黃 gold `#E9BC63`、綠 `#35E0A6`；來源 chip：WHO 玫紅、疾管署 gold、新聞 dim；時間游標/船標 cyan `#38BDF8`；管線燈：完成綠/進行藍脈動/待處理灰。
- **CSS scope**：epidemic.css 全選擇器 `#s-epidemic` 前綴（policy `.gbar` 跨頁洩漏前例殷鑑）；不手寫 `backdrop-filter`（用 Kit 的 `lg`/`lg-static`）。
- **只收進高雄港的船**：每艘 vessel 停靠序列末站必為 `高雄`（`berthed:true`）。
- **規則式評分公式**：`score = round(0.25*dwellDays + 0.50*sourceStrength + 0.25*distanceFactor)`；分級 ≥80 紅/60–79 橙/40–59 黃/<40 綠。分數只由 `scoreVessel()` 算，mock 不存算好的分數。
- **Mapbox token**：讀 `import.meta.env.VITE_MAPBOX_TOKEN`（`.env`，gitignored）；缺 token 時 worldmap 優雅降級（提示卡、不崩頁）；建圖前容器需淨空。
- **provider**：維持 mock（`source:'mock'`），`createMockExchange()` 接線不變（只換 `EpidemicSnapshot` 型別）。
- **三綠燈**：每個 task 完成時 `npx tsc --noEmit` 0 errors、`npx vitest run` 全綠、`npm run build` 成功。
- **commit**：SDD 檢查點由**使用者自己 commit**（每 task 末的 commit 指令為建議訊息，不要自動執行 `git commit`）。

---

### Task 1: `correlate.ts` — 規則式評分 + 時空命中判定（TDD）

**Files:**
- Create: `src/screens/epidemic/correlate.ts`
- Test: `tests/epidemic-correlate.test.ts`
- Modify: `src/data/types.ts`（先加 `EpidemicFactors` / `EpidemicPort` / `EpidemicEvent` 三個 interface，供 correlate 引用；其餘契約 Task 2 補齊）

**Interfaces:**
- Produces:
  - `export type RiskTier = 'red' | 'orange' | 'yellow' | 'green'`
  - `export interface VesselScore { score: number; tier: RiskTier; levelLabel: string; color: string }`
  - `export function scoreVessel(f: EpidemicFactors): VesselScore`
  - `export interface Hit { port: string; eventId: string; type: 'rose' | 'amber'; mag: number; markerDay: number }`
  - `export function computeHits(ports: EpidemicPort[], events: EpidemicEvent[]): Hit[]`
  - `export const INCUBATION = 7`
- Consumes: `EpidemicFactors`、`EpidemicPort`、`EpidemicEvent`（本 task 於 types.ts 新增）

- [ ] **Step 1: 在 types.ts 先加三個 interface**

在 `src/data/types.ts` 把既有 `EpidemicSnapshot`（第 96-101 行舊版）**上方**插入（舊 `EpidemicSnapshot` 暫時保留，Task 2 才整段換）：

```ts
export interface EpidemicFactors { dwellDays: number; sourceStrength: number; distanceFactor: number }
export interface EpidemicPort { name: string; dayIn: number; dayOut: number; berthed?: boolean }
export interface EpidemicEvent { id: string; port: string; day: number; source: 'who' | 'cdc' | 'news'; label: string }
```

- [ ] **Step 2: 寫失敗測試**

```ts
// tests/epidemic-correlate.test.ts
import { describe, it, expect } from 'vitest';
import { scoreVessel, computeHits } from '../src/screens/epidemic/correlate';
import type { EpidemicPort, EpidemicEvent } from '../src/data/types';

describe('scoreVessel', () => {
  it('加權公式：0.25*dwell + 0.50*source + 0.25*dist，四捨五入', () => {
    expect(scoreVessel({ dwellDays: 64, sourceStrength: 85, distanceFactor: 52 }).score).toBe(72);
  });
  it('分級邊界（等值 factors → score = factor 值）', () => {
    expect(scoreVessel({ dwellDays: 80, sourceStrength: 80, distanceFactor: 80 }).tier).toBe('red');
    expect(scoreVessel({ dwellDays: 79, sourceStrength: 79, distanceFactor: 79 }).tier).toBe('orange');
    expect(scoreVessel({ dwellDays: 60, sourceStrength: 60, distanceFactor: 60 }).tier).toBe('orange');
    expect(scoreVessel({ dwellDays: 59, sourceStrength: 59, distanceFactor: 59 }).tier).toBe('yellow');
    expect(scoreVessel({ dwellDays: 40, sourceStrength: 40, distanceFactor: 40 }).tier).toBe('yellow');
    expect(scoreVessel({ dwellDays: 39, sourceStrength: 39, distanceFactor: 39 }).tier).toBe('green');
  });
  it('level 文案與色對齊 tier', () => {
    const s = scoreVessel({ dwellDays: 80, sourceStrength: 80, distanceFactor: 80 });
    expect(s.levelLabel).toBe('紅級 · 禁止登輪');
    expect(s.color).toBe('#F0648C');
  });
});

describe('computeHits', () => {
  const ports: EpidemicPort[] = [
    { name: '香港', dayIn: 3, dayOut: 5 },
    { name: '高雄', dayIn: 13, dayOut: 13, berthed: true },
  ];
  it('通報落在停靠窗內 → rose，mag = 停靠起算重疊天數', () => {
    const e: EpidemicEvent[] = [{ id: 'e1', port: '香港', day: 4, source: 'who', label: '群聚' }];
    const h = computeHits(ports, e);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ port: '香港', type: 'rose', mag: 2, markerDay: 4 });
  });
  it('離港後、潛伏窗（≤7d）內通報 → amber，mag = 間隔天數', () => {
    const p: EpidemicPort[] = [{ name: '釜山', dayIn: 2, dayOut: 4 }];
    const e: EpidemicEvent[] = [{ id: 'e2', port: '釜山', day: 9, source: 'who', label: '群聚' }];
    expect(computeHits(p, e)[0]).toMatchObject({ type: 'amber', mag: 5 });
  });
  it('離港後超過潛伏窗 → 不命中', () => {
    const p: EpidemicPort[] = [{ name: '釜山', dayIn: 2, dayOut: 4 }];
    const e: EpidemicEvent[] = [{ id: 'e3', port: '釜山', day: 12, source: 'who', label: '群聚' }];
    expect(computeHits(p, e)).toHaveLength(0);
  });
  it('通報地點無對應停靠港 → 不命中', () => {
    const e: EpidemicEvent[] = [{ id: 'e4', port: '東京', day: 4, source: 'news', label: 'x' }];
    expect(computeHits(ports, e)).toHaveLength(0);
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run tests/epidemic-correlate.test.ts`
Expected: FAIL（`scoreVessel`/`computeHits` 未定義 → 匯入錯誤）

- [ ] **Step 4: 寫最小實作**

```ts
// src/screens/epidemic/correlate.ts
// 規則式評分 + 時空交叉比對純函式（依 WHO IHR 框架，可解釋、可測）。
// 分數只由此算（單一真相來源）；mock 只存 factors/ports/events raw 值。
import type { EpidemicFactors, EpidemicPort, EpidemicEvent } from '../../data/types';

export type RiskTier = 'red' | 'orange' | 'yellow' | 'green';
export interface VesselScore { score: number; tier: RiskTier; levelLabel: string; color: string }

const LEVELS: { min: number; tier: RiskTier; levelLabel: string; color: string }[] = [
  { min: 80, tier: 'red', levelLabel: '紅級 · 禁止登輪', color: '#F0648C' },
  { min: 60, tier: 'orange', levelLabel: '橙級 · 限制登輪', color: '#F5A54A' },
  { min: 40, tier: 'yellow', levelLabel: '黃級 · 加強防護', color: '#E9BC63' },
  { min: 0, tier: 'green', levelLabel: '綠級 · 正常', color: '#35E0A6' },
];

export function scoreVessel(f: EpidemicFactors): VesselScore {
  const score = Math.round(0.25 * f.dwellDays + 0.5 * f.sourceStrength + 0.25 * f.distanceFactor);
  const L = LEVELS.find((l) => score >= l.min)!;
  return { score, tier: L.tier, levelLabel: L.levelLabel, color: L.color };
}

export const INCUBATION = 7;
export interface Hit { port: string; eventId: string; type: 'rose' | 'amber'; mag: number; markerDay: number }

export function computeHits(ports: EpidemicPort[], events: EpidemicEvent[]): Hit[] {
  const hits: Hit[] = [];
  for (const e of events) {
    const p = ports.find((p) => p.name === e.port);
    if (!p) continue;
    if (e.day >= p.dayIn && e.day <= p.dayOut) {
      hits.push({ port: p.name, eventId: e.id, type: 'rose', mag: Math.min(p.dayOut, e.day) - p.dayIn + 1, markerDay: e.day });
    } else if (e.day > p.dayOut && e.day - p.dayOut <= INCUBATION) {
      hits.push({ port: p.name, eventId: e.id, type: 'amber', mag: e.day - p.dayOut, markerDay: e.day });
    }
  }
  return hits;
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run tests/epidemic-correlate.test.ts`
Expected: PASS（全部 case）

- [ ] **Step 6: 三綠燈**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: tsc 0 errors、vitest 全綠、build 成功

- [ ] **Step 7:（檢查點）由你 commit**

```
feat(epidemic): correlate.ts 規則式評分 + 時空命中判定（TDD）
```

---

### Task 2: 資料契約 `EpidemicSnapshot` 重寫 + mock JSON 全面改寫（皆進高雄）+ 舊 screen 降過渡殼（TDD）

**Files:**
- Modify: `src/data/types.ts`（整段換掉舊 `EpidemicSnapshot`）
- Rewrite: `src/data/mock/epidemic.json`
- Delete: `src/screens/epidemic/route.ts`
- Modify: `src/screens/epidemic/index.ts`（暫降為過渡殼，讀新契約、渲染最小內容，保 tsc 綠；Task 3+ 重寫）
- Modify: `src/screens/epidemic/epidemic.html`（暫清空或最小佔位；Task 3 重寫）
- Test: `tests/epidemic-mock.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `EpidemicFactors`/`EpidemicPort`/`EpidemicEvent`、`scoreVessel`
- Produces:
  - `EpidemicIntel`、`EpidemicPipelineStage`、`EpidemicInflow`、`EpidemicVessel`、`EpidemicSnapshot`（見 Step 1）

- [ ] **Step 1: types.ts 換掉舊 `EpidemicSnapshot`**

刪除舊的（第 96-101 行 `export interface EpidemicSnapshot { ship... }`），改為：

```ts
export interface EpidemicIntel { source: 'who' | 'cdc' | 'news'; text: string; hit: boolean }
export interface EpidemicPipelineStage { key: string; label: string; count: string; run?: boolean; detail: string[] }
export interface EpidemicVessel {
  id: string; name: string;
  factors: EpidemicFactors;
  ports: EpidemicPort[];        // 末站必為 '高雄' berthed
  events: EpidemicEvent[];
  intel: EpidemicIntel[];
  advice: string[];
  sms: string;
}
export type EpidemicInflow =
  | { kind: 'escalate'; targetId: string; event: EpidemicEvent; factors: EpidemicFactors; intel: EpidemicIntel; toast: string }
  | { kind: 'newship'; vessel: EpidemicVessel; toast: string };
export interface EpidemicSnapshot {
  timeRange: { startDate: string; endDate: string; startDay: number; now: number };
  pipeline: EpidemicPipelineStage[];
  fleet: EpidemicVessel[];
  inflowPool: EpidemicInflow[];
}
```

（`EpidemicFactors`/`EpidemicPort`/`EpidemicEvent` 已於 Task 1 加入，保留。）

- [ ] **Step 2: 寫失敗測試（mock 契約）**

```ts
// tests/epidemic-mock.test.ts
import { describe, it, expect } from 'vitest';
import snap from '../src/data/mock/epidemic.json';
import type { EpidemicSnapshot } from '../src/data/types';
import { scoreVessel } from '../src/screens/epidemic/correlate';

const s = snap as unknown as EpidemicSnapshot;

describe('epidemic mock 契約', () => {
  it('timeRange / pipeline(5) / fleet(≥5) / inflowPool(2)', () => {
    expect(s.timeRange.now).toBeGreaterThan(s.timeRange.startDay);
    expect(s.pipeline).toHaveLength(5);
    expect(s.fleet.length).toBeGreaterThanOrEqual(5);
    expect(s.inflowPool).toHaveLength(2);
  });
  it('每艘船停靠序列末站為高雄 berthed、factors 三欄齊', () => {
    for (const v of s.fleet) {
      const last = v.ports[v.ports.length - 1];
      expect(last.name).toBe('高雄');
      expect(last.berthed).toBe(true);
      expect(typeof v.factors.dwellDays).toBe('number');
      expect(typeof v.factors.sourceStrength).toBe('number');
      expect(typeof v.factors.distanceFactor).toBe('number');
    }
  });
  it('主秀 HORIZON 217 算出 72 橙級', () => {
    const h = s.fleet.find((v) => v.name === 'HORIZON 217')!;
    expect(scoreVessel(h.factors).score).toBe(72);
    expect(scoreVessel(h.factors).tier).toBe('orange');
  });
  it('流入池：發1 escalate 目標存在、發2 newship 末站高雄', () => {
    const esc = s.inflowPool.find((f) => f.kind === 'escalate');
    const nw = s.inflowPool.find((f) => f.kind === 'newship');
    expect(esc && s.fleet.some((v) => v.id === (esc as any).targetId)).toBe(true);
    expect(nw && (nw as any).vessel.ports.at(-1).name).toBe('高雄');
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run tests/epidemic-mock.test.ts`
Expected: FAIL（舊 epidemic.json 是單船 `ship/risk/...` 結構）

- [ ] **Step 4: 全面改寫 `src/data/mock/epidemic.json`**

**逐字轉錄 `docs/preview/preview-epidemic-redesign.html` 內的 `FLEET0` / `PIPE0` / `INFLOW` / `TR`** 為 JSON（把 JS 物件字面轉成 JSON：`P('香港',3,5)` → `{"name":"香港","dayIn":3,"dayOut":5}`、`P('高雄',13,13,{berthed:true})` → `{"name":"高雄","dayIn":13,"dayOut":13,"berthed":true}`）。頂層結構：

```json
{
  "timeRange": { "startDate": "06-19", "endDate": "07-02", "startDay": 0, "now": 13 },
  "pipeline": [ /* PIPE0 五筆：crawl/track/match(run:true)/score/sms，欄位 key,label,count,detail[],(run) */ ],
  "fleet": [ /* FLEET0 五筆：HORIZON 217 / MERIDIAN 9 / NORDIC 88 / PACIFIC DAWN / BLUE HERON */ ],
  "inflowPool": [ /* INFLOW 兩筆：escalate(targetId:'n88') + newship(CORAL EXPRESS) */ ]
}
```

驗證要點（對照 preview）：HORIZON 217 factors `{64,85,52}`；NORDIC 88 `{50,42,30}`；CORAL EXPRESS `{80,88,85}`；發1 escalate 的 `factors` 為 `{50,82,58}`、`event` 為釜山 day3。每艘船末站 `高雄` berthed。

- [ ] **Step 5: 刪 route.ts、把 index.ts 降為過渡殼**

刪除 `src/screens/epidemic/route.ts`。把 `src/screens/epidemic/index.ts` 改成能編譯的最小殼（讀新契約、渲染標頭 + 一行佔位，Task 3 重寫）：

```ts
import type { Screen } from '../types';
import { screenHeader } from '../../ui/components';
import type { EpidemicSnapshot } from '../../data/types';

const s: Screen = {
  async mount(el, ctx) {
    const snap: EpidemicSnapshot = await ctx.data.epidemic.snapshot();
    el.innerHTML =
      '<div class="swrap">' +
      screenHeader({ eyebrow: '港邊人員視角 · MODULE 05', color: '#F0648C', title: '疫情自動追溯', badges: ['AIS × WHO IHR · 規則式評分'], source: 'mock' }) +
      `<div class="anim" style="--d:.1s">進高雄船隊 ${snap.fleet.length} 艘 · 過渡殼（Task 3 重寫）</div>` +
      '</div>';
  },
};
export default s;
```

把 `src/screens/epidemic/epidemic.html` 內容暫時清成空字串（Task 3 重寫；此檔目前被舊 index.ts import，過渡殼不再 import 它，確保無殘留 import）。確認過渡殼**不 import** `epidemic.html`、`route.ts`。

- [ ] **Step 6: 跑測試 + 三綠燈**

Run: `npx vitest run tests/epidemic-mock.test.ts`（PASS）
Run: `npx tsc --noEmit && npx vitest run && npm run build`（三綠：tsc 0、vitest 全綠、build 成功）
Expected: 全綠。過渡殼頁面可到達、不崩（headless 或 `npm run dev` 開 `#/epidemic` 目視一行字）。

- [ ] **Step 7:（檢查點）由你 commit**

```
feat(epidemic): 資料契約改 fleet/pipeline/inflowPool + mock 全面改寫（皆進高雄）+ 刪 route.ts 降過渡殼
```

---

### Task 3: 版面骨架（epidemic.html / epidemic.css）+ 靜態渲染（標頭 / 管線帶 / 船隊清單 / 重點 chip / 右欄）

> 本 task 不含地圖與泳道（Task 4/5），中央地圖區與泳道區先留空容器。以預設選中船（分數最高者）靜態渲染左欄船隊 + 重點 chip + 右欄評分/情報/防護/簡訊 + 頂部管線帶（靜態態，無動畫）。

**Files:**
- Rewrite: `src/screens/epidemic/epidemic.html`
- Create: `src/screens/epidemic/epidemic.css`
- Rewrite: `src/screens/epidemic/index.ts`
- Modify: `src/ui/tokens.css`（若有 epidemic 專屬舊段落則清除；grep 確認）

**Interfaces:**
- Consumes: `EpidemicSnapshot`、`scoreVessel`、`computeHits`
- Produces（index.ts 模組內函式，供 Task 4-7 擴充）：
  - `renderFleet()`、`renderRight(v)`、`renderKeyRow(v)`、`renderPipe()`、`select(id)`、`sortedFleet()`、模組狀態 `fleet/pipe/curId/cursorDay`
  - CSS class 契約（`#s-epidemic` 前綴）：`.pipe/.pstage/.plamp/.pflow`、`.grid/.col/.panel/.cap`、`.frow/.rdot/.fname/.fstop/.fscore/.unread/.dim/.sel`、`.keyrow/.kchip`、`.map`、`.sl/.lane/.bar/.evt/.hitline/.cursor/.axis`、`.ring/.rulerow/.meter`、`.intel/.actchip/.sms`

- [ ] **Step 1: 寫 `epidemic.html` 骨架**

三分割骨架 + 佔位標記（對齊 preview `.grid` 結構；`#s-epidemic` scope 由 registry section id 提供）。逐字轉錄 preview `<div class="grid">…</div>` 的結構，把動態內容改成佔位容器：

```html
<div class="swrap">
  <!--HEADER-->
  <div class="pipe" id="epiPipe"></div>
  <div class="grid">
    <div class="col"><div class="panel" style="flex:1"><div class="cap">進高雄船隊 · 依風險排序</div><div id="epiFleet"></div></div></div>
    <div class="col">
      <div class="keyrow" id="epiKey"></div>
      <div class="panel"><div class="cap">Mapbox 真實航線 · 停靠序列 × 疫區（皆進高雄港）</div>
        <div class="map" id="epiMap"></div>
        <div class="sl" id="epiSl">
          <div class="lane"><span class="lname">船舶靠泊</span><div id="epiBerth"></div></div>
          <div class="lane" style="border-bottom:none"><span class="lname">疫情通報</span><div id="epiEvt"></div></div>
          <div id="epiHit"></div><div class="cursor" id="epiCursor" tabindex="0"></div>
        </div>
        <div class="axis" id="epiAxis"></div>
      </div>
    </div>
    <div class="col">
      <div class="panel"><div class="cap">規則式評分 · WHO IHR</div><div id="epiScore"></div></div>
      <div class="panel"><div class="cap">多來源情報 · 命中</div><div class="intel" id="epiIntel"></div></div>
      <div class="panel"><div class="cap">防護動作</div><div id="epiAdvice"></div></div>
      <div class="panel"><div class="cap">細胞簡訊 · 港邊派工</div><div class="sms" id="epiSms"></div></div>
    </div>
  </div>
</div>
```

（`<!--HEADER-->` 由 index.ts 用 `screenHeader` 取代；模擬偵測鈕放 header 的 `actionsHtml`。id 全用 `epi*` 前綴避免與別頁衝突。）

- [ ] **Step 2: 寫 `epidemic.css`（`#s-epidemic` 前綴）**

**逐字轉錄 preview `<style>` 內對應規則，每條前面加 `#s-epidemic` 前綴**（preview 的 `.pipe{...}` → `#s-epidemic .pipe{...}`，依此類推；`:root` 變數改為 `#s-epidemic{ --rose:... }` 或直接用 `tokens.css` 既有變數）。涵蓋：pipeline、grid、fleet、keyrow、map、swimlane、ring/meter、intel/actchip/sms、`.mk-port`/`.mk-ship`（Mapbox marker，Task 4 用）、`.hitpulse`（Task 6 用）。grid 為 `grid-template-columns:0.72fr 2.9fr 1fr`。`.map{height:400px}`。

- [ ] **Step 3: 重寫 `index.ts` — 靜態渲染（無地圖/泳道/互動）**

移植 preview 的 `LEVELS 之外` 邏輯：`scoreVessel`/`computeHits` 改成 `import` 自 `correlate.ts`（不要在 index.ts 重複定義）；`SRC`/`dotColor`/`sortedFleet`/`renderFleet`/`meterRow`/`renderRight`/`renderKeyRow`(即 preview `renderRight` 內組 keyrow 的那段，抽成獨立函式)/`renderPipe`（靜態，全 `done`/`run`，無動畫）。`select(id)` 本 task 只呼叫 `renderFleet()`/`renderRight(v)`/`renderKeyRow(v)`/`renderPipe()`（地圖/泳道留給 Task 4/5）。mount 內：

```ts
const snap = await ctx.data.epidemic.snapshot();
fleet = snap.fleet.map((v) => ({ ...v }));
pipe = snap.pipeline.map((s) => ({ ...s }));
timeRange = snap.timeRange; inflowPool = snap.inflowPool;
el.innerHTML = '<div class="swrap">' + screenHeader({ ..., actionsHtml: '<button class="simbtn" id="epiSim">模擬偵測</button>' }) + template(去掉 <div class="swrap"> 外層，或用 replace <!--HEADER-->) + ...
// 綁定、初次 select(sortedFleet()[0].id)
```

（`fleet/pipe/curId/cursorDay/timeRange/inflowPool` 為模組層 `let`；型別用 `EpidemicVessel` 等。渲染函式邏輯 1:1 對照 preview，唯選擇器改 `epi*` id。）

- [ ] **Step 4: tokens.css 清舊**

Run: `grep -nE "epidemic|risk-ring|tseq|tnode|\.route|\.factor|\.frow" src/ui/tokens.css`
若有 epidemic 專屬殘留（舊佔位頁的 `.risk-ring`/`.tseq`/`.tnode`/`.route`/`.factor` 等且無其他頁引用），刪除；共用選擇器（`.rosec`/`.amberc`/`.pill`）保留。無殘留則跳過。

- [ ] **Step 5: headless 驗證（靜態）**

用獨立 headless Chrome + CDP（比照 dispatch/policy 手法：`--remote-debugging-port` + 專屬 `--user-data-dir` + `--use-gl=angle --use-angle=swiftshader`）載入 `npm run dev` 的 `#/epidemic`，斷言：
- `#epiFleet .frow` 5 列、綠級船有 `.dim`、最高風險船 `.sel`
- `#epiKey .kchip` 4 張、`#epiScore .ring` 顯示分數（HORIZON 217 → 72）
- `#epiIntel` 命中列亮/未命中灰、`#epiAdvice .actchip`、`#epiSms` 有內文
- `#epiPipe .pstage` 5 個
- console 零錯誤

- [ ] **Step 6: 三綠燈**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: 全綠（`.map`/`.sl` 容器暫空、不報錯）

- [ ] **Step 7:（檢查點）由你 commit**

```
feat(epidemic): 三分割骨架 + epidemic.css + 船隊/重點chip/右欄/管線靜態渲染
```

---

### Task 4: Mapbox 依賴 + `worldmap.ts` + 選中船地圖渲染（航線 / 疫區熱點 / 港口 / 船位 / fitBounds）

**Files:**
- Modify: `package.json`（`npm install mapbox-gl` + `npm install -D @types/mapbox-gl`）
- Modify: `.env.example`（加 `VITE_MAPBOX_TOKEN=`）、`.env`（你本機填實際 token）
- Modify: `index.html`（`<head>` 加 Mapbox CSS：`<link href="https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.css" rel="stylesheet">`——或改由 worldmap.ts `import 'mapbox-gl/dist/mapbox-gl.css'`，擇一）
- Create: `src/screens/epidemic/worldmap.ts`
- Modify: `src/screens/epidemic/index.ts`（`select()` 內接上地圖渲染）

**Interfaces:**
- Consumes: `EpidemicVessel`、`Hit`（correlate）
- Produces（worldmap.ts）：
  - `export const PORT_COORDS: Record<string, [number, number]>`（逐字轉錄 preview `PORTS`）
  - `export interface WorldMap { renderVessel(v: EpidemicVessel, hits: Hit[]): void; setShipAt(v: EpidemicVessel, day: number): void; resize(): void; readonly ready: boolean }`
  - `export function createWorldMap(container: HTMLElement, onReady: () => void): WorldMap`（讀 token 用 **repo 既有寫法** `(import.meta as any).env?.VITE_MAPBOX_TOKEN`——對齊 `carbon.ts` 第 4 行，規避 vite/client 未宣告自訂 env 鍵的型別問題；缺 token → 顯示降級提示卡、`ready` 恆 false、其餘方法 no-op）
  - `export function shipLonLatAt(v: EpidemicVessel, day: number): [number, number]`（分段線性插值，逐字轉錄 preview）

- [ ] **Step 1: 安裝 Mapbox**

Run: `npm install mapbox-gl && npm install -D @types/mapbox-gl`
Expected: package.json 出現 `mapbox-gl` dep + `@types/mapbox-gl` devDep；`npm run build` 仍成功。

- [ ] **Step 2: `.env.example` + `.env`**

`.env.example` 追加一行 `VITE_MAPBOX_TOKEN=`（空值，示意）。`.env`（gitignored）填入你的 `pk.` token。

- [ ] **Step 3: 寫 `worldmap.ts`**

逐字轉錄 preview 的 `PORTS`→`PORT_COORDS`、`shipLonLatAt`、`initMap`/`renderMap`/`updateShip` 邏輯，包裝成 `createWorldMap` factory 回傳 `WorldMap` handle。要點（照 preview 已驗證的實作）：
- `import mapboxgl from 'mapbox-gl'`；token 從 `import.meta.env.VITE_MAPBOX_TOKEN` 讀。
- 無 token（非 `pk.` 開頭）：`container` 內插降級提示卡、`ready=false`、`renderVessel/setShipAt/resize` no-op。
- 有 token：建圖前**清空 container**；`new mapboxgl.Map({ style:'mapbox://styles/mapbox/dark-v11', center:[118,20], zoom:3.1, attributionControl:false })`；`map.on('load')` 內 addSource/addLayer（`route` line、`hotspots` circle、`trail` circle）+ 建 ship marker（DOM `.mk-ship`），設 `ready=true` 後呼叫 `onReady()`。
- `renderVessel(v,hits)`：setData `route`（LineString 經 `v.ports.map(p=>PORT_COORDS[p.name])`）、`hotspots`（events → 熱點，rose 大、amber 小）、清舊港口 markers 重建（`.mk-port` + 標籤，rose/amber/高雄綠/常態灰，高雄標「（目的港）」）、`setShipAt(v, timeRange.now)`、`fitBounds` 至航線範圍（padding 60-70、maxZoom 6.5）。
- `setShipAt(v,day)`：`shipMarker.setLngLat(shipLonLatAt(v,day))` + 更新 `trail` source（4 點淡出）。

- [ ] **Step 4: index.ts 接上地圖**

模組層加 `let map: WorldMap`。mount 內 `map = createWorldMap(el.querySelector('#epiMap')!, () => { if (curId) map.renderVessel(current(), hitsOf(current())); });`。`select(id)` 內在 `renderFleet/renderRight/...` 後加 `if (map.ready) map.renderVessel(v, computeHits(v.ports, v.events));`（`current()`/`hitsOf` 為小工具）。地圖渲染綁 `show()`（首次可見才有正確尺寸，比照既有 canvas 手法；並在 `show()` 呼叫 `map.resize()`）。

- [ ] **Step 5: headless 驗證（地圖，需連網 + token）**

CDP 載入 `#/epidemic`，等 ~5s（Mapbox 磚），斷言（比照已驗證的 preview）：
- `map.ready===true`、`#epiMap canvas.mapboxgl-canvas` 存在、mapbox 網路請求 > 0
- 選中 HORIZON 217：港口 marker 3 個、`.mk-ship` 存在、香港疫區熱點 source 有 feature
- `setShipAt(v, 0/4/13)` → shipMarker `getLngLat()` 依序 ≈ 馬尼拉/香港/高雄
- console 零錯誤、零 Mapbox warning

- [ ] **Step 6: 三綠燈**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: 全綠（`@types/mapbox-gl` 提供型別；`import.meta.env` 型別 OK）

- [ ] **Step 7:（檢查點）由你 commit**

```
feat(epidemic): Mapbox worldmap.ts 真實地圖 + 選中船航線/熱點/港口/船位/fitBounds
```

---

### Task 5: `swimlane.ts`（Epi-Gantt 雙泳道 + 命中連接線）+ 點船下鑽連動

**Files:**
- Create: `src/screens/epidemic/swimlane.ts`
- Modify: `src/screens/epidemic/index.ts`（`select()` 連動泳道；點船列已於 Task 3 綁 onclick，本 task 補齊地圖+泳道+右欄全連動）

**Interfaces:**
- Consumes: `EpidemicVessel`、`Hit`、`timeRange`
- Produces（swimlane.ts）：
  - `export interface SwimlaneEls { berth: HTMLElement; evt: HTMLElement; hit: HTMLElement; axis: HTMLElement; sl: HTMLElement }`
  - `export function renderSwimlane(els: SwimlaneEls, v: EpidemicVessel, hits: Hit[], timeRange: EpidemicSnapshot['timeRange']): void`
  - `export function dayToX(day: number, w: number, timeRange): number`（供 Task 6 游標定位共用）

- [ ] **Step 1: 寫 `swimlane.ts`**

逐字轉錄 preview 的 `renderSwimlane`（靠泊 bar 依命中著色、通報點依來源著色、命中連接線 `.hitline`（rose/amber，線寬 = `min(1.5+mag*0.6,5)`）、時間軸標籤）。`dayToX(day,w,tr)=(day-tr.startDay)/(tr.now-tr.startDay)*w`。泳道寬度取 `els.sl.clientWidth-62`。

- [ ] **Step 2: index.ts — select() 全連動**

`select(id)` 完整版：`curId=id; cursorDay=timeRange.now;` → `renderFleet()`（選中 `.sel`、未讀清除）→ `if(map.ready) map.renderVessel(v,hits)` → `renderSwimlane(swimEls, v, hits, timeRange)` → `renderRight(v)` → `renderKeyRow(v)` → `positionCursor()`（Task 6 定義，本 task 先讓游標歸位到 now 的 x）。點左欄 `.frow` → `select(v.id)`。

- [ ] **Step 3: headless 驗證（下鑽連動）**

CDP：點 `#epiFleet .frow`（第 2、3 艘）→ 斷言 `.sel` 換船、`#epiScore .ring` 數字更新、`#epiBerth .bar` 數量 = 該船停靠數、命中船有 `.hitline`、地圖 `renderVessel` 被呼叫（港口 marker 數更新）、右欄 intel/sms 更新。切船時 console 零錯誤。

- [ ] **Step 4: 三綠燈 + commit**

Run: `npx tsc --noEmit && npx vitest run && npm run build`（全綠）

```
feat(epidemic): swimlane.ts Epi-Gantt 雙泳道 + 命中連接線 + 點船下鑽全連動
```

---

### Task 6: 時間游標（拖曳 / 點擊 / 鍵盤 + 船沿航線插值 + 命中脈衝）

**Files:**
- Modify: `src/screens/epidemic/index.ts`（游標互動 + `positionCursor`/`setCursor`/`pulseHit`）
- Modify: `src/screens/epidemic/epidemic.css`（`.hitpulse` 動畫若 Task 3 未含則補）

**Interfaces:**
- Consumes: `dayToX`（swimlane）、`map.setShipAt`、`computeHits`、`shipLonLatAt`
- Produces: `positionCursor()`、`setCursor(day)`（供 select 歸位共用）

- [ ] **Step 1: 實作游標互動**

逐字轉錄 preview 的游標段：`cursorToDay(clientX)`、`setCursor(day)`（更新 `cursorDay` → `map.setShipAt(v,cursorDay)` + `positionCursor()` + 命中脈衝：游標越過 `hit.markerDay` 時 `pulseHit(h)`）、`positionCursor()`（`#epiCursor.style.left = 62 + dayToX(cursorDay,w)`）、`pulseHit(h)`。事件綁定：
- `#epiCursor` `pointerdown` → 拖曳（`setPointerCapture` 包 `try/catch`，合成事件防 NotFoundError）；`window` `pointermove/pointerup`。
- `#epiSl` `pointerdown`（非游標本體）→ 點擊即跳游標 + 起拖。
- `#epiCursor` `keydown`：←/→ 步進、Home/End 端點，**`stopPropagation()` + `preventDefault()`**（不觸發 main.ts 全站導覽 `1-6/0`）。

- [ ] **Step 2: headless 驗證（游標）**

CDP：
- `setCursor(0/4/13)` → `shipMarker.getLngLat()` 依序 ≈ 馬尼拉/香港/高雄（船沿真實航線插值）
- 游標 `#epiCursor` focus 後送 `ArrowLeft`/`ArrowRight` → `cursorDay` 變、`location.hash` 不變（不誤觸導覽）
- 拖曳越過命中日 → `.hitpulse.act` 出現
- console 零錯誤

- [ ] **Step 3: 三綠燈 + commit**

```
feat(epidemic): 時間游標拖曳/點擊/鍵盤 + 船沿真實航線插值 + 命中脈衝
```

---

### Task 7: 管線進場動畫 + 點階段看來源 + 模擬偵測（池兩發 + 重排 + 9s 自動）+ show/hide 生命週期 + reduced-motion

**Files:**
- Modify: `src/screens/epidemic/index.ts`

**Interfaces:**
- Consumes: `inflowPool`、`scoreVessel`、`ctx.ui.toast`
- Produces: 完整生命週期（mount/show/hide）+ 四互動全接齊

- [ ] **Step 1: 管線進場動畫 + 點階段 detail**

逐字轉錄 preview：`playPipe()`（`show()` 時五燈依序 `done`→`run`→`wait` 點亮 + `.pflow.lit` 流光；`prefers-reduced-motion` 直接終態）；`renderPipe` 內每 `.pstage` 綁 click → 切換 `.pdetail.show`（顯示 `detail[]`，來源列為 `<a>`），`document.body` click 收合。

- [ ] **Step 2: 模擬偵測（池兩發 + 重排 + 9s 自動）**

逐字轉錄 preview `simulate()`：
- 發1 `escalate`：目標船 `factors=f.factors`、`events.push(f.event)`、`intel` 前插命中列、`_unread=(id!==curId)` → `renderFleet()` 重排；若目標 = 目前選中則 `select` 重繪（分數 41→68、泳道新增釜山命中）。
- 發2 `newship`：`fleet.unshift({...vessel,_unread:true})` → `renderFleet()`（CORAL 85 置頂、未讀點、不搶選中）。
- 池用盡（`inflowIdx>=2`）→ 重置（`fleet=FLEET0 副本`、`inflowIdx=0`、若選中船已不存在則回選第一、toast「重置」）。
- 每發 `ctx.ui.toast({ title:'疫情自動追溯', message:f.toast })`。
- `#epiSim` click → `simulate()`；`show()` 內武裝 9 秒自動流入（`autoArmed && inflowIdx===0 && 本頁 active` 才觸發發1；離頁不誤跳，比照 policy）。

- [ ] **Step 3: show/hide 生命週期 + reduced-motion**

`show()`：`map.resize()` + 若首次或曾 resize 則 `map.renderVessel` 重繪 + `renderSwimlane` 重繪 + `playPipe()` + 武裝自動流入計時器。`hide()`：清掉自動流入 timer（避免離頁誤觸）。`prefers-reduced-motion`：管線直接終態、模擬流入不播滑入動畫（比照 preview/policy）。resize 監聽：本頁 active 時 `map.resize()` + `renderSwimlane` 重繪。

- [ ] **Step 4: headless 驗證（全互動）**

CDP（沿用 dispatch/policy 手法，真實時間流逝）：
- 管線：進頁五燈依序點亮；點 `.pstage` → `.pdetail` 顯示；`reduced-motion` 直接終態
- 模擬偵測 3 連擊：發1 NORDIC 41→68 重排上升 + 泳道釜山命中；發2 CORAL 85 置頂 + 未讀不搶選中；第三擊重置回初始
- 9 秒閒置自動流入僅未手動時觸發一次；停在 hero 頁 9 秒內不跳 epidemic toast
- `hide()` 後 timer 清除；`reduced-motion` 全動畫直接終態
- console 零錯誤

- [ ] **Step 5: 三綠燈 + commit**

```
feat(epidemic): 管線進場動畫+點階段看來源 + 模擬偵測池兩發 + show/hide 生命週期 + reduced-motion
```

---

### Task 8: 全站驗收（spec §10 逐項）+ HANDOFF 收尾

**Files:**
- Modify: `HANDOFF.md`
- （視需要）`docs/preview/preview-epidemic-redesign.html`：確認 token 已還原為佔位 `__MAPBOX_TOKEN__`（勿把含 token 版留在版控）

**Interfaces:** 無新增，純驗收。

- [ ] **Step 1: 三綠燈總驗**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: tsc 0、vitest 全綠（含 `epidemic-correlate` + `epidemic-mock`）、build 成功。

- [ ] **Step 2: spec §10 逐項 headless 驗收**

獨立 headless Chrome + CDP，逐項跑 spec §10 驗收清單並存證：
1. 內容規範：grep 頁面輸出無真實具名事件/船/公司；無散文段落。
2. 四互動：點船下鑽（≥3 艘）/ 時間游標（船插值 + 命中脈衝 + 鍵盤不觸發導覽）/ 管線（進場 + 點階段 + reduced-motion）/ 模擬偵測（發1 升級、發2 新船、重置、9s 自動、離頁不誤跳）。
3. 引導性配色：常態壓灰、風險/命中發亮（三情境截圖存證：初始 / 升級後 / 新船）。
4. `prefers-reduced-motion: reduce`：全動畫直接終態、內容完整。
5. 七頁全站迴歸：hero→carbon→policy→twin→dispatch→epidemic→alert→hero，console 零新增錯誤。

- [ ] **Step 3: 還原 preview token**

確認 `docs/preview/preview-epidemic-redesign.html` 的 `MAPBOX_TOKEN` 已改回佔位 `__MAPBOX_TOKEN__`（避免 token 進版控）；或於 commit 前處理。

- [ ] **Step 4: 更新 HANDOFF**

`HANDOFF.md` 第 1 節改為「Epidemic 頁改版：SDD 8 tasks 完成，全站驗收綠燈，待使用者實機驗收 + 決定合併方式」，記錄成果檔案、驗收證據、殘留事項（Mapbox 需連網/token）。

- [ ] **Step 5:（檢查點）由你 commit**

```
feat(epidemic): 全站驗收（三綠 + 四互動 headless + 七頁迴歸）+ HANDOFF 收尾
```

---

## Self-Review 紀錄

- **Spec coverage**：D1 船隊總覽→下鑽（T3/T5）；D2 上地圖+下泳道共用游標（T4/T5/T6）；D3 Mapbox（T4）；D4 規則評分純函式（T1）；D5 時空命中（T1）；D6 四互動（T3-T7）；D7 模擬偵測池兩發（T7）；D8 無散文（T3 骨架+Global Constraints）；D9 引導性配色（T3 css + Global Constraints）。§4 契約（T2）；§5 correlate（T1）；§6 mock 劇本（T2）；§8 配色（T3）；§9 檔案結構（全）；§10 驗收（T8）。
- **Placeholder scan**：Task 1/2 附完整測試碼與實作碼；UI task（3-7）以「逐字轉錄 preview + 精確選擇器/簽章 + headless 斷言」呈現（比照 dispatch/policy 前例，preview 為已驗證的 exact-code 來源），非 TODO。
- **Type consistency**：`scoreVessel`/`computeHits`/`Hit`/`VesselScore`/`RiskTier`（correlate，T1）→ index/swimlane/worldmap 一致引用；`EpidemicVessel`/`EpidemicSnapshot` 等（types.ts，T2）跨 task 一致；worldmap `createWorldMap`/`WorldMap.renderVessel/setShipAt/resize/ready`、`PORT_COORDS`、`shipLonLatAt`（T4）→ index（T4/T6）一致；swimlane `renderSwimlane`/`SwimlaneEls`/`dayToX`（T5）→ index 游標（T6）一致。
