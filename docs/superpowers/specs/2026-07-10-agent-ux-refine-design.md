# 數位員工 Agent 操作體驗 Refine — 設計文件

> 2026-07-10 brainstorming 定案。前置：agent screen 已完成並合併回 main（spec
> `2026-07-10-agent-screen-design.md`）、使用者已完成 live 實機測試（真 Gemini key +
> 碳權鏈三件套）。本輪針對 live 測試浮現的操作體驗粗糙面做四項 refine。
> 另有一個已落地的微調不在本 spec 範圍（已直接改在工作區）：agent 版面 38/62 → 50/50。

## 1. 決策紀錄表

| 決策 | 定案 | 理由 / 備註 |
|---|---|---|
| 範圍 | 四項：① 掛單挑真實 SU ② 工具卡顯真實數據 ③ 回答後情境追問 chips ④ 錯誤/中斷/確認卡打磨 | 使用者 live 測試後複選定案 |
| 掛單互動模型 | **確認卡內可選**（互動表單：held SU 下拉 + 總價輸入 + 即時折合每噸） | 三選項比選；掌控感最強、真正「挑」 |
| 追問 chips 來源 | **Gemini 回答順帶**（`SUGGEST::` 尾行，沿用 `PLAN::` 機制） | 零額外 API 呼叫、跟著串流出來 |
| price 語意 | **整顆 SU 總價**（PoC `market.list(token_id, price_musd×10^6)`，demo 5,945t 掛 300） | 對照 PoC 原始碼確認；卡片顯示折合每噸避免誤解 |
| waitConfirm 契約 | `Promise<boolean>` → `Promise<ConfirmResult{ ok, args? }>` | 互動卡要把使用者挑的參數帶回工具執行 |
| 掛單失敗語意 | **區分**：fetch throw（離線）→ 示範 fallback；後端在但非 2xx → 誠實失敗訊息 | 修掉現有「一律講示範」的不誠實行為 |
| SU 清單來源 | 新讀取工具 `list_holdable_units` 直打 `GET {carbon.base}/state` | provider snapshot 只有計數、拿不到 token_id |
| 工具卡豐富化 | `ToolRunResult` 加 `cardHtml?`；有則渲染 `.wcard.rich`，無則退回一行摘要 | 向後相容，逐工具漸進 |
| SUGGEST 串流處理 | loop.ts 尾行緩衝（扣住可能是 SUGGEST 字首的 partial line）；從 finalText 剝除再寫 history | 不閃現在答案裡、history 乾淨 |
| 錯誤訊息 | `friendlyError(e)` 純函式對映（key 無效/網路/額度/其他） | 不再 dump 原始 Gemini SDK JSON |
| 停止回復 | `stop()` 當下立即復原輸入列 + 標記 running 卡 | 不等 in-flight fetch；遲來收尾走 idempotent |

## 2. 跨切面契約改動（src/data/types.ts + 引擎介面）

```ts
// AgentEvent 新增一種 + error 事件加 optional detail（皆 additive）：
| { kind: 'suggest'; items: string[] }                    // 回答後的情境追問建議（2-3 條）
| { kind: 'error'; message: string; detail?: string }     // detail = 原始錯誤截 120 字（次要小字）

// ConfirmResult 定義在 src/data/types.ts（與 AgentEvent 同處，loop/replay/controller 三方引用）：
export interface ConfirmResult { ok: boolean; args?: Record<string, unknown> }

// EngineIO.waitConfirm 改（replay.ts 的 EngineIO 定義處）：
waitConfirm(ev): Promise<ConfirmResult>       // 原 Promise<boolean>

// ToolRunResult 加（tools.ts）：
cardHtml?: string   // 工具卡豐富內容（已 esc 的 HTML）；無則 workspace 退回 summaryHtml 一行
```

- **loop.ts 消費 ConfirmResult**：`ok:false` → functionResponse「使用者取消」；`ok:true` →
  用 `result.args ?? c.args` 執行工具，且 functionResponse 註明「實際執行參數」（模型
  後續回答不會講錯號碼）。
