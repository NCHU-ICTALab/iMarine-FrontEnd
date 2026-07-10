# 數位員工 Agent Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增第 9 個 screen「數位員工」——雙態（Gemini live / 劇本 mock）agent，透過 7 個工具讀取/導航/操作各模組資料層並做系統自我檢測。

**Architecture:** 核心抽象是 `AgentEvent` 事件流：`loop.ts`（Gemini manual loop）與 `replay.ts`（劇本 replay）都是 `AsyncGenerator<AgentEvent>`，UI（`index.ts` 控制器 + `workspace.ts` 右欄）只消費事件。工具執行層（`tools.ts` + `diagnostics.ts`）live/mock 共用。spec：`docs/superpowers/specs/2026-07-10-agent-screen-design.md`（**實作前先通讀**）。

**Tech Stack:** Vite + vanilla TS、Liquid Glass Kit、`@google/genai`（僅 agent screen lazy import）、vitest、CDP 實機驗證。

## Global Constraints

- **CORE RULE（CLAUDE.md）**：禁止對原檔做順手清理/型別補強/import 整理；禁止 emoji；commit 訊息無 Claude/Anthropic 署名。
- 文案繁體中文 + 英文術語；元件一律 Liquid Glass Kit，**不手寫 `backdrop-filter`**；小型大量重複卡用 `lg-static`。
- agent 頁 CSS 全部 `#s-agent` 前綴；內容必須包 `<div class="swrap">`（settings 頁漏包的教訓）。
- 模組色紫 `#B48CFF`；mode `doc`；rail 插在 alert 後、settings 前；鍵盤 `7`=agent、`8`=settings。
- `VITE_GEMINI_API_KEY` 只放 `.env`（gitignored）；**絕不 commit key**。
- 每 task 結尾三件套自查：`npx tsc --noEmit`、`npx vitest run`、`npm run build`。
- CDP 驗證用獨立 headless Chrome（SwiftShader flags、**勿加 `--disable-gpu`**、專屬 user-data-dir、跑畢 pkill 無殘留）。

---

### Task 1: 資料契約 + runbook/劇本 JSON（TDD）

**Files:**
- Modify: `src/data/types.ts`（檔尾追加，不動既有型別）
- Create: `src/data/mock/agent-runbook.json`
- Create: `src/data/mock/agent-scenarios.json`
- Test: `tests/agent-mock.test.ts`

**Interfaces:**
- Produces: `AgentModule`、`AgentEvent`、`DiagModuleReport`、`DiagReport`、`RunbookEntry`、`ScenarioEvent`、`AgentScenario`（後續全部 task 依賴，名稱以本 task 為準）。

- [ ] **Step 1: types.ts 檔尾追加契約**

```ts
// ── Agent screen（數位員工）契約 — spec 2026-07-10 ──────────────────────────
export type AgentModule = 'carbon' | 'policy' | 'twin' | 'dispatch' | 'epidemic' | 'alert';

/* live（Gemini loop）與 mock（劇本 replay）共同的事件流介面；UI 只消費事件 */
export type AgentEvent =
  | { kind: 'plan'; steps: string[] }
  | { kind: 'step_start'; index: number; caption: string }
  | { kind: 'tool_call'; tool: string; args: Record<string, unknown>; module?: AgentModule }
  | { kind: 'tool_result'; tool: string; summaryHtml: string; module?: AgentModule; ms: number }
  | { kind: 'text_delta'; text: string }
  | { kind: 'confirm_request'; tool: string; args: Record<string, unknown>; summaryHtml: string }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

export interface DiagModuleReport {
  status: 'ok' | 'degraded' | 'down' | 'mock';
  latencyMs?: number;
  detail: string;
}
export interface DiagReport {
  modules: Record<AgentModule | 'settings', DiagModuleReport>;
  ranAt: string;
}

export interface RunbookEntry {
  id: string;
  symptom: string;       // 症狀關鍵描述（比對用）
  cause: string;
  fix: string[];         // 修復步驟（逐條）
  module: AgentModule | 'frontend' | 'agent';
}

/* 劇本事件 = AgentEvent + 播放時序；exec:true 的 tool_call 由 replay 引擎真的執行工具 */
export type ScenarioEvent = AgentEvent & { delayMs: number; exec?: boolean };
export interface AgentScenario {
  id: string;
  patterns: string[];            // 指令關鍵字（lowercase includes 比對）
  events: ScenarioEvent[];
  cancelEvents?: ScenarioEvent[]; // confirm 取消時改播的尾段
}
```

- [ ] **Step 2: 寫 runbook JSON（8 條，內容轉錄自 HANDOFF/README 操作知識）**

`src/data/mock/agent-runbook.json`：

```json
[
  { "id": "rb-carbon-down", "module": "carbon",
    "symptom": "碳權後端離線 :8000 連線失敗 health 探測不到",
    "cause": "carbon PoC 後端（FastAPI :8000）或 Hardhat 鏈（:8545）未啟動",
    "fix": ["到 ../iMarine-Carbon-Tokenization-POC 依序執行 make chain、make deploy、make api", "重新整理頁面，碳權頁 chip 轉為 LIVE"] },
  { "id": "rb-rag-down", "module": "policy",
    "symptom": "政策 rag-agent 離線 :8100 連線失敗 知識庫讀不到",
    "cause": "rag-agent 後端（:8100）未啟動",
    "fix": ["啟動 rag-agent 服務（協作者 repo）", "未啟動時 policy/settings 會自動退回示範模式，不影響 demo"] },
  { "id": "rb-mapbox", "module": "epidemic",
    "symptom": "地圖空白 mapbox token 缺少 epidemic alert 不顯示",
    "cause": "VITE_MAPBOX_TOKEN 未設定且系統設定亦無覆寫值",
    "fix": ["在系統設定「前端設定」填入 Mapbox token，或於 .env 補 VITE_MAPBOX_TOKEN", "重新整理頁面"] },
  { "id": "rb-gemini-key", "module": "agent",
    "symptom": "數位員工劇本模式 Gemini key 缺少 live 不可用",
    "cause": "VITE_GEMINI_API_KEY 未設定，本頁自動退回劇本示範",
    "fix": ["於 .env 補 VITE_GEMINI_API_KEY（僅限本機 demo，勿提交版控）", "重啟 dev server"] },
  { "id": "rb-glass", "module": "frontend",
    "symptom": "玻璃效果不對 折射消失 介面霧面",
    "cause": "Liquid Glass 折射只在 Chromium 完整支援，其他瀏覽器自動降級磨砂",
    "fix": ["demo 機請使用 Chrome 或 Edge"] },
  { "id": "rb-settings-broken", "module": "frontend",
    "symptom": "設定遺失 localStorage 損毀 設定頁異常",
    "cause": "imarine.settings.v1 內容非合法 JSON",
    "fix": ["到系統設定各分區按「重置為預設」，或清除瀏覽器該站 localStorage 後重載"] },
  { "id": "rb-carbon-500", "module": "carbon",
    "symptom": "碳權發行 掛單 購買 除役 交易失敗 500",
    "cause": "Hardhat 鏈（:8545）未起，寫鏈交易全數失敗",
    "fix": ["到 PoC repo 執行 make chain 後再 make deploy、make api"] },
  { "id": "rb-net", "module": "frontend",
    "symptom": "地圖磚載不出 網路離線 外部資源失敗",
    "cause": "Mapbox 磚與 Gemini API 需要網路連線",
    "fix": ["確認 demo 現場網路；離線時地圖頁降級、數位員工走劇本模式"] }
]
```

- [ ] **Step 3: 寫劇本 JSON（4 條）**

`src/data/mock/agent-scenarios.json`——骨架如下（**精確數字規範**：回答文字內的數字只允許引用穩定 mock 模組的固定值；寫完後逐一對照 `src/data/mock/{policy,dispatch,epidemic,alert}.json` 校正，carbon 只作質化描述）：

