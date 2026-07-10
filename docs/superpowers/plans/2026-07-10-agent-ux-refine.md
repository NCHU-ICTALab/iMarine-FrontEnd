# Agent 操作體驗 Refine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 四項 agent 操作體驗 refine：互動掛單卡（挑真實 SU）、工具卡顯真實數據、SUGGEST:: 追問 chips、錯誤/中斷打磨。

**Architecture:** 契約先行（`suggest` 事件、`tool_result.cardHtml`、`error.detail`、`ConfirmResult`）→ 工具層（新 `list_holdable_units`、掛單失敗分流、各工具 `cardHtml`）→ live 引擎（SUGGEST 尾行緩衝、`friendlyError`、ConfirmResult 消費）→ UI 層（互動卡、suggest chips、停止即時回復）。spec：`docs/superpowers/specs/2026-07-10-agent-ux-refine-design.md`（**實作前先通讀**）。

**Tech Stack:** 既有 agent screen 檔案（無新產品檔）、vitest、CDP 實機驗證。

## Global Constraints

- **CORE RULE（CLAUDE.md）**：禁對既有檔順手清理/型別補強/import 整理/typo 修正；禁 emoji；commit 無 Claude/Anthropic 署名（author charles、不 push）。
- 改動範圍限 agent 檔（`src/screens/agent/*`、`src/data/types.ts` 追加、`src/data/mock/agent-scenarios.json`、agent 測試檔）；**不動** exchange/provider/其他 screen。
- CSS 全 `#s-agent` 前綴、不手寫 backdrop-filter；文案繁中 + 英文術語。
- **price 語意 = 整顆 SU 總價**（PoC `market.list`，demo 5,945t 掛 300）；卡片顯示折合每噸 = price ÷ amount。
- 每 task 三件套自查：`npx tsc --noEmit`、`npx vitest run`、`npm run build`。基線：24 檔 90 tests。
- CDP：獨立 headless Chrome + SwiftShader flags（`--use-gl=angle --use-angle=swiftshader --run-all-compositor-stages-before-draw`），勿加 `--disable-gpu`，跑畢 pkill 自己起的進程。
- 執行於 feature 分支 `agent-ux-refine`（自 main）；工作區有一個未 commit 的 `agent.css` 50/50 改動，Task 1 Step 0 先單獨 commit。

---

### Task 1: 契約層 + replay ConfirmResult/args 覆寫（TDD）

**Files:**
- Modify: `src/data/types.ts`（agent 段：AgentEvent union + ConfirmResult）
- Modify: `src/screens/agent/replay.ts`（EngineIO.waitConfirm 契約 + exec args 覆寫）
- Test: `tests/agent-replay.test.ts`（更新 + 新案例）、`tests/agent-mock.test.ts`（KINDS 白名單）

**Interfaces:**
- Produces（後續 task 全部依賴）：
  - `AgentEvent` 新增 `{ kind: 'suggest'; items: string[] }`；`tool_result` 加 `cardHtml?: string`；`error` 加 `detail?: string`
  - `export interface ConfirmResult { ok: boolean; args?: Record<string, unknown> }`（types.ts）
  - `EngineIO.waitConfirm(ev): Promise<ConfirmResult>`（原 `Promise<boolean>`）
  - replay 語意：confirm `ok:false` → cancelEvents（不變）；`ok:true 且帶 args` → 覆寫**下一個同名** exec tool_call 的 args（yield 的事件與 runTool 都用覆寫值）

- [ ] **Step 0: 先單獨 commit 工作區既有的 50/50 版面改動**

```bash
git checkout -b agent-ux-refine
git add src/screens/agent/agent.css
git commit -m "feat(agent): 對話與工作區版面改 50/50（使用者回饋）"
```

- [ ] **Step 1: types.ts agent 段修改**

`src/data/types.ts` 的 `AgentEvent`（現於檔尾 agent 契約段）改為：

```ts
export type AgentEvent =
  | { kind: 'plan'; steps: string[] }
  | { kind: 'step_start'; index: number; caption: string }
  | { kind: 'tool_call'; tool: string; args: Record<string, unknown>; module?: AgentModule }
  | { kind: 'tool_result'; tool: string; summaryHtml: string; module?: AgentModule; ms: number; cardHtml?: string }
  | { kind: 'text_delta'; text: string }
  | { kind: 'suggest'; items: string[] }
  | { kind: 'confirm_request'; tool: string; args: Record<string, unknown>; summaryHtml: string }
  | { kind: 'done' }
  | { kind: 'error'; message: string; detail?: string };

/* 確認卡回傳：ok=false 取消；ok=true 時 args 為使用者在互動卡上最終挑選的參數
   （靜態確認卡回原參數）。引擎以 args ?? 原 call args 執行工具。 */
export interface ConfirmResult { ok: boolean; args?: Record<string, unknown> }
```

（只動 `tool_result`/`error` 兩行 + 新增 `suggest` 行 + 檔尾加 ConfirmResult；其餘一字不動。）

- [ ] **Step 2: 更新測試（先跑 FAIL）**

`tests/agent-mock.test.ts`：`KINDS` 陣列加 `'suggest'`。
`tests/agent-replay.test.ts`：io stub 的 `waitConfirm` 改回傳 `ConfirmResult`，並加覆寫案例——整檔三處修改 + 一個新 it：

```ts
// io() 改：
const io = (confirm: boolean, ran: string[], ranArgs?: Record<string, unknown>[]): any => ({
  reduced: true, signal: new AbortController().signal,
  runTool: async (n: string, a: Record<string, unknown>) => {
    ran.push(n); ranArgs?.push(a);
    return { summaryHtml: 's', llmText: 'l' };
  },
  waitConfirm: async () => ({ ok: confirm }),
});

// 新 it（describe('runScenario') 內）：
it('confirm 帶 args → 覆寫下一個同名 exec tool_call 的參數', async () => {
  const ran: string[] = []; const ranArgs: Record<string, unknown>[] = [];
  const myIo = io(true, ran, ranArgs);
  myIo.waitConfirm = async () => ({ ok: true, args: { token_id: 7, price: 99 } });
  const evs = await collect(runScenario(sc, myIo));
  expect(ranArgs[1]).toEqual({ token_id: 7, price: 99 }); // place_carbon_order 用覆寫值
  const tc = evs.filter((e) => e.kind === 'tool_call' && e.tool === 'place_carbon_order')[0] as any;
  expect(tc.args).toEqual({ token_id: 7, price: 99 });     // yield 的事件也帶覆寫值
});
```

