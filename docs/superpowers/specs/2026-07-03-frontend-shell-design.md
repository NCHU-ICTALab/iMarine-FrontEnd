# iMarine-FrontEnd Shell 設計文件

日期：2026-07-03
狀態：已與使用者確認視覺基準（docs/preview/preview-v3.html），待實作
上游決策紀錄：`HANDOFF.md`

---

## 1. 目標與範圍

為「永續智能航港生態系」建立前端整合層（shell）：統一承載 6 大功能模組的 UI 與資料交換層。
用途是競賽 PPT 簡報與現場 demo。目標有二：

1. PPT 開場有 hero 封面、介紹各功能時有對應子頁，全部畫面可展示、可截圖。
2. 版面與介面契約先定好，之後各功能陸續上線時，只需「填入自己的 screen + 把 mock provider 換 live」，不再動 shell。

不在範圍：正式產品化、真實後端（碳權與孿生除外）、行動版最佳化（以 16:9 桌面簡報為準，僅做不壞版的保底）。

## 2. 技術棧與上游資產

- **Vite + vanilla TypeScript**，不用框架。與 Liquid Glass Kit（vanilla）及 LiDAR（Vite + TS）同源。
- UI 元件一律使用 **Liquid Glass Kit**（自 `~/Desktop/UI-ToolBox` 複製 `liquid-glass.css/js` 兩檔入 `src/ui/`）。遵守 Kit AI 規格書鐵則：不手寫 backdrop-filter、小型重複元件用 `lg-static`、儀表元件為玻璃容器 + 實心內容。
- 三個上游資產唯讀：Carbon PoC（呼叫其後端）、LiDAR（iframe 嵌入）、UI-ToolBox（複製兩檔）。
- 舊 React 原型 `介面/port-eco-dashboard` 已棄用。

## 3. 資訊架構與路由

7 個 screen，hash 路由（`#/hero`、`#/carbon`、`#/policy`、`#/twin`、`#/dispatch`、`#/epidemic`、`#/alert`）。

| # | id | 名稱 | 視角 | 模組色 | 資料 |
|---|----|------|------|--------|------|
| 0 | `hero` | 封面 + 戰情總覽（兩段式） | 全局 | `#35E0A6` | mock |
| 1 | `carbon` | 碳權代幣化交易 | 航港局 | `#E9BC63` | live |
| 2 | `policy` | AI 政策輔助報告 | 航港局 | `#38BDF8` | mock |
| 3 | `twin` | 2.5D 數位孿生沙盤推演 | 港務公司 | `#7FB4FF` | live |
| 4 | `dispatch` | 短時微氣候即時派工 | 港邊人員 | `#F5A54A` | mock |
| 5 | `epidemic` | 疫情自動追溯 | 港邊人員 | `#F0648C` | mock |
| 6 | `alert` | 自動警報推播 | 港邊人員 | `#FF7A59` | mock |

鍵盤快捷（簡報用）：`0` 總覽、`1`-`6` 對應功能頁、`Enter` 於 hero 切換封面/總覽。
初始載入讀取 hash 直接進入對應頁；無 hash 進入封面態。

## 4. Shell 架構

```
index.html
└─ src/main.ts            開機：背景、rail、router、鍵盤、LiquidGlass.init()
   ├─ shell/background.ts  背景系統（見 4.2）
   ├─ shell/rail.ts        左側玻璃 icon rail
   ├─ shell/router.ts      hash 路由 + screen 生命週期 + 進場動畫
   └─ screens/<id>/        每 screen 一資料夾，lazy import
```

### 4.1 左側 Rail

- 固定左側、垂直置中的玻璃膠囊（`class="lg" data-lg`），寬約 56px。
- 內容：頂部 logo（船形 icon）、分隔線、7 顆 icon 按鈕（`data-lg-tip` 顯示名稱）、active 態為模組色底 + 左側光條。
- hero 封面態時 rail 隱藏（translateX 滑出），進入其他任何狀態滑入。

### 4.2 背景系統（三層）

