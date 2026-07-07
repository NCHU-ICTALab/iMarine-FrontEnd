# Alert 頁改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 alert 頁從初版 mock 佔位頁改版為「獨立警報中心」：港區事件經分級規則以 Cell Broadcast 推播——左事件流 / 中 Mapbox 覆蓋地圖（cell 點亮+圍欄+波紋）/ 右手機 mock + 送達漏斗，含下鑽、演練池、tooltip、Ack 四互動。

**Architecture:** 資料契約改為 `kpi + cells[] + feed[] + drillPool[]` 的 `AlertSnapshot`；漏斗轉換率由純函式 `funnel.ts`（TDD）算出；中央主視覺 `broadcastmap.ts`（Mapbox dark-v11 高雄港，cell markers/圍欄 layer/pulsing dot/波紋）；膠合層 `index.ts` 管下鑽/演練/篩選/Ack 與生命週期。視覺與互動基準：`docs/preview/preview-alert-redesign.html`（**v2，使用者已驗收**；headless CDP 43 斷言全過、console 零錯誤）。spec：`docs/superpowers/specs/2026-07-07-alert-redesign-design.md`。

**Tech Stack:** Vite + vanilla TS；Liquid Glass Kit；Mapbox GL JS（已在 dependencies，epidemic 引入）；vitest（純邏輯）；headless Chrome + CDP（互動驗證，SwiftShader flags、勿加 `--disable-gpu`）。

## Global Constraints

- **無解釋性散文**：事件卡摘要/分級軌跡全用資料片段（「泊位 108 · 評分 68 · 限制登輪」），不寫完整句；手機簡訊維持 PWS 官方訊息結構（真實內容，允許）。無 emoji。
- **引導性配色**：模組色橘紅 `#FF7A59` 是全頁唯一高飽和色（rail active/eyebrow/紅色警報/圍欄/波紋/cell 點亮）；severity 色 `red:#FF7A59 / orange:#F5A54A / notice:#9fb0c3 / clear:#35E0A6`；橙紅級標題常態帶 sev 色、notice/clear 壓灰；選中卡光暈用 `color-mix` 跟 sev 色。
- **分級體系**：港區三級（紅色警報/橙色警戒/作業提示）+ 解除；PWS 對映 CH 碼：red→`CH 4371`、orange/notice→`CH 911`、clear→`CH 919`。
- **視線起點**：進頁自動選中 feed 首筆（最高風險）；演練池重置後同樣回到首筆，不留空地圖。
- **CSS scope**：alert.css 全選擇器 `#s-alert` 前綴；不手寫 `backdrop-filter`；小型重複元件用 `lg-static`。
- **Mapbox**：token 讀法同 epidemic worldmap.ts——`getSetting('frontend.mapboxToken','')` 優先、其次 `(import.meta as any).env?.VITE_MAPBOX_TOKEN`；缺 token 優雅降級提示卡；建圖前容器淨空。**坑（preview 已踩過，必守）**：不可對 Mapbox marker 根元素設 `position`（會蓋掉 `.mapboxgl-marker{position:absolute}` 造成逐顆累積偏移）；演練軌跡節點 state（done/run/wait）必須映射到 CSS class 才會亮。
- **provider**：維持 mock（`source:'mock'`），`createMockExchange()` 接線不變（只換 `AlertSnapshot` 型別）。
- **reduced-motion**：讀共用 `prefersReduced()`（`src/screens/settings/storage.ts`）；演練/下鑽/漏斗直達終態，內容完整非空白。
- **三綠燈**：每 task 完成時 `npx tsc --noEmit` 0 errors、`npx vitest run` 全綠、`npm run build` 成功。
- **commit**：SDD 檢查點由 **implementer subagent 自行 commit**（使用者 2026-07-07 授權，同 policy/dispatch/epidemic/settings 前例）——本地、commit 訊息無任何 Claude/Anthropic 署名、永不 push；每 task 末的 commit 訊息為建議格式。最終合併方式 finishing 再問使用者。

---

### Task 1: `funnel.ts` — 送達漏斗純邏輯（TDD）

**Files:**
- Create: `src/screens/alert/funnel.ts`
- Test: `tests/alert-funnel.test.ts`
- Modify: `src/data/types.ts`（先加 `AlertFunnel` interface 供 funnel.ts 引用；其餘契約 Task 2 換）

**Interfaces:**
- Produces:
  - `export interface FunnelRates { published: number; delivered: number; acked: number }`（各段相對前一段的轉換率 %，1 位小數）
  - `export function funnelRates(f: AlertFunnel): FunnelRates`
  - `export function sumDelivered(funnels: AlertFunnel[]): number`（各行 delivered 加總，KPI/標籤用）
  - `export const FUNNEL_STEPS: ReadonlyArray<readonly [keyof AlertFunnel & string, string]>`＝`[['triggered','觸發'],['published','發布'],['delivered','送達'],['acked','回報']]`
- Consumes: `AlertFunnel`（本 task 於 types.ts 新增）

- [ ] **Step 1: types.ts 先加 AlertFunnel**

