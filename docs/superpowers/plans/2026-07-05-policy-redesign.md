# Policy 頁改版（政策情報中心）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 policy 頁從單議題五段報告改版為「政策情報中心」——左收件匣（含模擬情報流入）、中 NotebookLM 式對話串（報告產出卡 + 追問 + 生成步驟動畫）、右來源清單（勾選與引用合一；綜合對話模式為五類分組摺疊 + 搜尋），純 mock。

**Architecture:** 資料契約 `PolicySnapshot` 改為 discriminated union 的 `briefs[]`（+ `inflow[]` 流入池 + `globalQa[]` 綜合劇本），mock JSON 全面改寫；screen 拆四檔——`policy.html`（三欄靜態骨架）、`policy.css`（`#s-policy` scope 樣式）、`generate.ts`（純時序排程模組，fake timers 可測）、`index.ts`（全部互動膠合）。視覺與互動的**唯一基準**是已驗收的 `docs/preview/preview-policy-redesign.html`（v7）——實作時任何不確定處以該檔行為為準。

**Tech Stack:** Vite + vanilla TS、Liquid Glass Kit（`src/ui/liquid-glass.css/js`，vendored 不可改）、vitest（fake timers）、Chromium 手動驗證。

## Global Constraints

- spec：`docs/superpowers/specs/2026-07-04-policy-redesign-design.md`；視覺基準：`docs/preview/preview-policy-redesign.html`（v7）。兩者衝突時以 preview 行為為準並回報。
- 禁止 emoji；文案繁體中文 + 英文術語。
- 元件一律 Liquid Glass Kit：玻璃容器掛 `class="lg" data-lg`，小型/大量重複元件用 `lg-static`；**不得手寫 `backdrop-filter`**。
- `src/ui/tokens.css`、`src/ui/liquid-glass.css/js`、`src/shell/*`、其他 screen **一律不動**。新版面樣式全部收在 `src/screens/policy/policy.css`（`#s-policy` scope）。
- 唯一允許的共用檔改動：`src/data/types.ts`（policy 型別區塊，Task 2）與 `src/ui/components.ts`（`source` 改 optional，Task 3）——範圍以本計畫寫明的為限。
- provider 維持 `source:'mock'`、零 HTTP 呼叫。
- 每個 task 結束時 `npx tsc --noEmit` 0 errors、`npx vitest run` 全綠、`npm run build` 成功。
- **Commit 由使用者自己下**：每 task 結尾為檢查點，停下來給使用者確認；除非使用者明確說「幫我 commit」，不執行 `git commit`。Commit 訊息不加任何 Claude/Anthropic 署名。
- 完成每個 task 後更新 `HANDOFF.md` 進度（一至三行）。

---

### Task 1: `generate.ts` 時序排程模組（TDD）

**Files:**
- Create: `src/screens/policy/generate.ts`
- Test: `tests/policy-generate.test.ts`

**Interfaces:**
- Consumes: 無（純模組，零依賴）。
- Produces:
  - `interface TimelineEvent { at: number; run: () => void }`
  - `interface TimelineHandle { cancel(): void }`
  - `function runTimeline(events: TimelineEvent[], totalMs: number, done: () => void): TimelineHandle`
  - 語意：呼叫後為每個 event 排 `setTimeout(run, at)`，並在 `totalMs` 時呼叫 `done`；`cancel()` 清掉所有未觸發 timer（含 done），可重複呼叫。reduced-motion 降級由呼叫端負責（直接不呼叫本函式）。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/policy-generate.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runTimeline } from '../src/screens/policy/generate';

describe('runTimeline', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('依 at 順序觸發 events，totalMs 時呼叫 done', () => {
    const order: string[] = [];
    runTimeline(
      [
        { at: 100, run: () => order.push('a') },
        { at: 300, run: () => order.push('b') },
      ],
      500,
      () => order.push('done'),
    );
    vi.advanceTimersByTime(99);
    expect(order).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(order).toEqual(['a']);
    vi.advanceTimersByTime(400);
    expect(order).toEqual(['a', 'b', 'done']);
  });

  it('cancel 阻止後續 events 與 done，且可重複呼叫', () => {
    const order: string[] = [];
    const h = runTimeline(
      [
        { at: 100, run: () => order.push('a') },
        { at: 300, run: () => order.push('b') },
      ],
      500,
      () => order.push('done'),
    );
    vi.advanceTimersByTime(150);
    h.cancel();
    h.cancel(); // 重複 cancel 不得拋錯
    vi.advanceTimersByTime(1000);
    expect(order).toEqual(['a']);
  });
});
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run tests/policy-generate.test.ts`
Expected: FAIL（`Cannot find module '../src/screens/policy/generate'`）

- [ ] **Step 3: 最小實作**

```ts
// src/screens/policy/generate.ts
/* 生成/回答步驟動畫的時序排程 — 純 setTimeout 包裝，好讓 index.ts 的動畫可被
   fake timers 單元測試。reduced-motion 降級由呼叫端決定（直接跳過本模組）。 */

export interface TimelineEvent { at: number; run: () => void }
export interface TimelineHandle { cancel(): void }

export function runTimeline(
  events: TimelineEvent[],
  totalMs: number,
  done: () => void,
): TimelineHandle {
  const timers: ReturnType<typeof setTimeout>[] = [];
  for (const e of events) timers.push(setTimeout(e.run, e.at));
  timers.push(setTimeout(done, totalMs));
  return {
    cancel() {
      while (timers.length) clearTimeout(timers.pop()!);
    },
  };
}
```

- [ ] **Step 4: 跑測試確認 GREEN**

Run: `npx vitest run`
Expected: 全綠（既有 16 tests + 新 2 tests = 18 PASS）

- [ ] **Step 5: 檢查點**

Run: `npx tsc --noEmit` → 0 errors。停下：使用者確認 + 使用者 commit。

---

### Task 2: 資料契約改版 + mock JSON 全面改寫（TDD）

**Files:**
- Modify: `src/data/types.ts:19-23`（`PolicySnapshot` 區塊整段替換）
- Rewrite: `src/data/mock/policy.json`
- Test: `tests/policy-mock.test.ts`（新增）

**Interfaces:**
- Consumes: 無。
- Produces（後續 task 的 index.ts 依賴這些確切名稱）:
  - `PolicySource { no: number; name: string; cat: string; date: string; checked: boolean }`
  - `PolicyQA { q: string; a: string }`
  - `IncidentBrief`（type:'incident'，含 severity/confidence/summary/cases/impact/actions）
  - `PolicyDocBrief`（type:'policy'，含 sections）
  - `DailyBrief`（type:'daily'，含 items/watch）
  - `PolicyBrief = IncidentBrief | PolicyDocBrief | DailyBrief`
  - `PolicySnapshot { briefs: PolicyBrief[]; inflow: PolicyBrief[]; globalQa: PolicyQA[] }`
  - `mock.ts` 不需改（既有 `policy as PolicySnapshot` cast 沿用）。

**注意**：本 task 改掉舊契約後，舊版 `src/screens/policy/index.ts` 會 tsc 報錯（用到 `snap.topic` 等舊欄位）。為了讓本 task 獨立回綠，Step 5 先把舊 index.ts 換成最小佔位（Task 4 會全面重寫）；`policy.html` 舊檔留待 Task 4 覆寫。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/policy-mock.test.ts
import { describe, it, expect } from 'vitest';
import { createMockExchange } from '../src/data/exchange/mock';

const CATS = ['全球航運指數', '台灣數據統計', '海運焦點新聞', '航港法令', '替代能源專區'];

describe('policy mock 契約', () => {
  it('briefs 7 條、inflow 2 條、globalQa 2 組', async () => {
    const s = await createMockExchange().policy.snapshot();
    expect(s.briefs).toHaveLength(7);
    expect(s.inflow).toHaveLength(2);
    expect(s.globalQa).toHaveLength(2);
  });
  it('主秀紅海為 incident 雙案例；NZF 為 policy 五段；晨報 watch 帶 goto', async () => {
    const s = await createMockExchange().policy.snapshot();
    const [redsea, nzf, daily] = s.briefs;
    expect(redsea.type).toBe('incident');
    if (redsea.type === 'incident') expect(redsea.cases).toHaveLength(2);
    expect(nzf.type).toBe('policy');
    if (nzf.type === 'policy') expect(nzf.sections).toHaveLength(5);
    expect(daily.type).toBe('daily');
    if (daily.type === 'daily') expect(daily.watch.goto).toBe('pol-nzf');
  });
  it('所有來源 cat 皆屬 iMarine 五類；globalQa 引用佔位可在全來源名稱中解析', async () => {
    const s = await createMockExchange().policy.snapshot();
    const all = [...s.briefs, ...s.inflow];
    const names = new Set(all.flatMap((b) => b.sources.map((x) => x.name)));
    for (const b of all) for (const src of b.sources) expect(CATS).toContain(src.cat);
    for (const qa of s.globalQa) {
      for (const m of qa.a.matchAll(/\{\{c:([^}]+)\}\}/g)) expect(names.has(m[1])).toBe(true);
    }
  });
});
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run tests/policy-mock.test.ts`
Expected: FAIL（`s.briefs` undefined——舊 JSON 是 topic/sections 形狀）

