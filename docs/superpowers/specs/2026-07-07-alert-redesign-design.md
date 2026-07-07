# Alert 頁改版設計 — 自動警報推播（細胞簡訊）

> Brainstorming 定案（2026-07-07）。互動 preview `docs/preview/preview-alert-redesign.html`
> 已迭代至 v2 並經使用者驗收通過（headless CDP 43 斷言全過、console 零錯誤）；
> 該檔為視覺/互動基準，實作依本 spec + 基準檔走 SDD。
>
> Preview 過程抓到、實作時必須帶入的兩個坑：(1) 演練軌跡節點 state（done/run/wait）要映射到
> CSS class 才會亮；(2) **不可對 Mapbox marker 根元素設 `position`**——會蓋掉
> `.mapboxgl-marker{position:absolute}`，marker 落回文件流造成逐顆累積偏移。

---

## 1. 動機與定位

現有 alert 頁是六大功能中唯一仍為初版 mock 佔位的頁：KPI 列 + feed 六列 + 手機 mock + 三顆
switch，沒有地圖、沒有分級規則、沒有推播範圍與送達過程的呈現，資訊深度遠低於改版後的
policy/dispatch/epidemic。

改版定位：**獨立警報中心**——港區事件（來自疫情追溯、微氣候派工等模組）經分級規則引擎，
以 Cell Broadcast（細胞廣播，同台灣災防告警 PWS 技術）推播到港區人員與船舶。頁面回答三個
問題：發生了什麼（事件流）、廣播到哪裡（地圖覆蓋）、對方看到什麼（手機端）。

視線動線：左欄事件流 → 中央地圖覆蓋 → 右欄手機結果。模組色橘紅 `#FF7A59` 是全頁唯一
高飽和「會叫」的顏色，常態內容壓灰（引導性配色，同 epidemic 定案原則）。

### 內容規範

- 事件題材使用港區作業事件（雷擊、強風、強降雨、疫情、颱風），不引用真實具名事故。
- 5 秒可讀原則（NOC 大屏）：大數字、少散文，狀態用色彩與動態表達。
- 無 emoji。繁體中文 + 英文術語。

## 2. 決策紀錄

| # | 決策 | 選項 | 定案 |
|---|---|---|---|
| 1 | 頁面定位 | A 獨立警報中心 / B 全站出口管線敘事 | **A 為主**，事件卡帶來源模組色點吸收 B 的跨模組關係 |
| 2 | 主視覺地圖 | A Mapbox 真地圖 / B canvas 自繪示意 | **A Mapbox**（dark-v11，沿用 epidemic 的 `VITE_MAPBOX_TOKEN`） |
| 3 | 互動範圍 | 演練/分級切換器/下鑽/小料 | **做 1 演練 + 3 下鑽 + 4 小料（cell tooltip + Acknowledge）**；獨立分級切換器不做，分級差異由演練池兩發自然呈現 |
| 4 | 版面 | A 三分割 / B 地圖滿版浮動面板 / C 雙層鏈路帶 | **A 三分割戰情式**（左事件流 / 中大地圖 / 右欄） |
| 5 | 右欄瘦身 | 甲 狀態機併入下鑽 / 乙 三件全塞 / 丙 漏斗併入下鑽 | **甲**：右欄常駐＝手機 mock + 送達漏斗；分級軌跡（狀態機）進事件下鑽 |
| 6 | 分級文案 | 甲 純 PWS / 乙 港區三級+PWS 對映 / 丙 純自創 | **乙**：港區自訂三級為主標，卡上另帶 PWS 對映 + mono `CH` 碼徽章 |
| 7 | 演練池 | — | 池兩發（作業提示級雷擊 → 紅色警報級颱風頂格），池盡重置，同 epidemic 手法 |
| 8 | v2 修訂（preview 驗收回饋） | — | 無解釋性散文 + 引導性配色（見 §2.1） |

### 2.1 v2 修訂（使用者 preview 驗收回饋，已定案）

- **無解釋性散文**：事件卡摘要用資料片段（「泊位 108 · 評分 68 · 限制登輪」），不寫完整句；
  分級軌跡各節點文字數據化——規則命中「疫情風險 ≥ 60 · `68 / 60`」（閾值 mono）、發布
  「`CH 911 · +4.1s`」；手機簡訊維持 PWS 官方訊息結構（真實內容，非解釋文字）。