```json
[
  { "id": "sc-summary",
    "patterns": ["摘要", "營運", "總覽", "今日"],
    "events": [
      { "kind": "plan", "steps": ["讀取碳權與派工現況", "查詢政策知識庫今日動態", "綜合撰寫營運摘要"], "delayMs": 600 },
      { "kind": "step_start", "index": 0, "caption": "正在讀取碳權與派工現況…", "delayMs": 500 },
      { "kind": "tool_call", "tool": "get_module_data", "args": { "module": "carbon" }, "module": "carbon", "delayMs": 300, "exec": true },
      { "kind": "tool_call", "tool": "get_module_data", "args": { "module": "dispatch" }, "module": "dispatch", "delayMs": 700, "exec": true },
      { "kind": "step_start", "index": 1, "caption": "正在查詢政策知識庫…", "delayMs": 500 },
      { "kind": "tool_call", "tool": "ask_policy_rag", "args": { "question": "今日與高雄港相關的重要法規動態" }, "module": "policy", "delayMs": 400, "exec": true },
      { "kind": "step_start", "index": 2, "caption": "正在綜合撰寫摘要…", "delayMs": 800 },
      { "kind": "text_delta", "text": "今日高雄港整體狀態良好。碳權市場交易活絡{{m:carbon}}；", "delayMs": 500 },
      { "kind": "text_delta", "text": "未來 90 分鐘無停工等級風險，各作業綠燈{{m:dispatch}}；", "delayMs": 700 },
      { "kind": "text_delta", "text": "政策面請留意 IMO 淨零框架的成本影響評估{{m:policy}}。", "delayMs": 700 },
      { "kind": "done", "delayMs": 400 }
    ] },
  { "id": "sc-redsea",
    "patterns": ["紅海", "碳成本", "航線"],
    "events": [
      { "kind": "plan", "steps": ["查詢政策知識庫紅海事件", "讀取碳權即時行情", "評估成本影響"], "delayMs": 600 },
      { "kind": "step_start", "index": 0, "caption": "正在查詢政策知識庫…", "delayMs": 500 },
      { "kind": "tool_call", "tool": "ask_policy_rag", "args": { "question": "紅海航線中斷對航運碳排的影響" }, "module": "policy", "delayMs": 400, "exec": true },
      { "kind": "step_start", "index": 1, "caption": "正在讀取碳權行情…", "delayMs": 500 },
      { "kind": "tool_call", "tool": "get_module_data", "args": { "module": "carbon" }, "module": "carbon", "delayMs": 300, "exec": true },
      { "kind": "step_start", "index": 2, "caption": "正在綜合評估…", "delayMs": 800 },
      { "kind": "text_delta", "text": "紅海航線中斷使船舶繞行好望角、航程顯著拉長，燃油碳排隨之上升{{m:policy}}；", "delayMs": 600 },
      { "kind": "text_delta", "text": "對應的碳權需求端走強，建議關注近期均價走勢並評估提前佈局{{m:carbon}}。", "delayMs": 800 },
      { "kind": "done", "delayMs": 400 }
    ] },
  { "id": "sc-diag",
    "patterns": ["健檢", "檢測", "診斷", "系統", "連線"],
    "events": [
      { "kind": "plan", "steps": ["執行全系統診斷", "比對維運知識庫", "彙整修復建議"], "delayMs": 600 },
      { "kind": "step_start", "index": 0, "caption": "正在探測各模組後端連線…", "delayMs": 500 },
      { "kind": "tool_call", "tool": "run_diagnostics", "args": {}, "delayMs": 300, "exec": true },
      { "kind": "step_start", "index": 1, "caption": "正在比對維運知識庫…", "delayMs": 600 },
      { "kind": "tool_call", "tool": "search_runbook", "args": { "symptom": "後端離線 連線失敗" }, "delayMs": 300, "exec": true },
      { "kind": "step_start", "index": 2, "caption": "正在彙整診斷報告…", "delayMs": 700 },
      { "kind": "text_delta", "text": "診斷完成，結果如右側燈號牆。若碳權後端離線{{m:carbon}}，請至 PoC repo 依序執行 make chain、make deploy、make api；", "delayMs": 600 },
      { "kind": "text_delta", "text": "政策後端未啟動時{{m:policy}}系統會自動退回示範模式，不影響簡報。", "delayMs": 800 },
      { "kind": "done", "delayMs": 400 }
    ] },
  { "id": "sc-order",
    "patterns": ["掛單", "上架", "賣出", "碳權交易"],
    "events": [
      { "kind": "plan", "steps": ["讀取碳權市場現況", "確認掛單參數", "執行掛單"], "delayMs": 600 },
      { "kind": "step_start", "index": 0, "caption": "正在讀取碳權市場現況…", "delayMs": 500 },
      { "kind": "tool_call", "tool": "get_module_data", "args": { "module": "carbon" }, "module": "carbon", "delayMs": 300, "exec": true },
      { "kind": "step_start", "index": 1, "caption": "等待操作員確認掛單…", "delayMs": 600 },
      { "kind": "confirm_request", "tool": "place_carbon_order", "args": { "batch": "KHH-2026-B12", "qty": 500, "price": 14.5 },
        "summaryHtml": "掛單 <b>KHH-2026-B12</b> 批次 500 t @ $14.5/t（寫入鏈上交易，需人工確認）", "delayMs": 300 },
      { "kind": "tool_call", "tool": "place_carbon_order", "args": { "batch": "KHH-2026-B12", "qty": 500, "price": 14.5 }, "module": "carbon", "delayMs": 300, "exec": true },
      { "kind": "text_delta", "text": "掛單已送出{{m:carbon}}，可到碳權頁的市場分頁查看掛單狀態。", "delayMs": 600 },
      { "kind": "done", "delayMs": 400 }
    ],
    "cancelEvents": [
      { "kind": "text_delta", "text": "已取消掛單，未寫入任何交易。需要我改用其他參數再試一次嗎？", "delayMs": 300 },
      { "kind": "done", "delayMs": 300 }
    ] }
]
```

- [ ] **Step 4: 寫契約測試（先跑先 FAIL 確認測的是真檔）**

`tests/agent-mock.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import scenarios from '../src/data/mock/agent-scenarios.json';
import runbook from '../src/data/mock/agent-runbook.json';
import type { AgentScenario, RunbookEntry } from '../src/data/types';

const SCS = scenarios as AgentScenario[];
const RBS = runbook as RunbookEntry[];
const KINDS = ['plan','step_start','tool_call','tool_result','text_delta','confirm_request','done','error'];
const TOOLS = ['get_module_data','ask_policy_rag','run_diagnostics','search_runbook','navigate_to_screen','place_carbon_order','update_setting'];

describe('agent-scenarios 契約', () => {
  it('4 條劇本、patterns 非空、事件 kind 合法、每條以 done 結尾', () => {
    expect(SCS.length).toBe(4);
    for (const sc of SCS) {
      expect(sc.patterns.length).toBeGreaterThan(0);
      for (const ev of sc.events) expect(KINDS).toContain(ev.kind);
      expect(sc.events.at(-1)!.kind).toBe('done');
      if (sc.cancelEvents) expect(sc.cancelEvents.at(-1)!.kind).toBe('done');
    }
  });
  it('exec 的 tool_call 只用已定義工具；confirm_request 後必有同名 exec tool_call', () => {
    for (const sc of SCS) {
      sc.events.forEach((ev, i) => {
        if (ev.kind === 'tool_call' && ev.exec) expect(TOOLS).toContain(ev.tool);
        if (ev.kind === 'confirm_request') {
          const next = sc.events.slice(i + 1).find((e) => e.kind === 'tool_call');
          expect(next && next.kind === 'tool_call' && next.tool === ev.tool).toBe(true);
          expect(sc.cancelEvents?.length).toBeGreaterThan(0);
        }
      });
    }
  });
  it('text_delta 的 {{m:xxx}} 標記只引用六模組', () => {
    for (const sc of SCS) for (const ev of sc.events) {
      if (ev.kind !== 'text_delta') continue;
      for (const m of ev.text.matchAll(/\{\{m:(\w+)\}\}/g))
        expect(['carbon','policy','twin','dispatch','epidemic','alert']).toContain(m[1]);
    }
  });
});

describe('agent-runbook 契約', () => {
  it('8 條、id 唯一、fix 非空', () => {
    expect(RBS.length).toBe(8);
    expect(new Set(RBS.map((r) => r.id)).size).toBe(8);
    for (const r of RBS) expect(r.fix.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5: 跑測試確認通過**：`npx vitest run tests/agent-mock.test.ts` → 全 PASS；再 `npx tsc --noEmit` → 0 errors。
- [ ] **Step 6: Commit**：`git add src/data/types.ts src/data/mock/agent-*.json tests/agent-mock.test.ts && git commit -m "feat(agent): 資料契約 + runbook/劇本 mock JSON（TDD）"`

---

### Task 2: diagnostics.ts 確定性 probe（TDD）

**Files:**
- Create: `src/screens/agent/diagnostics.ts`
- Test: `tests/agent-diagnostics.test.ts`

**Interfaces:**
- Consumes: `ScreenCtx`（`src/screens/types.ts`）、`DiagReport`（Task 1）、`getSetting`（`src/screens/settings/storage.ts`）。
- Produces: `runDiagnostics(ctx, opts?): Promise<DiagReport>`，`opts = { fetchFn?, timeoutMs?, carbonBase?, policyBase? }`（測試注入用）。

- [ ] **Step 1: 寫失敗測試**

`tests/agent-diagnostics.test.ts`（fetch stub 三路徑：up / down / timeout）：

```ts
import { describe, expect, it } from 'vitest';
import { runDiagnostics } from '../src/screens/agent/diagnostics';