- [ ] **Step 3: 改 `src/data/types.ts`**

把第 19-23 行的舊 `PolicySnapshot` 整段替換為：

```ts
/* Policy 頁（政策情報中心）契約 — 2026-07-04 spec 改版。
   briefs = 收件匣情報（新→舊）；inflow = 模擬偵測流入池（依序流入，不在初始收件匣）；
   globalQa = 綜合對話（知識庫模式）預錄劇本，回答內含 {{c:來源名稱}} 引用佔位，
   由 UI 在送出當下對照當前來源聯集解析成 cite span。 */
export interface PolicySource {
  no: number; name: string;
  cat: string;            // iMarine 五類之一：全球航運指數/台灣數據統計/海運焦點新聞/航港法令/替代能源專區
  date: string;
  checked: boolean;       // 參與生成（右欄勾選初始值）
}
export interface PolicyQA {
  q: string;              // 建議追問（chip 文字 = 使用者氣泡）
  a: string;              // 回答 html，含 <span class="cite" data-src="n">（globalQa 則含 {{c:名稱}} 佔位）
}
interface PolicyBriefBase {
  id: string;
  title: string;          // 收件匣列 + 報告標題
  time: string;           // 顯示字串，如「今日 14:02」
  grounding: number;      // 中欄 Grounding bar
  groundingNote: string;
  retrieved: number;      // 生成步驟動畫「檢索 N 筆」
  sources: PolicySource[];
  qa: PolicyQA[];         // 追問劇本
}
export interface IncidentBrief extends PolicyBriefBase {
  type: 'incident';
  severity: 'high' | 'medium';
  confidence: number;     // 信心度 %
  summary: string;        // html，含 cite span
  cases: { title: string; duration: string; action: string; outcome: string; cite: number }[];
  impact: string | null;  // html；簡短條目可為 null（版型跳過該段）
  actions: string[];
}
export interface PolicyDocBrief extends PolicyBriefBase {
  type: 'policy';
  sections: { heading: string; html: string }[];
}
export interface DailyBrief extends PolicyBriefBase {
  type: 'daily';
  items: { text: string; cite: number }[];
  watch: { text: string; goto?: string };
}
export type PolicyBrief = IncidentBrief | PolicyDocBrief | DailyBrief;
export interface PolicySnapshot {
  briefs: PolicyBrief[];
  inflow: PolicyBrief[];
  globalQa: PolicyQA[];
}
```

- [ ] **Step 4: 全面改寫 `src/data/mock/policy.json`**

內容 = preview 檔（`docs/preview/preview-policy-redesign.html`）`<script>` 內 `var DATA = [...]` 的 7 條 + `NEWBRIEF`/`NEWBRIEF2` 兩條（放進 `inflow`，依序 = 巴拿馬、馬六甲）+ `GLOBAL.qa` 兩組（放進 `globalQa`），**逐字照抄**，僅做格式轉換：
- 去掉 runtime 欄位（`gen`/`used`/`unread`/`fresh` 不進 JSON）。
- JS 物件 → 合法 JSON（鍵加雙引號、單引號字串改雙引號、`impact: null` 保留為 JSON `null`）。
- 頂層形狀：`{ "briefs": [紅海, NZF, 07-04晨報, 新加坡, EU ETS, 07-03晨報, 替代燃料], "inflow": [巴拿馬, 馬六甲], "globalQa": [優先行動, 港埠費回應] }`。

轉換完成後 spot-check 三處與 preview 逐字一致：紅海 `summary` 的兩個 cite、NZF 第五段 `建議草稿`、globalQa 第二組的四個 `{{c:...}}` 佔位。

- [ ] **Step 5: 舊 screen 暫時佔位（讓 tsc 回綠）**

把 `src/screens/policy/index.ts` 整檔暫時替換為：

```ts
/* Policy screen — 契約改版過渡佔位，Task 4 全面重寫（見 2026-07-05-policy-redesign plan）。 */
import type { Screen } from '../types';

const s: Screen = {
  async mount(el) {
    el.innerHTML = '<div class="swrap"><p class="mut">policy 改版施工中</p></div>';
  },
};
export default s;
```

- [ ] **Step 6: 跑測試/型別/建置確認 GREEN**

Run: `npx vitest run` → 全綠（18 + 3 = 21 PASS）
Run: `npx tsc --noEmit` → 0 errors
Run: `npm run build` → 成功

- [ ] **Step 7: 檢查點**

停下：使用者確認 + 使用者 commit。

---

### Task 3: `components.ts` 的 `source` 改 optional

**Files:**
- Modify: `src/ui/components.ts:10-18,44-56`

**Interfaces:**
- Consumes: 既有 `screenHeader(o)` / `srcChip(source, label?)`。
- Produces: `ScreenHeaderOptions.source?: Source`——未給 `source` 時不渲染資料源 chip（policy 頁特例，spec §2 決策表）。既有呼叫端（hero/carbon/dispatch/epidemic/alert 皆有傳 source）行為不變。

- [ ] **Step 1: 修改型別與模板**

`ScreenHeaderOptions` 的 `source: Source;` 改為：

```ts
  source?: Source; // 未給則不渲染資料源 chip（policy 頁特例，spec 2026-07-04 §2）
```

`screenHeader` 內：

```ts
  const src = o.source ? srcChip(o.source, o.sourceLabel) : '';
```

並把模板字串中的 `${srcChip(o.source, o.sourceLabel)}` 換成 `${src}`。

- [ ] **Step 2: 驗證**

Run: `npx tsc --noEmit` → 0 errors；`npx vitest run` → 21 PASS。
Chromium：`npm run dev` 開 `#/dispatch` 與 `#/alert`，確認標題列的 MOCK chip 仍在（既有呼叫端不受影響）。

- [ ] **Step 3: 檢查點**

停下：使用者確認 + 使用者 commit。

---

