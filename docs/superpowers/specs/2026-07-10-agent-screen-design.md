# 數位員工 Agent Screen — 設計文件

> 2026-07-10 brainstorming 定案。第 9 個 screen：「數位員工」AI Agent 頁——使用者以自然語言下指令，
> Agent 透過 tool-calling 讀取/導航/操作其他模組的資料層，把生態系串連起來；並能跑系統自我檢測，
> 依 runbook 給修復建議。競賽簡報的收官頁。

## 1. 決策紀錄表

| 決策 | 定案 | 理由 / 備註 |
|---|---|---|
| 真實程度 | **雙態 provider**：live（真 LLM agent loop）+ mock（劇本式 replay），同一 `AgentEvent` 介面，UI 共用 | 符合全站 live/mock fallback 慣例；demo 雙保險 |
| live LLM | **Gemini API 瀏覽器直呼**（`@google/genai`，`VITE_GEMINI_API_KEY` 於 `.env`，gitignored） | 使用者指定 Gemini；零新服務；key 絕不 commit/部署 |
| 模型 | `gemini-2.5-flash` | 快、免費額度夠、function calling 穩定 |
| Agent 規模 | **單 agent + 7 工具**，手寫 manual loop（`AsyncGenerator<AgentEvent>`） | Anthropic/Cognition 調研共識：此規模 multi-agent 是 overkill |
| 操作範圍 | 讀取 + 導航 + 兩個寫動作（碳權掛單、改設定），寫動作必經確認卡 | human-in-the-loop 本身是 demo 亮點 |
| 版面 | **方向 B**：左 chat ~38% / 右工作區 ~62%（Manus/Devin 式） | 視覺 companion 三方向比選定案 |
| UX 強化 | **1-7 全做**：開場即巡檢 / plan-then-act / 常駐旁白 / 工作區跟隨+足跡回看 / 確認卡 / 模組色 citation chips / 隨時中斷；**8（足跡收據行）不做** | 視覺 companion 複選定案 |
| 自我檢測分工 | **確定性 probe（程式碼）+ LLM 解讀 + 靜態 runbook JSON** | HolmesGPT/K8sGPT 先例：不讓 LLM 發明 ping 邏輯；runbook 比 model 重要 |
| rail 位置 | alert 之後、settings 之前（第 8 個 rail 項） | 收官敘事頁排功能頁之後 |
| 模組色 | 紫 `#B48CFF` | 與現有六色不撞，語意「AI」 |
| mode | `doc`（罩幕壓暗） | 文件型頁，同 carbon/policy |
| 鍵盤 | **agent 接手 `7`，settings 改 `8`** | demo 常用頁在前；settings 屬輔助頁排最後 |
| 劇本匹配 | 關鍵字比對，不中回誠實示範說明 | 沿用 policy 自由輸入慣例 |

## 2. 定位與敘事

- 前面六頁各自展示模組能力，本頁展示「**一個數位員工把生態系串起來**」：跨模組整合問答、
  代辦操作（掛單/改設定）、系統自我檢測與修復建議。
- 頁面標頭 eyebrow：`AI AGENT · 數位員工`；標題列帶資料源 chip（`GEMINI LIVE` / `劇本 MOCK`）。
- 使用場景：16:9 大螢幕、評審 5 秒內要看懂 agent 正在做什麼（旁白字幕 + 模組色貫穿）。

## 3. 版面

```
┌ rail ┬──────────────────────────────────────────────┐
│      │ eyebrow：AI AGENT · 數位員工                   │
│      │ 標題列：數位員工　　　　　　　　[GEMINI LIVE]   │
│      ├────────────────┬─────────────────────────────┤
│      │ 左 chat ~38%    │ 右工作區 ~62%                │
│      │  訊息流         │  stt 小標（正在操作：XX）      │
│      │  （計畫時間軸    │  工具結果卡堆疊 / 健檢燈號牆   │
│      │   內嵌泡泡）     │  （當前卡光暈、舊卡淡化摺疊）   │
│      │  建議指令 chips  │                              │
│      │  輸入列/停止鈕   │  底部：常駐旁白字幕列          │
└──────┴────────────────┴─────────────────────────────┘
```

- `.swrap` 版心（**必須**——settings 頁漏包的教訓見 HANDOFF §5）；CSS 全部 `#s-agent` 前綴。
- 元件用 Liquid Glass Kit；大量重複的小卡（工具結果卡、燈號卡）用 `lg-static`。