在 `src/data/types.ts` 既有 `AlertSnapshot`（第 121-125 行）**上方**插入（舊 `AlertSnapshot` 暫留，Task 2 整段換）：

```ts
export interface AlertFunnel { label: string; triggered: number; published: number; delivered: number; acked: number }
```

- [ ] **Step 2: 寫失敗測試**

```ts
// tests/alert-funnel.test.ts
import { describe, it, expect } from 'vitest';
import { funnelRates, sumDelivered, FUNNEL_STEPS } from '../src/screens/alert/funnel';
import type { AlertFunnel } from '../src/data/types';

describe('funnelRates', () => {
  it('各段相對前一段轉換率，四捨五入到 1 位小數', () => {
    const f: AlertFunnel = { label: '人員', triggered: 420, published: 415, delivered: 408, acked: 377 };
    expect(funnelRates(f)).toEqual({ published: 98.8, delivered: 98.3, acked: 92.4 });
  });
  it('前一段為 0 → 轉換率 0（不除以零）', () => {
    const f: AlertFunnel = { label: 'x', triggered: 0, published: 0, delivered: 0, acked: 0 };
    expect(funnelRates(f)).toEqual({ published: 0, delivered: 0, acked: 0 });
  });
  it('100% 邊界', () => {
    const f: AlertFunnel = { label: '船舶', triggered: 47, published: 47, delivered: 47, acked: 41 };
    expect(funnelRates(f).published).toBe(100);
    expect(funnelRates(f).delivered).toBe(100);
    expect(funnelRates(f).acked).toBe(87.2);
  });
});

describe('sumDelivered', () => {
  it('多行 delivered 加總', () => {
    expect(sumDelivered([
      { label: '人員', triggered: 2400, published: 2400, delivered: 2362, acked: 1875 },
      { label: '船舶', triggered: 47, published: 47, delivered: 47, acked: 41 },
    ])).toBe(2409);
  });
  it('空陣列 → 0', () => { expect(sumDelivered([])).toBe(0); });
});

describe('FUNNEL_STEPS', () => {
  it('四段固定順序', () => {
    expect(FUNNEL_STEPS.map(s => s[0])).toEqual(['triggered', 'published', 'delivered', 'acked']);
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run tests/alert-funnel.test.ts`
Expected: FAIL（`funnel.ts` 不存在 → 匯入錯誤）

- [ ] **Step 4: 寫最小實作**

```ts
// src/screens/alert/funnel.ts
// 送達漏斗純函式：轉換率只由此算（單一真相來源）；mock 只存四段 raw 計數。
import type { AlertFunnel } from '../../data/types';

export const FUNNEL_STEPS = [
  ['triggered', '觸發'],
  ['published', '發布'],
  ['delivered', '送達'],
  ['acked', '回報'],
] as const;

export interface FunnelRates { published: number; delivered: number; acked: number }

const pct = (num: number, den: number): number => (den === 0 ? 0 : Math.round((num / den) * 1000) / 10);

export function funnelRates(f: AlertFunnel): FunnelRates {
  return {
    published: pct(f.published, f.triggered),
    delivered: pct(f.delivered, f.published),
    acked: pct(f.acked, f.delivered),
  };
}

export function sumDelivered(funnels: AlertFunnel[]): number {
  return funnels.reduce((s, f) => s + f.delivered, 0);
}
```

- [ ] **Step 5: 跑測試確認通過 + 三綠燈**

Run: `npx vitest run tests/alert-funnel.test.ts` → PASS（6 tests）
Run: `npx tsc --noEmit` → 0 errors；`npx vitest run` → 全綠（既有 49 + 新 6）

- [ ] **Step 6: 建議 commit 訊息（使用者自行 commit）**

`feat(alert): funnel.ts 送達漏斗轉換率純函式 TDD`

---

### Task 2: 資料契約 `AlertSnapshot` 全面改寫 + mock JSON 逐字轉錄 + 降過渡殼（TDD）

**Files:**
- Modify: `src/data/types.ts:121-125`（舊 `AlertSnapshot` 整段換新契約）
- Modify: `src/data/mock/alert.json`（全面改寫，數值**逐字轉錄**自 `docs/preview/preview-alert-redesign.html` 的 `CELLS`/`FEED0`/`POOL` 常數與 `renderKpis()`）
- Modify: `src/screens/alert/index.ts`（降為過渡殼：舊渲染全刪，只留最小 mount 佔位，Task 3 重寫）
- Modify: `src/screens/alert/alert.html`（清空為註解佔位——不可帶 `id="s-alert"`，Task 3 重寫）
- Test: `tests/alert-mock.test.ts`

**Interfaces:**
- Produces（`src/data/types.ts`，後續 task 全依賴這組名稱）:

```ts
export type AlertSev = 'red' | 'orange' | 'notice' | 'clear';
export interface AlertFunnel { label: string; triggered: number; published: number; delivered: number; acked: number }
export interface AlertTrace { rule: string; threshold: string; pws: string; ch: string; publishSec: number }
export interface AlertSms { unit: string; event: string; area: string; action: string }
export interface AlertEvent {
  id: string;
  cat: 'epi' | 'wx' | 'ok';
  sev: AlertSev;
  source: 'epidemic' | 'dispatch' | 'weather' | 'system';
  title: string; body: string; time: string;
  ch: string;
  lngLat: [number, number];
  fence: [number, number][];
  cellsLit: string[];
  funnels: AlertFunnel[];
  trace: AlertTrace;
  sms: AlertSms;
  acked: boolean;
}
export interface AlertCell { id: string; lngLat: [number, number]; delivered: number }
export interface AlertSnapshot {
  kpi: { published: number; reachedPeople: number; reachedShips: number; avgSec: number; deliveryRate: number };
  cells: AlertCell[];
  feed: AlertEvent[];
  drillPool: AlertEvent[];
}
```

（`AlertEvent.toast` 不進契約——preview 的 `toast` 字串由 index.ts 依 sev 組出，見 Task 5。）
- Consumes: Task 1 的 `AlertFunnel`（同名合併，Task 1 已放對位置則不動）。

- [ ] **Step 1: 寫失敗測試（mock 契約）**

```ts
// tests/alert-mock.test.ts
import { describe, it, expect } from 'vitest';
import snap from '../src/data/mock/alert.json';
import type { AlertSnapshot, AlertEvent } from '../src/data/types';

const s = snap as unknown as AlertSnapshot;
const CH_BY_SEV: Record<string, string[]> = {
  red: ['CH 4371'], orange: ['CH 911'], notice: ['CH 911'], clear: ['CH 919'],
};
const allEvents: AlertEvent[] = [...s.feed, ...s.drillPool];

describe('alert mock 契約', () => {
  it('kpi 五欄 / cells(9) / feed(6) / drillPool(2)', () => {
    expect(s.kpi.published).toBe(14);
    expect(s.kpi.reachedPeople).toBeGreaterThan(0);
    expect(s.kpi.reachedShips).toBeGreaterThan(0);
    expect(s.cells).toHaveLength(9);
    expect(s.feed).toHaveLength(6);
    expect(s.drillPool).toHaveLength(2);
  });
  it('feed 首筆為最高風險（orange · epidemic 來源）——進頁自動選中的視線起點', () => {
    expect(s.feed[0].sev).toBe('orange');
    expect(s.feed[0].source).toBe('epidemic');
  });
  it('每筆事件：cellsLit id 都存在於 cells、fence ring ≥ 3 點、sev↔CH 對映符合分級表', () => {
    const cellIds = new Set(s.cells.map((c) => c.id));
    for (const e of allEvents) {
      e.cellsLit.forEach((id) => expect(cellIds.has(id)).toBe(true));
      expect(e.fence.length).toBeGreaterThanOrEqual(3);
      expect(CH_BY_SEV[e.sev]).toContain(e.ch);
      expect(e.trace.ch).toBe(e.ch);
    }
  });
  it('紅色警報事件雙漏斗（人員+船舶）、其餘單漏斗；漏斗四段遞減', () => {
    for (const e of allEvents) {
      expect(e.funnels.length).toBe(e.sev === 'red' ? 2 : 1);
      for (const f of e.funnels) {
        expect(f.triggered).toBeGreaterThanOrEqual(f.published);
        expect(f.published).toBeGreaterThanOrEqual(f.delivered);
        expect(f.delivered).toBeGreaterThanOrEqual(f.acked);
      }
    }
  });
  it('演練池：發1 notice 雷擊、發2 red 颱風（cellsLit 全 9 格）', () => {
    expect(s.drillPool[0].sev).toBe('notice');
    expect(s.drillPool[1].sev).toBe('red');
    expect(s.drillPool[1].cellsLit).toHaveLength(9);
  });
  it('sms 四欄 PWS 結構齊全', () => {
    for (const e of allEvents) {
      expect(e.sms.unit.length).toBeGreaterThan(0);
      expect(e.sms.event.length).toBeGreaterThan(0);
      expect(e.sms.area.length).toBeGreaterThan(0);
      expect(e.sms.action.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/alert-mock.test.ts`
Expected: FAIL（舊 alert.json 無 cells/drillPool 等欄位）

- [ ] **Step 3: types.ts 換新契約**

把 `src/data/types.ts` 舊 `AlertSnapshot`（含 Task 1 加的 `AlertFunnel` 那段）整段換成上方 Interfaces 區塊的完整定義。`DataExchange.alert: Provider<AlertSnapshot>` 一行不動。

- [ ] **Step 4: mock JSON 逐字轉錄**

`src/data/mock/alert.json` 全面改寫。資料來源＝preview 檔 `<script>` 內的常數，**逐字轉錄、不臆造**：
- `kpi`：`{"published":14,"reachedPeople":2610,"reachedShips":47,"avgSec":3.2,"deliveryRate":98.2}`（對齊 `renderKpis()` 的字面：14 / 2,610 / 47 / 3.2 s / 98.2%）
- `cells`：preview `CELLS` 9 筆原樣（id `KH-01`…`KH-09`、lngLat、delivered）。
- `feed`：preview `FEED0` 6 筆原樣（e1-e6 全欄位：id/cat/sev/source/title/body/time/ch/lngLat/fence/cellsLit/funnels/trace/sms/acked；`F(...)` 展開成物件）。
- `drillPool`：preview `POOL` 2 筆原樣（d1/d2；**去掉 `toast` 欄位**，由 index.ts 組字串）。