- **replay.ts 消費 ConfirmResult**：`ok:false` → cancelEvents（不變）；`ok:true 且帶 args` →
  **覆寫下一個同名 exec tool_call 的 args**（mock 卡也真的可挑、挑了真的掛那顆）。
- 既有測試（agent-replay）隨契約改斷言形狀；語意（取消不執行/中斷）不變。

## 3. §1 掛單挑真實 SU

### 3.1 新工具 `list_holdable_units`
- 讀取型，`parameters: { limit?: number }`（預設 8，只影響 llmText）。
- 執行：`GET {ctx.data.carbon.base}/state` → 篩 `sus[].status === 'held'` →
  `[{ token_id, amount }]`。
- **雙軌回傳**：`llmText` = 前 `limit` 筆 + 總數（省 LLM context）；`data` = 完整清單
  （cap 50 筆，供確認卡下拉）；`cardHtml` = 「可掛單 N 筆」+ 前 3 筆 `#id · 噸數`。
- carbon 離線（fetch throw）→ 空清單、llmText 標「碳權後端離線」。
- description 寫觸發條件：「使用者要掛單/上架碳權時，先呼叫本工具取得可掛單清單」。
- system prompt 同步加：掛單前先呼叫 `list_holdable_units`；`place_carbon_order` 的
  參數是「建議值」，使用者會在確認卡上最終挑選。

### 3.2 互動確認卡（controller 對 `place_carbon_order` 特化）
版面（chat 內確認卡 + 右欄同步明細，沿用現有 confirm 卡骨架）：

```
選擇 SU：   [ SU #3 · 2,881 噸 ▾ ]   ← <select>，held 全列（來自 list_holdable_units 的 data 快取）
總價 (USD)：[ 300        ]            ← <input type=number> min 1 整數；agent 建議價 prefill
折合每噸：  $0.104/t                  ← 即時計算 price ÷ amount（隨 select/input 更新）
市場脈絡：  流通 414,312 t · 掛單中 1 筆  ← carbon 快照（取自本任務內最近一次 carbon 資料，無則省略此行）
[ ✓ 確認掛單 ]  [ 取消 ]
```

- controller 持有「本任務內最近一次 `list_holdable_units` 的 `data`」快取；渲染互動卡時
  以它填下拉，agent 建議的 token_id 預選（若在清單內）。
- 確認 → `ConfirmResult{ ok:true, args:{ token_id: 挑的, price: 改的整數 } }`。
- **快取為空**（agent 沒先呼叫清單工具，或 carbon 離線）→ 下拉退化為手動 token_id
  數字輸入 + 「後端離線時將以示範模式記錄」提示（離線時）。
- 使用者停止/切頁時卡片掛著 → `confirmResolve({ ok:false })`（沿用既有中斷語意）。
- 其他 confirm 工具（`update_setting`）維持靜態確認卡，回 `{ ok, args: 原參數 }`。

### 3.3 掛單失敗語意（tools.ts `place_carbon_order`）
- fetch **throw**（後端離線）→ 維持「（示範）…未寫入鏈上」fallback。
- 後端在但回**非 2xx**（如挑的 SU 已被掛走、不可掛）→ 誠實回
  「掛單失敗（SU #N 可能已上架或不可掛），請重新挑選」——不再講「示範」。

### 3.4 mock parity（agent-scenarios.json `sc-order`）
- confirm 前插一個 `list_holdable_units` 的 exec tool_call（真打 /state，卡片填活資料）。
- confirm 後的 `place_carbon_order` exec args 由 ConfirmResult 覆寫（§2）。
- 劇本回答文字改為不含寫死號碼的說法（「掛單已送出」），避免與使用者實挑的號碼矛盾。

## 4. §2 工具卡顯真實數據（cardHtml per-tool）

全部經 `esc()`、mono 數字、模組色小標；資料欄位以 `src/data/types.ts` 現行 snapshot
型別為準、防禦性 optional chaining（缺欄位就少顯示、不炸）：