## 4. 核心抽象：AgentEvent 事件流

live 與 mock 都是 `AsyncGenerator<AgentEvent>`，UI 只消費事件，不知道背後是 Gemini 還是劇本。

```ts
type AgentEvent =
  | { kind: 'plan'; steps: string[] }                      // 執行計畫（3-5 步骨架）
  | { kind: 'step_start'; index: number; caption: string } // 某步開跑 + 旁白句
  | { kind: 'tool_call'; tool: string; args: unknown; module?: ModuleId }
  | { kind: 'tool_result'; tool: string; summaryHtml: string; module?: ModuleId; ms: number }
  | { kind: 'text_delta'; text: string }                   // 回答文字增量
  | { kind: 'confirm_request'; tool: string; args: unknown; summaryHtml: string }
  | { kind: 'done' }
  | { kind: 'error'; message: string };
```

- `confirm_request` 暫停引擎：UI 出確認卡，使用者按「確認執行」→ 引擎收 resume(true) 執行工具續 loop；
  「取消」→ resume(false)，agent 收到「使用者取消」的 tool response 並收尾。
- 中斷（停止鈕）：`AbortSignal` 進引擎；已完成步驟的結果保留，agent 補一句尾語（mock 直接播尾語事件）。
- 答案文字中的模組引用以 `{{m:carbon}}` 佔位，渲染層轉成模組色 citation chip（沿用 policy `{{c:}}` 手法）。

## 5. 工具清單（7 個，live/mock 共用同一組執行函式）

| 工具 | 類型 | 行為 | 後端不在時 |
|---|---|---|---|
| `get_module_data(module)` | 讀 | 讀該模組 provider `snapshot()`，回摘要關鍵數字；`module` 為 enum 六模組 | provider 本身有 mock 態，永遠有資料 |
| `ask_policy_rag(question)` | 讀 | 打 rag-agent `POST /api/chat`，回答案 + 證據來源 | 退 mock 情報聯集罐頭（沿用 policy 頁 fallback） |
| `run_diagnostics()` | 讀 | 確定性 probe（見 §6），回 `DiagReport` | probe 本身就是在測「不在」，永遠可跑 |
| `search_runbook(symptom)` | 讀 | 查靜態 runbook JSON，回命中條目 | 靜態檔，永遠可查 |
| `navigate_to_screen(id)` | 導航 | rail 跳轉到指定頁（延遲 ~1.5s 讓使用者看到 agent 說要去哪） | — |
| `place_carbon_order(batch, qty, price)` | **寫** | 確認卡 → 打 carbon PoC 掛單 API | 退示範回覆（訊息帶「示範」） |
| `update_setting(key, value)` | **寫** | 確認卡 → 寫 settings localStorage（`storage.ts` 既有機制），限白名單 key | 本機操作，永遠可做 |

- 寫工具 gating 在引擎層：收到這兩個 function call 不執行，先發 `confirm_request`。
- 工具 declaration 的 description 寫明「何時呼叫」（調研結論：prescriptive trigger conditions）。
- system prompt：角色（iMarine 港口數位員工）、六模組一句話簡介、工具使用準則、回答用繁中 +
  `{{m:module}}` 引用標記、不編造數字（一律出自工具結果）。

## 6. 自我檢測與 runbook

**probe（`diagnostics.ts`，純程式碼、不進 LLM）**，並行執行、各 3s timeout：

| 檢項 | 方法 |
|---|---|
| carbon 後端 | `GET :8000/health`，量延遲 ms |
| rag-agent | `GET :8100/api/sources`，量延遲 ms |
| mapbox token | 檢查 settings/`.env` 是否有值 |
| settings 完整性 | localStorage JSON 可解析、schema key 齊 |
| 各 provider 態 | 六模組 provider 的 `source`（live/mock） |

```ts
interface DiagReport {
  modules: Record<ModuleId | 'settings', {
    status: 'ok' | 'degraded' | 'down' | 'mock';
    latencyMs?: number;
    detail: string;
  }>;
  ranAt: string;
}
```