- [ ] **Step 5: index.ts 降過渡殼 + alert.html 清空**

`src/screens/alert/alert.html` 整檔換成（**不可帶 `id="s-alert"`**——router 已建 `<section id="s-alert">`（router.ts:48），template 再放同 id 會重複）：

```html
<!-- alert 改版過渡佔位（Task 3 重寫版面） -->
```

`src/screens/alert/index.ts` 整檔換成（讓 tsc 對新契約可編譯、頁面可到達不崩）：

```ts
/* Alert screen 過渡殼 — 改版進行中（Task 3 重寫版面）。 */
import type { Screen } from '../types';
import template from './alert.html?raw';

const s: Screen = {
  async mount(el) {
    el.innerHTML = '<div class="swrap">' + template + '</div>';
  },
};
export default s;
```

- [ ] **Step 6: 跑測試 + 三綠燈**

Run: `npx vitest run tests/alert-mock.test.ts` → PASS（6 tests）
Run: `npx tsc --noEmit` → 0；`npx vitest run` → 全綠；`npm run build` → 成功。
（舊 index.ts 引用的 `statRow`/`SEV_COLOR` 等已隨過渡殼刪除，不會殘留編譯錯誤。）

- [ ] **Step 7: 建議 commit 訊息**

`feat(alert): AlertSnapshot 新契約 + mock 逐字轉錄 preview v2 + 降過渡殼`

---

### Task 3: 三分割骨架 + `alert.css` + 靜態渲染與基本互動（篩選/Ack/下鑽非地圖部分）

**Files:**
- Modify: `src/screens/alert/alert.html`（重寫：標頭佔位 + KPI 列 + 三分割骨架）
- Create: `src/screens/alert/alert.css`（自 preview `<style>` 逐條轉錄，全 `#s-alert` 前綴）
- Modify: `src/screens/alert/index.ts`（重寫：渲染 + select/篩選/Ack/軌跡展開；地圖留 stub）
- Modify: `src/ui/tokens.css`（刪 alert 舊佔位段）

**Interfaces:**
- Consumes: Task 1 `funnelRates`/`sumDelivered`/`FUNNEL_STEPS`；Task 2 `AlertSnapshot`/`AlertEvent`/`AlertSev`。
- Produces（index.ts 模組內，Task 4/5 會擴充同檔）:
  - `const SEVC: Record<AlertSev, string>`、`const SEVN: Record<AlertSev, string>`、`const SRCC: Record<AlertEvent['source'], string>`（色/名查表，值逐字對齊 preview）
  - `function select(id: string): void`（下鑽：重繪 feed + 漏斗 + 手機；Task 4 加地圖）
  - `function renderFeed(): void`、`function renderFunnel(ev: AlertEvent, countUp: boolean): void`、`function renderPhone(ev: AlertEvent, drill: boolean): void`、`function traceHtml(ev: AlertEvent, states: string[] | null): string`
  - `type FeedItem = AlertEvent & { _unread?: boolean; _traceStates?: string[] | null }`（runtime 旗標不進資料契約，同 epidemic `FleetVessel` 手法）
  - `const SIM_BTN = '<button class="lg lg-btn lg-btn--accent lg-btn--sm" data-lg id="simBtn">模擬事件</button>'`（沿舊版 DEMO_BTN 樣式，改字與 id）
  - 模組層狀態（epidemic index.ts:30-41 同構）：`let feed: FeedItem[]`、`let drillPool: AlertEvent[]`、`let snap0: AlertSnapshot`（重置用初始複本）、`let curId: string | null`、`let curCat: string`、`let sectionEl: HTMLElement`、`let sCtx: ScreenCtx`（`map: BroadcastMap` 於 Task 4 才宣告，本 task 不引用）——渲染函式收模組層 `sectionEl` 查 DOM，`mount()` 開頭捕捉 `sectionEl = el; sCtx = ctx; snap0 = snap; feed = snap.feed.map(e => ({ ...e })); drillPool = snap.drillPool`

- [ ] **Step 1: alert.html 重寫**

自 preview `<body>` 的 `.swrap` 內容轉錄（標頭由 `screenHeader` 產生故不進 template；`.note` 示範說明不搬）：