/* 極簡 ctx stub：diagnostics 只讀 data.carbon.base 與各 provider 的 source */
function ctxStub(): any {
  const mock = { source: 'mock', snapshot: async () => ({}) };
  return { data: {
    carbon: { source: 'live', base: 'http://c', snapshot: async () => ({}) },
    policy: { source: 'live', base: 'http://p', snapshot: async () => ({}) },
    twin: { source: 'live', snapshot: async () => ({}) },
    overview: mock, dispatch: mock, epidemic: mock, alert: mock,
  } };
}
const okFetch: any = async () => ({ ok: true, status: 200 });
const downFetch: any = async () => { throw new Error('refused'); };
const hangFetch: any = (_u: string, init: any) =>
  new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('abort'))));

describe('runDiagnostics', () => {
  it('後端全通 → carbon/policy ok 且有 latencyMs；mock 模組回 mock', async () => {
    const r = await runDiagnostics(ctxStub(), { fetchFn: okFetch, timeoutMs: 50 });
    expect(r.modules.carbon.status).toBe('ok');
    expect(r.modules.policy.status).toBe('ok');
    expect(r.modules.carbon.latencyMs).toBeTypeOf('number');
    expect(r.modules.dispatch.status).toBe('mock');
    expect(r.ranAt).toBeTruthy();
  });
  it('連線拒絕 → down 且 detail 帶說明', async () => {
    const r = await runDiagnostics(ctxStub(), { fetchFn: downFetch, timeoutMs: 50 });
    expect(r.modules.carbon.status).toBe('down');
    expect(r.modules.carbon.detail).toContain('離線');
  });
  it('逾時 → down（AbortController 生效，不會卡住）', async () => {
    const r = await runDiagnostics(ctxStub(), { fetchFn: hangFetch, timeoutMs: 30 });
    expect(r.modules.carbon.status).toBe('down');
  });
});
```

- [ ] **Step 2: 跑測試確認 FAIL**（模組不存在）。
- [ ] **Step 3: 實作 `diagnostics.ts`**

```ts
/* 數位員工的確定性健檢 probe — 純程式碼，不進 LLM（spec §6）。
   LLM 只拿本函式的 DiagReport 去解讀與對照 runbook。 */
import type { ScreenCtx } from '../types';
import type { AgentModule, DiagModuleReport, DiagReport } from '../../data/types';
import { getSetting } from '../settings/storage';

export interface DiagOpts {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  carbonBase?: string;
  policyBase?: string;
}

async function probe(url: string, fetchFn: typeof fetch, timeoutMs: number):
  Promise<{ up: boolean; ms: number; detail: string }> {
  const t0 = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchFn(url, { signal: ctrl.signal });
    const ms = Math.round(performance.now() - t0);
    return r.ok ? { up: true, ms, detail: `HTTP ${r.status} · ${ms}ms` }
                : { up: false, ms, detail: `HTTP ${r.status}` };
  } catch {
    return { up: false, ms: Math.round(performance.now() - t0), detail: '後端離線或逾時' };
  } finally { clearTimeout(timer); }
}

export async function runDiagnostics(ctx: ScreenCtx, opts: DiagOpts = {}): Promise<DiagReport> {
  const fetchFn = opts.fetchFn ?? fetch.bind(globalThis);
  const timeoutMs = opts.timeoutMs ?? 3000;
  const env = (import.meta as any).env ?? {};
  const carbonBase = opts.carbonBase ?? ctx.data.carbon.base;
  const policyBase = opts.policyBase ?? ((ctx.data.policy as any).base ?? 'http://127.0.0.1:8100');

  const [c, p] = await Promise.all([
    probe(carbonBase + '/health', fetchFn, timeoutMs),
    probe(policyBase + '/api/sources', fetchFn, timeoutMs),
  ]);

  const mockOf = (m: AgentModule): DiagModuleReport =>
    ctx.data[m].source === 'live'
      ? { status: 'ok', detail: '本地 live provider' }
      : { status: 'mock', detail: '示範資料（設計如此，非故障）' };

  /* settings 完整性 + mapbox token 存在性（node/jsdom 環境防禦，比照 storage.ts 慣例） */
  let settingsRep: DiagModuleReport = { status: 'ok', detail: 'localStorage 設定可讀' };
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('imarine.settings.v1') : null;
    JSON.parse(raw ?? '{}');
  } catch { settingsRep = { status: 'degraded', detail: '設定 JSON 損毀，建議重置為預設' }; }
  const hasMapbox = !!(getSetting('frontend.mapboxToken', '') || env.VITE_MAPBOX_TOKEN);

  return {
    ranAt: new Date().toISOString(),
    modules: {
      carbon: c.up ? { status: 'ok', latencyMs: c.ms, detail: c.detail }
                   : { status: 'down', latencyMs: c.ms, detail: `碳權後端${c.detail}（:8000）` },
      policy: p.up ? { status: 'ok', latencyMs: p.ms, detail: p.detail }
                   : { status: 'down', latencyMs: p.ms, detail: `rag-agent ${p.detail}（:8100），頁面自動退示範` },
      twin: mockOf('twin'),
      dispatch: mockOf('dispatch'),
      epidemic: hasMapbox ? mockOf('epidemic')
                          : { status: 'degraded', detail: 'Mapbox token 缺少，地圖無法載入' },
      alert: mockOf('alert'),
      settings: settingsRep,
    },
  };
}
```

注意：`frontend.mapboxToken` 這個 settings key 名稱**實作時先 grep `src/screens/settings/sections/frontend.ts` 確認真實 key**，以既有 schema 為準（若不同，改用真名，測試不受影響——mapbox 檢查不在測試斷言內）。

- [ ] **Step 4: 跑測試 PASS** + `npx tsc --noEmit` 0 errors。
- [ ] **Step 5: Commit**：`git commit -m "feat(agent): diagnostics 確定性健檢 probe（TDD）"`

---

### Task 3: tools.ts 七工具 + renderAgentText（TDD）

**Files:**
- Create: `src/screens/agent/tools.ts`
- Test: `tests/agent-tools.test.ts`

**Interfaces:**
- Consumes: `ScreenCtx`、`runDiagnostics`（Task 2）、runbook JSON（Task 1）、`setSetting`（storage.ts）。
- Produces:
  - `AGENT_MODULES: { id: AgentModule; name: string; color: string }[]`
  - `interface ToolRunResult { summaryHtml: string; llmText: string; module?: AgentModule }`
  - `interface AgentTool { name; description; parameters; module?; confirm?; run(args): Promise<ToolRunResult> }`
  - `createTools(ctx: ScreenCtx, deps: { scheduleNav(id: string): void }): AgentTool[]`
  - `renderAgentText(text: string): string`（`{{m:xxx}}` → 模組色 chip、escape、換行轉 br）
  - `SETTING_WHITELIST: string[]`

- [ ] **Step 1: 寫失敗測試**

`tests/agent-tools.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { AGENT_MODULES, SETTING_WHITELIST, createTools, renderAgentText } from '../src/screens/agent/tools';

describe('renderAgentText', () => {
  it('{{m:carbon}} 轉成帶模組色與 data-nav 的 chip、其餘文字 escape', () => {
    const html = renderAgentText('碳權上漲{{m:carbon}} <b>不執行</b>\n次行');
    expect(html).toContain('data-nav="carbon"');
    expect(html).toContain('--mc:#E9BC63');
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('<br>');
  });
  it('未知模組標記整段移除', () => {
    expect(renderAgentText('x{{m:nope}}y')).toBe('xy');
  });
});

