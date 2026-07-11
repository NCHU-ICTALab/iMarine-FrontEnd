# 數位員工入口與設定整合 — 設計文件

日期：2026-07-11
狀態：已與使用者逐節確認定案
範圍：hero 封面 chips 加入數位員工入口 + settings 新增數位員工分區（有限生效）+ agent 端讀取點接線

---

## 1. 決策紀錄

| 問題 | 決定 | 理由 |
|---|---|---|
| hero 加入範圍 | **只加封面 chips（六變七）**；總覽儀表牆維持六卡 3×2 不動 | agent 是「操作入口」不是「監測模組」，儀表牆語意上放六大功能即可；`overview.json` 零改動 |
| settings 分區真實程度 | **有限生效（比照 mapbox token 前例）**，零佔位欄位 | agent 是純前端直呼 Gemini，沒有「後端待接入」問題；key 覆寫讓 demo 現場免碰 `.env` 免重啟 |
| 設定欄位清單 | 6 項全生效：geminiKey / model / 測試連線 / sourceMode / autoPatrol / 狀態唯讀 | 使用者委託盤點後核可（見 §4 盤點紀錄） |
| YAGNI 略過項 | `MAX_TURNS`、navigate 延遲 1500ms、rag-agent `:8100` 端點、SUGGEST 開關、mock 劇本速度、system prompt 客製 | 純內部保險絲／無實際情境／`:8100` 歸 policy 分區管（diagnostics 已跟 policy provider base 走），不重複 |

## 2. Hero 封面 chips（小改）

現況：[src/screens/hero/index.ts:66](../../../src/screens/hero/index.ts) 單一 `mods = SCREENS.slice(1, 7)` 同時餵封面 chips 與總覽儀表牆卡。

改法：拆兩條——

- `chipMods = SCREENS.slice(1, 8)` → 封面七 chips（含 agent 紫 `#B48CFF`，`data-go="agent"` 沿用既有委派點擊跳頁）
- `cardMods = SCREENS.slice(1, 7)` → 總覽儀表牆六卡不動

`hero.html` / `hero.css` / `src/data/mock/overview.json` 零改動（`.hchips` 為 flex row，第七顆自然排入；實測若換行觀感不佳再微調間距，屬驗收時判斷）。檔頭註解「settings 第 8 筆不進 hero」同步更正為「agent 進 chips 不進儀表牆；settings 兩者皆不進」。

## 3. Settings 數位員工分區

新檔 `src/screens/settings/sections/agent.ts`，於 `src/screens/settings/index.ts` 的 `alertSection` 之後註冊（順序對齊 rail：alert → agent）。分區 `id: 'agent'`、label「數位員工」、色紫 `#B48CFF`、`status()` 顯示目前生效態摘要。

### Group 1「Gemini 連線」（saveMode: explicit，比照 carbon API 連線）

| 欄位 | kind | 規格 |
|---|---|---|
| `agent.geminiKey` | password | API key 輸入框（遮罩顯示，用 schema 既有 `password` kind）。help：「留空使用 .env 的 VITE_GEMINI_API_KEY；僅存本機瀏覽器（localStorage），勿在共用電腦填入」 |
| `agent.model` | select | `gemini-2.5-flash`（預設）/ `gemini-2.5-pro` / `gemini-2.5-flash-lite` |
| 測試連線 | action | 生效 key 為空時**短路不打 API**，直接回 `{ok:false}`「未設定 key——填入上方欄位或於 .env 設定」。否則拿**生效 key + 生效 model** 真打一次 Gemini generateContent（最小 payload）。比照 `testCarbon`：4s 逾時、絕不 throw、一律 resolve ActionResult；成功訊息帶模型名，失敗訊息用 `friendlyError` 同款分類文案（金鑰無效／網路失敗／額度用盡／其他） |

### Group 2「行為」（saveMode: instant）

| 欄位 | kind | 規格 |
|---|---|---|
| `agent.sourceMode` | select | `auto`「自動（有 key 走 GEMINI LIVE）」（預設）/ `mock`「強制劇本 MOCK」。demo 想展示確定性劇本時不用刪 key |
| `agent.autoPatrol` | toggle | 進頁自動巡檢，預設開（`defaultOn: true`）。**boot 時判定一次**：關閉時首次進頁略過 `runDiagnostics` probe 與燈牆動畫，招呼泡泡改用無健檢結論的問候文案（`greet` 需支援 `lastDiag` 為 null 的分支，如「隨時吩咐——需要時可跟我說『跑一次完整系統健檢』」）、3 建議 chips 照顯。開關切換後**重新整理才生效**（既有 `booted` flag 只跑一次的語意不動，避免切開關補跑巡檢的複雜度） |