```html
<div class="keyrow"><!--KPIS--></div>
<div class="agrid">
  <div class="acol">
    <div class="panel apanel-feed">
      <div class="cap">警報事件流</div>
      <div class="fbar">
        <button class="fchip is-on" data-cat="all">全部</button><button class="fchip" data-cat="epi">疫情</button><button class="fchip" data-cat="wx">氣象</button><button class="fchip" data-cat="ok">解除</button>
      </div>
      <div id="afeed"></div>
    </div>
  </div>
  <div class="acol">
    <div class="panel"><div class="cap">Cell Broadcast 覆蓋 · 高雄港區</div>
      <div class="amap" id="amap"></div>
    </div>
  </div>
  <div class="acol">
    <div class="panel"><div class="cap">港區人員手機 · 接收端</div>
      <div class="phone" id="aphone">
        <div class="notch"></div><div class="ptime">19:36</div><div class="pdate">7月7日 星期二 · 高雄港區</div>
        <div id="aphoneScr"></div>
        <div class="palert" id="apalert"></div>
      </div>
    </div>
    <div class="panel"><div class="cap">送達漏斗</div><div id="afunnel"></div></div>
  </div>
</div>
```

（class 更名：preview `.grid/.col/.map/#map/#phone/#phoneScr/#palert/#feed/#funnel/#kpis` → `.agrid/.acol/.amap/#amap/#aphone/#aphoneScr/#apalert/#afeed/#afunnel/.keyrow` 佔位註解——避開全站通用名；其餘 class（ecard/trace/tnode/cell/cellwrap/pdot/ripple/phone 系/fun 系/fbar/fchip/kchip/chb/ackbtn/sdot/etitle/etime/ebody/emeta/unread）沿 preview 原名，皆被 `#s-alert` 前綴 scope。）

- [ ] **Step 2: alert.css 建檔（逐條轉錄 + 前綴）**

自 preview `<style>` 區塊逐條轉錄進 `src/screens/alert/alert.css`，規則：
1. 每條選擇器加 `#s-alert ` 前綴（含 `@keyframes` 名稱改帶 `a` 前綴防跨頁衝突：`ackpl→aackpl`、`pd→apd`、`rip→arip`、`shk→ashk`，引用處同步改）。
2. 刪 preview-only：`:root` 變數（改用 tokens.css 既有 `--rose/--amber/--flame/--ink-*` 等；preview 的 `--flame:#FF7A59` 與 tokens 的 flame 色值如不同，以 `#FF7A59` 字面寫入本檔用途處）、`body`、`.swrap`、`.eyebrow/.hrow/.chip/.simbtn`（標頭由 screenHeader/tokens 提供；「模擬事件」鈕沿用既有 `lg-btn` 樣式）、`.note`、`.mapfallback`（broadcastmap.ts 用 inline style 降級卡，同 worldmap 手法）。
3. `.grid→.agrid`、`.map→.amap` 等 Step 1 的更名同步。
4. 保留兩行關鍵註解：「不可對 .cellwrap 設 position（Mapbox marker 定位坑）」。
5. `index.ts` 頂部 `import './alert.css';`（同 epidemic 手法）。

- [ ] **Step 3: tokens.css 刪舊段**

刪 `src/ui/tokens.css` 的 alert 舊佔位樣式：`.alertrow` 系（194-198 行與 228-230 行附近）；另 grep `\.sms\b`、`\.phone\b`、`#phoneMock`、`.buzz`、`.fbar`、`.fchip` 在 tokens.css 的 alert 區段——**只刪確認全站無其他引用者**（`grep -rn "class 名" src/` 驗證；`.fbar/.fchip` 若已被本頁 alert.css 前綴版取代且他頁未用即可刪）。

- [ ] **Step 4: index.ts 重寫（靜態渲染 + 非地圖互動）**

整檔重寫。結構（邏輯逐字對齊 preview `<script>`，僅列差異；完整行為以 preview 為準轉錄）：

```ts
import type { Screen, ScreenCtx } from '../types';
import type { AlertSnapshot, AlertEvent, AlertSev } from '../../data/types';
import { funnelRates, sumDelivered, FUNNEL_STEPS } from './funnel';
import { screenHeader } from '../../ui/components';
import { prefersReduced } from '../settings/storage';
import template from './alert.html?raw';
import './alert.css';

const SEVC: Record<AlertSev, string> = { red: '#FF7A59', orange: '#F5A54A', notice: '#9fb0c3', clear: '#35E0A6' };
const SEVN: Record<AlertSev, string> = { red: '紅色警報', orange: '橙色警戒', notice: '作業提示', clear: '解除' };
const SRCC: Record<AlertEvent['source'], string> = { epidemic: '#F0648C', dispatch: '#F5A54A', weather: '#38BDF8', system: '#6b7a8d' };
```