| 工具 | cardHtml 內容 |
|---|---|
| `get_module_data(carbon)` | 2×2 迷你 stat：發行 N · 流通 X t · 掛單 L · 除役 R（離線時維持既有「後端離線」一行，不出 rich 卡） |
| `get_module_data(dispatch)` | 風險色點 + 一句結論（snapshot conclusion） |
| `get_module_data(twin)` | 泊位 N · 航跡 M |
| `get_module_data(epidemic)` | 2-3 KPI（紅級數等，依 snapshot 實際欄位） |
| `get_module_data(alert)` | 2-3 KPI（進行中警報 / 送達率等） |
| `ask_policy_rag` | 命中 N 條證據 + 前 2 條來源名（truncate） |
| `list_holdable_units` | 可掛單 N 筆 + 前 3 筆 `#id · 噸數` |
| `run_diagnostics` | 不變（燈號牆已夠豐富，不出 rich 卡） |

workspace.ts：`pushToolCard`/`settleToolCard` 支援 `cardHtml`（settle 時以 rich 內容
取代 running 摘要）；`.wcard.rich` 樣式加在 agent.css（`#s-agent` 前綴、lg-static 慣例）。

## 5. §3 SUGGEST:: 追問 chips

### 5.1 生成（live）
- system prompt 加：「回答結束後，最後一行輸出 `SUGGEST::追問1｜追問2｜追問3`
  （2-3 條、每條 12 字內、必須是使用者可能想追問的下一步）」。
- **loop.ts 尾行緩衝**：streaming 中永遠扣住「最後一個換行之後的 partial line」**若它是
  `SUGGEST::` 的字首**（`'SUGGEST::'.startsWith(partial)` 漸進判斷）；不是字首照常放行。
  流結束：tail 以 `parseSuggest` 解析成功 → 發 `suggest` 事件、**從 finalText 剝除**再寫回
  history；失敗 → 當一般文字 flush。
- `parseSuggest(text): { items: string[]; rest: string }` 純函式（比照 parsePlan，TDD）。

### 5.2 mock
- 四條劇本各在 `done` 前加一個 `suggest` 事件（預錄 2-3 條情境追問，文字對齊各劇本主題）。
- Task 1 的劇本契約測試隨之更新（kind 白名單加 `suggest`）。

### 5.3 渲染（controller）
- `suggest` 事件 → 該則回答泡泡尾端渲染 chips 列（in-thread；非開場 #aChips 區）。
- 點擊 = 填入輸入框 + submit；成功送出才移除（沿用 chips 的 started gating）。
- 新任務 submit 時上一組 suggest chips 移除；reduced-motion 不播進場動畫。

## 6. §4 錯誤/中斷/確認卡打磨

### 6.1 `friendlyError(e): { title: string; detail?: string }` 純函式（loop.ts，TDD）
| 錯誤特徵（訊息字串比對） | title |
|---|---|
| `API_KEY_INVALID` / `API key not valid` | Gemini 金鑰無效或未授權——檢查 `.env` 的 VITE_GEMINI_API_KEY 後重啟 dev server |
| `Failed to fetch` / `NetworkError` / `fetch failed` | 連線 Gemini 失敗——請確認網路（離線時可拔除 key 走劇本示範） |
| `RESOURCE_EXHAUSTED` / `429` | Gemini 額度已滿，稍後再試或走劇本示範 |
| 其他 | 數位員工暫時無法回應；`detail` = 原始訊息截 120 字（次要小字） |

- loop.ts catch 改發 `{ kind:'error', message: title, detail }`（error 事件加 optional
  `detail` 欄位，見 §2）；controller 渲染 message 為主行、detail 為次要小字（無 detail
  則單行）。mock 態 FALLBACK/劇本不帶 detail，行為不變。

### 6.2 停止即時回復（controller）
- `stop()` 當下**立即**：`setInputMode('idle')` + running 工具卡標「已停止」+ 旁白更新
  ——不等 in-flight fetch。
