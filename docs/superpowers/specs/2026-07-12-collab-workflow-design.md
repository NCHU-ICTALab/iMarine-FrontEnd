# 協作流程優化（collab workflow）設計文件

日期：2026-07-12
狀態：已與使用者逐段確認設計方向，待實作

---

## 1. 背景與目標

### 1.1 協作流程現況

協作者各自開發模組後端（獨立 repo），拉本 FrontEnd repo 接前端、調整呈現，發 PR 回來；
維護者（repo 擁有者）合併前端改動，再拉協作者的後端 repo，起前後端做整合測試。

### 1.2 痛點（使用者選定，四項全中）

| # | 痛點 | 說明 |
|---|---|---|
| P1 | PR 品質參差 | 改動範圍超出該改的地方（動到 shell／共用碼而非只動 provider）、不符設計規範，review 負擔重 |
| P2 | 資料契約沒對齊 | 後端 API 形狀和前端 types.ts／mock JSON 對不上，接的時候才發現欄位缺漏或語意不同 |
| P3 | 整合測試很費工 | 拉多個後端 repo、逐一起服務、手動核對，每次驗 PR 成本高 |
| P4 | 資訊銜接斷層 | 協作者不知道從哪讀起、環境怎麼建、慣例在哪；後端資訊沒有沉澱處 |

### 1.3 設計目標

穩定性（PR 進來不弄壞既有頁面）、協作性（協作者自助上手、驗 PR 有標準流程）、
可擴展性（新模組後端進來照同一套模板走，不加一個模組發明一套）。

## 2. 決策紀錄

| 問題 | 決定 |
|---|---|
| 協作範圍 | dispatch／epidemic／alert 三頁 + policy 續接，各自獨立後端 repo、不同協作者 |
| 資料契約誰遷就誰 | **後端 API 為準**；前端在 provider（`src/data/exchange/<模組>.ts`）內轉換成 UI 需要的 snapshot 形狀，UI 盡量不動（與 CLAUDE.md 既有原則一致：schema 跟後端契約走） |
| 穩定性把關 | **GitHub Actions CI**：PR 自動跑 tsc + vitest + build 三綠燈，不過不能合 |
| 整合驗證 | **契約 + UI 雙層腳本**：每模組一支契約 smoke（直打後端 API 驗欄位形狀）+ 一支 Playwright live 驗收（驗頁面真渲染） |
| 資訊沉澱 | **前端 repo 集中管**：`docs/collab/<模組>.md` 每模組一張整合卡，契約變更隨 PR 進版控一起 review |
| 文件形式 | 協作者會用 AI coding 工具（Claude Code／Cursor 等），文件寫成人／AI 雙讀：規則可判定、附自我驗證指令 |
| 方案 | 方案 B「文件 + 機械把關」四件套（CONTRIBUTING + 整合卡 + CI + verify 腳本）；不做 docker-compose／OpenAPI 驗證／CODEOWNERS（方案 C，競賽時程下 overkill） |

## 3. 全貌：新增與改動

### 3.1 新增檔案

```
CONTRIBUTING.md                          ← 協作者單一入口（人/AI 雙讀）
docs/collab/
  README.md                              ← 索引 + port/env 變數分配總表 + 維護者驗 PR 流程
  _template.md                           ← 整合卡模板（八欄）
  policy.md                              ← 填實（rag-agent 已存在）
  dispatch.md / epidemic.md / alert.md   ← 骨架（契約待定）+ 前端 mock 形狀參考附錄
.github/
  workflows/ci.yml                       ← PR/push 自動跑三綠燈
  pull_request_template.md               ← PR 自查清單
scripts/verify/
  contract.mjs                           ← 契約 smoke 共用 runner
  contracts/{policy,dispatch,epidemic,alert}.mjs   ← 每模組契約檔（policy 實作、其餘骨架）
  live.mjs                               ← Playwright live 驗收共用 runner
  live/{policy,dispatch,epidemic,alert}.mjs        ← 每模組斷言檔（policy 實作、其餘骨架）
```

### 3.2 配套接線改動（不動 `src/` 內任何檔案）