1. `#harbor` canvas：點雲高雄港氛圍場景（陸地/突堤/貨櫃場/移動船點）。實作版可換成孿生錄製影片或降級靜態圖。
2. `.glowfx`：品牌色光暈漸層（固定）。
3. `#veil` 罩幕：依 `body[data-mode]` 調整透明度——`cover` 0.16 / `ov` 0.28 / `doc` 0.82（碳權、政策）/ `full` 0.05（孿生）。

孿生 `full` 模式下背景增亮一檔、canvas 直繪泊位編號與焦點船標記；此為預覽的過渡呈現，實作版此頁直接以 LiDAR iframe 取代背景。

### 4.3 Screen 契約

```ts
// src/screens/types.ts
export interface ScreenCtx {
  data: DataExchange;                  // 見第 7 節
  ui: { toast(opts: ToastOpts): void; refresh(): void };  // 包 LiquidGlass
  setMode(m: Mode): void;              // hero 兩段式切換用
  background: { setTwinOffset(h: number): void; repaint(): void };  // 背景系統控制
}
export interface Screen {
  mount(el: HTMLElement, ctx: ScreenCtx): void | Promise<void>;  // 首次進入時呼叫一次
  show?(): void;   // 每次切入呼叫（含首次）
  hide?(): void;   // 切出呼叫；section DOM 保留不銷毀（twin iframe 因此不重載，見第 9 節）
}
```

（id、mode 等靜態描述放在 registry 的 `ScreenDef`，不在 Screen 實例上。）

- router 負責：切換 `.screen` 顯示、設定 `body[data-mode]`、rail active、雙 rAF 後加 `.entered` 觸發 stagger 進場、呼叫 `LiquidGlass.refresh()`。
- 各 screen 的 mode：hero 例外為動態（封面態 `cover`、總覽態 `ov`，由 hero 自行切換並回報 router）；carbon 與 policy 為 `doc`；twin 為 `full`；dispatch、epidemic、alert 為 `ov`。
- 新增模組 SOP：建 `src/screens/<id>/`、在 screens 註冊表加一筆（id、名稱、icon、模組色、mode）、rail 與 hero 入口自動生成。

## 5. 設計系統

### 5.1 Tokens（沿用 Carbon PoC 語言）

```
--lg-accent: #35E0A6        主色（青綠）
--bg: #070b11               底色
--gold: #E9BC63  --cyan: #38BDF8  --amber: #F5A54A  --rose: #F0648C  --flame: #FF7A59
--ink-90/60/50/40: 白色 92/62/50/40% 不透明度
--hair: rgba(255,255,255,.1)   髮絲線
字體：Inter / Noto Sans TC；數字與代碼 Geist Mono（tabular）
```

模組色只用於三處：rail active、eyebrow 圓點、該頁特定強調；不得作為大面積底色。

### 5.2 頁面節奏（每個功能頁共用）

1. eyebrow 標頭：模組色圓點 + mono 小字（`視角 · MODULE NN`）。
2. 標題列：h1 + 技術徽章 chip + 資料源 chip（live 綠 / mock 灰）+ 右側頁內動作。
3. KPI 統計列：4 張 `lg-stat`（屬性驅動彈簧數字 + spark）。
4. 主體：主視覺（左約 62%）+ 右欄卡片堆疊（38%）；孿生頁例外為全幅 + 浮動面板。
5. 進場：`.anim` stagger（`--d` 遞增 0.05s）。

### 5.3 共用元件（src/ui/components/）

`ScreenHeader`、`StatRow`、`DataSourceChip`、`Panel`、髮絲線表格樣式、`fchip` 篩選 chip、開發中佔位卡。全部以 Kit class 組合，不自創玻璃樣式。

## 6. 各 Screen 規格

以 `docs/preview/preview-v3.html` 為視覺與互動基準（原始碼 `preview-src-v3.html`），此處僅記關鍵行為。

### 6.0 hero（兩段式）

- 封面態：全幅場景 + kicker + 大標「永續智能航港生態系」+ 副標 + 六功能玻璃入口卡（hover 亮模組色框，點擊直達該頁）+「進入戰情總覽」CTA + 競賽署名行。無 KPI。
- 總覽態：KPI 列（進出港 128 / 在泊 47/62 / 等候 3.4hr −12% 改善（綠）/ 碳排 4,820t）+ 迷你港圖（陸地、突堤與泊位編號 108-113、航道、錨區、移動船點）+ 六模組即時狀態卡（點擊直達）+ 近 7 日進港 bar chart。
- `Enter` 或 CTA 切換兩態；封面→總覽時 rail 滑入、玻璃面板 stagger 進場。