- generator 遲來收尾（fetch 回來後 abort 檢查 return → finally）走 idempotent 路徑：
  重複 `setInputMode('idle')` 無害、abort 後不再排程導航/追加 UI。

### 6.3 確認卡市場脈絡
- 互動掛單卡顯示市場脈絡行（§3.2）：流通量/掛單數，來自本任務內最近一次 carbon
  資料快取；無快取則省略該行（不特地打 API）。

## 7. 檔案結構（全部在既有 agent 檔內，無新產品檔）

```
src/data/types.ts             AgentEvent + suggest、error 加 detail?；ConfirmResult 定義於此
src/screens/agent/tools.ts    + list_holdable_units；place_carbon_order 失敗語意分流；各工具 cardHtml；ToolRunResult.cardHtml
src/screens/agent/loop.ts     ConfirmResult 消費 + args 覆寫；SUGGEST 尾行緩衝 + parseSuggest；friendlyError；system prompt 更新
src/screens/agent/replay.ts   waitConfirm 契約改 ConfirmResult；args 覆寫下一個同名 exec
src/screens/agent/controller.ts  互動掛單卡（select/price/折合/市場脈絡）；suggest chips 渲染；停止即時回復；list 快取
src/screens/agent/workspace.ts   pushToolCard/settleToolCard 支援 cardHtml
src/screens/agent/agent.css      .wcard.rich、互動卡表單、suggest chips 樣式（#s-agent 前綴）
src/data/mock/agent-scenarios.json  sc-order 插 list 工具 + 各劇本加 suggest 事件
tests/  parseSuggest、friendlyError、list_holdable_units 篩選（fetch stub）、ConfirmResult 契約（replay args 覆寫）、cardHtml 組字；既有 agent 測試隨契約更新
```

## 8. 驗收標準

1. **三綠燈**：`tsc --noEmit` 0、`vitest run` 全綠（新增純函式測試 + 既有契約測試更新）、`build` 成功。
2. **vitest 純邏輯**：`parseSuggest`（含 partial 字首緩衝的判斷函式）、`friendlyError`
   四路徑、`list_holdable_units` 篩選/離線、replay ConfirmResult args 覆寫 + 取消不執行
   迴歸、cardHtml 各模組組字（缺欄位不炸）。
3. **CDP mock 態**：sc-order 互動卡（下拉有真 /state held 資料、改價折合每噸即時更新、
   確認後以挑的 args 真打 /list、取消播 cancelEvents）；豐富工具卡渲染；suggest chips
   出現/點擊送出/新任務移除；停止即時回復輸入列；console 零例外。
4. **live 態**（使用者以真 key 驗證，CDP dummy key 驗錯誤路徑）：friendlyError 顯示
   友善訊息非原始 JSON；SUGGEST chips 跟著真回答出現且答案文字無 SUGGEST 殘留；
   掛單全流程（agent 先列清單 → 卡上挑 → 確認 → 真上鏈 → 碳權頁可見）。
5. **迴歸**：既有 mock 四劇本、開場巡檢、citation chip、導航排程、reduced-motion 不迴歸。

## 9. 風險 / 取捨

- **waitConfirm 契約是 breaking change**：replay/loop/controller 三處同步改 + 測試更新；
  範圍都在 agent 檔內、無外部消費者。
- **SUGGEST 尾行緩衝**：模型不照格式輸出（無 SUGGEST 行）→ 無 chips、答案完整顯示
  （UI 容忍缺席，同 PLAN 慣例）；模型把 SUGGEST 放中間 → 當一般文字顯示（可接受的
  退化，prompt 已要求最後一行）。
- **/state 直打 vs provider**：`list_holdable_units` 繞過 provider 直打 /state 是刻意的
  （provider snapshot 拿不到 token_id）；不改 provider 契約（CORE RULE：不動既有
  exchange 檔）。
- **市場脈絡行依賴任務內快取**：agent 沒先讀 carbon 就直接掛單時無此行——接受，
  不為一行 UI 多打一次 API。