describe('createTools', () => {
  const mock = { source: 'mock', snapshot: async () => ({ kpi: { published: 3 } }) };
  const ctx: any = { data: {
    carbon: { source: 'live', base: 'http://c', snapshot: async () => ({ ok: false, issued: 0, tonsCirculating: 0, listed: 0, retired: 0 }) },
    policy: { source: 'live', snapshot: async () => ({}), chat: async () => { throw new Error('down'); } },
    twin: { source: 'live', snapshot: async () => ({ berths: [], trackCount: 443 }) },
    overview: mock, dispatch: mock, epidemic: mock, alert: mock,
  } };
  const tools = createTools(ctx, { scheduleNav: () => {} });
  const by = (n: string) => tools.find((t) => t.name === n)!;

  it('七工具齊備；寫工具標 confirm', () => {
    expect(tools.map((t) => t.name).sort()).toEqual([
      'ask_policy_rag','get_module_data','navigate_to_screen',
      'place_carbon_order','run_diagnostics','search_runbook','update_setting'].sort());
    expect(by('place_carbon_order').confirm).toBe(true);
    expect(by('update_setting').confirm).toBe(true);
  });
  it('get_module_data(carbon) 後端離線 → llmText 標示離線、不把零值當真', async () => {
    const r = await by('get_module_data').run({ module: 'carbon' });
    expect(r.llmText).toContain('離線');
    expect(r.module).toBe('carbon');
  });
  it('ask_policy_rag 後端不在 → 退示範罐頭（訊息帶「示範」）', async () => {
    const r = await by('ask_policy_rag').run({ question: 'x' });
    expect(r.llmText).toContain('示範');
  });
  it('search_runbook 關鍵字命中', async () => {
    const r = await by('search_runbook').run({ symptom: '碳權後端離線' });
    expect(r.llmText).toContain('make chain');
  });
  it('update_setting 白名單外 key 拒絕', async () => {
    const r = await by('update_setting').run({ key: 'evil.key', value: 1 });
    expect(r.llmText).toContain('不在允許');
    expect(SETTING_WHITELIST.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 跑測試確認 FAIL**。
- [ ] **Step 3: 實作 `tools.ts`**

```ts
/* 七工具：declaration（餵 Gemini functionDeclarations）+ 執行函式（live/mock 共用）。
   description 寫「何時呼叫」（prescriptive trigger），spec §5。 */
import type { ScreenCtx } from '../types';
import type { AgentModule, RunbookEntry } from '../../data/types';
import runbookJson from '../../data/mock/agent-runbook.json';
import { setSetting } from '../settings/storage';
import { runDiagnostics } from './diagnostics';

export const AGENT_MODULES: { id: AgentModule; name: string; color: string }[] = [
  { id: 'carbon', name: '碳權', color: '#E9BC63' },
  { id: 'policy', name: '政策', color: '#38BDF8' },
  { id: 'twin', name: '孿生', color: '#7FB4FF' },
  { id: 'dispatch', name: '派工', color: '#F5A54A' },
  { id: 'epidemic', name: '疫情', color: '#F0648C' },
  { id: 'alert', name: '警報', color: '#FF7A59' },
];

export const SETTING_WHITELIST = [
  'policy.llmMode', 'frontend.reduceMotion', 'frontend.entrance', 'carbon.apiBase',
];

export interface ToolRunResult {
  summaryHtml: string;
  llmText: string;
  module?: AgentModule;
  data?: unknown; // 結構化附載（run_diagnostics 回 DiagReport，控制器據此更新燈號牆）
}
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // Gemini functionDeclaration parameters（JSON Schema 子集）
  module?: AgentModule;
  confirm?: boolean;
  run(args: Record<string, unknown>): Promise<ToolRunResult>;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* 回答文字 → HTML：先 escape，再把 {{m:module}} 轉成模組色 citation chip（點擊由控制器委派跳頁） */
export function renderAgentText(text: string): string {
  let html = esc(text);
  html = html.replace(/\{\{m:(\w+)\}\}/g, (_m, id: string) => {
    const mod = AGENT_MODULES.find((x) => x.id === id);
    return mod ? `<span class="mchip" data-nav="${mod.id}" style="--mc:${mod.color}"><i></i>${mod.name}</span>` : '';
  });
  return html.replace(/\n/g, '<br>');
}

/* snapshot → LLM 可讀摘要：通用 JSON 截斷（誠實、不猜欄位），卡片另給人類可讀一行 */
function jsonBrief(v: unknown, max = 1200): string {
  const s = JSON.stringify(v);
  return s.length > max ? s.slice(0, max) + '…(截斷)' : s;
}

export function createTools(ctx: ScreenCtx, deps: { scheduleNav(id: string): void }): AgentTool[] {
  return [
    {
      name: 'get_module_data', module: undefined,
      description: '讀取指定功能模組的即時資料快照。當使用者詢問任何模組的現況、數字、或要求跨模組整合摘要時呼叫。',
      parameters: { type: 'object', properties: { module: { type: 'string', enum: AGENT_MODULES.map((m) => m.id), description: '模組 id' } }, required: ['module'] },
      async run(args) {
        const m = args.module as AgentModule;
        const snap: any = await ctx.data[m].snapshot();
        const name = AGENT_MODULES.find((x) => x.id === m)!.name;
        /* carbon 特例：後端離線回 ok:false + 全零，必須標示離線而非把零值當真（spec §5） */
        if (m === 'carbon' && snap && snap.ok === false)
          return { module: m, summaryHtml: `碳權後端<b>離線</b>（:8000）`, llmText: '碳權後端目前離線（:8000 連不上），沒有可信數字，請勿引用零值。' };
        return { module: m, summaryHtml: `已讀取${name}模組快照`, llmText: `${name}模組快照 JSON：${jsonBrief(snap)}` };
      },
    },
    {
      name: 'ask_policy_rag', module: 'policy',
      description: '向政策 RAG 知識庫提問（法規、政策、航運事件分析）。當問題涉及法規依據、政策影響、國際事件時呼叫。',
      parameters: { type: 'object', properties: { question: { type: 'string', description: '要問知識庫的問題' } }, required: ['question'] },
      async run(args) {
        try {
          const r = await ctx.data.policy.chat!(String(args.question), []);
          return { module: 'policy', summaryHtml: `知識庫命中 ${r.sources.length} 條證據`, llmText: `知識庫回答：${r.answerText}` };
        } catch {
          return { module: 'policy', summaryHtml: '知識庫離線，退回示範情報', llmText: '（示範）政策後端未啟動，以下為示範情報摘要：IMO 淨零框架與紅海航線中斷為近期兩大政策焦點，建議關注碳成本傳導。' };
        }
      },
    },
    {
      name: 'run_diagnostics',
      description: '執行全系統健康檢查（各後端連線、延遲、設定完整性）。當使用者要求健檢、回報系統異常、或問「有沒有問題」時呼叫。',
      parameters: { type: 'object', properties: {} },
      async run() {
        const rep = await runDiagnostics(ctx);
        const down = Object.entries(rep.modules).filter(([, v]) => v.status === 'down' || v.status === 'degraded');
        return {
          summaryHtml: down.length ? `發現 ${down.length} 項異常` : '全系統正常',
          llmText: `診斷報告 JSON：${JSON.stringify(rep.modules)}`,
          data: rep, // 控制器攔截更新 lastDiag + 燈號牆（Task 7）
        };
      },
    },
    {
      name: 'search_runbook',
      description: '查詢維運知識庫（已知問題與修復步驟）。當診斷發現異常、或使用者問「怎麼修」時呼叫。',
      parameters: { type: 'object', properties: { symptom: { type: 'string', description: '症狀描述關鍵字' } }, required: ['symptom'] },
      async run(args) {
        const kw = String(args.symptom).toLowerCase();
        const rbs = runbookJson as RunbookEntry[];
        const hit = rbs.filter((r) => kw.split(/\s+/).some((w) => w && (r.symptom + r.cause).toLowerCase().includes(w)));
        const list = (hit.length ? hit : rbs.slice(0, 3));
        return {
          summaryHtml: `命中 ${list.length} 條維運知識`,
          llmText: list.map((r) => `【${r.symptom}】原因：${r.cause}；修復：${r.fix.join('→')}`).join('\n'),
        };
      },
    },
    {
      name: 'navigate_to_screen',
      description: '帶使用者跳轉到指定功能頁。只在使用者明確要求前往/查看某頁時呼叫；跳轉會在回答結束後執行。',
      parameters: { type: 'object', properties: { id: { type: 'string', enum: ['hero', ...AGENT_MODULES.map((m) => m.id), 'settings'], description: '目標 screen id' } }, required: ['id'] },
      async run(args) {
        deps.scheduleNav(String(args.id)); // 排程：控制器在 done 後 ~1.5s 執行（spec §5）
        return { summaryHtml: `已排程跳轉 → ${args.id}`, llmText: `已排程跳轉到 ${args.id} 頁，回答結束後自動前往。` };
      },
    },
    {
      name: 'place_carbon_order', module: 'carbon', confirm: true,
      description: '碳權掛單（寫入鏈上交易，需人工確認）。只在使用者明確要求掛單/上架碳權時呼叫。',
      parameters: { type: 'object', properties: {
        batch: { type: 'string', description: '批次代號' },
        qty: { type: 'number', description: '噸數' },
        price: { type: 'number', description: '單價（美元/噸）' },
      }, required: ['batch', 'qty', 'price'] },
      async run(args) {
        try {
          /* 端點以 PoC 後端實際路由為準：實作本 task 時先執行
             grep -n "@app\." ../iMarine-Carbon-Tokenization-POC/backend/*.py
             確認掛單路由與 body 欄位後填入下行（沿用 PoC schema，不自創）。 */
          const r = await fetch(ctx.data.carbon.base + '/list', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batch: args.batch, amount: args.qty, price: args.price }),
          });
          if (!r.ok) throw new Error(String(r.status));
          return { module: 'carbon', summaryHtml: `掛單成功：${args.batch} ${args.qty}t @ $${args.price}`, llmText: '掛單成功，已寫入鏈上。' };
        } catch {
          return { module: 'carbon', summaryHtml: '（示範）後端離線，掛單以示範模式記錄', llmText: '（示範）碳權後端未啟動，本次掛單為示範性質、未寫入鏈上。' };
        }
      },
    },
    {
      name: 'update_setting', confirm: true,
      description: '修改系統設定（僅白名單 key，需人工確認）。當使用者要求切換模型接口、動效等設定，或修復建議需要改設定時呼叫。',
      parameters: { type: 'object', properties: {
        key: { type: 'string', description: `設定 key，只允許：${SETTING_WHITELIST.join(', ')}` },
        value: { type: 'string', description: '新值（布林用 "true"/"false"）' },
      }, required: ['key', 'value'] },
      async run(args) {
        const key = String(args.key);
        if (!SETTING_WHITELIST.includes(key))
          return { summaryHtml: '設定 key 不在允許清單，已拒絕', llmText: `key「${key}」不在允許清單（${SETTING_WHITELIST.join(', ')}），未修改。` };
        const raw = String(args.value);
        const v = raw === 'true' ? true : raw === 'false' ? false : raw;
        setSetting(key, v);
        return { summaryHtml: `已更新設定 ${key} = ${raw}`, llmText: `設定 ${key} 已更新為 ${raw}，即時生效。` };
      },
    },
  ];
}
```

實作時兩個查證動作（填真值，不留假設）：(a) `SETTING_WHITELIST` 逐一 grep `src/screens/settings/sections/*.ts` 確認 key 真名（`policy.llmMode`/`frontend.reduceMotion`/`frontend.entrance`/`carbon.apiBase` 以 schema 為準）；(b) 掛單端點照註解 grep PoC 後端路由後修正 path/body。

- [ ] **Step 4: 跑測試 PASS** + 三件套自查。
- [ ] **Step 5: Commit**：`git commit -m "feat(agent): 七工具 + renderAgentText（TDD）"`

---

### Task 4: replay.ts 劇本引擎（TDD）

**Files:**
- Create: `src/screens/agent/replay.ts`
- Test: `tests/agent-replay.test.ts`

**Interfaces:**
- Consumes: `AgentScenario`/`ScenarioEvent`/`AgentEvent`（Task 1）、`AgentTool`（Task 3）。
- Produces:
  - `interface EngineIO { runTool(name: string, args: Record<string, unknown>): Promise<ToolRunResult>; waitConfirm(ev): Promise<boolean>; signal: AbortSignal; reduced: boolean }`
  - `runScenario(sc: AgentScenario, io: EngineIO): AsyncGenerator<AgentEvent>`
  - `matchScenario(input: string, scs: AgentScenario[]): AgentScenario | null`
  - `FALLBACK_EVENTS: ScenarioEvent[]`（比對不中的誠實示範說明）

- [ ] **Step 1: 寫失敗測試**

`tests/agent-replay.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { matchScenario, runScenario } from '../src/screens/agent/replay';
import type { AgentScenario } from '../src/data/types';

const sc: AgentScenario = {
  id: 't', patterns: ['健檢'],
  events: [
    { kind: 'plan', steps: ['a'], delayMs: 0 },
    { kind: 'tool_call', tool: 'run_diagnostics', args: {}, delayMs: 0, exec: true },
    { kind: 'confirm_request', tool: 'place_carbon_order', args: { qty: 1 }, summaryHtml: 'x', delayMs: 0 },
    { kind: 'tool_call', tool: 'place_carbon_order', args: { qty: 1 }, delayMs: 0, exec: true },
    { kind: 'text_delta', text: 'ok', delayMs: 0 },
    { kind: 'done', delayMs: 0 },
  ],
  cancelEvents: [{ kind: 'text_delta', text: '已取消', delayMs: 0 }, { kind: 'done', delayMs: 0 }],
};
const io = (confirm: boolean, ran: string[]): any => ({
  reduced: true, signal: new AbortController().signal,
  runTool: async (n: string) => { ran.push(n); return { summaryHtml: 's', llmText: 'l' }; },
  waitConfirm: async () => confirm,
});
async function collect(gen: AsyncGenerator<any>) { const out = []; for await (const e of gen) out.push(e); return out; }

describe('runScenario', () => {
  it('exec tool_call 真的執行工具並自動補 tool_result 事件', async () => {
    const ran: string[] = [];
    const evs = await collect(runScenario(sc, io(true, ran)));
    expect(ran).toEqual(['run_diagnostics', 'place_carbon_order']);
    expect(evs.filter((e) => e.kind === 'tool_result').length).toBe(2);
    expect(evs.at(-1)!.kind).toBe('done');
  });
  it('confirm 取消 → 改播 cancelEvents、後續事件不執行', async () => {
    const ran: string[] = [];
    const evs = await collect(runScenario(sc, io(false, ran)));
    expect(ran).toEqual(['run_diagnostics']); // 掛單未執行
    expect(evs.some((e) => e.kind === 'text_delta' && e.text === '已取消')).toBe(true);
    expect(evs.at(-1)!.kind).toBe('done');
  });
  it('abort → generator 提早結束、不再執行工具', async () => {
    const ctrl = new AbortController();
    const ran: string[] = [];
    const myIo = { ...io(true, ran), signal: ctrl.signal };
    const gen = runScenario(sc, myIo);
    await gen.next(); // plan
    ctrl.abort();
    const rest = await collect(gen);
    expect(ran).toEqual([]);
    expect(rest.length).toBe(0);
  });
});

describe('matchScenario', () => {
  it('關鍵字 includes 命中；不中回 null', () => {
    expect(matchScenario('幫我跑健檢', [sc])!.id).toBe('t');
    expect(matchScenario('毫無關聯', [sc])).toBeNull();
  });
});
```

- [ ] **Step 2: 跑測試確認 FAIL**。
- [ ] **Step 3: 實作 `replay.ts`**

```ts
/* 劇本 replay 引擎 — mock 態的 AgentEvent 產生器（spec §8）。
   與 loop.ts（live）共用 EngineIO 介面；exec:true 的 tool_call 真的執行工具（資料活的），
   回答文字預錄。reduced（prefers-reduced-motion / 設定）時跳過 delay。 */
import type { AgentEvent, AgentScenario, ScenarioEvent } from '../../data/types';
import type { ToolRunResult } from './tools';

export interface EngineIO {
  runTool(name: string, args: Record<string, unknown>): Promise<ToolRunResult>;
  waitConfirm(ev: Extract<AgentEvent, { kind: 'confirm_request' }>): Promise<boolean>;
  signal: AbortSignal;
  reduced: boolean;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((res) => {
    if (signal.aborted) return res();
    const t = setTimeout(res, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true });
  });

/* 剝掉劇本專用欄位，回純 AgentEvent（UI 不該看到 delayMs/exec） */
function strip(ev: ScenarioEvent): AgentEvent {
  const { delayMs: _d, exec: _e, ...rest } = ev as ScenarioEvent & Record<string, unknown>;
  return rest as AgentEvent;
}

async function* play(events: ScenarioEvent[], cancelEvents: ScenarioEvent[] | undefined, io: EngineIO): AsyncGenerator<AgentEvent> {
  for (const ev of events) {
    if (io.signal.aborted) return;
    if (!io.reduced && ev.delayMs) await sleep(ev.delayMs, io.signal);
    if (io.signal.aborted) return;

    if (ev.kind === 'tool_call' && ev.exec) {
      yield strip(ev);
      const t0 = performance.now();
      const r = await io.runTool(ev.tool, ev.args);
      if (io.signal.aborted) return;
      yield { kind: 'tool_result', tool: ev.tool, summaryHtml: r.summaryHtml, module: r.module ?? (ev as any).module, ms: Math.round(performance.now() - t0) };
      continue;
    }
    if (ev.kind === 'confirm_request') {
      yield strip(ev);
      const ok = await io.waitConfirm(strip(ev) as Extract<AgentEvent, { kind: 'confirm_request' }>);
      if (io.signal.aborted) return;
      if (!ok) { yield* play(cancelEvents ?? [{ kind: 'done', delayMs: 0 }], undefined, io); return; }
      continue;
    }
    yield strip(ev);
    if (ev.kind === 'done') return;
  }
}

export function runScenario(sc: AgentScenario, io: EngineIO): AsyncGenerator<AgentEvent> {
  return play(sc.events, sc.cancelEvents, io);
}

export function matchScenario(input: string, scs: AgentScenario[]): AgentScenario | null {
  const s = input.toLowerCase();
  return scs.find((sc) => sc.patterns.some((p) => s.includes(p.toLowerCase()))) ?? null;
}

/* 比對不中：誠實示範說明（沿用 policy 自由輸入慣例） */
export const FALLBACK_EVENTS: ScenarioEvent[] = [
  { kind: 'text_delta', delayMs: 300, text: '目前為劇本示範模式（未偵測到 Gemini API key），只能回應預錄指令：試試「今日營運摘要」「紅海事件對碳成本的影響」「系統健檢」「幫我掛單碳權」。' },
  { kind: 'done', delayMs: 200 },
];
```

- [ ] **Step 4: 跑測試 PASS** + 三件套自查。
- [ ] **Step 5: Commit**：`git commit -m "feat(agent): 劇本 replay 引擎（TDD）"`

---

### Task 5: loop.ts Gemini live 引擎 + parsePlan（TDD 純函式部分）

**Files:**
- Create: `src/screens/agent/loop.ts`
- Modify: `package.json`（+`@google/genai`）、`.env.example`（+`VITE_GEMINI_API_KEY=`）
- Test: `tests/agent-plan.test.ts`

**Interfaces:**
- Consumes: `AgentTool`（Task 3）、`EngineIO`（Task 4）。
- Produces:
  - `parsePlan(text: string): { steps: string[]; rest: string }`
  - `runGemini(opts: { apiKey: string; tools: AgentTool[]; history: unknown[]; userText: string; io: EngineIO }): AsyncGenerator<AgentEvent>`（`history` 為 Gemini `Content[]`，呼叫端持有、跨輪追問沿用）

- [ ] **Step 1: 安裝依賴**：`npm i @google/genai`；`.env.example` 加一行 `VITE_GEMINI_API_KEY=`。
- [ ] **Step 2: 寫 parsePlan 失敗測試**

`tests/agent-plan.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { parsePlan } from '../src/screens/agent/loop';

describe('parsePlan', () => {
  it('PLAN:: 前綴 → 拆步驟、rest 為剩餘文字', () => {
    const r = parsePlan('PLAN::讀資料｜查知識庫｜寫摘要\n開始執行');
    expect(r.steps).toEqual(['讀資料', '查知識庫', '寫摘要']);
    expect(r.rest).toBe('開始執行');
  });
  it('無前綴 → steps 空、rest 原文（UI 容忍 plan 缺席）', () => {
    const r = parsePlan('直接回答');
    expect(r.steps).toEqual([]);
    expect(r.rest).toBe('直接回答');
  });
});
```

- [ ] **Step 3: 跑測試 FAIL 後實作 `loop.ts`**

```ts
/* Gemini manual agent loop — live 態的 AgentEvent 產生器（spec §8）。
   模型每輪 generateContentStream：文字 → text_delta；functionCalls → 執行工具 →
   functionResponse 回填 → 下一輪；直到無 functionCall 純文字回合 → done。
   confirm 工具（tools[].confirm）先發 confirm_request、等 io.waitConfirm。 */
import { GoogleGenAI } from '@google/genai';
import type { AgentEvent } from '../../data/types';
import type { AgentTool } from './tools';
import type { EngineIO } from './replay';

const MODEL = 'gemini-2.5-flash';
const MAX_TURNS = 8; // 防失控 loop 上限

export const SYSTEM_PROMPT = [
  '你是 iMarine 永續智能航港生態系的「數位員工」，服務高雄港營運團隊。',
  '生態系六模組：carbon 碳權代幣化交易、policy 政策 RAG 報告、twin 數位孿生沙盤、dispatch 微氣候派工、epidemic 疫情追溯、alert 警報推播。',
  '規則：',
  '1. 回答一律繁體中文；引用某模組資料時在句尾加 {{m:模組id}} 標記（如 {{m:carbon}}）。',
  '2. 數字只能出自工具結果，絕不編造；工具回報離線就照實說離線。',
  '3. 多步驟任務的第一則回覆第一行輸出計畫：PLAN::步驟1｜步驟2｜步驟3（3-5 步，之後不再輸出 PLAN）。',
  '4. 需要系統健檢先呼叫 run_diagnostics，有異常再呼叫 search_runbook 給修復步驟。',
  '5. 回答精簡（150 字內），這是大螢幕簡報場景。',
].join('\n');

export function parsePlan(text: string): { steps: string[]; rest: string } {
  const m = text.match(/^PLAN::([^\n]+)\n?/);
  if (!m) return { steps: [], rest: text };
  return { steps: m[1].split('｜').map((s) => s.trim()).filter(Boolean), rest: text.slice(m[0].length) };
}

export async function* runGemini(opts: {
  apiKey: string; tools: AgentTool[]; history: unknown[]; userText: string; io: EngineIO;
}): AsyncGenerator<AgentEvent> {
  const { tools, io } = opts;
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });
  /* 對「本地副本」工作：abort/error 時不污染共用 history（半截 functionCall 會讓下一輪
     API 呼叫爆錯）；只在成功 done 時把完整回合（含最終回答文字）同步回 opts.history。 */
  const contents: any[] = [...(opts.history as any[])];
  contents.push({ role: 'user', parts: [{ text: opts.userText }] });
  const declarations = tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));

  let planSent = false;
  let stepIdx = 0;
  let finalText = ''; // 累積最終回答（同步回 history 用）
  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (io.signal.aborted) return;
      const stream = await ai.models.generateContentStream({
        model: MODEL, contents,
        config: { systemInstruction: SYSTEM_PROMPT, tools: [{ functionDeclarations: declarations }] },
      });

      let text = '';
      const calls: { name: string; args: Record<string, unknown> }[] = [];
      /* 首回合文字先緩衝到出現換行或累積 40 字才 flush：PLAN:: 前綴可能被 chunk 切半
         （如 "PL" + "AN::…"），startsWith 判不出來，一律以緩衝條件杜絕誤判 */
      const flushFirst = () => { planSent = true; return parsePlan(text); };
      for await (const chunk of stream) {
        if (io.signal.aborted) return;
        const t = (chunk as any).text;
        if (t) {
          text += t;
          if (!planSent) {
            if (!text.includes('\n') && text.length < 40) continue; // 續緩衝
            const { steps, rest } = flushFirst();
            if (steps.length) yield { kind: 'plan', steps };
            if (rest) { yield { kind: 'text_delta', text: rest }; finalText += rest; }
            text = '';
            continue;
          }
          yield { kind: 'text_delta', text: t };
          finalText += t;
        }
        for (const fc of (chunk as any).functionCalls ?? []) calls.push({ name: fc.name, args: fc.args ?? {} });
      }
      if (!planSent && text) { // 短回答整段在緩衝內結束：flush 一樣走 parsePlan
        const { steps, rest } = flushFirst();
        if (steps.length) yield { kind: 'plan', steps };
        if (rest) { yield { kind: 'text_delta', text: rest }; finalText += rest; }
        text = '';
      }

      if (!calls.length) {
        /* 成功收尾：把完整回合寫回共用 history（含最終回答，供多輪追問） */
        contents.push({ role: 'model', parts: [{ text: finalText }] });
        (opts.history as any[]).length = 0;
        (opts.history as any[]).push(...contents);
        yield { kind: 'done' };
        return;
      }

      /* 執行本輪全部 functionCalls，結果回填 */
      contents.push({ role: 'model', parts: calls.map((c) => ({ functionCall: { name: c.name, args: c.args } })) });
      const responses: any[] = [];
      for (const c of calls) {
        const tool = tools.find((t) => t.name === c.name);
        if (!tool) { responses.push({ functionResponse: { name: c.name, response: { error: 'unknown tool' } } }); continue; }
        yield { kind: 'step_start', index: stepIdx++, caption: `正在執行 ${tool.name}…` };
        if (tool.confirm) {
          const ev = { kind: 'confirm_request', tool: c.name, args: c.args, summaryHtml: `執行 ${tool.name}（${JSON.stringify(c.args)}）？` } as const;
          yield ev;
          const ok = await io.waitConfirm(ev as any);
          if (io.signal.aborted) return;
          if (!ok) { responses.push({ functionResponse: { name: c.name, response: { result: '使用者取消了這個動作' } } }); continue; }
        }
        yield { kind: 'tool_call', tool: c.name, args: c.args, module: tool.module };
        const t0 = performance.now();
        const r = await io.runTool(c.name, c.args);
        yield { kind: 'tool_result', tool: c.name, summaryHtml: r.summaryHtml, module: r.module ?? tool.module, ms: Math.round(performance.now() - t0) };
        responses.push({ functionResponse: { name: c.name, response: { result: r.llmText } } });
      }
      contents.push({ role: 'user', parts: responses });
    }
    yield { kind: 'error', message: '已達工具呼叫上限，任務中止。' };
  } catch (e) {
    if (!io.signal.aborted) yield { kind: 'error', message: 'Gemini 連線異常：' + String((e as Error).message ?? e) };
  }
}
```

實作時查證：`@google/genai` 的 chunk 介面（`chunk.text` / `chunk.functionCalls`）以安裝版 README/型別檔為準，如有出入以 SDK 真名修正——loop 邏輯不變。

- [ ] **Step 4: 跑測試 PASS** + 三件套自查（`npm run build` 確認 lazy chunk 正常）。
- [ ] **Step 5: Commit**：`git commit -m "feat(agent): Gemini manual loop + parsePlan（TDD）"`（**確認 `.env` 未被 add**）

---

### Task 6: screen 骨架 + shell 接入 + 開場巡檢（CDP 驗證）

**Files:**
- Create: `src/screens/agent/{index.ts, agent.html, agent.css, workspace.ts}`
- Modify: `src/shell/registry.ts`（插第 8 筆，settings 前）、`src/main.ts:78`（`n <= 7` → `n <= 8`）

**Interfaces:**
- Consumes: `screenHeader`/`srcChip`（`src/ui/components.ts`）、`runDiagnostics`（Task 2）、`AGENT_MODULES`（Task 3）、`prefersReduced`（storage.ts）。
- Produces: `workspace.ts` 匯出 `createWorkspace(el: HTMLElement): Workspace`，介面：
  ```ts
  interface Workspace {
    showDiag(rep: DiagReport, animate: boolean): void;   // 6+1 燈號牆（逐卡點燈）
    pushToolCard(ev: { tool; summaryHtml; module?; ms? }, running: boolean): void; // 結果卡堆疊
    settleToolCard(summaryHtml: string, ms: number): void; // 當前卡由 running 轉完成
    showConfirm(summaryHtml: string): void;              // 右欄同步顯示確認明細
    caption(text: string): void;                          // 底部旁白字幕
    footprint(modules: AgentModule[]): void;              // done 後足跡 chips
    reset(): void;
  }
  ```

- [ ] **Step 1: registry 插入 agent 定義（alert 之後、settings 之前）**

```ts
  {
    id: 'agent',
    title: '數位員工',
    short: '數位員工',
    color: '#B48CFF',
    mode: 'doc',
    icon: '<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 7V4M8 12h.01M16 12h.01M9 16h6"/>',
    load: () => import('../screens/agent/index'),
  },
```

- [ ] **Step 2: main.ts 鍵盤上限 7 → 8**（`if (n >= 1 && n <= 8) router.go(SCREENS[n].id);`）；`grep -rn "鍵盤.*7\|按 7\|key 7" src/ README.md` 檢查是否有寫死「7=設定」的文案，有則同步改 8。
- [ ] **Step 3: agent.html 骨架**

```html
<div class="swrap">
  <!--HEADER-->
  <div class="agrid">
    <section class="achat lg lg-static" data-lg>
      <div class="athread" id="aThread"></div>
      <div class="achips" id="aChips"></div>
      <form class="ainput" id="aForm">
        <input id="aInput" type="text" placeholder="詢問數位員工，或輸入「系統健檢」…" autocomplete="off">
        <button id="aSend" type="submit">送出</button>
        <button id="aStop" type="button" class="hidden">■ 停止</button>
      </form>
    </section>
    <section class="awork lg lg-static" data-lg>
      <div class="awtitle" id="aWtitle">數位員工工作區</div>
      <div class="awbody" id="aWbody"></div>
      <div class="acaption" id="aCaption">系統就緒</div>
    </section>
  </div>
</div>
```

- [ ] **Step 4: agent.css**（全部 `#s-agent` 前綴；核心規則——`.agrid{display:grid;grid-template-columns:38fr 62fr;gap:14px;min-height:0}`、`.athread` 卷軸區、`.bub-u/.bub-a` 泡泡、`.tstep` 時間軸列（spinner/勾/待辦三態）、`.mchip`（模組色 citation chip，`--mc` 驅動圓點）、`.awbody .wcard`（結果卡，`--mc` 邊光、`.current` 光暈、`.settled` 淡化）、`.lampwall`（3×2+1 燈號牆）、`.acaption` 字幕列、`.confirmcard` 雙鈕、進場 stagger 用既有 `.anim` + `--d` 慣例、`@media (prefers-reduced-motion: reduce)` 與 `body[data-motion="reduce"]` 關動畫）。視覺基準：brainstorm mockup `.superpowers/brainstorm/7098-1783649515/content/layout-v2.html` 的三態畫面。
- [ ] **Step 5: workspace.ts 實作**（純 DOM 渲染，無業務邏輯）：`showDiag` 以 `AGENT_MODULES` + settings 渲染 7 張燈號卡（status→色：ok 綠 `#35E0A6`/mock 灰/degraded 琥珀/down 玫紅），`animate` 時逐卡 `.lit` stagger（80ms 間隔，reduced 直接終態）；`pushToolCard` 推卡、最多同屏 4 張（更舊 `.folded` 收成一行）；`caption` 換字幕文字。
- [ ] **Step 6: index.ts（本 task 只做開場，chat 控制器 Task 7）**

```ts
import type { Screen, ScreenCtx } from '../types';
import type { DiagReport } from '../../data/types';
import { screenHeader } from '../../ui/components';
import { prefersReduced } from '../settings/storage';
import { runDiagnostics } from './diagnostics';
import { createWorkspace, type Workspace } from './workspace';
import html from './agent.html?raw';
import './agent.css';

let ws: Workspace;
let ctxRef: ScreenCtx;
let booted = false;           // 開場巡檢只跑一次（spec §7.1）
let lastDiag: DiagReport | null = null;

const hasKey = () => !!((import.meta as any).env?.VITE_GEMINI_API_KEY);

const screen: Screen = {
  mount(el, ctx) {
    ctxRef = ctx;
    el.innerHTML = html.replace('<!--HEADER-->', screenHeader({
      eyebrow: 'AI AGENT · 數位員工', color: '#B48CFF', title: '數位員工',
      badges: ['Tool-calling Agent', 'Self-diagnostics'],
      source: hasKey() ? 'live' : 'mock',
      sourceLabel: hasKey() ? 'GEMINI LIVE' : '劇本 MOCK',
    }));
    ws = createWorkspace(el.querySelector('.awork') as HTMLElement);
    // Task 7 在此接 chat 控制器
  },
  async show() {
    if (booted) { if (lastDiag) ws.showDiag(lastDiag, false); return; } // 重入顯示上次終態
    booted = true;
    lastDiag = await runDiagnostics(ctxRef);
    ws.showDiag(lastDiag, !prefersReduced());
    greet(lastDiag); // 招呼泡泡 + 3 條建議指令 chips（模板組字：問候+健檢結論+LIVE/MOCK 統計）
  },
  hide() { /* Task 7 接 abort */ },
};
export default screen;
```

`greet()`：計算 `ok/mock/down` 數量組一句話（如「6 個模組全部在線（2 live / 4 示範）」，有 down 則列名並建議跑健檢），插入 `.bub-a` 泡泡；chips 三條 = 「整合今日港區營運摘要」「紅海事件對碳成本的影響？」「跑一次完整系統健檢」，點擊填入輸入框並送出（Task 7 接線前先只填入）。

- [ ] **Step 7: 三件套自查** + **CDP 驗證**：起 `npm run dev`；`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --remote-debugging-port=9460 --use-gl=angle --use-angle=swiftshader --run-all-compositor-stages-before-draw --user-data-dir=/tmp/agent-cdp about:blank`；CDP 腳本斷言：(1) rail 有第 9 顆鈕、點擊 → `#s-agent.screen.active`；(2) 鍵盤 `7` → agent、`8` → settings、`1`-`6` 迴歸不變；(3) 開場燈號牆 7 卡渲染、招呼泡泡與 3 chips 存在；(4) 切走再切回不重播（泡泡數不變）；(5) console 零 JS 例外。跑畢 pkill。
- [ ] **Step 8: Commit**：`git commit -m "feat(agent): screen 骨架 + shell 接入 + 開場巡檢"`

---

### Task 7: chat 控制器 + 事件渲染（劇本全鏈路，CDP 驗證）

**Files:**
- Modify: `src/screens/agent/index.ts`（接控制器）、`src/screens/agent/workspace.ts`（如需補方法）
- Create: 無新檔（控制器寫在 index.ts；超過 ~250 行時抽 `controller.ts`）

**Interfaces:**
- Consumes: `runScenario`/`matchScenario`/`FALLBACK_EVENTS`/`EngineIO`（Task 4）、`runGemini`（Task 5）、`createTools`/`renderAgentText`（Task 3）、`Workspace`（Task 6）。
- Produces: 完整可互動的 agent 頁（mock 態）。

- [ ] **Step 1: 控制器狀態機**

```ts
/* 單一任務生命週期：idle → running →（waiting_confirm）→ running → idle
   running 中不可重入（送出鈕禁用、輸入列變停止鈕）；abort 統一走 AbortController。 */
let running = false;
let ctrl: AbortController | null = null;
let confirmResolve: ((ok: boolean) => void) | null = null;
let pendingNav: string | null = null;
let navTimer: ReturnType<typeof setTimeout> | null = null; // done 後 1.5s 的跳轉排程
const history: unknown[] = []; // Gemini Content[]（live 多輪）

async function submit(text: string): Promise<void> {
  if (running || !text.trim()) return;
  running = true; ctrl = new AbortController();
  setInputMode('running'); // 送出鈕→停止鈕
  appendUserBubble(text);
  const bubble = appendAgentBubble(); // 本次任務的 agent 泡泡（計畫時間軸 + 文字都進這裡）

  const io: EngineIO = {
    reduced: prefersReduced(),
    signal: ctrl.signal,
    runTool: async (n, a) => {
      const r = await toolByName(n).run(a);
      if (n === 'run_diagnostics' && r.data) { // 攔截診斷附載：更新開場燈號牆的資料源
        lastDiag = r.data as DiagReport;
        ws.showDiag(lastDiag, !prefersReduced());
      }
      return r;
    },
    waitConfirm: (ev) => new Promise<boolean>((res) => {
      confirmResolve = res;
      renderConfirmCard(bubble, ev, (ok) => { confirmResolve = null; res(ok); });
      ws.showConfirm(ev.summaryHtml);
      ws.caption('等待操作員確認…');
    }),
  };
  const gen = hasKey()
    ? runGemini({ apiKey: env.VITE_GEMINI_API_KEY, tools, history, userText: text, io })
    : runScenario(matchScenario(text, scenarios) ?? { id: 'fb', patterns: [], events: FALLBACK_EVENTS }, io);

  const touched: AgentModule[] = [];
  try {
    for await (const ev of gen) consume(ev, bubble, touched);
  } finally {
    running = false; setInputMode('idle');
    ws.footprint(touched);
    if (pendingNav && !ctrl.signal.aborted) {
      const target = pendingNav; pendingNav = null;
      navTimer = setTimeout(() => { location.hash = '#/' + target; }, 1500); // hash 路由（router.ts:110 hashchange 監聽，已核實）
    }
  }
}
```

- [ ] **Step 2: 導航接線**（已核實）：`router.ts:110` 有 `hashchange` 監聽、hash 格式為 **`#/<id>`**（`parseHash` 只認 `#/` 前綴）——控制器與 citation chip 一律用 `location.hash = '#/' + id` 跳頁，不需動 main.ts。`createTools(ctx, { scheduleNav: (id) => { pendingNav = id; } })`。
- [ ] **Step 3: `consume(ev)` 事件渲染對照表**

| 事件 | chat 左欄 | 工作區右欄 |
|---|---|---|
| `plan` | 泡泡內插時間軸骨架（`.tstep.pend` × N） | — |
| `step_start` | 第 index 步轉 `.run`（spinner）、前一步轉 `.ok` 收合 | `caption(ev.caption)` |
| `tool_call` | 當前步驟附工具 chip | `pushToolCard(ev, true)`、`caption('正在呼叫 ' + tool)`、記 `touched` |
| `tool_result` | 步驟 chip 標耗時 | `settleToolCard(summaryHtml, ms)`；tool 為 `run_diagnostics` 時改 `showDiag(lastDiag, true)` |
| `text_delta` | `renderAgentText` 增量 append 進泡泡文字區 | — |
| `confirm_request` | 泡泡下插確認卡（確認執行/取消雙鈕、點後禁用） | `showConfirm` |
| `done` | 最後步驟轉 `.ok`；游標移除 | `caption('任務完成')` |
| `error` | 泡泡內玫紅錯誤列 | `caption('發生錯誤')` |

- [ ] **Step 4: 中斷**：停止鈕 → `ctrl.abort()`；若 `confirmResolve` 掛著先 `confirmResolve(false)` 再 abort；generator 提早 return 走 finally 收尾；泡泡補一句「已停止，前面步驟的結果保留。」。`hide()` → 同 abort + `pendingNav = null` + `if (navTimer) clearTimeout(navTimer)`（spec §11：排程等待中手動切頁/中斷要取消跳轉，不疊加）。
- [ ] **Step 5: citation chip 委派**：`athread` 上事件委派 `click` `[data-nav]` → `location.hash = '#/' + id` 跳頁；`mouseenter` 浮 tooltip（該模組最近一張工具卡的 `summaryHtml`，無則模組名）。
- [ ] **Step 6: 建議指令 chips 接線**：點擊 → 填輸入框 + `submit()`，chip 用掉移除。
- [ ] **Step 7: 三件套自查** + **CDP 驗證（mock 態，不設 key）**：四劇本逐條——(1) sc-summary：plan 3 步骨架→逐步勾、右欄 3 張工具卡、旁白至少換 3 次、答案含 3 顆 mchip；(2) mchip 點擊 → 跳對應頁再返回；(3) sc-diag：燈號牆重渲染（斷 :8000 情境下 carbon 卡玫紅 + 回答含 make chain）；(4) sc-order：確認卡出現、「取消」→ 播 cancelEvents、「確認」→ 示範掛單回覆；(5) 執行中按停止 → 泡泡收尾語、輸入列復原；(6) 亂打指令 → FALLBACK 說明；(7) 輸入框打 `0`-`8` 不跳頁；(8) reduced-motion：事件直達終態、無 spinner；(9) console 零 JS 例外。
- [ ] **Step 8: Commit**：`git commit -m "feat(agent): chat 控制器 + 事件渲染全鏈路（mock 劇本可互動）"`

---

### Task 8: live 態接線驗證 + 全站驗收 + 文件收尾

**Files:**
- Modify: `HANDOFF.md`（第 1 節加本輪段落 + 第 4 節下一步）、`README.md`（agent 頁段落 + Gemini key 前置與紅線）
- Test: 無新檔（重跑全套）

**Interfaces:**
- Consumes: 前七個 task 的全部產出。

- [ ] **Step 1: live 態驗證（有 key）**：`.env` 設 `VITE_GEMINI_API_KEY`（**勿 commit**）→ 真 Gemini 跑「整合今日港區營運摘要」與「系統健檢」各一輪：plan 事件出現（或容忍缺席）、工具真的被呼叫、答案帶 `{{m:}}` chips、footer 無誤；「幫我掛單」→ 確認卡 gating 生效。carbon 後端在線時確認掛單真打 API。**拔掉 key 重載 → 自動退 mock、chip 顯「劇本 MOCK」。**
- [ ] **Step 2: key 紅線稽核**：`git status` 確認 `.env` 未追蹤；`grep -r "AIza" dist/ src/` 無 key 字面值（build 後 bundle 也查）；README 寫明「Gemini key 僅限本機 demo，勿提交、勿部署公開網址」。
- [ ] **Step 3: 三綠燈**：`npx tsc --noEmit` 0 errors、`npx vitest run` 全綠（新增 5 檔：agent-mock/agent-diagnostics/agent-tools/agent-replay/agent-plan）、`npm run build` 成功且 `@google/genai` 只進 agent 的 lazy chunk（`ls dist/assets` 佐證主 chunk 未增胖）。
- [ ] **Step 4: CDP 全站迴歸**：9 頁 sweep（hero→carbon→policy→twin→dispatch→epidemic→alert→agent→settings）逐頁 `.screen.active` + 版面非空；鍵盤 `0`-`8` 全配置；twin WebGL context alive；carbon/policy 既有互動抽查不迴歸；`prefers-reduced-motion` 下 agent 頁完整渲染非空白；console 全程零 JS 例外。
- [ ] **Step 5: README 更新**：功能表加「數位員工」列；「畫面展示」加 agent 頁截圖（SwiftShader 3200×2000，存 `docs/screens/agent.png`）；demo 前置清單加 Gemini key（可選）段。
- [ ] **Step 6: HANDOFF.md 更新**：第 1 節頂部加本輪段落（定位/成果檔案/驗收誠實分野/live-mock 雙態註記），第 4 節「下一步」改寫（demo 前置加 Gemini key 說明）。
- [ ] **Step 7: Commit**：`git commit -m "docs: agent screen 全站驗收 + README/HANDOFF 收尾"`

---

## Self-Review（計畫寫完後已核對）

1. **Spec coverage**：§4 AgentEvent（Task 1）、§5 七工具含 navigate 排程/carbon 零值/白名單（Task 3+7）、§6 診斷+runbook（Task 1+2）、§7 UX1-7（Task 6 開場=UX1；Task 7 plan 時間軸=UX2、旁白=UX3、工作區跟隨+足跡=UX4、確認卡=UX5、mchip=UX6、中斷=UX7）、§8 雙態（Task 4+5）+ cancelEvents + 數字一致性規範（Task 1 Step 3）、§9 檔案結構、§10 驗收（Task 6/7 CDP + Task 8 全站）、§11 key 紅線（Task 8 Step 2）。
2. **Placeholder scan**：無 TBD；三處「實作時查證」（mapbox key 名、PoC 掛單路由、genai chunk 介面）皆附具體查證指令與判準，屬明確動作非留白。
3. **Type consistency**：`EngineIO`（Task 4 定義、Task 5/7 消費）、`ToolRunResult`/`AgentTool`（Task 3 定義、4/5/7 消費）、`Workspace` 方法名（Task 6 定義、Task 7 消費）已逐一比對一致。
4. **Self-review 修正紀錄（對照程式碼實查後）**：(a) hash 路由格式核實為 `#/<id>`（`router.ts:110` hashchange 監聽存在），Task 7 導航/citation 全數改用並移除備援方案；(b) loop.ts 改對 history 本地副本工作、成功 done 才把完整回合（含最終回答文字）同步回共用 history——原版錯誤時會留半截 functionCall 污染下一輪、且最終回答從未寫回（多輪追問斷 context）；(c) PLAN:: 前綴 chunk 切半誤判——改緩衝至換行或 40 字，流結束的短回答同樣走 parsePlan；(d) `ToolRunResult` 加 `data?` 附載，控制器攔截 `run_diagnostics` 更新燈號牆（原設計拿不到 DiagReport）；(e) 補 `navTimer` 宣告 + `hide()` 清排程；(f) diagnostics 的 localStorage 加 `typeof` 防禦（vitest 為 jsdom 環境已核實，防禦為求與 storage.ts 慣例一致）。
