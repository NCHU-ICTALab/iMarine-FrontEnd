# iMarine-FrontEnd

「永續智能航港生態系」前端整合層——2026 航港大數據創意應用競賽的簡報 + 現場 demo 用 shell。
Vite + vanilla TypeScript（不使用框架）打造，深色 Liquid Glass 設計語言，左側玻璃 icon rail
串接 7 個畫面：封面／戰情總覽（`hero`，兩段式）、碳權代幣化交易（`carbon`）、AI 政策輔助報告
（`policy`）、2.5D 數位孿生沙盤推演（`twin`）、短時微氣候即時派工（`dispatch`）、疫情自動追溯
（`epidemic`）、自動警報推播（`alert`）。

本專案是競賽用的展示殼層，非正式產品；`carbon`／`twin` 兩頁串接真實後端（live provider），其餘
四頁使用 mock 資料（`src/data/mock/*.json`）。

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

`.env` 內兩個變數：

| 變數 | 說明 | 預設值 |
|---|---|---|
| `VITE_CARBON_API` | 碳權代幣化交易 PoC 後端（FastAPI）位址 | `http://127.0.0.1:8000` |
| `VITE_TWIN_URL` | 數位孿生 LiDAR 範例頁位址（供 `twin` 頁 iframe 嵌入） | `http://localhost:5174/examples/kaohsiung-port/index.html` |

兩個服務若未啟動，對應頁面會自動降級（碳權頁連線 chip 轉紅並提示；孿生頁顯示提示卡、
背景點雲場景仍可見），不會讓整個 shell 崩潰。

## Live Demo 前置作業

以下兩個模組要看到「真實資料」而非降級畫面，需要先啟動對應的上游服務。這兩個 repo 皆為本專案
之外的獨立專案，本專案僅呼叫（carbon）或嵌入（twin），不修改其原始碼。

### 碳權代幣化交易（carbon）

在 **iMarine-Carbon-Tokenization-POC** repo 依序執行：

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
