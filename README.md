# iMarine-FrontEnd

「永續智能航港生態系」前端整合層——2026 航港大數據創意應用競賽的簡報 + 現場 demo 用 shell。
Vite + vanilla TypeScript（不使用框架）打造，深色 Liquid Glass 設計語言，左側玻璃 icon rail
串接 8 個畫面：封面／戰情總覽（`hero`，兩段式）、碳權代幣化交易（`carbon`）、AI 政策輔助報告
（`policy`）、2.5D 數位孿生沙盤推演（`twin`）、短時微氣候即時派工（`dispatch`）、疫情自動追溯
（`epidemic`）、自動警報推播（`alert`）、數位員工 AI Agent（`agent`）。

本專案是競賽用的展示殼層，非正式產品；`carbon`／`twin` 兩頁串接真實後端（live provider），
`agent` 頁為雙態 provider（設定 Gemini API key 才走真實 tool-calling，未設定則退回劇本 mock），
其餘四頁使用 mock 資料（`src/data/mock/*.json`）。

## 協作者從這裡開始

要接自己模組的後端、改前端呈現、發 PR 回來，**先讀 [CONTRIBUTING.md](CONTRIBUTING.md)**——涵蓋
環境建置、**改動範圍白名單**（每個模組 PR 只准動哪些檔）、發 PR 前的驗收指令（`npm run check`／
`verify:contract`／`verify:live`）與提交流程。接著看你負責模組的整合卡
**[docs/collab/](docs/collab/README.md)**——後端起服務指令、API 契約（後端為準、隨 PR 更新）、
port／env 變數分配總表。技術規範細節（settings 欄位、mock → live、頁面設計規範）見下方
[協作者指南](#協作者指南)章節。

## 畫面展示

封面／戰情總覽、主要模組頁與系統設定頁的實機畫面（逐頁標註資料源）：

### 封面 · 戰情總覽（`hero`，兩段式）

競賽 PPT 開場封面 →按 `Enter`／點「進入戰情總覽」→ 戰情總覽，兩段共用一支全螢幕波浪 loop 影片
底圖（封面明亮、總覽罩幕壓暗，切換時元件 stagger 進場、影片持續播放不換底圖）。封面為電影感
中置標題 + 六大功能模組＋數位員工共七顆色點 chips（可點直接進入該模組）+ `ENTER` 快捷提示；戰情總覽為六模組
儀表牆（每張卡：模組色點 + 名稱 + 關鍵指標 + 迷你趨勢線，點卡跳頁），頂部一行即時 KPI（今日
進出港船舶／在泊船席／平均等候／今日預估碳排）。以「大螢幕遠觀、單一 CTA、緩慢大週期背景
動態、文字恆靜」為開場設計語言。

![封面 · 永續智能航港生態系](docs/screens/hero-cover.png)

![戰情總覽 · 高雄港即時生態快照](docs/screens/hero-overview.png)

> 封面文案與七顆模組入口 chips 為靜態；戰情總覽的 KPI 與六模組指標綁 overview mock provider（數位員工僅入封面 chips、不進儀表牆）。底圖為自架
> 的抽象波浪 loop 影片（`src/screens/hero/hero-bg.mp4`，無縫循環、離線內建、無需連網取用）。

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

### 疫情自動追溯（`epidemic`）

港邊第一線視角：自動整合進港船隻的過去 AIS 資料重建停靠港口序列，交叉比對船舶航跡與 WHO／
疾管署／國際新聞的疫情通報時序，判定「近期停靠港是否出現疫情、航跡是否與通報時序重疊」，建立
擴散預警並以細胞簡訊通知港邊作業人員。左側為進高雄港船隊清單（依規則式評分風險排序，常態壓灰、
風險發亮）；中央為 Mapbox 真實世界地圖（船舶沿真實航線收束至高雄港，疫區熱點標示）＋下方
Epi-Gantt 雙泳道（船舶靠泊 × 疫情通報，時空重疊即畫命中連接線），共用一條可拖曳的時間游標——
拖動時船舶沿真實航線移動、越過命中時刻脈衝示警；右側為規則式評分卡（依 WHO《國際衛生條例》
框架的靠港天數／來源強度／距離因子）、多來源情報、防護動作與細胞簡訊。頂部自動化管線帶演出
「爬取情資→重建航跡→時空比對→規則評分→細胞簡訊」五階段，並可「模擬偵測」新疫情通報流入
（升級既有船隻風險／新增高風險進港船）。以「規則式評分可解釋、新病原只需補規則」為設計語言。

![疫情自動追溯](docs/screens/epidemic.png)

> 本頁船隊／疫情通報／評分皆為 mock（船名為虛構），地圖底圖為 Mapbox 真實磚；正式版只需把
> provider 由 mock 換成 AIS ＋ WHO／疾管署情資後端即可上線。地圖需在 `.env` 設
> `VITE_MAPBOX_TOKEN` 並於執行時連網取磚。

### 自動警報推播（`alert`）

港區廣播中心：疫情追溯／即時派工／氣象監測等模組產生的港區事件，經分級規則引擎後以細胞廣播
（Cell Broadcast，同災防告警 PWS 技術）推播給港區人員與船舶。左側為警報事件流（事件卡帶來源
模組色點與港區三級分級——紅色警報／橙色警戒／作業提示，對映 PWS 訊息碼徽章 `CH 4371`／`911`／
`919`，點卡可原位展開「偵測 → 規則命中 → 分級 → 發布」的分級軌跡）；中央為 Mapbox 高雄港覆蓋
地圖（基地台 cell 逐一點亮、地理圍欄與波紋擴散示意廣播覆蓋範圍）；右側為港區人員手機端（依分級
呈現通知橫幅或全螢幕緊急插播）與送達漏斗（觸發 → 發布 → 送達 → 回報，紅色警報時人員／船舶雙軌）。
可「模擬事件」演練全鏈路推播（作業提示雷擊 → 紅色警報颱風頂格）。常態壓灰、警報發亮的引導性配色，
資訊以數據／徽章／色彩呈現而非散文。下圖為紅色警報頂格（全港廣播）畫面：

![自動警報推播](docs/screens/alert.png)

> 本頁事件流／覆蓋範圍／送達統計皆為 mock，地圖底圖為 Mapbox 真實磚；正式版只需把 provider 由
> mock 換成事件匯流 ＋ 細胞廣播發布後端即可上線。地圖需在 `.env` 設 `VITE_MAPBOX_TOKEN` 並於
> 執行時連網取磚。

### 2.5D 數位孿生沙盤推演（`twin`）

高雄港原生 3D 場景（LiDAR 引擎直繪，無 iframe、無外部服務）：航照底圖 + 依船種上色的
AIS 船舶點雲；雙分頁戰情室（即時回放＝過去 24 小時 443 艘真實 AIS 航跡回放／未來推演＝
沙盤模擬）；右側船型篩選、在港趨勢、視角預設、底部時間軸。

![2.5D 數位孿生沙盤推演](docs/screens/twin.png)

### 碳權代幣化交易（`carbon`）

串接碳權 PoC 後端（FastAPI + 本地模擬鏈）的即時資料：累計發行 SU、總減碳噸數、
已交易／已除役統計，與 108 筆 SU 資產卡（真實 `dataHash`、狀態、持有者）。

![碳權代幣化交易](docs/screens/carbon.png)

### 數位員工（`agent`）

港區的 AI 數位員工：以自然語言下指令，透過 8 個工具讀取／導航／操作六大功能模組的資料層，
把整個生態系串起來——跨模組整合問答（如「整合今日港區營運摘要」「紅海事件對碳成本的影響？」）、
系統自我檢測（確定性 probe + 維運 runbook，異常時給修復步驟）、以及需人工確認的寫入操作（碳權
掛單、修改設定）。畫面左右各半——左為對話串、右為工作區。進頁自動跑一次靜默巡檢，右側工作區以
6+1 燈號牆逐卡點燈；任務執行採 plan-then-act（計畫時間軸打勾）+ 常駐旁白字幕 + 工作區跟隨（工具
結果卡直接顯示各模組真實數據的迷你統計、完成後留下模組足跡 chips）；答案中的模組引用以彩色
citation chip 呈現，hover 可看該模組本次工具摘要、點擊直接跳轉該頁，回答結束後再給 2-3 顆情境
追問 chips 引導下一步。碳權掛單這類寫入動作一律先出確認卡——掛單時 agent 先列出目前可掛單的
真實 SU，確認卡以下拉挑選要掛哪一顆 + 調整總價（即時顯示折合每噸），操作員挑定按下才會真的寫入
鏈上。以 human-in-the-loop 為設計語言——AI 不是黑箱操作者，而是每一步都看得見、可中斷、可確認的協作者。

![數位員工](docs/screens/agent.png)

> 本頁為雙態 provider：設定 Gemini API key 後走真實 Gemini tool-calling，標題列 chip 顯示
> 「GEMINI LIVE」；未設定 key 則自動退回四條劇本 mock（chip 顯示「劇本 MOCK」）。key 可填在
> `.env` 的 `VITE_GEMINI_API_KEY`，或直接在**系統設定的「數位員工」分區**填入（設定值覆寫 `.env`、
> 免重啟即時切換 LIVE／MOCK，見下方「系統設定」）；同分區可選模型（`gemini-2.5-flash` 預設／
> `-pro`／`-flash-lite`）、按「測試連線」驗 key、或以「資料源模式」強制走劇本、關閉進頁自動巡檢。
> ——劇本內的資料查詢工具仍會真的呼叫各模組 provider（資料是活的，只有回答文字
> 預錄），碳權掛單／系統健檢等工具在 mock 態下同樣可完整互動。Gemini key 僅限本機 demo，
> **勿提交版控、勿部署公開網址**（瀏覽器直接呼叫 API，key 會出現在 network 請求中）。
> live 態（真實 Gemini key）互動掛單全流程與回答後追問 chips 已實機驗證：agent 先列出可掛單 SU、
> 確認卡挑選後真打碳權 API 寫入鏈上、Gemini 回錯時優雅降級（友善錯誤訊息、頁面不崩潰、拔除 key 退回
> mock）皆正常。碳權掛單真打鏈需先啟動 PoC 三件套（見「Live Demo 前置作業」的碳權段）。

### 系統設定（`settings`）

全站前後端設定頁（左側 rail 底部齒輪進入，快捷鍵 `8`）：schema 驅動的設定框架，左欄八個分區
（前端設定 + 六大功能模組 + 數位員工），右側依分區呈現。前端設定分區管資料源總覽、動態效果、Mapbox
token；碳權分區管 API 端點與連線測試；政策報告分區是完整互動的 LLM 應用設定——模型管理（供應商
卡牆 + API 金鑰設定 + 測試連線 + 系統預設推理／Embedding／Rerank 模型）與知識庫管理（多知識庫、
文件上傳、chunk 分段、檢索策略 vector／full-text／hybrid 漸進揭露）；數位員工分區管 Gemini
連線（API key、模型選擇、測試連線）與行為（資料源模式 自動／強制劇本、進頁自動巡檢開關）；其餘
四個模組分區（沙盤／派工／疫情／警報）為「後端待接入」的預留骨架。設定落地 localStorage 並有限
生效（政策頁地端／雲端切換與此雙向同步、Mapbox token 與碳權 API 端點可覆寫 `.env`、數位員工
Gemini key／模型／資料源模式覆寫 `.env` 且即時切換標題列 LIVE／MOCK chip、減少動態效果全站生效）。

![系統設定](docs/screens/settings.png)

> 本頁為協作框架：其他人的後端整合進來時，只要在 `src/screens/settings/sections/<模組>.ts` 加一筆
> schema 物件即可長出對應設定欄位，無需碰 UI 程式碼（詳見下方「協作者指南」）。政策報告分區的
> 模型／知識庫管理為完整互動 mock，介面形狀依未來 REST API 設計，換接真後端只需替換 provider。

政策報告分區的模型／知識庫管理已可接 **rag-agent** 後端（見「Live Demo 前置作業」）：後端在時走
真實知識庫與模型連線，**後端不在時退回完整 mock 示範**——五庫卡牆（`MOCK` 標記）、檢索策略
vector／full-text／hybrid、rerank 導引、測試連線示範驗證皆可離線操作。

![系統設定 · 政策報告分區的知識庫 mock 示範](docs/screens/settings-kb-mock.png)

數位員工分區（有限生效）：Gemini 連線（API key 遮罩輸入、模型選擇、測試連線）＋ 行為（資料源
模式 自動／強制劇本、進頁自動巡檢開關）＋ 狀態唯讀。設定頁填 key／切模式後，數位員工頁標題列的
LIVE／MOCK chip 免重啟即時跟隨。

![系統設定 · 數位員工分區](docs/screens/settings-agent.png)

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

`.env` 內有七個變數：

| 變數 | 說明 | 預設值 |
|---|---|---|
| `VITE_CARBON_API` | 碳權代幣化交易 PoC 後端（FastAPI）位址 | `http://127.0.0.1:8000` |
| `VITE_MAPBOX_TOKEN` | 疫情自動追溯頁 Mapbox 地圖的 access token（`pk.` 開頭公開 token） | （無，需自行填入） |
| `VITE_POLICY_API` | 政策報告（policy 綜合對話 + settings 政策報告分區）rag-agent 後端位址；未起則走 mock 示範 | `http://127.0.0.1:8100` |
| `VITE_GEMINI_API_KEY` | 數位員工（agent）頁 Gemini API key；未設定則退回劇本 mock，**選填**（亦可改在系統設定「數位員工」分區填入，免改檔免重啟） | （無，需自行填入） |
| `VITE_DISPATCH_API` | 短時微氣候派工後端位址（協作中，port 分配見 `docs/collab/README.md`） | `http://127.0.0.1:8200` |
| `VITE_EPIDEMIC_API` | 疫情自動追溯後端位址（協作中，同上） | `http://127.0.0.1:8300` |
| `VITE_ALERT_API` | 自動警報推播後端位址（協作中，同上） | `http://127.0.0.1:8400` |

`VITE_DISPATCH_API`/`VITE_EPIDEMIC_API`/`VITE_ALERT_API` 為協作後端的 port 預留，
目前三頁 provider 仍為 mock、變數暫不被讀取；接 live 時 provider 依既有慣例讀取（比照 `policy.ts`）。

`VITE_CARBON_API` 服務若未啟動，碳權頁連線 chip 會轉紅並提示，不會讓整個 shell 崩潰；twin
頁不依賴任何環境變數（詳見下方「Live Demo 前置作業」）。`VITE_MAPBOX_TOKEN` 未設定時，疫情
頁地圖區會顯示提示卡、頁面其餘部分照常運作（優雅降級，不崩）；填入後地圖於執行時連網取磚。
`VITE_GEMINI_API_KEY` 未設定時數位員工頁自動退回劇本 mock，不影響 demo；此變數也可略過，改在
**系統設定「數位員工」分區**填 key（存 localStorage、覆寫 `.env`、免重啟即時生效，適合 demo 現場）。
**此 key 僅限本機使用，絕不可提交版控或部署到公開網址**（瀏覽器直接呼叫 Gemini API，key 會出現在
network 請求中；設定頁填入時同樣只存在本機瀏覽器，勿在共用電腦填入）。`.env` 已列入 `.gitignore`，變數不會進版控。

## Live Demo 前置作業

功能頁中，**碳權代幣化交易（carbon）** 與 **AI 政策輔助報告（policy）／系統設定的政策報告分區**
需要先啟動上游服務才能看到「真實資料」而非示範畫面；**數位員工（agent）** 的 Gemini live 態需要
自行填入 API key（選填，未設定不影響 demo）；twin 模組已原生內建，無需任何前置作業（見下）。

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

### AI 政策輔助報告（policy）／系統設定 · 政策報告分區

policy 頁的「綜合對話」與系統設定「政策報告」分區（模型管理、知識庫管理）接 **rag-agent** 後端
（`VITE_POLICY_API`，預設 `http://127.0.0.1:8100`）：綜合對話走 `/api/chat` 附引用回答、知識庫
管理列真實知識庫與上傳文件、模型管理測真實連線。**後端未啟動時全數優雅退回完整 mock 示範**——
知識庫呈五庫卡牆（帶 `MOCK` 標記）＋檢索策略／rerank／hybrid 互動、測試連線走示範驗證、綜合對話
以情報聯集回答，離線也能完整 demo。收件匣情報本就是 mock 展示，不受後端影響。rag-agent 的取得
與啟動請洽負責該後端的協作者。

### 數位員工（agent）

agent 頁預設走**劇本 mock**（無需任何前置作業，四條劇本可完整互動）；要看真實 Gemini
tool-calling，取得 API key（[Google AI Studio](https://aistudio.google.com/) 免費取得）後兩種填法擇一：
（a）填入 `.env` 的 `VITE_GEMINI_API_KEY` 後重啟 `npm run dev`；（b）**免改檔免重啟**——直接在系統
設定「數位員工」分區的「Gemini 連線」填 key 並儲存，標題列 chip 立即切成「GEMINI LIVE」（設定值
覆寫 `.env`）。同分區可選模型、按「測試連線」驗 key、或以「資料源模式＝強制劇本 MOCK」在有 key 時
仍展示確定性劇本。**此 key 僅限本機 demo 使用，絕不可提交版控、絕不可部署到公開網址**（瀏覽器直接
呼叫 API，key 會出現在 network 請求中；競賽若需公開部署，屆時應改走後端代理簽名，不應沿用本機直呼
架構）。碳權掛單工具在 `VITE_CARBON_API` 未啟動時會優雅退回示範回覆（訊息帶「示範」），不影響 live 對話本身。

### 2.5D 數位孿生（twin）

twin 模組已內建 LiDAR 引擎與真實 AIS/泊位資料，`npm run dev` 即可，無需額外服務。

## 鍵盤快捷鍵（簡報用）

| 按鍵 | 動作 |
|---|---|
| `0` | 回到 hero 戰情總覽 |
| `1`–`6` | 依序跳至 碳權／政策／孿生／派工／疫情／警報 六個功能頁 |
| `7` | 數位員工 |
| `8` | 系統設定 |
| `Enter` | 僅在 hero 頁生效：於封面（COVER）與戰情總覽（OVERVIEW）之間切換 |

## 瀏覽器需求

介面的玻璃質感（Liquid Glass 折射效果）**僅在 Chromium 系瀏覽器（Chrome／Edge）完整支援**，
簡報與 demo 請使用 Chromium 系瀏覽器開啟。其他瀏覽器會自動降級為磨砂玻璃效果，功能不受影響，
但視覺效果會打折扣。

## 簡報 Demo 影片錄製（可再生成）

競賽 PPT 的系統展示不做現場 demo，改用**預錄影片**呈現。整套錄影是 **Playwright 自動化腳本**，
不靠人工操作——**腳本即真相，任何頁面的介面／後端定案後，一行指令即可重錄該段**，畫面節奏每次一致。
> 這是刻意的設計：功能仍在開發中，先錄一版可排練的影片；哪一頁做好了就重錄哪一頁，不必重來。

### 一鍵重錄

```bash
npm run demo:record -- <scenario>
```

`<scenario>` 為以下九支之一（= 影片檔名）：

| scenario | 內容 | 資料態 | 依賴 |
|---|---|---|---|
| `hero-cover` | 封面 loop（波浪＋七 chips） | mock | 無 |
| `hero-overview` | Enter→戰情總覽儀表牆 | mock | 無 |
| `carbon` | 碳權發行→掛單→鏈上帳本 | **live** | PoC `:8000`/`:8545`（`make chain`＋`make api`） |
| `policy` | 情報生成報告→綜合對話引用 | mock | 上線後接 rag-agent `:8100` |
| `twin` | 2.5D 沙盤→未來 24hr 推演 | **live** | 無（原生自繪） |
| `dispatch` | 颱風情境→法規依據展開 | mock | 上線後接 dispatch provider |
| `epidemic` | 下鑽單船→模擬偵測紅級 | mock | Mapbox token＋連網 |
| `alert` | 兩發演練→手機紅色警報插播 | mock | Mapbox token＋連網 |
| `agent-finale` | 數位員工跨模組收官（真 Gemini） | **live** | Gemini key（`.env`）＋PoC `:8000`；`--take N` 多錄挑選 |

### 前置與產出

- 需 `ffmpeg`（`brew install ffmpeg`）與 Playwright 的 Chromium（`npx playwright install chromium`，`playwright` 已列 devDependency）。
- 錄製自起獨立 dev server（埠 `:5288`）＋ headed Chromium（真 GPU，twin WebGL／Mapbox 品質所需），**不動你的 `.env`、不佔用既有 `:5173`/`:8000`**。
- 影片輸出 `demo-videos/*.mp4`（1920×1080／H.264／無音軌）＋每支 payoff 停格 `demo-videos/stills/*.png`（PPT 備援用）。**`demo-videos/` 已 gitignore**——影片是可再生成的產物，不進版控；進版控的是**錄影腳本**（`scripts/demo/`）與**簡報腳本**（`docs/presentation/簡報腳本.md`）。

### 檔案結構

```
scripts/demo/
  ffmpeg.mjs        webm→mp4 轉檔／speed-ramp／抽停格 參數（純函式，有單元測試）
  cursor.mjs        合成游標（overlay 圓點＋點擊漣漪＋easing 軌跡）
  recorder.mjs      runner：起 dev server→headed 錄影→ffmpeg 後製→清理
  scenarios/*.mjs   每支影片一個劇本（分鏡＝進頁定場→互動→payoff 停格）
```

設計文件見 `docs/superpowers/specs/2026-07-12-ppt-presentation-demo-design.md`；
講稿／cue 表／逐段分鏡／重錄索引見 `docs/presentation/簡報腳本.md`。

## 頁面背景影片（集中式背景層）

全站背景影片由 `src/shell/backdrop.ts` 集中管理：依目前頁面的 `ScreenDef.bg` 切換單一共用 `<video>`，
缺 `bg` 的頁自動退回 `#harbor` 點雲。scrim 強度純 CSS 依 `body[data-mode]`（cover 輕 / ov 略暗 / doc 較重）；
影片本身另降亮度 `.75` + 透明度 `.8`（`tokens.css` 的 `#backdrop`）壓低存在感，退為氛圍不搶眼、doc 頁文字更清楚。

**替某頁加背景影片（一頁一次）：**

1. 準備 seamless loop 的 mp4（H.264、約 1620×1080、< 2MB），放到 `src/screens/<id>/<id>-bg.mp4`。
2. 抽 reduced-motion poster：`node scripts/backdrop-poster.mjs <id>`（產出同目錄 `<id>-poster.jpg`）。
3. 在 `src/shell/registry.ts` 該頁 import mp4/jpg 並在其 `ScreenDef` 填 `bg`/`poster`：
   ```ts
   import xxxBg from '../screens/<id>/<id>-bg.mp4';
   import xxxPoster from '../screens/<id>/<id>-poster.jpg';
   // …該頁 def 內：
   bg: xxxBg, poster: xxxPoster,
   ```
4. 支援頁：carbon / policy / dispatch / epidemic / alert / agent。**twin 不加**（原生 WebGL 自填畫面）。

## 協作者指南

> **協作流程與 PR 規範**（環境建置、改動範圍白名單、驗收指令、提交流程）見根目錄
> [CONTRIBUTING.md](CONTRIBUTING.md)；各模組後端的整合資訊（起服務、API 契約、port 分配）見
> [docs/collab/](docs/collab/README.md)。本章為技術規範細節，由上述文件引用。

左側 rail 底部的「系統設定」（`settings`）頁是 schema 驅動的設定框架：協作者要幫自己負責的
模組（twin／dispatch／epidemic／alert）新增或調整設定欄位，**不需要碰任何 UI 或渲染程式碼**，
只要編輯自己模組的 `src/screens/settings/sections/<模組>.ts`。本章同時是「新模組主頁面」PR 的
檢查基準（見第 4 節）。

### 1. 新增／刪除設定欄位

每個模組一個檔案：`src/screens/settings/sections/<模組>.ts`，匯出一個 `SettingsSection`
（型別定義在 `src/screens/settings/schema.ts`）。一個 section 底下有多個 `SettingGroup`（卡片），
一個 group 底下有多個 `SettingField`（欄位）。

`SettingField` 是 8 種 kind 的 discriminated union：

| kind | 用途 | 必要屬性 | 常用可選屬性 |
|---|---|---|---|
| `text` | 單行文字輸入 | `key`、`label` | `placeholder`、`help`、`disabled` |
| `password` | 遮罩輸入；已存值只顯示尾四碼，按「更換」才重新輸入、「清除」需 confirm | `key`、`label` | `help`、`disabled` |
| `select` | 下拉選單，`options` 是函式（可回傳動態來源，如「已連線供應商的已啟用模型」聯集） | `key`、`label`、`options` | `help`、`disabled` |
| `toggle` | 開關 | `key`、`label` | `help`、`disabled`、`defaultOn` |
| `number` | 數字輸入 | `key`、`label` | `min`、`max`、`step`、`help`、`disabled` |
| `slider` | 滑桿 | `key`、`label`、`min`、`max` | `step`、`disabled` |
| `action` | 按鈕觸發非同步動作（如「測試連線」），`run` 回傳 `Promise<ActionResult>`，驅動 idle/執行中/成功/失敗四態 UI | `label`、`button`、`run` | `disabled`（**沒有 `key`**，不寫入 storage、不受下方重複 key 檢查） |
| `note` | 純文字提示，不參與讀寫 | `text` | — |

可複製範例（一個 `text` + 一個 `toggle`，示範兩種 `saveMode`）：

```ts
// src/screens/settings/sections/dispatch.ts
import type { SettingsSection } from '../schema';

export const dispatchSection: SettingsSection = {
  id: 'dispatch',
  label: '短時微氣候即時派工建議',
  color: '#F5A54A',
  status: () => '後端待接入',
  groups: [
    {
      title: '推論服務',
      saveMode: 'explicit', // 文字欄位群：改字 → 浮出「未儲存變更」列 → 按「儲存」才寫入 + 生效
      fields: [
        { kind: 'text', key: 'dispatch.inferenceEndpoint', label: 'ConvLSTM 推論端點', placeholder: 'https://...' },
      ],
    },
    {
      title: '通知',
      saveMode: 'instant', // toggle/select/slider：撥動當下即寫入 storage + 立即生效，無儲存鈕
      fields: [
        { kind: 'toggle', key: 'dispatch.autoNotify', label: '自動派工通知', defaultOn: true },
      ],
    },
  ],
};
```

`saveMode` 是 group 層級的屬性，同一個 group 不要混用 `instant`／`explicit`（toggle/select/slider
用 `instant`，text/password/number 這類需要「確認才送出」的欄位用 `explicit`）。`key` 是
storage 路徑，命名規則固定為 `<模組>.<欄位>`（如 `dispatch.autoNotify`），**全站所有 section
共用同一個扁平命名空間**，跨模組也不能重複。

寫完 section 後要在 `src/screens/settings/index.ts` 的 `SECTIONS` 陣列加入你的 import；
**刪除欄位＝從 `fields` 陣列刪掉那個物件**，刪整個 group／整個 section 同理刪對應物件／檔案
＋ `index.ts` 的 import 與陣列項。storage 是扁平 key→value，刪欄位後殘留的舊 key 不會報錯，
單純不再被讀取。

`key` 重複的提醒：`validateSections(SECTIONS)` 在 `index.ts` 的 `mount()` 執行一次，掃描所有
帶 `key` 的欄位（`action`／`note` 沒有 `key`，不列入檢查），一旦同一個 key 出現兩次就直接
`throw new Error('settings schema: duplicate key "..."')`——整個設定頁會在載入期掛掉，
方便在開發階段就抓到而不是流到 demo 現場。單元測試 `tests/settings-schema.test.ts` 涵蓋此行為。

### 2. 讀取設定值

跨頁讀寫走 `src/screens/settings/storage.ts` 這三個 API（單一 localStorage key
`imarine.settings.v1`）：

```ts
import { getSetting, setSetting, subscribe } from '../settings/storage';

getSetting('dispatch.autoNotify', true); // storage 有值就回，否則回傳第二參數 fallback
setSetting('dispatch.autoNotify', false); // 寫入 + 通知所有訂閱該 key 的 callback
const unsub = subscribe('dispatch.autoNotify', (v) => { /* … */ }); // 回傳取消訂閱函式
```

實例是 `policy.llmMode`（地端／雲端 LLM）在設定頁與 policy 頁之間的雙向同步
（`src/screens/policy/index.ts`）：policy 頁初始化讀 `getSetting('policy.llmMode', 'local')`，
使用者在 policy 頁切換 segmented 時 `setSetting('policy.llmMode', llm)` 回寫；同時
`subscribe('policy.llmMode', cb)` 監聽設定頁那邊的變更並跟著切換 segmented 樣式（用值比對
避免自己觸發自己造成的震盪）。重新整理頁面後兩邊都讀到同一份 storage，狀態不丟。

同檔的 `prefersReduced()` 是所有頁面「減少動態效果」判斷的唯一入口（設定頁覆寫優先，其次
`matchMedia('(prefers-reduced-motion: reduce)')`）——新頁面的 reduced-motion 分支一律呼叫
這個 helper，不要自己重寫 `matchMedia` 判斷。

### 3. mock → live

資料交換層的 provider 介面（`src/data/types.ts`）：

```ts
export type Source = 'live' | 'mock';
export interface Provider<T> {
  readonly source: Source;
  snapshot(): Promise<T>;
}
```

mock provider（`src/data/exchange/mock.ts` 的 `mockProvider(data)`）把靜態 JSON 包成
`Promise`；live provider（`src/data/exchange/carbon.ts` 的 `createCarbonProvider(base)`）
真的呼叫後端 API。**換接真後端只需要改 `src/data/exchange/` 底下對應模組的檔案**（把
`mockProvider(dispatchJson)` 換成一個實作 `Provider<DispatchSnapshot>` 的函式），screen
程式碼與 UI 完全不動——因為 screen 永遠只呼叫 `ctx.data.<模組>.snapshot()`，不在乎背後是
mock 還是 live。

policy 模組進一步示範 **live 優先、後端不在時退回 mock** 的雙態：`src/data/exchange/policy.ts`
的 provider 有 `chat()`／`knowledgeBases()` 等方法打 rag-agent，呼叫端以 `try/catch` 包裹，後端
不在時退回完整 mock 示範（`src/screens/settings/sections/policy-kb-mock.ts` 的 `mountMockKb()`）。
協作者的模組若想「後端未接時仍能離線 demo」，可比照這個 fallback 形狀。

設定頁 `action` 欄位的 `run()` 怎麼指到真端點，可參考 `src/screens/settings/sections/carbon.ts`
的 `testCarbon()`：真打 `fetch(base + '/health')`（帶 `AbortController` 逾時），**永遠 resolve
成 `ActionResult`、絕不 throw/reject**（成功與失敗都包進 `try/catch` 回傳 `{ok, message}`），
這樣 renderer 的 action 四態 UI（執行中 → 成功／失敗）才不會卡死。協作者的模組要接真的
「測試連線」時比照這個形狀寫。

**API key 只送不回**：mock 階段為了 demo 方便，key 是明文存在 localStorage（`password` 欄位
用 `tail4()` 只在畫面上顯示尾四碼，不代表儲存有遮罩）；真後端接上時，後端回傳的設定物件裡
**永遠是 masked key**（如 `sk-***abcd`），前端不應該把畫面上顯示的遮罩值當作真 key 再送出去。
這個介面形狀已經寫進 policy 模型管理的資料契約設計（見
`docs/superpowers/specs/2026-07-07-settings-page-design.md` §6.2 的 `PolicyBackendSettings`），
其他模組接後端時比照辦理。

### 4. 前端頁面設計規範（PR 檢查基準）

新增一個模組主頁面（如佔位頁轉正）或改動既有頁面時，以下四類是 review 的檢查基準。

**技術契約**：
- `Screen` 介面（`src/screens/types.ts`）三段生命週期：`mount(el, ctx)` 每個 screen 只呼叫
  一次（首次進入）；`show()` 每次切入呼叫（含首次，在 `mount` 之後）；`hide()` 切出呼叫，
  **DOM 保留、不銷毀**。
- 檔案結構固定 `src/screens/<id>/{index.ts, <id>.html, <id>.css}`。
- CSS 全部選擇器加 `#s-<id>` 前綴，避免跨頁樣式外漏（既有真實案例：policy 頁的 `.gbar` 曾被
  孿生模組未加前綴的同名規則污染，教訓見 `HANDOFF.md`）。
- canvas／尺寸依賴的重繪要綁在 `show()`，不要放在只跑一次的 `mount()`。
- 計時器／`setTimeout`／`requestAnimationFrame` 一律在 `hide()` 清除（實例：
  `src/screens/epidemic/index.ts` 的 `hide()` 清 `autoFlowTimer`／`pipeTimer`），避免離開頁面
  後背景還在跑、回來時重複觸發。
- reduced-motion 分支一律呼叫共用的 `prefersReduced()`（見第 2 節），不要自己重寫
  `matchMedia` 判斷。

**設計系統**：
- 元件一律用 Liquid Glass Kit（`src/ui/liquid-glass.css/js`），**不手寫 `backdrop-filter`**——
  折射效果由 Kit 的 JS 對帶 `data-lg` 的元素注入，自己寫的 `backdrop-filter` 會被蓋掉或製造
  不一致的降級行為。
- 小型／大量重複的元件用 `.lg-static`（輕量玻璃降級，不即時折射）。
- 儀表／統計類元件的原則是「玻璃容器 + 實心內容」，不要整塊都做成半透明。
- design tokens：底色 `#070b11`、主色 `--lg-accent:#35E0A6`、金 `#E9BC63`、資訊藍 `#38BDF8`、
  警示玫紅 `#F0648C`；髮絲線 `rgba(255,255,255,.1)`；字體 Inter／Noto Sans TC + Geist Mono。
- 各模組輔助色（`src/shell/registry.ts` 的 `color` 欄位）：碳權金 `#E9BC63`、政策青 `#38BDF8`、
  孿生藍 `#7FB4FF`、派工琥珀 `#F5A54A`、疫情玫紅 `#F0648C`、警報橘紅 `#FF7A59`、系統設定
  銀灰 `#9FB0C0`。**使用限制**：這些顏色只用在 rail active 光條、`screenHeader()` 的 eyebrow
  圓點、徽章（badge/chip）這三處，不要拿去做大面積填色或當作內文強調色。

**版面節奏**：
- eyebrow 標頭用 `screenHeader()`（`src/ui/components.ts`）→ 標題列（`badges` 技術徽章 +
  `source`/`sourceLabel` 資料源 chip，未給 `source` 則不顯示，policy／settings 頁是特例不顯示）
  → KPI 統計列用 `statRow()` → 主視覺（左欄 ~62%）+ 右欄卡片；進場用 stagger（`--d` 延遲變數）。
- 背景兩態：空間型頁（hero／twin／dispatch／epidemic）背景亮；文件型頁（carbon／policy／
  settings）用 `data-mode="doc"` 罩幕壓暗——新頁面依內容密度（展演型 vs 表單密集型）挑一種。

**內容原則**：
- mock 頁不是空殼——用報告書 v6 的參考數字做完整假資料版面，之後只把 provider 從 mock 換
  live，UI 不用重做。
- schema／資料型別要跟後端契約走，**不要憑空臆造欄位**；佔位分區（disabled + badge）先畫出
  合理的欄位骨架即可，實際欄位定案要等協作者的後端需求確定。

**新模組頁面 PR 自查清單**：

- [ ] `Screen.mount()` 只做一次性初始化，`show()`/`hide()` 各司其職，`hide()` 後 DOM 未被銷毀
- [ ] 檔案結構為 `src/screens/<id>/{index.ts,<id>.html,<id>.css}`
- [ ] CSS 選擇器全部加 `#s-<id>` 前綴，無外漏規則
- [ ] canvas／尺寸相關重繪綁在 `show()`，不是 `mount()`
- [ ] 所有計時器／rAF 在 `hide()` 清除
- [ ] reduced-motion 分支呼叫 `prefersReduced()`，未自行重寫 `matchMedia`
- [ ] 沒有手寫 `backdrop-filter`，玻璃元件皆出自 Liquid Glass Kit
- [ ] 小型/重複元件用了 `.lg-static`
- [ ] 用了 design tokens（色票/字體），未混入非表列顏色
- [ ] 模組輔助色只用在 rail active／eyebrow 圓點／徽章，未大面積填色
- [ ] 頁面節奏為 eyebrow → 標題列 → KPI → 主視覺+右欄，背景模式（亮/`doc`）選擇有理由
- [ ] mock 資料為完整假資料版面，不是空殼；欄位/型別沒有臆造，跟後端契約一致
- [ ] 新增的設定欄位（若有）key 命名為 `<模組>.<欄位>`，未與既有 key 衝突
- [ ] `npx tsc --noEmit` / `npx vitest run` / `npm run build` 三者皆綠燈