### Task 4: 三欄骨架 + 收件匣 + 三類版型 + Grounding bar（index.ts v1）

**Files:**
- Rewrite: `src/screens/policy/policy.html`
- Create: `src/screens/policy/policy.css`
- Rewrite: `src/screens/policy/index.ts`
- 視覺基準：`docs/preview/preview-policy-redesign.html`（本 task 對應其「點條目切換/三類版型/gbar/右欄平面來源」子集）

**Interfaces:**
- Consumes: Task 2 型別、Task 3 `screenHeader`（不傳 source）。
- Produces（Task 5-7 會直接呼叫/擴充）:
  - module state：`briefs: PolicyBrief[]`、`state: Map<string, { used: Set<number>; unread: boolean; fresh: boolean }>`（runtime 狀態不污染 snapshot 物件）、`curId: string`、`sectionEl: HTMLElement`、`sCtx: ScreenCtx`
  - `select(id: string): void`（Task 7 擴充 global 分支）
  - `renderInbox(): void`、`bodyHtml(b: PolicyBrief): string`、`reportLabel(b: PolicyBrief): string`
  - `renderGbar(value: number, note: string): void`
  - `renderSources(b: PolicyBrief): void`（平面清單；Task 7 加 union 分支）
  - `bindCites(root: HTMLElement): void`（本 task 先實作 hover/click 對平面清單；Task 7 擴充群組行為）
  - `MODEL = { local: '地端 LLM · 8B 量化版', cloud: '雲端 API · 旗艦模型' }`、`llm: 'local' | 'cloud'`
  - `reduced(): boolean`（`matchMedia('(prefers-reduced-motion: reduce)').matches`）

- [ ] **Step 1: 重寫 `policy.html`**（動態為主，只留骨架與固定元素；標頭由 index.ts 以 `screenHeader` 拼接在前）

```html
<div class="pcols">
  <aside class="inbox lg lg-static anim" style="--d:.08s" aria-label="情報收件匣">
    <div class="cap">情報收件匣<button class="simbtn" id="simBtn" title="模擬新情報偵測流入">模擬偵測</button></div>
    <div id="inboxList" role="list"></div>
  </aside>

  <section class="report chatcol lg anim" data-lg style="--d:.12s">
    <div class="rhead">
      <h2 id="rTitle"></h2>
      <button class="lg lg-btn lg-btn--accent lg-btn--sm" data-lg id="genBtn">重新生成</button>
    </div>
    <div class="gbar" id="gBar" title="Grounding 事實基礎驗證">
      <span class="glbl">GROUNDING</span>
      <span class="gtrack"><i id="gFill"></i></span>
      <span class="gval" id="gVal">--%</span>
      <span class="gnote2" id="gNote"></span>
    </div>
    <div class="thread" id="thread"></div>
    <div class="qchips" id="qchips"></div>
    <div class="inrow">
      <input id="qinput" type="text" placeholder="就此情報提問，回答皆附 iMarine 來源引用…" aria-label="提問輸入">
      <button class="lg lg-btn lg-btn--accent lg-btn--sm" data-lg id="qsend">送出</button>
    </div>
  </section>

  <aside class="stack anim" style="--d:.16s">
    <div class="panel lg lg-static" id="srcPanel">
      <h4>來源 <span class="lg-badge" id="srcCount">0</span></h4>
      <div id="srcList"></div>
    </div>
  </aside>
</div>
```

- [ ] **Step 2: 新建 `policy.css`**

內容 = preview 第二個 `<style>` 區塊（`/* ── Policy 頁改版 mockup 專用樣式 ── */`）的**逐字移植**，做且僅做以下調整：
1. 每條規則 selector 前綴 `#s-policy `（含 media query 內的規則）。
2. **刪除** mockup 專用區塊：`:root` 變數（tokens.css 已有同名變數）、`html,body`、`#harbor`、`.glowfx`、`#veil`、`.anim`/`@keyframes rise`（tokens.css 已有 .anim 進場系統）、`.mockrail`、`main`/`.pscreen`/`.swrap`、`.eyebrow`/`.trow`/`.lg-chip`/`.src`（tokens.css 已有）、`.mut`/`.mono`（tokens.css 已有）。
3. **刪除**已無使用的規則：`.rmeta`、`#reportBody.fade`、`.gaugebox`/`.gnote`。
4. **保留並前綴**（完整清單，漏一項就是視覺 bug）：`.pcols`、`.stack`、`.panel`（僅 policy 內距版本→改名 `.pcols .panel` 不需要——tokens.css 已有 `.panel`，**刪除**重複定義）、`.llmswitch`/`.lbtn`、`.inbox`/`.inbox .cap`/`.simbtn`/`.ib`/`.ib .idot`/`.ib.slidein`/`@keyframes ibin`/`.ib .udot`/`.gib .idot`/`.ibsep`、`.report`（**刪除**——tokens.css 已有 .report 基礎；僅保留本頁新增的 `.chatcol` 尺寸規則）、`.rhead`、`.gbar` 全套、`.report h3:first-of-type`（tokens.css 是 `:first-child`，chatcol 內 h3 前有其他節點，此條保留）、`.report ol`、`.cases`/`.case`、`.ditems`/`.watch`/`.wlink`、`#steps`/`.step`/`.sdot`/`@keyframes pulse`、`.genin`/`@keyframes secin`、`.chatcol`/`.thread`/`.msg` 全套（user/ai/thinking/reportcard/mhead/mfoot）、`.qchips`/`.qchip`/`.inrow`、`.srcrow` 新增部分（`.schk`/`.skip`/`.off`、`#srcPanel:hover .schk`；`.srcrow` 基礎與 `.hl` 在 tokens.css 已有，不重複）、`.ssearch`/`.sghead` 全套/`.sgbody`、各 `@media(prefers-reduced-motion:reduce)` 覆寫。
5. cite 樣式沿用 tokens.css（不複製）。

- [ ] **Step 3: 重寫 `index.ts`（v1：mount 骨架 + 收件匣 + 版型 + gbar + 平面來源 + cite 連動）**