- **引導性配色**：橙級/紅級事件標題常態帶 severity 色，作業提示/解除壓灰；選中卡底色/邊框/
  光暈跟該事件 severity 色走（`color-mix`）；軌跡內級別名染 sev 色。
- **視線起點**：進頁自動選中最高風險事件（feed 首筆疫情橙級）——地圖圍欄 + cell 點亮 +
  手機橫幅 + 漏斗即刻就位；演練池重置後同樣回到此狀態（不留空地圖）。
- **手機初始態**：無選中情境已不存在（自動選中），紅色警報以外顯示「當前橫幅 + 前一則
  （壓暗）」雙層，畫面不留空黑。

### 分級體系（決策 6 展開）

| 港區級別 | 色 | PWS 對映 | CH 碼 | 手機呈現 |
|---|---|---|---|---|
| 紅色警報 | `--flame`（模組色系深紅橘） | 緊急警報 | `CH 4371` | 全螢幕強制插播 + 抖動 + 警報音 icon |
| 橙色警戒 | amber | 警訊通知 | `CH 911` | 通知橫幅（顯著） |
| 作業提示 | 中性亮 | 警訊通知 | `CH 911` | 通知橫幅（可滑掉） |
| 解除 | `--lg-accent` 綠 | 警訊通知 | `CH 919` | 一般通知 |

## 3. 版面

```
eyebrow 標頭（自動警報推播 · CELL BROADCAST）· 標題列 + [模擬事件] 鈕 + MOCK 資料源 chip
KPI 4 卡：今日發布 / 觸及（人員+船舶）/ 平均送達延遲（s）/ 送達率（%）
┌───────────┬──────────────────────────────┬───────────────┐
│ 事件流      │ Mapbox 高雄港 dark-v11          │ 手機 mock       │
│ ~0.9fr     │ ~2.6fr                        │ ~1fr           │
│ 篩選 chips  │ · 基地台 cell 8-10 個（六邊形示意）│ （PWS 訊息結構）  │
│ 6-7 則卡    │ · 選中事件圍欄 polygon           │ ──────────    │
│ sev 左色條  │ · 事件源 pulsing dot            │ 送達漏斗        │
│ 來源模組色點 │ · cell hover tooltip 送達數      │ 4 段階梯 bar    │
│ CH 徽章/Ack │                               │ （紅色警報雙行） │
└───────────┴──────────────────────────────┴───────────────┘
```

- 事件卡組成：sev 左緣色條、來源模組圓點（epidemic 玫紅 `#F0648C` / dispatch 琥珀 `#F5A54A` /
  氣象等其餘用中性）、標題、單行摘要、mono `CH` 徽章、時間、Acknowledge 鈕。
- 手機 mock：玻璃質感 + 瀏海 + 時鐘；簡訊照 PWS 訊息結構固定欄位順序：發布單位（航港局
  港勤中心）→ 事件 → 影響區域 → 應變指示 → 時間。
- 送達漏斗：**水平階梯 bar**（不用真漏斗圖）——觸發 → 發布 → 送達 → 已回報 四段，每段
  bar 右端標數字與轉換率；紅色警報事件顯示人員/船舶兩行並排。
- 背景模式 `doc`？否——本頁地圖為主視覺屬空間型頁，維持既有 `data-mode` 設定不變
  （現況 registry 定義為準，實作時不改 mode 語意）。

## 4. 資料契約 `AlertSnapshot`（`src/data/types.ts` 全面改寫）