Run: `npx vitest run tests/agent-replay.test.ts` → 既有 confirm 案例 FAIL（型別/行為未改）。

- [ ] **Step 3: 改 replay.ts**

```ts
// EngineIO（import ConfirmResult from '../../data/types'）：
export interface EngineIO {
  runTool(name: string, args: Record<string, unknown>): Promise<ToolRunResult>;
  waitConfirm(ev: Extract<AgentEvent, { kind: 'confirm_request' }>): Promise<ConfirmResult>;
  signal: AbortSignal;
  reduced: boolean;
}

// play() 內：迴圈外宣告 let override: { tool: string; args: Record<string, unknown> } | null = null;
// confirm 分支改：
if (ev.kind === 'confirm_request') {
  yield strip(ev);
  const res = await io.waitConfirm(strip(ev) as Extract<AgentEvent, { kind: 'confirm_request' }>);
  if (io.signal.aborted) return;
  if (!res.ok) { yield* play(cancelEvents ?? [{ kind: 'done', delayMs: 0 }], undefined, io); return; }
  if (res.args) override = { tool: ev.tool, args: res.args }; // 覆寫下一個同名 exec
  continue;
}
// exec tool_call 分支改（覆寫 args；事件與 runTool 都用覆寫值）：
if (ev.kind === 'tool_call' && ev.exec) {
  const execArgs = override && override.tool === ev.tool ? override.args : ev.args;
  if (override && override.tool === ev.tool) override = null;
  yield { ...(strip(ev) as Extract<AgentEvent, { kind: 'tool_call' }>), args: execArgs };
  const t0 = performance.now();
  const r = await io.runTool(ev.tool, execArgs);
  if (io.signal.aborted) return;
  yield { kind: 'tool_result', tool: ev.tool, summaryHtml: r.summaryHtml, module: r.module ?? (ev as any).module, ms: Math.round(performance.now() - t0), cardHtml: r.cardHtml };
  continue;
}
```

（`r.cardHtml` 目前 ToolRunResult 尚無此欄位——Task 2 才加；本 task 為避免 tsc 錯誤，`cardHtml: (r as any).cardHtml` 或先在 Task 1 同步把 `ToolRunResult` 加上 `cardHtml?: string`（tools.ts 介面加一行、不動實作）。**採後者**：tools.ts 的 `ToolRunResult` 加 `cardHtml?: string;` 一行。）

- [ ] **Step 4: 跑測試 PASS**：`npx vitest run tests/agent-replay.test.ts tests/agent-mock.test.ts` 全綠。注意：controller.ts/loop.ts 此時 `waitConfirm` 型別不合 → `npx tsc --noEmit` **會有錯誤**——本 task 允許（Task 3/4 修復），在 report 註明；`vitest` 與 `build`（vite build 不含 tsc）需通過。若 build 因型別失敗，最小過渡：controller.ts `waitConfirm` 回傳改 `Promise.resolve({ ok })` 包裝、loop.ts `const res = await io.waitConfirm(ev); const ok = res.ok;`（兩處各一行級，Task 3/4 再完整接手）。**優先做此過渡讓 tsc 全綠**，避免中間態紅燈。
- [ ] **Step 5: Commit**：`git add src/data/types.ts src/screens/agent/replay.ts src/screens/agent/tools.ts src/screens/agent/controller.ts src/screens/agent/loop.ts tests/agent-replay.test.ts tests/agent-mock.test.ts && git commit -m "feat(agent): ConfirmResult 契約 + replay args 覆寫 + suggest/cardHtml/detail 事件欄位（TDD）"`

---

### Task 2: tools.ts — list_holdable_units + 掛單失敗分流 + cardHtml（TDD）

**Files:**
- Modify: `src/screens/agent/tools.ts`
- Test: `tests/agent-tools.test.ts`（追加案例）

**Interfaces:**
- Consumes: `ToolRunResult.cardHtml?`（Task 1 已加）。
- Produces:
  - 新工具 `list_holdable_units`：`module:'carbon'`、`data` = `{ token_id: number; amount: number }[]`（cap 50，**Task 4 的互動卡下拉消費此形狀**）
  - `get_module_data` 回傳加 `cardHtml`（各模組）與 carbon 的 `data: snap`（**Task 4 市場脈絡行消費 `tonsCirculating`/`listed`**）
  - `place_carbon_order` 失敗分流：fetch throw → 示範；`!r.ok` → 誠實失敗

- [ ] **Step 1: 寫失敗測試（追加到 tests/agent-tools.test.ts 的 describe('createTools') 內）**