| 檔案 | 改動 |
|---|---|
| `package.json` | scripts 加三行：`check`（`tsc --noEmit && vitest run && vite build`）、`verify:contract`（`node scripts/verify/contract.mjs`）、`verify:live`（`node scripts/verify/live.mjs`）。零新依賴（playwright 已在 devDependencies） |
| `.env.example` | 加 `VITE_DISPATCH_API=http://127.0.0.1:8200`、`VITE_EPIDEMIC_API=http://127.0.0.1:8300`、`VITE_ALERT_API=http://127.0.0.1:8400` |
| `README.md` | 協作者指南章節開頭加一行導引到 CONTRIBUTING.md（既有四節內容保留不動）；環境變數表補三個新變數 |
| `CLAUDE.md` | 加一行：「若你是協作者（非 repo 擁有者）的 AI 助手，請以 CONTRIBUTING.md 為最高指導」——CLAUDE.md 在版控內，協作者的 AI 工具會讀到，其中「先問我」「不要 commit」等為擁有者個人規則，會誤導協作者的 AI |

註：`.env.example` 新變數暫不被任何 provider 讀取（三頁 provider 仍是 mock），屬 port 預留；
協作者接 live 時 provider 依既有慣例讀 `import.meta.env.VITE_<模組>_API ?? 預設值`（比照 `policy.ts`）。

## 4. CONTRIBUTING.md

定位：協作者從 clone 到發 PR 的**唯一入口**。規則寫成「可判定 + 可自我驗證」：每條硬規則
儘量配一個能跑的檢查指令，AI 助手可直接執行，人也好讀。與 README 協作者指南的分工：
CONTRIBUTING 管**流程與範圍**（怎麼協作），README 協作者指南管**技術規範**（怎麼寫對），
CONTRIBUTING 以連結引用 README 各節、不複製內容，避免兩處失步。

章節結構：

1. **專案脈絡 30 秒** — shell 架構（9 screens + rail）、provider 模式（`Provider<T>`、
   `source: 'live' | 'mock'`）、「你負責的模組邊界」示意。
2. **環境建置** — Node 22、`npm i`、`cp .env.example .env`、`npm run dev`；
   起自己模組後端的指令一律連到 `docs/collab/<模組>.md` §2，CONTRIBUTING 不重複。
3. **改動範圍白名單（對應 P1，核心）** — 每模組 PR **只准動**：
   - `src/data/exchange/<模組>.ts`（provider，mock→live 主戰場）
   - `src/screens/<模組>/`（自己頁面的呈現）
   - `src/screens/settings/sections/<模組>.ts`
   - `src/data/types.ts` — 僅自己模組的型別區塊，PR 描述需標註改了哪些型別
   - `src/data/mock/<模組>.json`（契約造成 mock 形狀連動時）
   - `docs/collab/<模組>.md` + `scripts/verify/contracts/<模組>.mjs` + `scripts/verify/live/<模組>.mjs`（契約變更必須同 PR 更新）
   - `tests/` 內自己模組的測試檔

   **禁改清單**（要動先開 issue 討論）：`src/shell/`、`src/ui/`、`src/main.ts`、`index.html`、
   其他模組的任何檔案、`package.json`（含依賴與 scripts）、`.github/`（CI 設定）、
   `scripts/demo/`（錄影管線）、`CLAUDE.md`／`HANDOFF.md`（擁有者的工作檔）。

   白名單為軟約束（文件 + PR 模板自查，不做 CI 硬擋）；若日後屢犯再升級 changed-files 檢查（future）。
4. **資料交換層規則（對應 P2）** — 後端 API 為準；provider 內轉換成 snapshot 形狀；
   **live 失敗必退 mock**（比照 `src/data/exchange/policy.ts` 的 fallback 形狀，
   「demo 現場後端沒起也不能崩」是硬規則）；資料源 chip 如實顯示 live/mock，不假標。
5. **設計規範** — 連結 README 協作者指南 §1–§4（settings schema／storage／mock→live／
   頁面設計規範 + 新頁面 PR 自查清單）。
6. **提交流程** — branch 命名 `feat/<模組>-*`；發 PR 前自查序列：
   `npm run check` → `npm run verify:contract -- <模組>` → `npm run verify:live -- <模組>`
   （尚未接 live 的 PR，verify 兩支允許不適用，於 PR 模板勾選並說明原因）；
   PR 描述要件（改了什麼、契約變更摘要、測試證據、頁面截圖）。
7. **給 AI 助手的指引** — 白名單的機器可讀重述（明確路徑清單）+ 自查指令序列 +
   「CLAUDE.md 是 repo 擁有者個人工作規則，協作情境以本文件為準」宣告。
8. **維護者驗 PR 流程（透明化）** — 收 PR → CI 綠 → 照整合卡 §2 起後端 →
   `verify:contract` → `verify:live` → 人眼看頁面 → 合併。讓協作者知道自己會被怎麼驗，
   也是維護者自己的 runbook。