```ts
/* Policy screen — 政策情報中心（2026-07-04 spec 改版）。
   互動基準：docs/preview/preview-policy-redesign.html（v7）。
   中欄 = NotebookLM 式對話串（報告為產出卡）；本檔為膠合層，
   時序排程走 ./generate 的 runTimeline（可測），資料走 ctx.data.policy.snapshot()。 */
import type { Screen, ScreenCtx } from '../types';
import type { PolicyBrief, PolicyQA, PolicySource } from '../../data/types';
import { screenHeader } from '../../ui/components';
import { runTimeline, type TimelineHandle } from './generate';
import template from './policy.html?raw';
import './policy.css';

const MODEL = { local: '地端 LLM · 8B 量化版', cloud: '雲端 API · 旗艦模型' } as const;

let briefs: PolicyBrief[] = [];
let inflowPool: PolicyBrief[] = [];
let globalQa: PolicyQA[] = [];
let curId = '';
let llm: keyof typeof MODEL = 'local';
let sectionEl: HTMLElement;
let sCtx: ScreenCtx;

/* runtime 狀態（不污染 snapshot 物件）：chips 用掉的索引、未讀、滑入一次性旗標 */
interface BriefState { used: Set<number>; unread: boolean; fresh: boolean }
const state = new Map<string, BriefState>();
function st(id: string): BriefState {
  let s = state.get(id);
  if (!s) { s = { used: new Set(), unread: false, fresh: false }; state.set(id, s); }
  return s;
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <T extends HTMLElement>(sel: string) => sectionEl.querySelector(sel) as T;
function briefById(id: string): PolicyBrief | undefined {
  return briefs.find((b) => b.id === id);
}
function nowStr(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ── 收件匣 ── */
function dotColor(b: PolicyBrief): string {
  if (b.type === 'policy') return 'var(--cyan)';
  if (b.type === 'daily') return 'var(--lg-accent)';
  return b.severity === 'high' ? 'var(--rose)' : 'var(--amber)';
}
function typeName(b: PolicyBrief): string {
  return b.type === 'policy' ? '政策' : b.type === 'daily' ? '日報' : '突發';
}
function renderInbox(): void {
  const list = $('#inboxList');
  list.innerHTML =
    `<button class="ib gib${curId === 'global' ? ' on' : ''}" role="listitem" data-id="global"` +
    ` title="跨全部情報來源直接提問"><i class="idot"></i><span>綜合對話 · 全部來源</span></button>` +
    '<hr class="ibsep">' +
    briefs.map((b) => {
      const s = st(b.id);
      return `<button class="ib${b.id === curId ? ' on' : ''}${s.fresh ? ' slidein' : ''}" role="listitem"` +
        ` data-id="${b.id}" title="${typeName(b)} · ${b.time}">` +
        `<i class="idot" style="--c:${dotColor(b)}"></i><span>${b.title}</span>` +
        (s.unread ? '<i class="udot" aria-label="未讀"></i>' : '') + '</button>';
    }).join('');
  briefs.forEach((b) => { st(b.id).fresh = false; }); // 滑入動畫只播一次
}

/* ── 三類版型（產出卡內文） ── */
function bodyHtml(b: PolicyBrief): string {
  if (b.type === 'incident') {
    let h = `<h3>一、事件摘要</h3><p>${b.summary}</p>` +
      `<h3>二、歷史相似案例</h3><div class="cases${b.cases.length === 1 ? ' one' : ''}">` +
      b.cases.map((c) =>
        `<div class="case"><b>${c.title}</b><span class="dur">${c.duration}</span>` +
        `<p><span class="k">處置</span> ${c.action}<br><span class="k">成效</span> ${c.outcome}` +
        `<span class="cite" data-src="${c.cite}">${c.cite}</span></p></div>`).join('') + '</div>';
    let n = 3;
    if (b.impact) { h += `<h3>三、對高雄港影響評估</h3><p>${b.impact}</p>`; n = 4; }
    h += `<h3>${['一', '二', '三', '四'][n - 1]}、建議行動</h3><ol>` +
      b.actions.map((a) => `<li>${a}</li>`).join('') + '</ol>';
    return h;
  }
  if (b.type === 'policy') {
    return b.sections.map((s) => `<h3>${s.heading}</h3><p>${s.html}</p>`).join('');
  }
  return '<ol class="ditems">' +
    b.items.map((it) => `<li>${it.text}<span class="cite" data-src="${it.cite}">${it.cite}</span></li>`).join('') +
    '</ol><div class="watch"><span class="wlbl">→ 建議關注</span>' +
    (b.watch.goto
      ? `<button class="wlink" data-goto="${b.watch.goto}">${b.watch.text}</button>`
      : `<span>${b.watch.text}</span>`) + '</div>';
}
function reportLabel(b: PolicyBrief): string {
  return b.type === 'incident' ? '結構化產出 · 決策建議報告'
    : b.type === 'daily' ? '結構化產出 · 每日晨報' : '結構化產出 · 政策評估報告';
}

/* ── Grounding 窄 bar ── */
function renderGbar(value: number, note: string): void {
  $('#gVal').textContent = `${value}%`;
  $('#gNote').textContent = note;
  const fill = $('#gFill');
  if (reduced()) { fill.style.width = `${value}%`; return; }
  fill.style.width = '0%';
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${value}%`; }));
}

/* ── 右欄來源（平面清單；global 分支見 Task 7） ── */
function srcRowHtml(s: PolicySource, key: string): string {
  return `<div class="srcrow${s.checked ? '' : ' off'}" data-no="${s.no}">` +
    `<input type="checkbox" class="schk" ${key}${s.checked ? ' checked' : ''}` +
    ` aria-label="${s.name} 參與生成">` +
    `<span class="no">[${s.no}]</span>` +
    `<div><span class="sname">${s.name}</span>${s.checked ? '' : '<span class="skip">未參與</span>'}` +
    `<div class="meta">${s.cat} · ${s.date}</div></div></div>`;
}
function renderSources(b: PolicyBrief): void {
  $('#srcCount').textContent = String(b.sources.length);
  const list = $('#srcList');
  list.innerHTML = b.sources.map((s, i) => srcRowHtml(s, `data-i="${i}"`)).join('');
  list.querySelectorAll<HTMLInputElement>('.schk').forEach((chk) => {
    chk.addEventListener('change', () => {
      const s = b.sources[Number(chk.getAttribute('data-i'))];
      s.checked = chk.checked;
      renderSources(b); // 灰列/未參與即時更新；影響下次生成的「閱讀 k/n」計數
    });
  });
}

/* ── 引用連動（hover 高亮 + 點擊捲動；global 群組擴充見 Task 7） ── */
function bindCites(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.cite').forEach((c) => {
    if ((c as HTMLElement & { _bound?: boolean })._bound) return;
    (c as HTMLElement & { _bound?: boolean })._bound = true;
    const no = c.getAttribute('data-src');
    const row = () => $('#srcList').querySelector<HTMLElement>(`.srcrow[data-no="${no}"]`);
    c.addEventListener('mouseenter', () => row()?.classList.add('hl'));
    c.addEventListener('mouseleave', () => row()?.classList.remove('hl'));
    c.addEventListener('click', () => {
      const r = row();
      if (!r) return;
      r.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' });
      r.classList.add('hl');
      setTimeout(() => r.classList.remove('hl'), 2000);
    });
  });
}

/* ── 對話串（本 task 只放產出卡；chips/提問見 Task 5） ── */
function renderThread(b: PolicyBrief): void {
  const thread = $('#thread');
  thread.innerHTML =
    `<div class="msg ai reportcard"><div class="mhead"><i></i>${reportLabel(b)}</div>` +
    `<div id="reportBody">${bodyHtml(b)}</div></div>`;
  bindCites(thread);
  thread.querySelector<HTMLButtonElement>('.wlink')?.addEventListener('click', function () {
    select(this.getAttribute('data-goto')!);
  });
  ($('#qinput') as HTMLInputElement).value = '';
}

/* ── 條目切換 ── */
function select(id: string): void {
  const b = briefById(id);
  if (!b) return; // global 分支 Task 7 補
  curId = id;
  st(id).unread = false;
  ($('#genBtn') as HTMLElement).style.display = '';
  renderInbox();
  $('#rTitle').textContent = b.title + (b.type === 'incident' ? ' — 決策建議報告' : '');
  renderThread(b);
  renderGbar(b.grounding, b.groundingNote);
  renderSources(b);
}