```ts
it('list_holdable_units 篩 held、data 附完整清單、llmText 帶前 N 筆', async () => {
  const sus = [
    { token_id: 0, status: 'retired', amount: 100 },
    { token_id: 1, status: 'held', amount: 200 },
    { token_id: 2, status: 'listed', amount: 300 },
    { token_id: 3, status: 'held', amount: 400 },
  ];
  const g: any = globalThis;
  const origFetch = g.fetch;
  g.fetch = async () => ({ ok: true, json: async () => ({ sus }) });
  try {
    const r = await by('list_holdable_units').run({});
    expect(r.data).toEqual([{ token_id: 1, amount: 200 }, { token_id: 3, amount: 400 }]);
    expect(r.llmText).toContain('#1');
    expect(r.module).toBe('carbon');
    expect(r.cardHtml).toContain('2');
  } finally { g.fetch = origFetch; }
});
it('list_holdable_units 後端離線 → data 空、llmText 標離線', async () => {
  const g: any = globalThis;
  const origFetch = g.fetch;
  g.fetch = async () => { throw new Error('refused'); };
  try {
    const r = await by('list_holdable_units').run({});
    expect(r.data).toEqual([]);
    expect(r.llmText).toContain('離線');
  } finally { g.fetch = origFetch; }
});
it('place_carbon_order 後端在但非 2xx → 誠實失敗（不講示範）', async () => {
  const g: any = globalThis;
  const origFetch = g.fetch;
  g.fetch = async () => ({ ok: false, status: 500 });
  try {
    const r = await by('place_carbon_order').run({ token_id: 1, price: 15 });
    expect(r.llmText).toContain('掛單失敗');
    expect(r.llmText).not.toContain('示範');
  } finally { g.fetch = origFetch; }
});
it('get_module_data(twin) 回 cardHtml 帶泊位/航跡數', async () => {
  const r = await by('get_module_data').run({ module: 'twin' });
  expect(r.cardHtml).toContain('443');
});
it('cardHtml 對缺欄位 snapshot 不炸', async () => {
  const r = await by('get_module_data').run({ module: 'dispatch' }); // stub snapshot 回 {}
  expect(r.summaryHtml).toBeTruthy(); // 不 throw 即可
});
```

（既有 test ctx stub 的 twin snapshot 已回 `{ berths: [], trackCount: 443 }`；dispatch stub 回 `{ kpi: { published: 3 } }`——缺 scenarios 欄位，正好驗防禦性。）

- [ ] **Step 2: 跑 FAIL**：`npx vitest run tests/agent-tools.test.ts`。
- [ ] **Step 3: 實作 tools.ts**

(a) `get_module_data` 的 `run` 改為（cardHtml 組字函式 + carbon data 附載）：

```ts
/* 各模組 snapshot → 右欄豐富卡 HTML（全部防禦性 optional chaining，缺欄位少顯示不炸） */
function moduleCardHtml(m: AgentModule, snap: any): string | undefined {
  const n = (v: unknown) => (typeof v === 'number' ? v.toLocaleString() : '—');
  switch (m) {
    case 'carbon':
      return `<div class="rstats">` +
        `<span>發行 <b>${n(snap?.issued)}</b></span><span>流通 <b>${n(snap?.tonsCirculating)} t</b></span>` +
        `<span>掛單 <b>${n(snap?.listed)}</b></span><span>除役 <b>${n(snap?.retired)}</b></span></div>`;
    case 'dispatch': {
      const sc = snap?.scenarios?.[0];
      if (!sc) return undefined;
      const concl = String(sc.conclusion ?? '').replace(/\{\{(?:stop|add):([^}]*)\}\}/g, '$1');
      return `<div class="rline"><b>${esc(String(sc.label ?? ''))}</b> ${esc(concl)}</div>`;
    }
    case 'twin':
      return `<div class="rstats"><span>泊位 <b>${n(snap?.berths?.length)}</b></span><span>航跡 <b>${n(snap?.trackCount)}</b></span></div>`;
    case 'epidemic':
      return `<div class="rstats"><span>追蹤船隊 <b>${n(snap?.fleet?.length)}</b></span><span>流入情資 <b>${n(snap?.inflowPool?.length)}</b></span></div>`;
    case 'alert':
      return `<div class="rstats"><span>已發布 <b>${n(snap?.kpi?.published)}</b></span><span>送達率 <b>${n(snap?.kpi?.deliveryRate)}%</b></span></div>`;
    case 'policy':
      return `<div class="rstats"><span>情報收件匣 <b>${n(snap?.briefs?.length)}</b></span></div>`;
  }
}
```

`get_module_data.run` 的成功 return 改：

```ts
return {
  module: m, summaryHtml: `已讀取${name}模組快照`,
  cardHtml: moduleCardHtml(m, snap),
  data: m === 'carbon' ? snap : undefined, // 互動掛單卡的市場脈絡行用（Task 4）
  llmText: `${name}模組快照 JSON：${jsonBrief(snap)}`,
};
```

（carbon `ok:false` 離線分支維持原樣、不出 cardHtml。）

(b) `ask_policy_rag` 成功分支 return 加：

```ts
cardHtml: `<div class="rline">命中 <b>${r.sources.length}</b> 條證據${r.sources.slice(0, 2).map((s) => `<span class="rsrc">${esc(String(s.name ?? '')).slice(0, 24)}</span>`).join('')}</div>`,
```

(c) 新工具（插在 `place_carbon_order` 前）：