- `mount(el, ctx)`：`await ctx.data.alert.snapshot()` → `screenHeader({ eyebrow:'港區廣播中心 · MODULE 06', color:'#FF7A59', title:'自動警報推播', badges:['CELL BROADCAST · PWS 對映'], source:'mock', actionsHtml: SIM_BTN })` + `<div class="swrap">` 包 template；KPI 列渲染 preview `renderKpis()` 的四張 kchip（今日發布 `#kPub` 14／觸及 人員/船舶 `2,610 / 47`／平均送達延遲 hi `3.2 s`／送達率 `98.2%`，值取自 `snap.kpi` 格式化，不寫死）。
- `renderFeed()`/`traceHtml()`/`renderPhone()`/`renderFunnel()`/`select()`：自 preview 對應函式逐字轉錄型別化。要點：
  - 事件卡：sev 左色條（`--sv` CSS 變數）、來源色點、**橙紅級標題常態帶 sev 色**（`ev.sev==='red'||ev.sev==='orange'?c:'#aab6c4'`）、CH mono 徽章、sev 名徽章、Ack 鈕（`stopPropagation`，todo 脈動→done 靜止）、unread 圓點。
  - `traceHtml(ev, states)`：四節點（偵測→規則命中→分級→發布），`st(i)` 映射 `done→'on'`、`run→'on run'`、`wait→''`、`states===null→'on'`（**preview 修過的坑，照 v2 版轉錄**）；閾值/CH+延遲用 `.tmono`；級別名染 `SEVC[ev.sev]`。
  - `renderPhone(ev, drill)`：red → `#apalert` 全螢幕插播卡（PWS 結構：ptag/事件/【unit】區域+指示/CH footer）+ `drill && !prefersReduced()` 時 `.shake`；非 red → 橫幅（orange 加 `.warn`）+ 壓暗「前一則」；本 task `drill` 一律傳 `false`。
  - `renderFunnel(ev, countUp)`：用 `FUNNEL_STEPS`/`funnelRates`/`sumDelivered` 渲染 preview 的階梯 bar（`.funlbl` 標籤+delivered、四段 `.fstep`：段名/bar 寬 `v/triggered*100%`/mono 數字/轉換率 %）；`countUp && !prefersReduced()` 時 rAF 900ms 滾數字，否則直設終值。本 task 呼叫處一律 `countUp=false`（Task 5 演練才用 true）。
  - `select(id)`：`curId=id` → `renderFeed()`（含 `.sel` 卡 trace 展開，天然互斥）+ `renderFunnel(ev,false)` + `renderPhone(ev,false)` + `renderMapStub(ev)`（本 task 空函式，Task 4 換真地圖）。
  - 篩選：`#s-alert` 內事件委派，同 preview（`curCat`，`all` 全顯）。
  - **mount 末尾 `select(snap.feed[0].id)`**（視線起點）。
- KPI/演練/重置皆讀模組層 `snap0`（mount 捕捉，見 Interfaces）。

- [ ] **Step 5: 三綠燈 + headless CDP 靜態驗證**

Run: `npx tsc --noEmit`／`npx vitest run`／`npm run build` → 全綠。
CDP（獨立 headless Chrome + `npm run dev`，斷言至少）：`#/alert` 冷啟動 → kchip 4、`.ecard` 6、首卡 `.sel` + `.trace` 展開 4 節點全亮、漏斗 408、手機橫幅 `.warn`、篩選 `ok`→2 卡→`all`→6 卡、Ack todo→done、console 零錯誤。

- [ ] **Step 6: 建議 commit 訊息**

`feat(alert): 三分割骨架 + alert.css(#s-alert) + 靜態渲染與篩選/Ack/軌跡展開 + tokens.css 清舊`

---

### Task 4: `broadcastmap.ts` — Mapbox 覆蓋地圖 + 下鑽連動

**Files:**
- Create: `src/screens/alert/broadcastmap.ts`
- Modify: `src/screens/alert/index.ts`（`renderMapStub` 換真地圖接線 + show/hide/resize 生命週期）

**Interfaces:**
- Produces:

```ts
export interface BroadcastMap {
  renderEvent(ev: AlertEvent | null): void;   // 圍欄+cell 點亮(無 stagger)+pdot+fitBounds；null=清空
  litCells(ids: string[], stagger: boolean): number; // 回傳 stagger 總時長 ms（無 stagger/RM 回 0）
  ripple(lngLat: [number, number]): void;      // 三發波紋（RM no-op）
  resize(): void;
  readonly ready: boolean;
}
export function createBroadcastMap(container: HTMLElement, cells: AlertCell[], onReady: () => void): BroadcastMap;
```

- Consumes: Task 2 `AlertEvent`/`AlertCell`；`prefersReduced()`。

- [ ] **Step 1: broadcastmap.ts 建檔**

參考 `src/screens/epidemic/worldmap.ts` 的骨架（token 讀法/降級卡/容器淨空/`map.resize()` 不等 ready 的註解**逐字沿用**），內容自 preview 的 `initMap/setFence/litCells/ripple/renderMap` 轉錄型別化。要點：
- `new mapboxgl.Map({ container, style:'mapbox://styles/mapbox/dark-v11', center:[120.308,22.585], zoom:12.15, attributionControl:false })`。
- `load` 後：`fence` geojson source + `fence-f` fill layer（`#FF7A59`, opacity .1）+ `fence-l` line layer（dasharray [3,2]）；每個 cell 建 `.cellwrap` marker（`<div class="cell"></div><div class="tip">…送達 N 支</div>`，**wrapper 不設 position**）；`pdot` marker（初始 `display:none`）。
- `setFence(ev)`：設 polygon `[[...ev.fence, ev.fence[0]]]`；`!prefersReduced()` 時 `setInterval` 120ms 正弦呼吸 `line-opacity`（切換事件先 `clearInterval`）。
- `litCells(ids, stagger)`：全清 `.lit` → 無 stagger 或 RM 直接加、回 0；有 stagger 每格 110ms `setTimeout`、回 `ids.length*110`。**timer id 收集起來，`renderEvent`/清空時取消**（preview 為簡化未收，實作要收——快速連點下鑽不可殘留舊 stagger）。
- `ripple(lngLat)`：RM no-op；3 發、間隔 380ms、每發 `.ripple.act` marker 1600ms 後 remove。
- `renderEvent(ev)`：`setFence` + `litCells(ev?.cellsLit ?? [], false)` + pdot 顯隱/定位 + `fitBounds`（fence 點 + 點亮 cell 座標，padding 90、duration RM?0:700、maxZoom 13.6）。