## 5. docs/collab/ 整合卡

### 5.1 README.md（索引 + 分配總表）

全站唯一的 port／env 變數權威表，新後端先來認領，不撞 port：

| 模組 | 後端 repo | port | 前端 env 變數 | 整合卡 |
|---|---|---|---|---|
| carbon | iMarine-Carbon-Tokenization-POC | 8000（+8545 chain） | `VITE_CARBON_API` | （既有，README「Live Demo 前置作業」章節，不另立卡） |
| policy | rag-agent | 8100 | `VITE_POLICY_API` | policy.md |
| dispatch | 待填 | **8200** | `VITE_DISPATCH_API` | dispatch.md |
| epidemic | 待填 | **8300** | `VITE_EPIDEMIC_API` | epidemic.md |
| alert | 待填 | **8400** | `VITE_ALERT_API` | alert.md |

Port 慣例：每模組一個百位段，輔助服務用同段 +1～+99（carbon 的 8545 chain 是既成事實，
新模組不重蹈跨段）。twin 原生內建無後端、agent 直連 Gemini API，皆不佔 port 段。

維護者驗 PR 流程（同 CONTRIBUTING §8）也放這裡一份連結。

### 5.2 _template.md（整合卡模板，八欄）

1. **基本資訊** — 模組、負責人、後端 repo URL、預設 branch
2. **起服務** — 前置需求（Python 版本等）、指令序、健康檢查端點、預期輸出（維護者照抄可起）
3. **env 變數** — 前端側 `VITE_*` + 後端側自己的 `.env` 需求
4. **API 契約（後端為準，隨 PR 更新）** — 端點表（method／path／用途）、request/response
   JSON 範例、欄位說明、錯誤回應形狀
5. **前端接線** — provider 檔案、轉換邏輯摘要、fallback 行為、資料源 chip 轉 LIVE 的條件
6. **驗收** — `verify:contract`／`verify:live` 指令 + 人眼檢查清單（頁面該看到什麼）
7. **demo 影片** — 對應 scenario 名稱 + `npm run demo:record -- <scenario>`（接上 live 後
   重錄，chip 自動轉 LIVE，串接既有錄影管線）
8. **變更紀錄** — 日期 + 契約變更摘要

### 5.3 初始四張卡的分野（誠實記錄）

- **policy.md 填實**：rag-agent 已存在，端點以 `src/data/exchange/policy.ts` 與 settings
  政策報告分區現行呼叫為準，實作時起真 rag-agent 校對後寫入（不憑記憶臆造端點形狀）。
- **dispatch.md／epidemic.md／alert.md 填骨架**：§1～§3 能填多少填多少，§4 契約標「待定」；
  附錄放「前端現有 mock JSON 的欄位形狀」作參考——「後端為準」之下，這是前端讓後端知道
  UI 需要哪些資訊的唯一輸入管道，非契約承諾。

## 6. GitHub Actions CI + PR 模板

### 6.1 ci.yml

- 觸發：`pull_request` → main、`push` → main
- 環境：ubuntu-latest + Node 22（對齊維護者本機 v22）、`npm ci`
- 三步驟＝手動驗的三綠燈：`npx tsc --noEmit` → `npm run test` → `npm run build`
- **不跑** verify 腳本（需要後端在場，CI 上沒有）。分工：CI 管「不會壞」，verify 管「有接對」

### 6.2 pull_request_template.md

勾選清單：模組名、改動範圍白名單自查（逐項勾）、契約變更（有／無；有 → 整合卡 §4 +
contracts/<模組>.mjs 已同步更新）、測試證據（`npm run check` 結果 + 兩支 verify 結果或
說明為何不適用）、頁面截圖。

### 6.3 使用者手動步驟（本設計不代為操作 GitHub 外顯動作）

1. push 後確認 CI 首跑綠
2. repo Settings → Branch protection：main 設 CI 為 required check

## 7. scripts/verify/ 雙層驗收腳本

### 7.1 第一層：契約 smoke（`npm run verify:contract -- <模組>`）

- `contract.mjs` 共用 runner：讀 argv 取模組名 → 動態 import `contracts/<模組>.mjs` →
  逐 check 跑 → 輸出 PASS/FAIL 表格 → 任一 FAIL 或載入失敗非零退出。
- `contracts/<模組>.mjs` 是「契約即代碼」本體，形狀固定：

```js
export default {
  base: process.env.VITE_DISPATCH_API ?? 'http://127.0.0.1:8200',
  checks: [
    { name: 'GET /health 回 200 且形狀正確', run: async (base) => { /* fetch + 驗欄位存在/型別/非空 */ } },
    // 每個端點一個 check
  ],
};
```