```ts
{
  name: 'list_holdable_units', module: 'carbon',
  description: '列出目前可掛單（held 狀態）的碳權 SU 清單。使用者要掛單/上架碳權時，先呼叫本工具取得清單，再呼叫 place_carbon_order（其參數為建議值，使用者會在確認卡上最終挑選）。',
  parameters: { type: 'object', properties: { limit: { type: 'number', description: '回傳給模型的筆數上限（預設 8）' } } },
  async run(args) {
    try {
      const r = await fetch(ctx.data.carbon.base + '/state');
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      const held: { token_id: number; amount: number }[] = (d.sus ?? [])
        .filter((s: any) => s.status === 'held')
        .map((s: any) => ({ token_id: Number(s.token_id), amount: Number(s.amount ?? 0) }));
      const limit = Math.max(1, Math.min(20, Number(args.limit) || 8));
      const brief = held.slice(0, limit).map((s) => `#${s.token_id}(${s.amount}t)`).join('、');
      return {
        module: 'carbon' as const,
        data: held.slice(0, 50), // 互動卡下拉消費（cap 50）
        summaryHtml: `可掛單 SU 共 ${held.length} 筆`,
        cardHtml: `<div class="rline">可掛單 <b>${held.length}</b> 筆${held.slice(0, 3).map((s) => `<span class="rsrc">#${s.token_id} · ${s.amount.toLocaleString()}t</span>`).join('')}</div>`,
        llmText: held.length
          ? `可掛單（held）SU 共 ${held.length} 筆，前 ${Math.min(limit, held.length)} 筆：${brief}。請挑一筆與建議總價（整顆 SU 總價，美元整數）呼叫 place_carbon_order。`
          : '目前沒有可掛單的 held SU。',
      };
    } catch {
      return { module: 'carbon' as const, data: [], summaryHtml: '碳權後端離線，無法取得清單', llmText: '碳權後端離線（:8000），無法取得可掛單清單。' };
    }
  },
},
```

(d) `place_carbon_order.run` 失敗分流：

```ts
async run(args) {
  let resp: Response;
  try {
    resp = await fetch(ctx.data.carbon.base + '/list', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token_id: args.token_id, price: Math.round(Number(args.price)) }),
    });
  } catch {
    return { module: 'carbon', summaryHtml: '（示範）後端離線，掛單以示範模式記錄', llmText: '（示範）碳權後端未啟動，本次掛單為示範性質、未寫入鏈上。' };
  }
  if (!resp.ok)
    return { module: 'carbon', summaryHtml: `掛單失敗：SU #${args.token_id} 可能已上架或不可掛`, llmText: `掛單失敗（HTTP ${resp.status}）：SU #${args.token_id} 可能已上架或不可掛，請改挑其他 held SU。` };
  return { module: 'carbon', summaryHtml: `掛單成功：SU #${args.token_id} 總價 $${args.price}`, llmText: `掛單成功：SU #${args.token_id}（總價 $${args.price}）已寫入鏈上。` };
},
```

- [ ] **Step 4: 跑 PASS + 三件套**（tsc 0 / vitest 全綠 / build ok）。
- [ ] **Step 5: Commit**：`git add src/screens/agent/tools.ts tests/agent-tools.test.ts && git commit -m "feat(agent): list_holdable_units + 掛單失敗分流 + 各工具 cardHtml（TDD）"`

---

### Task 3: loop.ts — SUGGEST 尾行緩衝 + friendlyError + ConfirmResult 消費（TDD 純函式）

**Files:**
- Modify: `src/screens/agent/loop.ts`
- Test: `tests/agent-plan.test.ts`（追加 parseSuggest/splitEmittable/friendlyError）

**Interfaces:**
- Consumes: `ConfirmResult`（Task 1）。
- Produces:
  - `parseSuggest(text): { items: string[]; rest: string }`
  - `splitEmittable(buf): { emit: string; hold: string }`（尾行緩衝純函式）
  - `friendlyError(raw: string): { message: string; detail?: string }`
  - `suggest` 事件於 done 前 yield；error 事件帶 detail

- [ ] **Step 1: 寫失敗測試（追加到 tests/agent-plan.test.ts）**

```ts
import { parseSuggest, splitEmittable, friendlyError } from '../src/screens/agent/loop';

describe('parseSuggest', () => {
  it('尾行 SUGGEST:: → 拆 items、rest 去掉該行', () => {
    const r = parseSuggest('回答內容。\nSUGGEST::追問A｜追問B｜追問C');
    expect(r.items).toEqual(['追問A', '追問B', '追問C']);
    expect(r.rest).toBe('回答內容。');
  });
  it('帶尾端換行也解析；超過 3 條截斷', () => {
    const r = parseSuggest('x\nSUGGEST::a｜b｜c｜d\n');
    expect(r.items).toEqual(['a', 'b', 'c']);
  });
  it('無 SUGGEST → items 空、rest 原文', () => {
    expect(parseSuggest('純回答')).toEqual({ items: [], rest: '純回答' });
  });
});

describe('splitEmittable', () => {
  it('尾行是 SUGGEST 字首（切半）→ 扣住尾行、放行其餘', () => {
    expect(splitEmittable('回答。\nSUG')).toEqual({ emit: '回答。\n', hold: 'SUG' });
  });
  it('尾行是完整 SUGGEST 行 → 扣住', () => {
    const r = splitEmittable('回答。\nSUGGEST::a｜b');
    expect(r.hold).toBe('SUGGEST::a｜b');
  });
  it('尾行帶結尾換行的 SUGGEST 行 → 仍扣住（不外洩）', () => {
    const r = splitEmittable('回答。\nSUGGEST::a｜b\n');
    expect(r.emit).toBe('回答。\n');
    expect(r.hold).toBe('SUGGEST::a｜b\n');
  });
  it('一般文字尾行 → 全部放行', () => {
    expect(splitEmittable('回答還沒完')).toEqual({ emit: '回答還沒完', hold: '' });
  });
});

describe('friendlyError', () => {
  it('key 無效', () => { expect(friendlyError('API_KEY_INVALID: x').message).toContain('金鑰'); });
  it('網路', () => { expect(friendlyError('TypeError: Failed to fetch').message).toContain('網路'); });
  it('額度', () => { expect(friendlyError('429 RESOURCE_EXHAUSTED').message).toContain('額度'); });
  it('其他 → 通用 + detail 截 120', () => {
    const r = friendlyError('x'.repeat(300));
    expect(r.message).toContain('暫時無法回應');
    expect(r.detail!.length).toBe(120);
  });
});
```

- [ ] **Step 2: 跑 FAIL** 後實作。三個純函式：

```ts
export function parseSuggest(text: string): { items: string[]; rest: string } {
  const m = text.match(/\n?SUGGEST::([^\n]+)\n?\s*$/);
  if (!m) return { items: [], rest: text };
  return {
    items: m[1].split('｜').map((s) => s.trim()).filter(Boolean).slice(0, 3),
    rest: text.slice(0, m.index).replace(/\n$/, ''),
  };
}

/* SUGGEST 尾行緩衝：扣住「最後一行」若它可能是 SUGGEST 行（含被 chunk 切半的字首），
   其餘放行。放行段直接 yield text_delta；扣住段留到流結束交 parseSuggest 判定。 */