### Group 3「狀態」（唯讀 custom，比照 carbon 鏈路資訊）

顯示目前生效態：「GEMINI LIVE（key 來源：設定頁 / .env）」或「劇本 MOCK（強制 / 無 key）」+ 生效模型名。

## 4. Agent 端接線（只換讀取點，不動引擎邏輯）

新增 `src/screens/agent/config.ts`，匯出三個純讀取函式：

- `effectiveKey(): string` — `getSetting('agent.geminiKey', '')` 非空優先，否則 `env.VITE_GEMINI_API_KEY`，否則空字串
- `effectiveModel(): string` — `getSetting('agent.model', 'gemini-2.5-flash')`
- `isLive(): boolean` — `sourceMode === 'mock'` 一律 false；否則 `!!effectiveKey()`

三個既有讀取點改用（逐點列舉，此外不動）：

1. `src/screens/agent/index.ts:23` 的 `hasKey` → `isLive()`（標題列 LIVE/MOCK chip）
2. `src/screens/agent/controller.ts:18` 的 `hasKey` → `isLive()`（submit 走 live/mock 分流）
3. `src/screens/agent/controller.ts:384` 傳給 `runGemini` 的 `apiKey` → `effectiveKey()`，並新增傳入 `model: effectiveModel()`；`loop.ts` 的 `MODEL` 常數改為 `runGemini` 參數（預設值 `gemini-2.5-flash`），`SYSTEM_PROMPT` 等其餘不動

即時生效機制：storage 的 `subscribe(key, cb)` 是 per-key 訂閱——標題列 chip 需各訂 `agent.geminiKey` 與 `agent.sourceMode` 兩條（`agent.model` 不影響 chip 不訂），callback 以 `isLive()` 現值更新 header source chip 的文字與 class（比照 policy `llmMode` 前例）；submit 每次呼叫 `isLive()`/`effectiveKey()`/`effectiveModel()` 現讀，天然即時。`autoPatrol` 在 `index.ts` 的 `show()` boot 分支 gating（語意見 §3 Group 2）。

盤點紀錄（使用者委託全掃 agent 程式碼後核可）：可調參數僅上述 6 項升級為設定，其餘見 §1 YAGNI 略過項。

## 5. 測試與驗收標準

- **vitest**：`config.ts` 三函式優先序純函式測試（settings 覆寫 env、mock 強制、預設值）；settings schema key 唯一性既有測試自然涵蓋新欄位；新分區 schema 契約測試（欄位 key/kind 存在性）。
- **CDP 驗收**：
  - hero 封面七 chips（第七顆紫色、點擊跳 agent 頁）、總覽儀表牆仍六卡、hero 其餘互動不迴歸
  - settings 出現「數位員工」分區、三 group 渲染、explicit 儲存/捨棄語意正確
  - 設定頁填 dummy key → agent 頁 chip 即時轉「GEMINI LIVE」→ 送指令走 live 路徑、Gemini 真回 400、friendlyError 上牆（不動 `.env`）
  - `sourceMode=mock` + 有 key → chip 顯「劇本 MOCK」、送指令走劇本
  - `autoPatrol=off` + 重新整理 → 首次進頁只顯招呼（無健檢結論文案）+ chips、無 probe 動畫；`=on` + 重新整理 → 恢復巡檢（開關切換需重載生效，見 §3）
  - 測試連線 action：無 key 失敗訊息、dummy key 金鑰無效訊息（真 key 成功案例留使用者實機驗）
  - 全站 9 頁迴歸 + console 零例外
- **三綠燈**：`tsc --noEmit` 0 / `vitest run` 全綠 / `build` 成功。

## 6. 風險與取捨

- **key 存 localStorage 明文**：與 mapbox token 前例一致，僅限本機 demo；help 文案警示、README 不變（既有「key 僅限本機」註記已涵蓋）。
- **模型清單寫死三選項**：Gemini 模型名會隨版本演進，select options 過時只影響下拉清單，key 覆寫與 auto/mock 分流不受影響；屆時改一行 options。
- **測試連線消耗真實 quota**：最小 payload 一次呼叫，可接受。