- [ ] **Step 2: index.ts 接線**

- `mount()`：`const map = createBroadcastMap(el.querySelector('#amap')!, snap.cells, () => { if (curId) renderMap(feed.find(e=>e.id===curId)!); })`；`renderMapStub` 換 `renderMap(ev){ map.renderEvent(ev); }`；`select()` 內呼叫。
- `show()`：`map.resize()`（首次 active 前容器 `display:none` 量不到尺寸——dispatch/epidemic 定案慣例）；`hide()` 留 Task 5。
- 視窗 `resize` 監聽（本頁 `.active` 時才 `map.resize()`，同 epidemic index.ts:365 手法）。

- [ ] **Step 3: 三綠燈 + CDP 下鑽驗證**

三綠燈後 CDP 斷言：`#/alert` → Mapbox canvas 存在、cell 9 markers、首筆自動選中 cell 點亮 3、`map.project` 與 marker 中心像素一致（**驗 marker 定位坑**）、點 e3 → 點亮組不同 + fitBounds 移動、點 e5（clear，`cellsLit:[]`）→ 全滅 + 圍欄仍設、cell hover `.tip` 顯示送達數、console 零錯誤。無 token 情境：另起 `VITE_MAPBOX_TOKEN= npm run dev -- --port 5178`（env 覆寫為空、settings localStorage 亦無 token 的乾淨 profile）→ 降級提示卡顯示、頁面其餘功能正常、不拋錯；驗畢關閉該 server。

- [ ] **Step 4: 建議 commit 訊息**

`feat(alert): broadcastmap.ts Mapbox 覆蓋地圖（cell/圍欄/pdot/波紋）+ 下鑽連動`

---

### Task 5: 模擬事件演練（池兩發全鏈路動畫 + 重置）+ 生命週期

**Files:**
- Modify: `src/screens/alert/index.ts`

**Interfaces:**
- Consumes: Task 3 全部渲染函式、Task 4 `BroadcastMap`。
- Produces: `function simulate(): void`（掛 `#simBtn`）；`Screen.show()/hide()` 完整版。

- [ ] **Step 1: 演練狀態與 timeline（自 preview `simulate()` 轉錄型別化）**

模組層：`let poolIdx = 0, simming = false; const timers: number[] = [];`
`const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };`
`function cancelTimers() { timers.forEach(clearTimeout); timers.length = 0; }`（policy 前例：切頁不可洩漏動畫）。

`simulate()` 邏輯（對齊 preview v2）：
1. `if (simming) return;`
2. **池盡重置**：`poolIdx >= drillPool.length` → `feed = snap0.feed.map(e => ({ ...e })); poolIdx = 0; select(snap0.feed[0].id);` kPub 回 `snap0.kpi.published`；`sCtx.ui.toast({ title:'自動警報推播', message:'演練池重置 · 回到初始事件流' }); return;`
3. 取 `ev = { ...drillPool[poolIdx++], _unread: true }`，`simming = true`、鈕 disabled；toast 文案由 sev 組：red→`緊急警報已發布 · 紅色警報 · 全港廣播`、其餘→`警訊通知已發布 · ${SEVN[ev.sev]} · 觸及 ${sumDelivered(ev.funnels).toLocaleString()} 人`。
4. **RM 分支**：直達終態——插卡（`_traceStates=null` 全亮）、`select(ev.id)` 等效全渲染、`renderFunnel(ev,true)`（RM 內部直設終值）、toast、finish。
5. **動畫分支**（總長 ~5.2s）：
   - `_traceStates=['run','wait','wait','wait']`，`feed=[ev,...feed]`，`curId=ev.id`，`renderFeed()`；地圖先 `renderEvent({...ev, cellsLit: []})`（圍欄+pdot 先上、cell 等 stagger）；手機/漏斗先清或維持。
   - 軌跡逐節：`TS=[['done','run','wait','wait'],['done','done','run','wait'],['done','done','done','run'],null]`，`later(()=>{ev._traceStates=TS[i];renderFeed();}, 600+i*600)`。
   - `later(()=>{ map.ripple(ev.lngLat); map.litCells(ev.cellsLit, true); }, 2200)`。
   - `later(()=>{ renderPhone(ev, true); toast(...); }, 2200 + Math.min(ev.cellsLit.length*110, 1100) + 300)`。
   - `later(()=>{ renderFunnel(ev, true); }, 3600)`。
   - `later(finish, 5200)`；`finish()`：`simming=false`、鈕恢復、`#kPub` 設 `snap0.kpi.published + poolIdx`。toast 一律走 `sCtx.ui.toast`。