export function splitEmittable(buf: string): { emit: string; hold: string } {
  const body = buf.endsWith('\n') ? buf.slice(0, -1) : buf;
  const nl = body.lastIndexOf('\n');
  const tail = body.slice(nl + 1);
  const isSuspect = tail.length > 0 && ('SUGGEST::'.startsWith(tail) || tail.startsWith('SUGGEST::'));
  if (!isSuspect) return { emit: buf, hold: '' };
  return { emit: buf.slice(0, nl + 1), hold: buf.slice(nl + 1) };
}

export function friendlyError(raw: string): { message: string; detail?: string } {
  if (/API_KEY_INVALID|API key not valid/i.test(raw))
    return { message: 'Gemini 金鑰無效或未授權——檢查 .env 的 VITE_GEMINI_API_KEY 後重啟 dev server' };
  if (/Failed to fetch|NetworkError|fetch failed/i.test(raw))
    return { message: '連線 Gemini 失敗——請確認網路（離線時可拔除 key 走劇本示範）' };
  if (/RESOURCE_EXHAUSTED|429/.test(raw))
    return { message: 'Gemini 額度已滿，稍後再試或走劇本示範' };
  return { message: '數位員工暫時無法回應', detail: raw.slice(0, 120) };
}
```

- [ ] **Step 3: runGemini 整合改動（四處）**

(a) **SUGGEST 緩衝**：每輪 stream 迴圈用 `pend` 管線取代直接 yield（plan 緩衝流程不變，flush 後的 `rest` 也進管線）：

```ts
let pend = ''; // 本輪 SUGGEST 尾行緩衝
const emitText = function* (s: string) { /* 不可用：generator 內 helper 不能 yield —— 直接 inline */ };
// 迴圈內（planSent 之後的文字路徑）：
pend += t;
const { emit, hold } = splitEmittable(pend);
if (emit) { yield { kind: 'text_delta', text: emit }; finalText += emit; }
pend = hold;
// plan flush 分支：原「if (rest) { yield …; finalText += rest; }」改為 pend += rest 後跑同一段 splitEmittable。
```

輪結束（stream 收完）：
- 有 functionCalls（中間輪）：`if (pend) { yield { kind:'text_delta', text: pend }; finalText += pend; pend = ''; }`（中間輪不該有 SUGGEST，照常放行）。
- 無 functionCalls（最終輪，`!calls.length` 分支）：
```ts
if (pend) {
  const sug = parseSuggest(pend);
  if (sug.rest) { yield { kind: 'text_delta', text: sug.rest }; finalText += sug.rest; }
  if (sug.items.length) { pendingSuggest = sug.items; } // done 前 yield
  pend = '';
}
contents.push({ role: 'model', parts: [{ text: finalText }] }); // finalText 已不含 SUGGEST 行
hist.length = 0; hist.push(...contents);
if (pendingSuggest) yield { kind: 'suggest', items: pendingSuggest };
yield { kind: 'done' };
return;
```
（`let pendingSuggest: string[] | null = null;` 宣告在 turn 迴圈外。）

(b) **ConfirmResult 消費**（confirm 分支改）：

```ts
if (tool.confirm) {
  const ev = { kind: 'confirm_request', tool: c.name, args: c.args, summaryHtml: `執行 ${tool.name}（${JSON.stringify(c.args)}）？` } as const;
  yield ev;
  const res = await io.waitConfirm(ev);
  if (io.signal.aborted) return;
  if (!res.ok) { responses.push({ functionResponse: { name: c.name, response: { result: '使用者取消了這個動作' } } }); continue; }
  if (res.args) c.args = res.args; // 使用者在互動卡上挑的最終參數；後續 yield/執行/回填全用它
}
yield { kind: 'tool_call', tool: c.name, args: c.args, module: tool.module };
const t0 = performance.now();
const r = await io.runTool(c.name, c.args);
yield { kind: 'tool_result', tool: c.name, summaryHtml: r.summaryHtml, module: r.module ?? tool.module, ms: Math.round(performance.now() - t0), cardHtml: r.cardHtml };
responses.push({ functionResponse: { name: c.name, response: { result: `（實際執行參數 ${JSON.stringify(c.args)}）` + r.llmText } } });
```

（同時把 Task 1 Step 4 的過渡碼移除。）

(c) **friendlyError**（catch 改）：

```ts
} catch (e) {
  if (!io.signal.aborted) {
    const fe = friendlyError(String((e as Error).message ?? e));
    yield { kind: 'error', message: fe.message, detail: fe.detail };
  }
}
```

(d) **SYSTEM_PROMPT 追加兩條規則**（規則 5 後）：

```ts
'6. 回答結束後，最後一行輸出 SUGGEST::追問1｜追問2｜追問3（2-3 條、每條 12 字內、必須是使用者可能想追問的下一步）。',
'7. 使用者要掛單碳權時：先呼叫 list_holdable_units 取得可掛單清單，再以其中一筆與建議總價（整顆 SU 總價，美元整數）呼叫 place_carbon_order；該參數是建議值，使用者會在確認卡上最終挑選。',
```

- [ ] **Step 4: 跑 PASS + 三件套**（tsc 0——Task 1 過渡碼移除後 loop 型別完整）。
- [ ] **Step 5: Commit**：`git add src/screens/agent/loop.ts tests/agent-plan.test.ts && git commit -m "feat(agent): SUGGEST 尾行緩衝 + friendlyError + ConfirmResult 消費（TDD）"`

---

### Task 4: controller/workspace/css + 劇本 — 互動掛單卡、suggest chips、停止即時回復（CDP）

**Files:**
- Modify: `src/screens/agent/controller.ts`、`src/screens/agent/workspace.ts`、`src/screens/agent/agent.css`
- Modify: `src/data/mock/agent-scenarios.json`
- Test: `tests/agent-mock.test.ts`（劇本 suggest 斷言）；互動走 CDP

**Interfaces:**
- Consumes: `ConfirmResult`、`suggest`/`cardHtml`/`detail` 事件（Task 1）、`list_holdable_units.data`/`get_module_data(carbon).data`（Task 2）。
- Produces: 完整可互動 refine 後頁面。`Workspace` 加 `markStopped(): void`；`settleToolCard(summaryHtml, ms, cardHtml?)`。

- [ ] **Step 1: workspace.ts**

```ts
// ToolCardEvent + CardState 各加 cardHtml?: string；
// settleToolCard 簽名改：
function settleToolCard(summaryHtml: string, ms: number, cardHtml?: string): void {
  const last = cards[cards.length - 1];
  if (!last || !last.running) return; // 序列假設 guard（Task 6 review 建議）
  last.summaryHtml = summaryHtml; last.ms = ms; last.running = false; last.cardHtml = cardHtml;
  renderCards();
}
// cardHtml(c) 渲染改：
const cls = 'wcard lg lg-static' + (c.running ? ' current' : ' settled') + (c.cardHtml ? ' rich' : '');
...
`<div class="wsum">${c.cardHtml ?? c.summaryHtml}</div>` +
// 新方法（停止即時回復：running 卡標已中止）：
function markStopped(): void {
  const last = cards[cards.length - 1];
  if (last && last.running) { last.running = false; last.summaryHtml = '已中止'; renderCards(); }
}
// Workspace 介面 + return 加 markStopped。
```

- [ ] **Step 2: controller.ts — 狀態與快取**

```ts
// confirmResolve 型別改：
let confirmResolve: ((res: ConfirmResult) => void) | null = null;
// 任務內快取（runTask 開頭重置）：
let lastHoldable: { token_id: number; amount: number }[] = [];
let lastCarbon: { tonsCirculating?: number; listed?: number } | null = null;
// io.runTool 攔截（run_diagnostics 之外再加兩個）：
if (n === 'list_holdable_units' && Array.isArray(r.data)) lastHoldable = r.data as typeof lastHoldable;
if (n === 'get_module_data' && (a as any).module === 'carbon' && r.data) lastCarbon = r.data as typeof lastCarbon;
// io.waitConfirm 改：
waitConfirm: (ev) => new Promise<ConfirmResult>((res) => {
  if (ev.tool === 'place_carbon_order') renderOrderCard(bubble, ev, res);
  else renderConfirmCard(bubble, ev, res);
  ws.showConfirm(ev.summaryHtml);
  ws.caption('等待操作員確認…');
}),
```

既有 `renderConfirmCard` 的 `resolve` 改 `(res: ConfirmResult) => void`：`pick(ok)` 內 `resolve(ok ? { ok: true, args: ev.args } : { ok: false })`；`confirmResolve = (r) => pick(r.ok);`。

- [ ] **Step 3: controller.ts — 互動掛單卡 renderOrderCard（新函式，緊鄰 renderConfirmCard）**

```ts
function renderOrderCard(
  bubble: HTMLElement,
  ev: Extract<AgentEvent, { kind: 'confirm_request' }>,
  resolve: (res: ConfirmResult) => void,
): void {
  const host = bubble.querySelector('.confirmhost') as HTMLElement;
  const sug = ev.args as { token_id?: unknown; price?: unknown };
  const sugPrice = Math.max(1, Math.round(Number(sug.price) || 15));
  const list = lastHoldable;
  const options = list.map((s) =>
    `<option value="${s.token_id}" data-amount="${s.amount}"${Number(sug.token_id) === s.token_id ? ' selected' : ''}>SU #${s.token_id} · ${s.amount.toLocaleString()} 噸</option>`).join('');
  const suField = list.length
    ? `<label>選擇 SU<select class="csel">${options}</select></label>`
    : `<label>SU 編號（未取得清單，手動輸入）<input type="number" class="ctok" min="0" step="1" value="${Math.max(0, Math.round(Number(sug.token_id) || 0))}"></label>`;
  const market = lastCarbon
    ? `<div class="cmkt">市場脈絡：流通 ${Number(lastCarbon.tonsCirculating ?? 0).toLocaleString()} t · 掛單中 ${lastCarbon.listed ?? 0} 筆</div>` : '';
  const card = document.createElement('div');
  card.className = 'confirmcard chatconfirm orderform';
  card.innerHTML =
    '<div class="cstt">需要你確認 — 碳權掛單</div>' +
    `<div class="ccform">${suField}` +
    `<label>總價 (USD)<input type="number" class="cprice" min="1" step="1" value="${sugPrice}"></label>` +
    '<div class="cest">折合每噸 <b class="cper">$—</b></div>' + market + '</div>' +
    '<div class="cbtns"><button type="button" class="cbtn ok">確認掛單</button><button type="button" class="cbtn no">取消</button></div>';
  host.appendChild(card);
  const sel = card.querySelector('.csel') as HTMLSelectElement | null;
  const tok = card.querySelector('.ctok') as HTMLInputElement | null;
  const priceIn = card.querySelector('.cprice') as HTMLInputElement;
  const per = card.querySelector('.cper') as HTMLElement;
  const updatePer = () => {
    const amount = sel ? Number(sel.selectedOptions[0]?.dataset.amount ?? 0)
      : Number(list.find((s) => s.token_id === Number(tok?.value))?.amount ?? 0);
    const p = Number(priceIn.value) || 0;
    per.textContent = amount > 0 && p > 0 ? '$' + (p / amount).toFixed(3) + '/t' : '$—';
  };
  sel?.addEventListener('change', updatePer);
  tok?.addEventListener('input', updatePer);
  priceIn.addEventListener('input', updatePer);
  updatePer();
  let settled = false;
  const pick = (ok: boolean): void => {
    if (settled) return;
    settled = true;
    confirmResolve = null;
    card.querySelectorAll('button,select,input').forEach((n) => n.setAttribute('disabled', ''));
    card.classList.add(ok ? 'picked-ok' : 'picked-no');
    ws.showConfirm('');
    if (!ok) { resolve({ ok: false }); return; }
    const token_id = sel ? Number(sel.value) : Math.max(0, Math.round(Number(tok?.value) || 0));
    const price = Math.max(1, Math.round(Number(priceIn.value) || sugPrice));
    resolve({ ok: true, args: { token_id, price } });
  };
  (card.querySelector('.cbtn.ok') as HTMLButtonElement).addEventListener('click', () => pick(true));
  (card.querySelector('.cbtn.no') as HTMLButtonElement).addEventListener('click', () => pick(false));
  confirmResolve = (r) => pick(r.ok);
  scrollThread();
}
```

- [ ] **Step 4: controller.ts — consume 三處 + suggest + 停止即時回復 + supersede guard**

```ts
// consume 'tool_result'：settle 帶 cardHtml
ws.settleToolCard(ev.summaryHtml, ev.ms, ev.cardHtml);
// consume 新 case：
case 'suggest': {
  const row = document.createElement('div');
  row.className = 'schips';
  row.innerHTML = ev.items.map((s) => `<button type="button" class="schip">${esc(s)}</button>`).join('');
  bubble.appendChild(row);
  break;
}
// consume 'error'：detail 次要小字
case 'error': {
  const e = document.createElement('div');
  e.className = 'aerr';
  e.textContent = ev.message;
  if (ev.detail) {
    const d = document.createElement('div');
    d.className = 'aerrdetail';
    d.textContent = ev.detail;
    e.appendChild(d);
  }
  bubble.appendChild(e);
  finishSteps(tline);
  ws.caption('發生錯誤');
  break;
}
// thread click 委派加 schip（既有 [data-nav] 委派之前或之後皆可）：
thread.addEventListener('click', (e) => {
  const s = (e.target as HTMLElement).closest('.schip');
  if (s) { void submit(s.textContent ?? ''); return; }
  const chip = (e.target as HTMLElement).closest('[data-nav]');
  if (!chip) return;
  const id = chip.getAttribute('data-nav');
  if (id) location.hash = '#/' + id;
});
// runTask 開頭（appendUserBubble 前）：
thread.querySelectorAll('.schips').forEach((n) => n.remove()); // 新任務移除上一組追問 chips
lastHoldable = []; lastCarbon = null;
const myCtrl = ctrl; // supersede guard：stop 後立刻開新任務時，舊 finally 不得動新任務的 UI
// runTask finally 改：
} finally {
  if (ctrl === myCtrl) {
    running = false;
    setInputMode('idle');
    if (touched.length) ws.footprint(touched);
    if (pendingNav && !myCtrl.signal.aborted) {
      const target = pendingNav; pendingNav = null;
      navTimer = setTimeout(() => { navTimer = null; location.hash = '#/' + target; }, 1500);
    } else { pendingNav = null; }
  }
  if (curBubble === bubble) curBubble = null;
}
// stop() 改（即時回復）：
function stop(): void {
  if (!running) return;
  if (confirmResolve) confirmResolve({ ok: false });
  ctrl?.abort();
  running = false;          // 立刻可下下一個指令（舊任務收尾由 supersede guard 隔離）
  setInputMode('idle');
  ws.markStopped();
  if (curBubble) { /* 既有：ico 停轉 + astop 註記，不變 */ }
  ws.caption('已停止');
  scrollThread();
}
// teardown()：confirmResolve({ ok: false })（型別隨改）。
```

- [ ] **Step 5: agent.css 追加（#s-agent 前綴）**

```css
/* 豐富工具卡 */
#s-agent .wcard.rich .wsum{padding-top:2px;}
#s-agent .rstats{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--ink-60);}
#s-agent .rstats b{font-family:var(--mono,monospace);color:var(--ink);font-weight:600;}
#s-agent .rline{font-size:12px;color:var(--ink-60);line-height:1.5;}
#s-agent .rline b{font-family:var(--mono,monospace);color:var(--ink);}
#s-agent .rsrc{display:inline-block;margin-left:8px;padding:1px 7px;border:1px solid var(--hair);border-radius:99px;font-size:11px;color:var(--ink-60);}
/* 互動掛單卡 */
#s-agent .orderform .ccform{display:flex;flex-direction:column;gap:8px;margin:8px 0 2px;}
#s-agent .orderform label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--ink-60);}
#s-agent .orderform select,#s-agent .orderform input{background:rgba(255,255,255,.06);border:1px solid var(--hair);border-radius:9px;padding:7px 10px;color:var(--ink);font:inherit;}
#s-agent .orderform .cest{font-size:12px;color:var(--ink-60);}
#s-agent .orderform .cest b{font-family:var(--mono,monospace);color:var(--lg-accent);}
#s-agent .orderform .cmkt{font-size:11px;color:var(--ink-40);}
/* 追問 chips */
#s-agent .schips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;}
#s-agent .schip{border:1px dashed rgba(180,140,255,.45);background:none;border-radius:99px;padding:4px 11px;font-size:12px;color:#c8b8ea;cursor:pointer;font:inherit;}
#s-agent .schip:hover{background:rgba(180,140,255,.12);}
/* 錯誤 detail */
#s-agent .aerrdetail{margin-top:4px;font-size:11px;color:var(--ink-40);font-family:var(--mono,monospace);word-break:break-all;}
```

（實作時對照 tokens.css 既有變數名——`--ink`/`--ink-60`/`--ink-40`/`--hair`/`--lg-accent`；若某變數不存在，grep tokens.css 用真名。）

- [ ] **Step 6: agent-scenarios.json**

(a) `sc-order`：step_start(0) 的 `get_module_data(carbon)` 之後插入：

```json
{ "kind": "tool_call", "tool": "list_holdable_units", "args": {}, "module": "carbon", "delayMs": 400, "exec": true },
```

`confirm_request.summaryHtml` 改：`"掛單碳權 SU — 請在卡片上挑選 SU 與總價後確認（寫入鏈上交易）"`。

(b) 四條劇本各在 `done` 事件**前**插 `suggest`（追問文字全部命中既有 patterns，點了必有戲）：
- sc-summary：`{ "kind": "suggest", "items": ["跑一次系統健檢", "紅海事件對碳成本的影響", "幫我掛單碳權"], "delayMs": 300 }`
- sc-redsea：`{ "kind": "suggest", "items": ["幫我掛單碳權", "今日營運摘要"], "delayMs": 300 }`
- sc-diag：`{ "kind": "suggest", "items": ["今日營運摘要", "幫我掛單碳權"], "delayMs": 300 }`
- sc-order：`{ "kind": "suggest", "items": ["今日營運摘要", "跑一次系統健檢"], "delayMs": 300 }`；`cancelEvents` 的 done 前加 `{ "kind": "suggest", "items": ["幫我掛單碳權"], "delayMs": 300 }`

(c) `tests/agent-mock.test.ts` 加一個 it：

```ts
it('每條劇本在 done 前有 suggest 事件（追問 chips）', () => {
  for (const sc of SCS) {
    const kinds = sc.events.map((e) => e.kind);
    expect(kinds).toContain('suggest');
    expect(kinds.indexOf('suggest')).toBeLessThan(kinds.lastIndexOf('done'));
  }
});
```

- [ ] **Step 7: 三件套自查** + **CDP 驗證（mock 態不設 key；起 dev、headless Chrome port 9465、user-data-dir /tmp/agent-ux-cdp）**：
  1. sc-order 全流程：右欄出 `list_holdable_units` 豐富卡（真 /state held 數）→ 互動卡出現（下拉有真實選項、含建議 token 預選）→ 改選另一顆 SU + 改總價 → 折合每噸即時變 → 確認 → 掛單以**挑的參數**真打 `/list`（斷言 fetch body 或 掛單成功文案帶挑的 token_id）→ 碳權 /state 該 token 轉 listed。
  2. sc-order 取消路徑：取消 → cancelEvents 播放 + cancel 的 suggest chips 出現。
  3. sc-summary：三張豐富工具卡（rstats 有 mono 數字）、答案尾 suggest chips 出現 → 點「跑一次系統健檢」→ 新任務啟動 + 舊 chips 移除。
  4. 停止即時回復：sc-summary 執行中按停止 → 輸入列**立即**復原（不等 delay）、running 卡標「已中止」、可立刻送出下一指令。
  5. reduced-motion：suggest chips 直接出現無動畫；互動卡功能正常。
  6. console 全程零 JS 例外。跑畢 pkill 自己起的進程。
  （掛單會真的改鏈上狀態——挑一顆 held token 掛掉沒關係，資料是 demo 資料；report 記下掛了哪顆。）
- [ ] **Step 8: Commit**：`git add src/screens/agent/controller.ts src/screens/agent/workspace.ts src/screens/agent/agent.css src/data/mock/agent-scenarios.json tests/agent-mock.test.ts && git commit -m "feat(agent): 互動掛單卡 + suggest chips + 停止即時回復 + 豐富工具卡渲染"`

---

### Task 5: 全站驗收 + HANDOFF 收尾

**Files:**
- Modify: `HANDOFF.md`（第 1 節加本輪段落、第 4 節下一步）
- Test: 無新檔（重跑全套）

- [ ] **Step 1: 三綠燈**：`npx tsc --noEmit` 0、`npx vitest run` 全綠（基線 24 檔 90 + 本輪新增案例）、`npm run build` 成功。
- [ ] **Step 2: CDP 全站迴歸**：9 頁 sweep + 鍵盤 0-8 + agent 開場巡檢/citation chip/導航排程不迴歸 + `#aInput` 打數字不跳頁 + console 零例外。
- [ ] **Step 3: live 態驗證分野**：dummy key 驗 friendlyError（key 無效 → 友善訊息 + detail 小字、無原始 JSON dump）；**真實 key 的完整互動掛單流程（Gemini 先呼叫 list_holdable_units → 互動卡挑選 → 真上鏈）與 SUGGEST chips 跟真回答出現，誠實記載留待使用者驗證**。
- [ ] **Step 4: HANDOFF.md**：第 1 節頂部加「Agent 操作體驗 refine」段（四項成果/契約改動/驗收誠實分野/live 待使用者），第 4 節下一步更新。
- [ ] **Step 5: Commit**：`git add HANDOFF.md && git commit -m "docs: agent 操作體驗 refine 全站驗收 + HANDOFF 收尾"`