```ts
export type AlertSev = 'red' | 'orange' | 'notice' | 'clear';

export interface AlertTrace {          // 分級軌跡（下鑽用）
  rule: string;                        // 命中規則，如「雷雨胞距港 < 10km」
  threshold: string;                   // 閾值描述
  pws: string;                         // PWS 對映名（緊急警報/警訊通知）
  ch: string;                          // 'CH 4371' 等
  publishSec: number;                  // 偵測到發布秒數
}

export interface AlertFunnel {         // 送達漏斗（一行）
  label: string;                       // '人員' | '船舶'
  triggered: number; published: number; delivered: number; acked: number;
}

export interface AlertEvent {
  id: string;
  cat: 'epi' | 'wx' | 'ok';           // 篩選分類（沿用）
  sev: AlertSev;
  source: 'epidemic' | 'dispatch' | 'weather' | 'system';  // 來源模組色點
  title: string; body: string; time: string;
  ch: string;                          // CH 徽章
  lngLat: [number, number];            // 事件源座標
  fence: [number, number][];           // 圍欄 polygon（geojson ring）
  cellsLit: string[];                  // 點亮的 cell id 清單
  funnels: AlertFunnel[];              // 1 行（一般）或 2 行（紅色警報）
  trace: AlertTrace;
  sms: { unit: string; event: string; area: string; action: string };  // PWS 結構
  acked: boolean;
}

export interface AlertCell { id: string; lngLat: [number, number]; delivered: number; }

export interface AlertSnapshot {
  kpi: { published: number; reachedPeople: number; reachedShips: number;
         avgSec: number; deliveryRate: number };
  cells: AlertCell[];                  // 基地台 8-10 個（高雄港真實座標）
  feed: AlertEvent[];                  // 初始 6-7 則
  drillPool: AlertEvent[];             // 演練池 2 發（完整欄位）
}
```

座標系沿用 epidemic worldmap 的 `[lng, lat]`（Mapbox 慣例）。mock JSON 數值逐字轉錄自
驗收通過的 preview，不在實作期臆造。

## 5. 可測純邏輯（TDD 單元）

- `src/screens/alert/funnel.ts`：`funnelRates(f: AlertFunnel)` → 各段相對前一段的轉換率 %
  （四捨五入到 1 位小數，除零回 0）；`sumDelivered(funnels)` → 各行 delivered 加總（標籤/KPI 用）；
  `FUNNEL_STEPS` 四段常數。漏斗「渲染」歸 index.ts，funnel.ts 只放純邏輯。
- mock 契約測試 `tests/alert-mock.test.ts`：feed/drillPool 每筆事件的 `cellsLit` id 都存在於
  `cells`、`sev` 與 `ch` 對映符合 §2 分級表、紅色警報事件 `funnels.length === 2`、
  `fence` ring 至少 3 點。

## 6. mock 劇本

### 初始 feed（6-7 則，改寫自現有 alert.json 題材）
疫情橙級（source: epidemic，橙色警戒 CH 911）、強降雨（dispatch，作業提示）、強風
（weather，橙色警戒）、雷擊警戒（weather，作業提示）、解除雷擊（clear CH 919）、解除疫情
黃級（clear）。其中 1-2 則預設 `acked: true` 展示兩種 Ack 狀態。

### 演練池（兩發，層級刻意拉開）
1. **雷擊警戒 ·（作業提示）**：雷雨胞接近港區西南 8km，油品裝卸區小圍欄、cellsLit 3 格、
   手機橫幅通知、觸及約 180 人（單行漏斗）。
2. **颱風海上陸上警報 ·（紅色警報，頂格高潮）**：全港區停止作業——全港大圍欄、cell 全亮
   stagger、波紋擴散、手機全螢幕強制插播 + 抖動 + 警報音 icon、雙漏斗（人員 2,400 /
   船舶 47）滾數字。
   池盡第三按重置（feed 移除演練插入項、地圖/漏斗/手機還原）。

## 7. 互動規格

### 7.1 點事件卡下鑽
- 地圖 `flyTo` 事件 `lngLat`，繪該事件 `fence`（模組色低 opacity 填色 + 呼吸描邊）與
  `cellsLit` 點亮態、事件源 pulsing dot。
- 右欄漏斗切換為該事件 `funnels`。
- 卡片原位展開「分級軌跡」：偵測 → 規則命中（rule/threshold）→ 分級（港區級 + PWS 對映）→
  發布（CH + publishSec），小節點流、當前節點發光；單卡互斥展開（同 dispatch 規則展開手法）。

### 7.2 模擬事件（標頭「模擬事件」鈕，池兩發）
每發全鏈路動畫 6-8 秒，依序：事件源 dot 出現脈動 → 分級軌跡節點流逐節亮（在新插入的卡內）→
地圖波紋擴散 + `cellsLit` 逐格 stagger 點亮（~100ms/格）→ 手機 mock 依 sev 呈現（橫幅或
全螢幕插播 + 抖動）→ 漏斗數字 count-up → 事件流頂端插入新卡（未讀樣式）。動畫期間鈕
disabled 防重入；`reduced-motion` 直達終態（卡插入、地圖終態、漏斗終值、手機終態，無過場）。