6. 演練插入的卡參與篩選（`renderFeed` 天然涵蓋）；點卡清 `_unread`。

- [ ] **Step 2: 生命週期完整版**

- `show()`：`map.resize()`。
- `hide()`：`cancelTimers()`；若 `simming` 被中斷 → `simming=false`、鈕恢復（半途狀態允許停在當下畫面，重進頁可繼續操作；不自動回滾——與 policy 生成中斷語意一致）。
- 全域 `resize` 監聽維持「`.active` 時才動作」。

- [ ] **Step 3: 三綠燈 + CDP 演練全鏈路驗證**

CDP 斷言（真實時間流逝）：第一發——鈕 disabled、7 卡、軌跡節點依序亮、2.2s 後 cell 亮 3、手機橫幅 + toast、漏斗滾到 176、kPub 15、5.2s 後鈕恢復；第二發——8 卡、`CH 4371`、cell 全亮 9、`#apalert.show` + shake、雙漏斗 47、kPub 16；第三按重置——回 6 卡、選中首筆、kPub 14；**演練中切頁**（hash 切 hero）→ 無殘留 toast/計時器洩漏、切回可再按；`Emulation.setEmulatedMedia` reduced-motion → 一按直達終態（卡+cell+手機+漏斗終值皆完整）；`#s-alert` 無輸入框、鍵盤 `0-7` 導覽迴歸正常；console 全程零錯誤。

- [ ] **Step 4: 建議 commit 訊息**

`feat(alert): 模擬事件池兩發全鏈路動畫 + 重置 + show/hide 生命週期 + reduced-motion`

---

### Task 6: 全站驗收 + 文件收尾

**Files:**
- Modify: `HANDOFF.md`（進度/驗收證據/殘留）
- 無產品碼改動（發現缺陷記錄後回報，不自行修——同前例規約）

- [ ] **Step 1: 三綠燈**

`npx tsc --noEmit` 0／`npx vitest run` 全綠（既有 + alert-funnel 6 + alert-mock 6）／`npm run build` 成功。

- [ ] **Step 2: spec §10 逐項 CDP 驗收**

對照 spec `docs/superpowers/specs/2026-07-07-alert-redesign-design.md` §10 全清單：冷啟動渲染、下鑽（含互斥）、演練兩發+重置+防重入、tooltip、Ack、篩選、reduced-motion、鍵盤 `0-7` 迴歸、**8 頁全站迴歸 console 零錯誤**（hero→carbon→policy→twin→dispatch→epidemic→alert→settings）。截圖存 scratch（初始/下鑽/紅色警報頂格三張）。

- [ ] **Step 3: HANDOFF.md 收尾**

第 1 節換成 alert 改版完成摘要（成果檔案/SDD tasks/驗收誠實分野/殘留），第 4 節下一步改「最終 whole-branch review → 使用者實機驗收 → finishing」。

- [ ] **Step 4: 建議 commit 訊息**

`docs(alert): 全站驗收 + HANDOFF 收尾`

---

## Self-Review 紀錄

- Spec 覆蓋：§2 決策 1-8（定位/地圖/互動/版面/右欄/分級/池/v2）→ Task 3-5；§4 契約 → Task 2；§5 純邏輯 → Task 1（funnelRates/sumDelivered）+ Task 2（mock 契約測試）；§6 mock 劇本 → Task 2；§7 互動 7.1-7.5 → Task 3（篩選/Ack/軌跡）+ Task 4（下鑽地圖）+ Task 5（演練）；§8 配色 → Global Constraints + Task 3；§9 檔案 → 各 task Files；§10 驗收 → Task 6；§11 YAGNI（不做切換器/聲音/switch 落地）→ 無對應 task，正確。
- 型別一致：`AlertFunnel` Task 1 定義、Task 2 契約合併同名；`BroadcastMap.renderEvent/litCells/ripple/resize/ready` Task 4 定義、Task 5 引用一致；`FUNNEL_STEPS` 鍵名與 `AlertFunnel` 欄位一致。
- 佔位掃描：無 TBD/TODO；轉錄型 task 均指明 preview 具體函式名為唯一基準。
- 複審修正（第二輪 self-review 發現）：(1) Task 2 過渡殼原寫 `<div id="s-alert">` 與 router 建的 section id 重複 → 改無 id 佔位註解；(2) 補 `SIM_BTN` 定義與 `FeedItem` 擴充型別（`_unread/_traceStates` 不進資料契約）；(3) 模組層狀態補 `sectionEl/sCtx/snap0/drillPool`（epidemic 同構），Task 5 重置/toast 改引用 `snap0`/`sCtx`；(4) Task 4 無 token 驗證改成可操作的 env 覆寫指令；(5) spec §5 `sumReach` 更名 `sumDelivered`、§9 funnel.ts 職責改「純邏輯（渲染歸 index.ts）」，spec 已同步。