### 6.1 carbon（一比一還原 PoC，硬性要求）

- 版面基準即 PoC `ui/index.html`：**操作邏輯與方式與原本完全一樣**。
- 標題列承載原 topbar 內容：品牌（eyebrow 顯示 iMarine SU Exchange）、`工作台/稽核` lg-tabs、鏈路連線 chip、批次發行上鏈鈕。
- 統計列：累計發行 SU / 總減碳噸數（金色）/ 已交易 / 已除役。
- 工作台：左篩選 rail（狀態含筆數、持有者、船舶下拉、清除篩選、顯示 x/y 筆）+ SU 資產工具列（筆數、排序、單筆發行）+ 三欄代幣卡片牆（金色大值、狀態 pill、SU #n · IMO、持有者/用途/dataHash）。
- 稽核：船舶減碳排行 bar chart + SU 帳本全表（含逐筆驗證鈕）。
- 重構方式：搬 markup/CSS/JS 入 `screens/carbon/`，僅移除 fixed topbar 與 body 背景；對後端（FastAPI :8000）的呼叫與各 modal 流程原封不動，經 carbon provider 轉發。

### 6.2 policy

- 議題輸入列（label + 議題文字 + 重新生成鈕）。生成：報告 blur 1.4s + 完成 toast（mock，不接 LLM）。
- 報告五段：背景/國際案例/量化參考/政策選項/建議草稿；量化數字掛引用 chip，hover 高亮右欄對應來源列。
- 右欄：Grounding 環形儀表（93%）+ 引用來源清單（編號、名稱、可信度分級、日期）。

### 6.3 twin

- MVP：iframe 嵌入 LiDAR kaohsiung-port 範例（其 overlay UI 本就是 liquid-glass）；shell 提供浮動標頭（模組名 + PPO + Pareto Front 徽章 + LIVE chip）。
- 浮動右欄（可滾動、隱藏卷軸）：Pareto 候選方案（#2 採納）、KPI 方案 vs 基準（2x2）、泊位甘特（含 00-24 軸）、情境切換按鈕（點擊 → active + 「重新推演」toast）。
- 底部 24hr 時間軸滑桿：更新 `NOW +HH:MM` 與 KPI 數字（彈簧動畫）；預覽版並連動船位偏移。

### 6.4 dispatch

- 主視覺：降雨機率網格 canvas，含海岸線/陸地帶/突堤地理脈絡，網格僅繪於海面；色階 綠→黃→橙→紅（圖例常駐）。
- 0-90 min 滑桿（步進 10）：連動熱區動畫 + 下方讀數（風速/降雨機率/等級，顏色隨風險）。
- 右欄：4 張差異化派工建議卡（左緣風險色條 + 建議 + 觸發理由 mono 小字）+ 風速預測折線圖。
- 標題列指標 chips：CSI/POD/FAR（tooltip 說明全名）。

### 6.5 epidemic

- 主視覺：過去 14 天停靠序列航跡 canvas（各港陸地點群、疫情港玫紅警戒圈、高雄琥珀圈、虛線航跡）。
- 下方停靠時序卡列（馬尼拉→香港（疫情通報 +2d，玫紅框）→基隆→高雄 108（在泊，琥珀框））。
- 右欄：風險評分環（72 橙級·限制登輪）+ 三因子 lg-meter 拆解（靠港天數/來源強度/距離因子）+ 來源強度 chips（WHO/CDC/媒體）+ 防護建議 + 參考案例（2022 新光輪）。

### 6.6 alert

- 統計列：今日推播/觸及人數/平均送達/待確認回報。
- 左：分類篩選 chips（全部/疫情/氣象/解除，實際過濾）+ 警報 feed（左緣嚴重度色條 + 標題 + 說明 + 時間）。
- 右：手機 mock（瀏海、時鐘、日期、細胞簡訊氣泡，舊訊息降透明度）+ 推播規則開關（lg-switch）。
- 「模擬推播」鈕：toast + 手機震動動畫 + 新簡訊插入（上限 3 則）。

