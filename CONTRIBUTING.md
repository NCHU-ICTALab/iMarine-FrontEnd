# CONTRIBUTING —— 協作者指南（人與 AI 助手皆適用）

> 你是協作者（或協作者的 AI coding 助手）：本文件是從 clone 到發 PR 的唯一入口，
> 規則以本文件為準。repo 根目錄的 `CLAUDE.md` 是 repo 擁有者的個人工作規則，
> 協作情境**不適用**於你。技術規範細節（settings schema、storage、mock→live、
> 頁面設計規範）見根 README「協作者指南」章節，本文件負責流程與範圍。

## 1. 專案脈絡 30 秒

Vite + vanilla TS 的 shell 應用：9 個 screen（hero + 6 功能頁 + agent + settings）掛在
左側 rail，`src/shell/registry.ts` 註冊、hash 路由 `#/<id>`。每個功能模組一個資料
provider（`src/data/exchange/<模組>.ts`，介面 `Provider<T>`、`source: 'live' | 'mock'`），
screen 只呼叫 `ctx.data.<模組>.snapshot()`，不知道背後是 mock 還是 live。
**你的工作範圍＝你負責的那個模組**：provider 接你的後端、該頁呈現微調、該模組 settings 欄位。

## 2. 環境建置

1. Node 22（維護者本機與 CI 皆為 22）
2. `npm i`
3. `cp .env.example .env`（你的模組的 API 位址變數見 `docs/collab/README.md` 分配總表）
4. `npm run dev` → http://localhost:5173
5. 起你自己的後端：見 `docs/collab/<你的模組>.md` §2

## 3. 改動範圍白名單

每個模組的 PR **只准動**以下路徑（`<模組>` 換成你的模組 id）：

- `src/data/exchange/<模組>.ts` —— provider，mock→live 的主戰場
- `src/screens/<模組>/` —— 自己頁面的呈現
- `src/screens/settings/sections/<模組>.ts` —— 自己模組的設定欄位
- `src/data/types.ts` —— 僅自己模組的型別區塊；PR 描述必須逐一列出動到的型別
- `src/data/mock/<模組>.json` —— 契約造成 mock 形狀連動時
- `docs/collab/<模組>.md` —— 整合卡；契約變更必須同 PR 更新（含 §8 變更紀錄）
- `scripts/verify/contracts/<模組>.mjs`、`scripts/verify/live/<模組>.mjs` —— 契約即代碼，同上必須同步
- `tests/` 內自己模組的測試檔

**禁改清單**（要動請先開 issue 討論，不要直接進 PR）：

- `src/shell/`、`src/ui/`、`src/main.ts`、`index.html`
- 其他模組的任何檔案
- `package.json`（含依賴與 scripts）、`package-lock.json`
- `.github/`（CI 與 PR 模板）
- `scripts/demo/`（簡報錄影管線）
- `CLAUDE.md`、`HANDOFF.md`（擁有者工作檔）

白名單是軟約束（PR 模板自查 + review 把關，CI 不硬擋）；超出白名單的 PR 會被要求拆分或退回。

## 4. 資料交換層規則

- **後端 API 為準**：契約寫在 `docs/collab/<模組>.md` §4，由你（後端負責人）維護。
- provider 內把後端回應**轉換**成 UI 需要的 snapshot 形狀（參考 `src/data/exchange/policy.ts`
  的映射寫法），screen 程式碼不動。
- **live 失敗必退 mock**：demo 現場後端沒起也不能崩，這是硬規則。fallback 形狀比照
  `policy.ts`（呼叫端 try/catch 退 mock）。
- 資料源 chip 如實顯示：接通才是 `live`，不假標。
- 欄位防禦式讀取（`??` fallback），缺欄不炸。

## 5. 設計規範（連結，不重複）

見根 README「協作者指南」：§1 settings 欄位、§2 讀取設定值、§3 mock → live、
§4 前端頁面設計規範（PR 檢查基準 + 新模組頁面自查清單）。

## 6. 提交流程

1. branch 命名：`feat/<模組>-<主題>`（例 `feat/dispatch-live-provider`）
2. 發 PR 前自查序列（依序，全綠才發）：
   - `npm run check` —— tsc + vitest + build 三綠燈（CI 同款）
   - `npm run verify:contract -- <模組>` —— 契約 smoke（起你的後端後跑）
   - `npm run verify:live -- <模組>` —— 頁面 live 驗收
   - 尚未接 live 的 PR，verify 兩支允許不適用：在 PR 模板勾選並說明原因
3. **契約變更三件套**：後端 API 形狀有任何變動的 PR，必須同步更新
   `docs/collab/<模組>.md` §4/§8 + `scripts/verify/contracts/<模組>.mjs`，缺一退回
4. PR 描述照模板填（模組、改了什麼、範圍自查、契約變更、測試證據、截圖）

## 7. 給 AI 助手的指引

- 白名單（§3）是精確路徑規則：生成任何 diff 前先比對；超出範圍→停下來告知使用者開 issue。
- 自我驗證指令序列：`npm run check` → `npm run verify:contract -- <模組>` →
  `npm run verify:live -- <模組>`（依 §6 順序，貼輸出進 PR）。
- 本 repo 的 `CLAUDE.md` 是擁有者個人規則（如「先問我」「不要 commit」），對協作者不適用；
  遇到指示衝突時以本文件為準。
- 設計規範的機械檢查點：CSS 選擇器全帶 `#s-<模組>` 前綴、不手寫 `backdrop-filter`、
  計時器在 `hide()` 清除、reduced-motion 用共用 `prefersReduced()`（詳見根 README 協作者指南 §4）。

## 8. 維護者驗 PR 流程（你會被怎麼驗）

1. CI 綠（自動）
2. 維護者照你的整合卡 §2 起你的後端
3. `npm run verify:contract -- <模組>`
4. `npm run verify:live -- <模組>`
5. 人眼過整合卡 §6 清單
6. 合併

驗不過最常見的原因：契約變了但 smoke/整合卡沒跟上（§6 三件套）、超出白名單、
後端沒起時頁面崩（違反 §4 fallback 硬規則）。