const s: Screen = {
  async mount(el, ctx) {
    sectionEl = el;
    sCtx = ctx;
    const snap = await ctx.data.policy.snapshot();
    briefs = snap.briefs;
    inflowPool = snap.inflow;
    globalQa = snap.globalQa;

    el.innerHTML =
      '<div class="swrap">' +
      screenHeader({
        eyebrow: '航港局視角 · MODULE 02',
        color: '#38BDF8',
        title: 'AI 政策輔助報告',
        // 本頁不顯示資料源 chip 與技術徽章（spec §2 標題列再減負）
        actionsHtml:
          '<nav class="llmswitch lg" data-lg aria-label="LLM 接口切換">' +
          '<button class="lbtn on" data-llm="local">地端部署</button>' +
          '<button class="lbtn" data-llm="cloud">雲端 API</button></nav>',
      }) +
      template +
      '</div>';

    // LLM 切換：只影響下一次生成/回答
    el.querySelectorAll<HTMLButtonElement>('.lbtn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('on')) return;
        el.querySelectorAll('.lbtn').forEach((x) => x.classList.remove('on'));
        btn.classList.add('on');
        llm = btn.getAttribute('data-llm') as keyof typeof MODEL;
        ctx.ui.toast({
          title: '已切換 LLM 接口',
          message: `${llm === 'local' ? '地端部署' : '雲端 API'}（${MODEL[llm]}），下次生成生效`,
          duration: 3200,
        });
      });
    });

    // 收件匣點擊委派
    $('#inboxList').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.ib');
      if (btn) select(btn.getAttribute('data-id')!);
    });

    select(briefs[0].id);
  },
};
export default s;
```

（`inflowPool`/`globalQa`/`runTimeline`/`TimelineHandle` 在本 task 尚未被使用——TS `noUnusedLocals` 若未開啟不會報錯；若 tsc 報 unused，於本 task 暫以 `void inflowPool; void globalQa;` 兩行壓制並加註「Task 6/7 使用」，Task 6/7 移除。`runTimeline` import 同理暫移除、Task 6 加回。）

- [ ] **Step 4: 驗證**

Run: `npx tsc --noEmit` → 0 errors；`npx vitest run` → 21 PASS；`npm run build` → 成功。
Chromium（`npm run dev` → `#/policy`）對照 preview 逐項：
1. 標題列：只有 eyebrow + 標題 + 右側「地端部署/雲端 API」chips（無 MOCK、無技術徽章）；切換 chip → toast「已切換 LLM 接口…下次生成生效」。
2. 收件匣：頂部「綜合對話 · 全部來源」（漸層點）+ 分隔線 + 7 條（色點：紅海玫紅/新加坡琥珀/政策青/日報綠）；初始選中紅海。
3. 三類版型逐條點擊：紅海（四段 + 雙案例卡）、NZF（五段）、07-04 晨報（4 條列 + 建議關注可點 → 跳 NZF）、新加坡（單案例卡、無影響評估段）。
4. Grounding bar：紅海 87% → NZF 93% 切換時填色重新過場；note 文字正確。
5. 右欄：紅海 7 筆（[6][7] 灰列「未參與」）；hover 來源卡浮現勾選框、取消勾選即變灰；cite hover 高亮對應列、點擊捲動 + 高亮 2s。
6. console 零錯誤。

- [ ] **Step 5: 檢查點**

更新 HANDOFF 一行；停下：使用者確認 + 使用者 commit。

---

### Task 5: 對話串——追問 chips / 輸入列 / 思考氣泡 / 回答氣泡

**Files:**
- Modify: `src/screens/policy/index.ts`（新增函式 + `renderThread`/`select` 接線）

**Interfaces:**
- Consumes: Task 1 `runTimeline`、Task 4 的 `st()`/`bindCites`/`renderThread`/`MODEL`/`llm`/`nowStr`/`reduced`。
- Produces:
  - `ANSMS = { local: [900, 1100], cloud: [500, 700] }`
  - `answering: boolean`、`generating: boolean`（Task 6 的 genBtn 與本 task 互斥共用）
  - `activeTimeline: TimelineHandle | null` 與 `cancelTimers(): void`（Task 6/7 也呼叫）
  - `renderChips(qa: PolicyQA[], usedKey: string): void`
  - `ask(pair: PolicyQA, qi: number | null): void`
  - `sendFree(): void`

- [ ] **Step 1: 加入狀態與取消工具**（放在 `reduced()` 定義之後）

```ts
const ANSMS = { local: [900, 1100], cloud: [500, 700] } as const;
let answering = false;
let generating = false; // Task 6 重新生成使用；與追問互斥
let activeTimeline: TimelineHandle | null = null;

function cancelTimers(): void {
  activeTimeline?.cancel();
  activeTimeline = null;
  answering = false;
  generating = false;
  const btn = sectionEl?.querySelector<HTMLButtonElement>('#genBtn');
  if (btn) btn.textContent = '重新生成';
}
```

（此時把 Task 4 暫留的 `import { runTimeline, type TimelineHandle } from './generate';` 加回/啟用。）

- [ ] **Step 2: chips 渲染與提問流程**（放在 `renderThread` 之後）

```ts
/* ── 追問（chips 走預錄劇本；自由輸入回覆誠實示範說明） ── */
function renderChips(qa: PolicyQA[], usedKey: string): void {
  $('#qchips').innerHTML = qa
    .map((p, i) => (st(usedKey).used.has(i) ? '' : `<button class="qchip" data-qi="${i}">${p.q}</button>`))
    .join('');
}
function scrollThread(): void {
  const t = $('#thread');
  t.scrollTop = t.scrollHeight;
}
function ask(pair: PolicyQA, qi: number | null): void {
  if (answering || generating) return;
  const model = MODEL[llm];
  answering = true;
  const thread = $('#thread');
  const uq = document.createElement('div');
  uq.className = 'msg user';
  uq.textContent = pair.q; // 使用者輸入一律 textContent（XSS 安全）
  thread.appendChild(uq);
  if (qi !== null) { st(curId).used.add(qi); renderChips(currentQa(), curId); }

  const citeSet = new Set<string>();
  for (const m of pair.a.matchAll(/data-src="(\d+)"/g)) citeSet.add(m[1]);

  const finish = () => {
    answering = false;
    activeTimeline = null;
    thread.querySelector('.msg.thinking')?.remove();
    const am = document.createElement('div');
    am.className = 'msg ai';
    am.innerHTML = `<p>${pair.a}</p><div class="mfoot">${model} · ${nowStr()}` +
      (citeSet.size ? ` · 引用 ${citeSet.size} 筆` : '') + '</div>';
    thread.appendChild(am);
    bindCites(am);
    scrollThread();
  };

  if (reduced()) { finish(); return; } // reduced-motion：跳過思考氣泡直通回答

  const think = document.createElement('div');
  think.className = 'msg ai thinking';
  think.innerHTML = '<i class="sdot"></i><span>檢索 iMarine 資料庫…</span>';
  thread.appendChild(think);
  scrollThread();
  const ms = ANSMS[llm];
  activeTimeline = runTimeline(
    [{ at: ms[0], run: () => { const sp = think.querySelector('span'); if (sp) sp.textContent = '綜合回答與 Grounding 驗證…'; } }],
    ms[0] + ms[1],
    finish,
  );
}
function currentQa(): PolicyQA[] {
  return briefById(curId)?.qa ?? []; // Task 7 擴充 global 分支
}
function sendFree(): void {
  const input = $('#qinput') as HTMLInputElement;
  const t = input.value.trim();
  if (!t || answering || generating) return;
  input.value = '';
  ask({
    q: t,
    a: '此為示範環境，自由輸入的問題將由正式版 LLM + RAG 依 iMarine 五類資料庫即時回答並附引用；您可先點選下方建議追問體驗完整流程。',
  }, null);
}
```

- [ ] **Step 3: 接線**

1. `renderThread(b)` 尾端加一行：`renderChips(b.qa, b.id);`
2. `select()` 內（切條目會重置對話串）已透過 renderThread 覆蓋 thread——在 `select()` 開頭加 `cancelTimers();`（切條目取消進行中的回答/生成）。
3. `mount()` 內加事件（收件匣委派之後）：