**runbook（`src/data/mock/agent-runbook.json`）**：條目 `{ id, symptom, cause, fix: string[], module }`，
~8 條，內容自 HANDOFF/README 既有操作知識轉錄（示例）：
- carbon :8000 down → 到 PoC repo 依序 `make chain` + `make deploy` + `make api`
- rag-agent :8100 down → policy/settings 自動退 mock；起 rag-agent 即恢復 live
- mapbox token 缺 → epidemic/alert 地圖空白；settings 或 `.env` 補 `VITE_MAPBOX_TOKEN`
- Gemini key 缺 → 本頁退劇本 mock 態
- 玻璃效果不對 → demo 機用 Chrome/Edge（Chromium 才有折射）

**診斷→修復閉環**：異常時 agent 呼叫 `search_runbook` 給修復步驟；若修復是 `update_setting`
能做的，agent 直接提議並出確認卡。

## 7. 互動規格（UX 1-7）

1. **開場即巡檢**：`show()` 時自動跑靜默 `run_diagnostics`（不進 LLM、不產生對話記錄）——右欄
   6 模組卡 stagger 逐一點燈，chat 出 agent 招呼泡泡（模板組字：問候 + 健檢結論一句 + LIVE/MOCK 統計）
   + 3 條建議指令 chips（用掉即消失）。每次切入頁面僅首次自動跑（session 內重入不重跑，避免洗版）。
2. **Plan-then-act**：任務開始先收 `plan` 事件，在 agent 泡泡內列 3-5 步骨架（○ 待執行）；
   `step_start` → spinner；該步的工具跑完 → 綠勾 + 耗時；完成步驟收合成一行。
3. **常駐旁白字幕**：右欄底部字幕列，`step_start`/`tool_call`/`tool_result` 都更新一句現在式白話
   （「正在閱讀政策知識庫的 7 條證據…」）；idle 時顯示系統狀態一句。
4. **工作區跟隨 + 足跡回看**：每個 `tool_call` 推入一張結果卡（模組色邊光），當前卡帶微光暈、
   完成卡淡化下沉；同屏最多 3-4 張，更舊摺疊成一行。任務 `done` 後頂部出模組足跡 chips，
   點擊回看該步驟結果卡。健檢工具的結果卡特化為 6 模組燈號牆（3×2）。
5. **確認卡**：`confirm_request` → chat 內出參數卡（確認執行 / 取消雙鈕）+ 右欄同步顯示明細卡
   + 旁白改「等待操作員確認…」。確認前引擎暫停；生成/確認中不可重入（沿用 policy 互斥慣例）。
6. **模組色 citation chips**：答案中 `{{m:module}}` → 「● 模組名」chip；hover 浮出該模組本次
   工具結果摘要 tooltip；點擊 rail 跳轉該頁。
7. **隨時中斷**：執行中輸入列變「■ 停止」；點下 → abort 引擎 → 已完成步驟保留，agent 尾語一句。

**生命週期與降級**：
- `hide()`：abort 進行中引擎、清 timers（比照各頁 `cancelTimers()` 慣例）；切回不恢復未完任務。
- 鍵盤：輸入框內打 `0`-`8` 不跳頁（既有 bail-out 涵蓋，驗收確認）。
- `prefers-reduced-motion`：跳過 stagger/spinner/字幕打字感，直接顯示終態；劇本 replay 直接跳事件終態。
- console 零 JS 例外（全站驗收既有標準）。

## 8. 雙態 provider 細節

**live（`loop.ts`）**：
- `@google/genai`，`VITE_GEMINI_API_KEY` 存在且非空 → live 態。
- manual loop：`generateContentStream`（messages + tools declarations）→ 流出 `text_delta`；
  收到 functionCall → 發 `tool_call` 事件 → 執行本地工具 → 發 `tool_result` → functionResponse
  回填 → 下一輪；直到無 functionCall 的純文字回合 → `done`。
- `plan` 事件來源：system prompt 要求第一回合先輸出 JSON 計畫（或以首個文字回合解析）；
  解析失敗時退化為無計畫骨架、僅逐工具顯示（UI 容忍 plan 缺席）。
- 對話歷史保留在頁面 session 內（多輪追問可用）；切頁不清、重載清。

**mock（`replay.ts`）**：
- key 缺 → mock 態，資料源 chip 顯「劇本 MOCK」。
- `agent-scenarios.json`：~4 條劇本（今日營運摘要 / 紅海事件碳成本 / 完整系統健檢 / 碳權掛單），
  每條 = `{ id, patterns: string[], events: ScenarioEvent[] }`；`ScenarioEvent` 為 AgentEvent 加
  `delayMs`；`tool_call` 事件標 `exec: true` 時 replay 引擎**真的執行**對應工具、以真實結果渲染
  結果卡（資料活的），回答文字則預錄。