---

## Self-Review（計畫寫完後已核對）

1. **Spec coverage**：§2 契約（Task 1）、§3 掛單挑 SU 全流程含失敗分流/快取空退化/mock parity（Task 1+2+4）、§4 cardHtml 各工具（Task 2）+ workspace 渲染（Task 4）、§5 SUGGEST 生成/緩衝/渲染/mock（Task 3+4）、§6 friendlyError/停止即時回復/市場脈絡（Task 3+4）、§8 驗收（Task 4 CDP + Task 5 全站）。
2. **Placeholder scan**：無 TBD；Task 1 Step 4 的「中間態過渡碼」是明確的兩行指定（Task 3 移除），非留白；CSS 變數名附 grep 指令判準。
3. **Type consistency**：`ConfirmResult`（T1 定義、T3/T4 消費）、`cardHtml` 鏈（T1 事件欄位 + ToolRunResult → T2 產出 → T4 渲染）、`lastHoldable` 形狀（T2 `data` = `{token_id,amount}[]` = T4 下拉消費）、`markStopped`/`settleToolCard` 三參數（T4 內自洽）、`friendlyError` 回傳 `{message,detail?}` 對應 error 事件欄位——逐一比對一致。
4. **既有行為保護**：replay 取消不執行/abort 語意有既有測試 gate；`renderConfirmCard`（update_setting 靜態卡）保留；suggest 事件對 replay 是 default 分支直接 strip yield（無需改 play）；supersede guard 解決 stop 即時回復與舊 finally 的競態。