## 7. 資料交換層（src/data/）

```ts
// types.ts
export type Source = 'live' | 'mock';
export interface Provider<TSnapshot> {
  readonly source: Source;
  snapshot(): Promise<TSnapshot>;          // 頁面主資料
  subscribe?(cb: (s: TSnapshot) => void): () => void;  // 之後接 live 更新用
}
export interface DataExchange {
  carbon: CarbonProvider;     // live：包 PoC FastAPI（stats、資產清單、發行/掛單/交易/除役、稽核表）
  twin: TwinProvider;         // live：包 LiDAR AIS 回放與泊位佔用快照（座標/時間戳沿用其 snapshot schema）
  overview: Provider<OverviewSnapshot>;    // mock（彙整各模組摘要）
  policy: Provider<PolicySnapshot>;        // mock
  dispatch: Provider<DispatchSnapshot>;    // mock
  epidemic: Provider<EpidemicSnapshot>;    // mock
  alert: Provider<AlertSnapshot>;          // mock
}
```

- 本期只實作 carbon 與 twin 為 live，其餘 provider 讀 `src/data/mock/*.json`（數字取自報告書與預覽基準）。
- UI 依 `provider.source` 顯示資料源 chip；之後換 live 只改 provider 內部，screen 不動。
- carbon provider 的 endpoint 走 `.env`（`VITE_CARBON_API`，預設 `http://localhost:8000`）；PoC 後端未啟動時 chip 轉紅 + 頁內顯示連線指引（沿用 PoC 的 health check 概念）。
- mock JSON 的欄位形狀 = 對應 live schema 的子集（含 id/timestamp/geo），確保未來可直接替換。

## 8. 專案結構

```
iMarine-FrontEnd/
├─ index.html  vite.config.ts  package.json  .env.example  .gitignore
├─ docs/
│  ├─ preview/                 已驗收之視覺基準（v3）
│  └─ superpowers/specs/       本文件
├─ public/assets/              hero 背景影片、靜態素材
└─ src/
   ├─ main.ts
   ├─ shell/   background.ts  rail.ts  router.ts
   ├─ ui/      liquid-glass.css  liquid-glass.js  components/  tokens.css
   ├─ data/    types.ts  exchange/(carbon.ts  twin.ts  mock.ts)  mock/*.json
   └─ screens/ hero/  carbon/  policy/  twin/  dispatch/  epidemic/  alert/
```

## 9. 效能與降級

- 折射僅 Chromium 完整支援；其他瀏覽器 Kit 自動降級磨砂。demo 機用 Chrome/Edge。
- `prefers-reduced-motion`：停用 stagger 與 canvas 動畫（改單幀重繪於狀態切換時）。
- 背景 canvas 單一 rAF 迴圈；迷你港圖僅在總覽態可見時繪製。
- 孿生 iframe 只在進入該頁時載入（lazy），離開時保留（避免重載）但暫停互動。
- hero 背景影片 `preload="metadata"`，低階裝置退為靜態圖 + glow。

## 10. 驗收標準

1. `npm run dev` 開啟後：封面 → Enter → 總覽 → 1-6 各頁全部可達且無 console error。
2. carbon 頁在 PoC 後端運行時完成一次「單筆發行 → 掛單 → 購買 → 除役」全流程，操作與原 PoC 無差異。
3. twin 頁 iframe 內可操作 LiDAR 場景（軌道、時間軸）。
4. 四個 mock 頁的互動（政策生成、派工滑桿、疫情因子、警報推播）與預覽 v3 行為一致。
5. 視覺與 `docs/preview/preview-v3.html` 逐頁對照無明顯回退。

## 11. 明確不做（YAGNI）

- 不做使用者登入/權限、不做多語系、不做手機版專屬版面。
- 不重寫 Carbon PoC 的內部邏輯、不將 LiDAR 改為 npm 套件深度整合（screen 契約已預留，未來可換）。
- policy/dispatch/epidemic/alert 不接真模型與真資料源（mock provider 佔位）。
