# iMarine-FrontEnd

「永續智能航港生態系」前端整合層——2026 航港大數據創意應用競賽的簡報 + 現場 demo 用 shell。
Vite + vanilla TypeScript（不使用框架）打造，深色 Liquid Glass 設計語言，左側玻璃 icon rail
串接 7 個畫面：封面／戰情總覽（`hero`，兩段式）、碳權代幣化交易（`carbon`）、AI 政策輔助報告
（`policy`）、2.5D 數位孿生沙盤推演（`twin`）、短時微氣候即時派工（`dispatch`）、疫情自動追溯
（`epidemic`）、自動警報推播（`alert`）。

本專案是競賽用的展示殼層，非正式產品；`carbon`／`twin` 兩頁串接真實後端（live provider），其餘
四頁使用 mock 資料（`src/data/mock/*.json`）。

## 畫面展示

四個主要模組的實機畫面（逐頁標註資料源）：

### AI 政策輔助報告（`policy`）

NotebookLM 式三欄政策情報中心：左側情報收件匣（突發事件／新政策／每日晨報三類，可模擬偵測
新情報流入）、中欄對話串（結構化產出報告卡 + 「看得見 AI 在工作」四步驟生成過程 + 追問對話）、
右側 iMarine 五類來源清單（勾選與引用連動）；頂部「綜合對話」進入跨情報知識庫模式（來源聯集
分組摺疊 + 搜尋 + 跨情報提問），並可切換地端／雲端 LLM 接口。以 LLM + RAG 結合 Grounding
事實基礎驗證為設計語言。

![AI 政策輔助報告](docs/screens/policy.png)

> 本頁為 mock 資料的完整互動展示（版面與互動皆已就緒）；正式版只需把 provider 由 mock 換成
> LLM + RAG 後端即可上線。

### 短時微氣候 · 即時派工建議（`dispatch`）

港邊第一線視角：以 ConvLSTM 產出未來 0–90 分鐘港區微氣候預測（六級雨量分級 + 蒲福風級 +
10 分鐘平均風速／陣風），90 分鐘後銜接中央氣象署預報（+3h／+6h），時間軸以「近密遠疏」呈現
雙資料源。左側依當前預測給出七類碼頭作業（橋式機／散裝穀物／散裝煤礦／油品化學品／引水拖船／
綁解纜／倉儲櫃場）的可作業／戒備／停工燈號矩陣，點列可原位展開派工建議的規則依據（區分官方
法規條號與業界慣例）；右側為派工指令卡。可切換三種天氣情境（現況穩定／強降雨逼近／颱風外圍），
全頁連動重算。以「規則引擎可解釋」為設計語言——調度員看得懂系統為什麼這樣建議。

![短時微氣候即時派工建議](docs/screens/dispatch.png)

> 本頁為 mock 資料的完整互動展示；規則庫依據勞動部強風／大雨函釋、高雄港風災防救作業要點、
> 中央氣象署雨量分級等實際規範建立。正式版只需把 provider 由 mock 換成 ConvLSTM 預測 +
> 氣象署 API 後端即可上線。

### 2.5D 數位孿生沙盤推演（`twin`）

高雄港原生 3D 場景（LiDAR 引擎直繪，無 iframe、無外部服務）：航照底圖 + 依船種上色的
AIS 船舶點雲；雙分頁戰情室（即時回放＝過去 24 小時 443 艘真實 AIS 航跡回放／未來推演＝
沙盤模擬）；右側船型篩選、在港趨勢、視角預設、底部時間軸。

![2.5D 數位孿生沙盤推演](docs/screens/twin.png)

### 碳權代幣化交易（`carbon`）

串接碳權 PoC 後端（FastAPI + 本地模擬鏈）的即時資料：累計發行 SU、總減碳噸數、
已交易／已除役統計，與 108 筆 SU 資產卡（真實 `dataHash`、狀態、持有者）。

![碳權代幣化交易](docs/screens/carbon.png)

## 安裝與啟動

```
npm install
npm run dev
```

`npm run dev` 啟動 Vite dev server（預設埠 5173），瀏覽器開啟顯示的網址即可看到封面畫面。

其他常用指令：

| 指令 | 用途 |
|---|---|
| `npm run build` | 產出靜態檔於 `dist/`（正式簡報機打包用） |
| `npm run test` | 執行 vitest 單元測試 |
| `npm run preview` | 預覽 `npm run build` 的產出 |

## 環境變數（.env）

先複製範本：

```
cp .env.example .env
```

`.env` 內只有一個變數：

| 變數 | 說明 | 預設值 |
|---|---|---|
| `VITE_CARBON_API` | 碳權代幣化交易 PoC 後端（FastAPI）位址 | `http://127.0.0.1:8000` |

此服務若未啟動，碳權頁連線 chip 會轉紅並提示，不會讓整個 shell 崩潰；twin 頁不依賴任何
環境變數（詳見下方「Live Demo 前置作業」）。

## Live Demo 前置作業

六個功能頁中，只有 **碳權代幣化交易（carbon）** 需要先啟動上游服務才能看到「真實資料」而非
降級畫面；twin 模組已原生內建，無需任何前置作業（見下）。

### 碳權代幣化交易（carbon）

carbon 呼叫的 **iMarine-Carbon-Tokenization-POC** 是本專案之外的獨立 repo，本專案僅呼叫其
API，不修改其原始碼。依序執行：

```
make chain
make deploy
make api
```

`make chain` 啟動本地 Hardhat 節點、`make deploy` 部署合約、`make api` 啟動 FastAPI 後端
（預設埠 8000，對應 `VITE_CARBON_API`）。三者都要跑起來，carbon 頁才能完成發行、掛單、購買、
除役等完整流程。

### 2.5D 數位孿生（twin）

twin 模組已內建 LiDAR 引擎與真實 AIS/泊位資料，`npm run dev` 即可，無需額外服務。

## 鍵盤快捷鍵（簡報用）

| 按鍵 | 動作 |
|---|---|
| `0` | 回到 hero 戰情總覽 |
| `1`–`6` | 依序跳至 碳權／政策／孿生／派工／疫情／警報 六個功能頁 |
| `Enter` | 僅在 hero 頁生效：於封面（COVER）與戰情總覽（OVERVIEW）之間切換 |

## 瀏覽器需求

介面的玻璃質感（Liquid Glass 折射效果）**僅在 Chromium 系瀏覽器（Chrome／Edge）完整支援**，
簡報與 demo 請使用 Chromium 系瀏覽器開啟。其他瀏覽器會自動降級為磨砂玻璃效果，功能不受影響，
但視覺效果會打折扣。