```ts
    $('#qchips').addEventListener('click', (e) => {
      const c = (e.target as HTMLElement).closest('.qchip');
      if (!c) return;
      const qi = Number(c.getAttribute('data-qi'));
      ask(currentQa()[qi], qi);
    });
    $('#qsend').addEventListener('click', sendFree);
    ($('#qinput') as HTMLInputElement).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendFree();
    });
```

4. `Screen` 物件加 `hide()`（切頁清理 timer，spec §8）：

```ts
  hide() { cancelTimers(); },
```

- [ ] **Step 4: 驗證**

Run: `npx tsc --noEmit`、`npx vitest run`、`npm run build` → 全綠。
Chromium 對照 preview：
1. 紅海兩顆 chips；點第一顆 → 使用者氣泡（右對齊）→ 思考氣泡兩拍文字 → 約 2s 後回答氣泡（含 cite [3][4]、footer「地端 LLM · 8B 量化版 · HH:MM · 引用 2 筆」）；回答的 cite hover/點擊連動右欄。
2. chip 用掉消失；切走再切回紅海 → 對話串重置為只有產出卡、但 chips 仍只剩一顆（used 記憶）。
3. 自由輸入任意文字 → 回覆誠實示範說明（無引用 footer 只有模型+時間）。
4. 回答進行中再點 chip/送出 → 無反應（不可重入）；思考中切到別條 → 思考氣泡不會把回答塞進新條目（cancelTimers 生效）。
5. console 零錯誤。

- [ ] **Step 5: 檢查點**

更新 HANDOFF 一行；停下：使用者確認 + 使用者 commit。

---

### Task 6: 重新生成步驟動畫 + 模擬情報流入

**Files:**
- Modify: `src/screens/policy/index.ts`

**Interfaces:**
- Consumes: Task 1 `runTimeline`、Task 5 `cancelTimers`/`generating`/`answering`、Task 4 `bodyHtml`/`renderInbox`/`st`。
- Produces:
  - `STEPMS = { local: [800, 1300, 2400, 1000], cloud: [500, 800, 1500, 700] }`
  - `flowIn(): void` 與 `flowIdx: number`（Task 7 的 `updateGlobalPanels` 掛進 flowIn）
  - genBtn click handler（產出卡內原位步驟動畫）

- [ ] **Step 1: 重新生成**（放在 `sendFree` 之後；`STEPMS` 常數放在 `ANSMS` 旁）

```ts
const STEPMS = { local: [800, 1300, 2400, 1000], cloud: [500, 800, 1500, 700] } as const;

/* ── 重新生成：四步驟動畫在產出卡內原位播放，完成後段落 stagger 進場 ── */
function stepHtml(texts: string[], stage: number): string {
  return '<div id="steps">' + texts.map((t, i) => {
    const cls = i < stage ? 'done' : i === stage ? 'run' : '';
    return `<div class="step ${cls}"><i class="sdot"></i><span>${t}</span></div>`;
  }).join('') + '</div>';
}
function regenerate(): void {
  if (generating || answering || curId === 'global') return;
  const b = briefById(curId);
  if (!b) return;
  const model = MODEL[llm]; // 捕捉觸發當下的接口
  const checked = b.sources.filter((s) => s.checked);
  const body = () => sectionEl.querySelector<HTMLElement>('#reportBody');
  const genBtn = $('#genBtn') as HTMLButtonElement;

  const finish = () => {
    generating = false;
    activeTimeline = null;
    genBtn.textContent = '重新生成';
    const el = body();
    if (!el) return;
    el.innerHTML = bodyHtml(b);
    if (!reduced()) {
      Array.from(el.children).forEach((kid, i) => {
        kid.classList.add('genin');
        (kid as HTMLElement).style.setProperty('--gd', `${(i * 0.09).toFixed(2)}s`);
      });
    }
    bindCites($('#thread'));
    $('#thread').querySelector<HTMLButtonElement>('.wlink')?.addEventListener('click', function () {
      select(this.getAttribute('data-goto')!);
    });
    sCtx.ui.toast({
      title: '報告已生成',
      message: `${b.groundingNote} · Grounding ${b.grounding}%（${model}）`,
      duration: 3600,
    });
  };

  if (reduced()) { finish(); return; } // reduced-motion：直通結果

  generating = true;
  genBtn.textContent = '生成中…';
  const texts = [
    `解讀議題：${b.title}`,
    `檢索 iMarine 資料庫 · 命中 ${b.retrieved} 筆`,
    `閱讀來源（0/${checked.length}）`,
    '綜合草稿與 Grounding 驗證',
  ];
  const ms = STEPMS[llm];
  const redraw = (stage: number) => { const el = body(); if (el) el.innerHTML = stepHtml(texts, stage); };
  redraw(0);

  const events: { at: number; run: () => void }[] = [];
  let t = ms[0];
  events.push({ at: t, run: () => redraw(1) });
  t += ms[1];
  events.push({ at: t, run: () => redraw(2) });
  const per = ms[2] / Math.max(checked.length, 1);
  checked.forEach((src, i) => {
    events.push({ at: t + per * i, run: () => { texts[2] = `閱讀來源：${src.name}（${i + 1}/${checked.length}）`; redraw(2); } });
  });
  t += ms[2];
  events.push({ at: t, run: () => { texts[2] = `閱讀來源 ${checked.length} 筆完成`; redraw(3); } });
  t += ms[3];
  activeTimeline = runTimeline(events, t, finish);
}
```

`mount()` 加：`$('#genBtn').addEventListener('click', regenerate);`

**取消語意注意**：`select()` 開頭的 `cancelTimers()` 會清 timer 並還原按鈕文字，之後 `renderThread(b)` 重蓋 thread（含被步驟動畫佔據的產出卡）——與 preview 行為一致，無需額外處理。

- [ ] **Step 2: 模擬情報流入**（放在 `renderInbox` 之後）

```ts
/* ── 模擬情報流入：池內依序流入；池用畢下一次點擊重置並重新流入（demo 可循環） ── */
let flowIdx = 0;
let autoFlowArmed = false;
function flowIn(): void {
  if (flowIdx >= inflowPool.length) {
    // 重置：移除已流入條目；若正選中其一則退回第一條
    const removedCur = inflowPool.some((p) => p.id === curId);
    briefs = briefs.filter((b) => !inflowPool.includes(b));
    flowIdx = 0;
    if (removedCur) select(briefs[0].id);
  }
  const nb = inflowPool[flowIdx++];
  const s = st(nb.id);
  s.used = new Set(); // 重新流入時追問劇本重置
  s.unread = true;
  s.fresh = !reduced();
  briefs.unshift(nb);
  renderInbox();
  updateAfterInflow(); // Task 7 前為 no-op，Task 7 接 global 聯集同步
  sCtx.ui.toast({
    title: '偵測到新事件',
    message: `${nb.title} · 信心度 ${nb.type === 'incident' ? nb.confidence : '--'}% · 已自動生成決策建議`,
    duration: 4200,
  });
}
function updateAfterInflow(): void { /* Task 7 實作（global 模式同步右欄與 gbar） */ }
```

`mount()` 加（genBtn 接線之後）：

```ts
    $('#simBtn').addEventListener('click', flowIn);
```

`Screen` 加 `show()`（首次顯示才武裝 9 秒自動流入；頁面非 active 時不觸發，避免在其他頁跳 toast）：

```ts
  show() {
    if (autoFlowArmed) return;
    autoFlowArmed = true;
    setTimeout(() => {
      if (flowIdx === 0 && sectionEl.classList.contains('active')) flowIn();
    }, 9000);
  },
```