- 純 Node `fetch` + `AbortController` 逾時，零新依賴；不起 UI、不開瀏覽器，秒級判定
  「後端契約變了」vs「前端接壞了」。後端未起時輸出明確連線失敗訊息（非 stack trace dump）。
- 流程規則（進 CONTRIBUTING §6）：後端契約變更的 PR 必須同步改這支 + 整合卡 §4。

### 7.2 第二層：Playwright live 驗收（`npm run verify:live -- <模組>`）

- `live.mjs` 共用 runner，手法沿用既有已驗證模式（backdrop Task 6）：
  1. 起隔離 dev server：直跑 `node node_modules/vite/bin/vite.js --port 5320 --strictPort`
     （固定 port 5320，避開既有 :5173/:5174/:5288/:5301；跑畢 kill、確認無殘留；
     繼承使用者 `.env`——live 驗收本來就要真後端位址）
  2. Playwright headless Chromium（epidemic 的 Mapbox GL 為 WebGL，headless 下走
     SwiftShader 軟體渲染，比照既有 twin headless 驗證手法、勿加 `--disable-gpu`；
     twin 本身不在協作範圍）
  3. `goto #/<模組>` → 等 `.screen.active`
  4. 跑 `live/<模組>.mjs` 斷言檔：資料源 chip 顯 LIVE（若該頁有 chip；**policy 頁為既有
     特例不顯示資料源 chip**，改以該頁 live 特徵斷言——如知識庫列表來自真後端——具體
     斷言於斷言檔內定義、實作時對真 rag-agent 校對）、關鍵 selector 非空（KPI 數字、
     主視覺容器）、全程零 `pageerror`
  5. 截圖存 OS tmpdir（`imarine-verify-live-<模組>.png`）供人眼複核 → 輸出結果 → 清理
     （不用 session scratchpad——本腳本是 repo 交付物，協作者環境也要能跑，不得依賴
     維護者的 session 路徑）
- `live/<模組>.mjs` 每模組斷言檔形狀：`export default { screenId, asserts: [...] }`。

### 7.3 誠實分野

policy 兩支立刻寫實（起真 rag-agent 實測校對）；dispatch／epidemic／alert 三支立骨架——
執行時明確輸出「契約待定，見 docs/collab/<模組>.md §4」並**非零退出**，不假裝通過。
協作者接 live 的第一個 PR 必須把骨架填實（PR 模板會勾到）。

## 8. 驗收標準

1. 三綠燈不退步：`tsc --noEmit` 0、vitest 全綠（基線 28 檔 132 tests，本輪若依 TDD 慣例
   為 runner 純函式新增測試則在基線上增加、不得減少）、build 成功
   （本輪不動 `src/` 內任何檔案；`src/` 外改動限 package.json scripts、.env.example、
   README、CLAUDE.md 各小改）
2. `npm run check` 本地一鍵跑通
3. policy 契約 smoke 對真 rag-agent（:8100）跑通；rag-agent 未起時輸出明確連線失敗訊息（非 crash）
4. policy live 驗收跑通：chip 轉 LIVE、關鍵 selector 非空、零 pageerror、截圖產出、
   dev server 無殘留（`lsof -ti tcp:5320` 空）
5. 三個骨架模組執行 verify 時誠實報「契約待定」+ 非零退出
6. 文件完備性：假想新協作者只讀 CONTRIBUTING + 自己的整合卡，能從 clone 走到發 PR
   不需口頭補充（自查演練）
7. 使用者步驟（設計不代為操作）：push 後 CI 首跑綠、GitHub 設 branch protection

## 9. 風險與邊界

- **三後端契約未定** → smoke／整合卡 §4 只能先骨架；靠「第一個 live PR 必填」流程規則
  吃掉，非本輪可解。
- **白名單是軟約束** → 不做 CI 硬擋 changed-files，保持輕量；屢犯再升級（future）。
- **CI 分鐘數** → 三步驟約 2–3 分鐘/次，GitHub free 額度充裕。
- **rag-agent 驗收依賴** → 驗收標準 3/4 需本機起得了 rag-agent；起不了則該兩項降級為
  「後端未起的失敗路徑驗證」+ 標註留待使用者補真後端驗收（誠實分野，不假裝跑過）。
- **不做（YAGNI）**：docker-compose 統一拉後端、OpenAPI／JSON Schema 驗證框架、
  CODEOWNERS、branch protection 自動化設定。