### 7.3 cell tooltip
hover 任一 cell → tooltip 顯示 cell id 與 `delivered` 送達數。

### 7.4 Acknowledge
事件卡 Ack 鈕：未確認＝sev 色脈動；點擊 → 靜止橘 + 「已確認」；已 acked 卡不再脈動。
純前端狀態（不落地）。

### 7.5 篩選 chips
沿用現有四類（全部/疫情/氣象/解除），過濾 feed（演練插入項也參與過濾）。

## 8. 配色與設計系統

- 模組色 `#FF7A59` 只用於：rail active、eyebrow 圓點、徽章、紅色警報高亮、地圖圍欄/波紋。
- severity 三階 + 綠（解除）+ 中性灰，不再增加色階；常態壓灰、警報發亮（引導性配色）。
- 元件一律 Liquid Glass Kit；小型重複元件（事件卡、cell tooltip）用 `lg-static`；
  不手寫 `backdrop-filter`。CSS 全部 `#s-alert` 前綴。
- 手機 mock 為「玻璃容器 + 實心內容」。

## 9. 檔案結構

```
src/screens/alert/
  index.ts          重寫（生命週期 mount/show/hide、下鑽、演練、Ack、篩選）
  alert.html        重寫（佔位標記手法同前例）
  alert.css         新增（#s-alert 前綴）
  broadcastmap.ts   新增（Mapbox 初始化、cell 層、圍欄層、波紋、flyTo、tooltip）
  funnel.ts         新增（純邏輯：funnelRates/sumDelivered/FUNNEL_STEPS；渲染歸 index.ts）
src/data/types.ts   AlertSnapshot 全面改寫
src/data/mock/alert.json  全面改寫（逐字轉錄自驗收 preview）
src/ui/tokens.css   刪 alert 舊佔位段（若有）
tests/alert-funnel.test.ts, tests/alert-mock.test.ts  新增
docs/preview/preview-alert-redesign.html  互動 mockup（token 佔位 __MAPBOX_TOKEN__）
```

Mapbox token 沿用 `.env` 的 `VITE_MAPBOX_TOKEN`（epidemic 已建立）；preview 檔進版控時
token 還原為佔位。取捨：Mapbox 磚需連網（與 epidemic 相同，demo 現場需備網路）。

## 10. 驗收標準

1. 三綠燈：`npx tsc --noEmit` 0 / `npx vitest run` 全綠（含新增測試）/ `npm run build` 成功。
2. 冷啟動 `#/alert`：KPI 4 卡、事件流 6-7 卡（sev 色條/來源色點/CH 徽章/Ack 態）、Mapbox
   canvas + cell 全繪、手機 mock、漏斗渲染正確。
3. 點事件下鑽：flyTo + 圍欄 + cellsLit + 漏斗切換 + 分級軌跡原位展開（互斥）。
4. 模擬事件兩發 + 第三按重置：全鏈路動畫依序、紅色警報全螢幕插播 + 雙漏斗、動畫中防重入。
5. cell hover tooltip、Ack 脈動→靜止、篩選四類（含演練插入項）。
6. `prefers-reduced-motion`：演練直達終態、下鑽無過場動畫、內容完整非空白。
7. 鍵盤迴歸：`0-7` 導覽正常；頁內若有輸入元素不劫持（既有 bail-out）。
8. 8 頁全站迴歸 console 零錯誤（headless Chrome + CDP，SwiftShader flags、勿加
   `--disable-gpu`）。
9. demo 前真 Chrome 人工 click-through（下鑽/演練/tooltip 手感）。

## 11. 非目標（YAGNI）

- 不接真實 CBS/PWS 發布 API；純 mock provider（`source:'mock'`）。
- 不做獨立 severity 切換器（決策 3）。
- 不做警報聲音播放（僅 icon 示意）。
- 不做推播規則 switch 的後端落地（規則展示為分級軌跡，舊三顆 switch 移除，
  規則設定歸系統設定頁 alert 分區未來擴充）。
- 不做歷史查詢/分頁/搜尋。