- [ ] **Step 3: 驗證**

Run: `npx tsc --noEmit`、`npx vitest run`、`npm run build` → 全綠。
Chromium 對照 preview：
1. 紅海按「重新生成」（地端）：產出卡內容原位變四步驟、逐步亮起、第三步輪播 5 個勾選來源名（1/5..5/5）、約 5.5s 完成 → 段落 stagger 進場 + toast；期間按鈕「生成中…」不可重入；既有 Q&A 氣泡保留。
2. 切「雲端 API」再生成 → 約 3.5s。
3. 取消右欄一個有引用的來源（如 [5]）再生成 → 第三步計數變 4。
4. 生成中切別條 → 動畫停止、新條目正常顯示；生成中切到別頁再回來 → 按鈕已還原（hide 清理）。
5. 「模擬偵測」：第一下巴拿馬滑入頂部 + 未讀圓點 + toast、不搶選中；第二下馬六甲；第三下重置並重新流入巴拿馬（清單回 8 條）。點開流入條目 → 未讀消失、單案例卡版型 + 1 顆追問 chip。
6. 開頁不動等 9 秒 → 自動流入一次；若先手動按過則不再自動觸發。停在其他頁（如 hero）等 9 秒 → 不會跳「偵測到新事件」toast。
7. console 零錯誤。

- [ ] **Step 4: 檢查點**

更新 HANDOFF 一行；停下：使用者確認 + 使用者 commit。

---

### Task 7: 綜合對話（知識庫模式：聯集 + 分組摺疊 + 搜尋 + {{c}} 解析）

**Files:**
- Modify: `src/screens/policy/index.ts`

**Interfaces:**
- Consumes: Task 4 `select`/`renderInbox`/`srcRowHtml`/`renderGbar`/`bindCites`、Task 5 `ask`/`renderChips`/`currentQa`、Task 6 `updateAfterInflow`。
- Produces:
  - `buildUnion(): void`（重建 `globalUnion: PolicySource[]`，名稱去重、重編號、checked 讀 `globalChecked`）
  - `resolveTokens(html: string): string`（`{{c:名稱}}` → 當前聯集編號 cite span）
  - `renderUnionSources(): void`（五類分組摺疊 + 搜尋 + 三態群組勾選）
  - `select('global')` 分支、`updateAfterInflow` 實作

- [ ] **Step 1: 聯集與解析**（放在 `renderSources` 之後）

```ts
/* ── 綜合對話（知識庫模式）：來源聯集 + 分組摺疊 + {{c:名稱}} 解析 ── */
const CATS = ['海運焦點新聞', '全球航運指數', '台灣數據統計', '航港法令', '替代能源專區'];
let globalUnion: PolicySource[] = [];
const globalChecked = new Map<string, boolean>(); // key=來源名稱，跨切換保留
const expandedCats = new Set<string>();
let srcQuery = '';

function buildUnion(): void {
  const seen = new Set<string>();
  const list: PolicySource[] = [];
  for (const b of briefs) {
    for (const src of b.sources) {
      if (seen.has(src.name)) continue;
      seen.add(src.name);
      list.push({
        no: list.length + 1, name: src.name, cat: src.cat, date: src.date,
        checked: globalChecked.get(src.name) ?? true,
      });
    }
  }
  globalUnion = list;
}
function resolveTokens(html: string): string {
  return html.replace(/\{\{c:([^}]+)\}\}/g, (_, name: string) => {
    const s = globalUnion.find((x) => x.name === name);
    return s ? `<span class="cite" data-src="${s.no}">${s.no}</span>` : '';
  });
}
function catCounts(): string {
  const m = new Map<string, number>();
  for (const s of globalUnion) m.set(s.cat, (m.get(s.cat) ?? 0) + 1);
  return [...m.entries()].map(([k, v]) => `${k} ${v}`).join(' · ');
}
function avgGrounding(): number {
  return Math.round(briefs.reduce((a, b) => a + b.grounding, 0) / briefs.length);
}
```

- [ ] **Step 2: 分組摺疊來源面板**（放在 Step 1 之後）

```ts
function setUnionChecked(s: PolicySource, on: boolean): void {
  s.checked = on;
  globalChecked.set(s.name, on);
}
function renderUnionSources(): void {
  $('#srcCount').textContent = String(globalUnion.length);
  const q = srcQuery.trim();
  let html = `<input class="ssearch" id="ssearch" type="text" placeholder="搜尋來源名稱…"` +
    ` value="${srcQuery.replace(/"/g, '&quot;')}" aria-label="搜尋來源">`;
  for (const cat of CATS) {
    const all = globalUnion.filter((s) => s.cat === cat);
    if (!all.length) continue;
    const hits = q ? all.filter((s) => s.name.includes(q)) : all;
    if (q && !hits.length) continue; // 搜尋時隱藏無命中群組
    const open = q ? true : expandedCats.has(cat); // 搜尋時自動展開命中群組
    const checkedN = all.filter((s) => s.checked).length;
    html += `<div class="sgroup"><div class="sghead" data-cat="${cat}">` +
      `<input type="checkbox" class="gchk" data-cat="${cat}"${checkedN === all.length ? ' checked' : ''}` +
      ` aria-label="${cat} 全選">` +
      `<span class="caret${open ? ' open' : ''}">▶</span>` +
      `<span class="gname">${cat}</span><span class="gcnt">${checkedN}/${all.length}</span></div>` +
      (open ? `<div class="sgbody">${hits.map((s) => srcRowHtml(s, `data-no-chk="${s.no}"`)).join('')}</div>` : '') +
      '</div>';
  }
  const list = $('#srcList');
  list.innerHTML = html;
  list.querySelectorAll<HTMLInputElement>('.gchk').forEach((g) => {
    const cat = g.getAttribute('data-cat')!;
    const all = globalUnion.filter((s) => s.cat === cat);
    const n = all.filter((s) => s.checked).length;
    g.indeterminate = n > 0 && n < all.length; // 半選需以 property 設定
    g.addEventListener('change', () => {
      all.forEach((s) => setUnionChecked(s, g.checked));
      renderUnionSources();
    });
  });
  list.querySelectorAll<HTMLElement>('.sghead').forEach((h) => {
    h.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('gchk')) return;
      const cat = h.getAttribute('data-cat')!;
      if (expandedCats.has(cat)) expandedCats.delete(cat); else expandedCats.add(cat);
      renderUnionSources();
    });
  });
  list.querySelectorAll<HTMLInputElement>('.schk').forEach((chk) => {
    const no = chk.getAttribute('data-no-chk');
    if (no === null) return;
    chk.addEventListener('change', () => {
      const s = globalUnion.find((x) => x.no === Number(no));
      if (!s) return;
      setUnionChecked(s, chk.checked);
      renderUnionSources();
    });
  });
  const se = list.querySelector<HTMLInputElement>('#ssearch')!;
  se.addEventListener('input', () => {
    srcQuery = se.value;
    renderUnionSources();
    const el = list.querySelector<HTMLInputElement>('#ssearch')!; // 重繪後還原焦點與游標
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });
}
```

- [ ] **Step 3: 接線 global 分支**

1. `select()` 開頭（`cancelTimers()` 之後）加：

```ts
  if (id === 'global') {
    curId = 'global';
    renderInbox();
    $('#rTitle').textContent = '綜合對話 — 跨情報知識庫';
    ($('#genBtn') as HTMLElement).style.display = 'none'; // 知識庫模式無單一報告可重生成
    buildUnion();
    $('#thread').innerHTML =
      `<div class="msg ai reportcard"><div class="mhead"><i></i>知識庫總覽</div>` +
      `<p style="margin:0;color:var(--ink-60);font-size:13.5px">已就緒 ${briefs.length} 條情報、` +
      `${globalUnion.length} 筆來源文件（${catCounts()}）。可勾選右欄來源後直接提問，回答皆附引用；` +
      '也可點下方建議提問開始。</p></div>';
    renderChips(globalQa, 'global');
    ($('#qinput') as HTMLInputElement).value = '';
    renderGbar(avgGrounding(), `跨 ${briefs.length} 條情報平均 · ${globalUnion.length} 筆來源就緒`);
    renderUnionSources();
    return;
  }