- 指令關鍵字比對不中 → 誠實示範說明泡泡（說明這是劇本示範態 + 列可用指令）。

## 9. 檔案結構與資料契約

```
src/screens/agent/
  index.ts        Screen 生命週期 + chat 控制器（消費 AgentEvent、渲染調度、確認卡/中斷）
  agent.html      骨架（.swrap 版心）
  agent.css       樣式（#s-agent 前綴）
  loop.ts         Gemini manual agent loop → AsyncGenerator<AgentEvent>
  replay.ts       劇本 replay 引擎 → AsyncGenerator<AgentEvent>
  tools.ts        7 工具：declaration schema + 執行函式（live/mock 共用）
  diagnostics.ts  確定性 probe → DiagReport
  workspace.ts    右欄渲染（結果卡堆疊/燈號牆/旁白字幕/足跡）
src/data/mock/
  agent-scenarios.json
  agent-runbook.json
src/data/types.ts   + AgentEvent / DiagReport / AgentScenario / RunbookEntry
src/shell/registry.ts  + 第 9 筆 ScreenDef（agent，插在 alert 後）
src/main.ts            鍵盤：7 → agent、8 → settings
package.json           + @google/genai
.env.example           + VITE_GEMINI_API_KEY=
```

- 接線改動僅 registry + main.ts 鍵盤兩處；不動任何既有 screen/provider 邏輯。
- settings 頁的鍵盤提示文案若寫死 `7`，隨鍵盤改 `8` 一併更新（實作時 grep 確認）。

## 10. 驗收標準

1. **三綠燈**：`tsc --noEmit` 0 errors、`vitest run` 全綠、`npm run build` 成功。
2. **vitest（純邏輯 TDD）**：AgentEvent 引擎語意（confirm gating 暫停/續跑/取消、abort 中斷、
   plan 缺席容忍）、劇本 JSON 契約（patterns 非空、events 合法、exec 工具存在）、runbook 契約、
   `diagnostics.ts`（fetch mock：up/down/timeout 三路徑）、`{{m:}}` 轉 chip 純函式。
3. **CDP 實機**（獨立 headless Chrome + SwiftShader、勿加 `--disable-gpu`）：
   - 進頁開場：6 卡點燈、招呼泡泡、建議 chips；rail 第 8 項 active、鍵盤 `7`/`8` 新配置全站迴歸。
   - mock 態四劇本逐條播放：計畫打勾、右欄跟隨、旁白更新、citation chip hover/click 跳轉、
     掛單確認卡（確認/取消兩路徑）、中斷鈕。
   - 健檢劇本：燈號牆 + 修復建議（人為斷 :8000 情境下 runbook 命中）。
   - 輸入框打 `0`-`8` 不跳頁；`prefers-reduced-motion` 終態直達非空白；8+1 頁全站迴歸
     console 零 JS 例外。
4. **live 態**（有 key 時人工/半自動驗證）：真 Gemini 跑通「摘要」與「健檢」各一輪、
   確認卡真打 carbon API（後端在時）；key 缺時自動退 mock、chip 正確顯示。
5. **key 紅線**：`.env` gitignored 佐證、bundle grep 無 key 字面值、README 註記僅限本機 demo。

## 11. 風險 / 取捨

- **Gemini key 暴露**：瀏覽器直呼 = key 進 network 請求。限本機 demo；絕不 commit、絕不部署
  公開網址。競賽若需公開部署，屆時改薄 proxy（引擎介面不變，只換簽名層）。
- **live 依賴網路 + 額度**：demo 保險是 mock 態，UI 無差別；上台前可主動拔 key 走劇本。
- **Gemini function calling 偶發不呼叫工具 / plan 格式飄移**：description 寫觸發條件 +
  UI 容忍 plan 缺席；真的歪掉 demo 用 mock。
- **`navigate_to_screen` 離開本頁**＝中斷目前任務（`hide()` abort）：設計上接受——導航型指令
  的回答先講完再跳轉（延遲 1.5s），跳轉即任務結束。
- **@google/genai bundle 體積**：僅 agent screen lazy import（registry 的 `load()` 已是動態
  import，天然 code-split）。