```

2. `currentQa()` 改為：

```ts
function currentQa(): PolicyQA[] {
  return curId === 'global' ? globalQa : (briefById(curId)?.qa ?? []);
}
```

3. `mount()` 的 qchips 委派中，global 模式送出前解析佔位——把 `ask(currentQa()[qi], qi);` 改為：

```ts
      let pair = currentQa()[qi];
      if (curId === 'global') pair = { q: pair.q, a: resolveTokens(pair.a) }; // 送出當下解析，編號永遠正確
      ask(pair, qi);
```

4. `updateAfterInflow()` 實作（覆蓋 Task 6 的 no-op）：

```ts
function updateAfterInflow(): void {
  if (curId !== 'global') return;
  buildUnion(); // 對話串不重置，只同步右欄與 gbar
  renderGbar(avgGrounding(), `跨 ${briefs.length} 條情報平均 · ${globalUnion.length} 筆來源就緒`);
  renderUnionSources();
}
```

5. `bindCites()` 擴充 global 行為——把 `mouseenter`/`mouseleave`/`click` 三個 handler 換成：

```ts
    const ghead = () => {
      const s = globalUnion.find((x) => x.no === Number(no));
      return s ? $('#srcList').querySelector<HTMLElement>(`.sghead[data-cat="${s.cat}"]`) : null;
    };
    c.addEventListener('mouseenter', () => {
      const r = row();
      if (r) { r.classList.add('hl'); return; }
      if (curId === 'global') ghead()?.classList.add('hl'); // 收合中 → 高亮群組標頭
    });
    c.addEventListener('mouseleave', () => {
      row()?.classList.remove('hl');
      if (curId === 'global') ghead()?.classList.remove('hl');
    });
    c.addEventListener('click', () => {
      let r = row();
      if (!r && curId === 'global') {
        const s = globalUnion.find((x) => x.no === Number(no));
        if (!s) return;
        expandedCats.add(s.cat); // 自動展開目標群組
        srcQuery = '';
        renderUnionSources();
        r = row();
      }
      if (!r) return;
      r.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' });
      r.classList.add('hl');
      setTimeout(() => r!.classList.remove('hl'), 2000);
    });
```

- [ ] **Step 4: 驗證**

Run: `npx tsc --noEmit`、`npx vitest run`、`npm run build` → 全綠。
Chromium 對照 preview：
1. 點「綜合對話」：標題「綜合對話 — 跨情報知識庫」、重新生成鈕隱藏、知識庫總覽卡（7 條情報 · N 筆來源 · 五類分佈）、gbar 顯平均。
2. 右欄：搜尋框 + 五群組全收合（各帶三態勾選框與 勾選數/總數）；點標頭展開；群組全不選 → 該類全灰、計數 0/N；勾回一筆 → 半選橫線。
3. 搜尋「蘇伊士」→ 只剩海運焦點新聞群組展開一列；清空還原收合狀態。
4. 點綜合 chip 提問 → 回答 cite 編號對應右欄聯集列；點 cite（目標在收合群組）→ 自動展開 + 捲動高亮；hover cite（收合中）→ 群組標頭高亮。
5. 知識庫模式下按「模擬偵測」→ 右欄聯集/群組計數/gbar note 擴充、**對話串不重置**；chips 用掉的記憶跨切換保留；勾選狀態跨切換保留。
6. 自由輸入 → 誠實示範說明；切回一般條目 → 重新生成鈕恢復顯示、右欄回平面清單。
7. console 零錯誤。

- [ ] **Step 5: 檢查點**

更新 HANDOFF 一行；停下：使用者確認 + 使用者 commit。

---

### Task 8: 全站驗收（spec §10 全項）+ 文件收尾

**Files:**
- Modify: `HANDOFF.md`（完成記錄）
- 驗收對象：全部前置 task 的成果；比對基準 `docs/preview/preview-policy-redesign.html` 與 spec §10。

- [ ] **Step 1: 三綠燈**

Run: `npx tsc --noEmit` → 0 errors；`npx vitest run` → 全綠（21+ tests）；`npm run build` → 成功。

- [ ] **Step 2: spec §10 逐項 Chromium 驗收**

對照 spec §10 的 10 個驗收項逐一執行（1-9 項；第 10 項即 preview 基準本身）。其中前面 task 已個別驗過的項目仍要在**同一個 session** 內重跑一遍（迴歸）；額外重點：
- 全部 7+2 條目與綜合對話入口逐一點擊，右欄同步、console 零錯誤。
- 鍵盤導覽迴歸：在 `#qinput` 內打數字 `1`-`6` 不得觸發全站導覽（main.ts 既有的 INPUT bail-out 應涵蓋，需實測確認）。
- 全站七頁（hero/carbon/policy/twin/dispatch/epidemic/alert）導覽一輪，console 乾淨。

- [ ] **Step 3: reduced-motion 驗證**

比照 Task 12 前例：Playwright MCP `browser_run_code_unsafe` 呼叫 `page.emulateMedia({ reducedMotion: 'reduce' })`（或 headless CLI `--force-prefers-reduced-motion`），確認：
- 點條目/生成/追問/流入全部直通可用（無步驟動畫、無思考氣泡、無滑入、gbar 直接設值、未讀圓點不脈動）。
- 內容完整非空白。

- [ ] **Step 4: HANDOFF 收尾**

`HANDOFF.md` 第 1 節記錄「Policy 頁改版實作完成」：任務清單、驗收結果、殘留事項（若有）。

- [ ] **Step 5: 檢查點**

停下：使用者實機驗收 + 使用者 commit（或使用者指示合併方式）。

---

## Self-Review 紀錄

- **Spec coverage**：§3 版面（Task 4）、§4.1 切換（Task 4）、§4.2 生成動畫（Task 6）、§4.3 LLM 切換（Task 4）、§4.4 引用與勾選（Task 4）、§4.5 goto（Task 4）、§4.6 追問（Task 5）、§4.7 流入（Task 6）、§4.8 綜合對話（Task 7）、§5 版型（Task 4）、§6 契約與 mock（Task 2）、§7 檔案結構（Task 1/3/4）、§8 錯誤處理（Task 5 hide/cancel、Task 6 取消語意）、§9 測試（Task 1/2）、§10 驗收（Task 8）、§11 YAGNI（無對應 task，自然滿足）。無缺口。
- **佔位掃描**：`updateAfterInflow` 在 Task 6 為明文 no-op、Task 7 給出完整實作——非 TBD。無其他佔位。
- **型別一致性**：`runTimeline(events, totalMs, done)`（Task 1）與 Task 5/6 呼叫相符；`st()`/`state` 命名一致；`srcRowHtml(s, key)` 兩處呼叫（`data-i` / `data-no-chk`）與勾選 handler 對應；`PolicySnapshot { briefs, inflow, globalQa }` 與 mock.ts cast、index.ts mount 解構一致。
