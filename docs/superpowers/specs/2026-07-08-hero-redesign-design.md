# Hero 頁重構設計（影片底圖 + 封面/總覽兩段全面重做）

日期：2026-07-08
狀態：設計定案（brainstorming + visual companion 三輪選型完成）
基準：封面/總覽 mockup 見 `.superpowers/brainstorm/45532-1783482130/content/`（cover-layout.html 選 C、overview-layout.html 選 C、video-grade.html 選 A）

## 1. 動機與定位

hero 頁是競賽 PPT 開場 + 現場 demo 的門面。現行封面/總覽的底圖是 `background.ts` 全站點雲 canvas（程式繪製假資料），2026-07-03 shell spec 即註記「實作版可換成孿生錄製影片或降級靜態圖」。本案把 hero 頁底圖換成使用者提供的抽象波浪 loop 影片，並依網路調研（defense/maritime tech hero、AAA title screen、IOC 戰情室、兩段式轉場 choreography）重做封面與總覽兩段版面。

hero 之外的頁面一律不動；全站點雲 `background.ts` 不動（其餘空間型頁仍用，hero active 時被影片蓋住）。

## 2. 已定案的決策

| 決策 | 選定 | 理由 / 淘汰方案 |
|---|---|---|
| 影片素材 | 使用者提供的 Mux 影片（抽象暗色霓虹波浪、橘→洋紅漸層、10.2s 無縫 loop） | 「無主體、無敘事、純氛圍」正是頂尖 SaaS（Linear/Kpler 路線）的背景動態共識；抽象動態比劣質港口實拍高級 |
| 影片取得 | 已自 HLS 下載重封為 MP4 自架進 repo | Mux 未開 MP4 靜態版本；hls.js 串流需連網+新依賴，自架離線可用最穩 |
| 色調 | A：保留原始暖橘，不調色 | hero 專屬記憶點、與 teal UI 冷暖對比；teal 版單一色相顯平、藍版少衝擊力。零轉檔工序、poster 一致 |
| 封面版面 | C：中置 + 六模組 chips | 保留「封面看得到六模組」的簡報動線；大入口卡降維成一排色點 chips。A 極簡中置（無模組資訊）、B 左下對齊（投影易被講台擋）淘汰 |
| 總覽版面 | C：模組儀表牆（3×2 大卡） | 簡報動線「總覽=六大功能目錄」最直白；A 現行結構刷新（保守）、B map-centric IOC（點雲地圖滿版放大顯假）淘汰 |
| 轉場 | 底圖不換、scrim 換；chips 淡出、卡片 stagger 進場 | 空間連續性=記憶點（調研主流做法）；FLIP morph 動畫 YAGNI 不做 |
| 地圖/KPI 卡/週趨勢 | 全部移除（`ovmap.ts` 刪檔） | 總覽 C 版面不含地圖；KPI 縮成標題列一行 mono 小字 |
| attract 模式（閒置退回封面） | 不做 | 競賽是講者控場非無人展台，YAGNI |
| 文案 | 沿用現行（kicker/大標/副標/署名行） | 使用者於 mockup C 確認 |

## 3. 版面規格

### 3.1 封面（COVER）

垂直構圖（全部中置、置中對齊）：

```
[影片滿版底圖 + 淺罩幕]
        kicker  iMARINE ECOSYSTEM · PORT OF KAOHSIUNG（全大寫、letter-spacing .3em+、55% 白）
        大標    永續智能航港生態系（字級 ≥ 螢幕高 8-10%，1080p 約 88-100px、白、粗體）
        副標    碳權交易 × AI 政策決策 × 數位孿生 × 第一線作業安全（一行、60%+ 白）
        chips   六模組 chips 一排（色點 + 模組短名，可點跳頁）
        CTA     [ENTER] kbd 樣式 chip（低頻呼吸脈動）＋「進入戰情總覽」
        署名    交通部航港局 · 第 6 屆航港大數據創意應用競賽（35% 白、最小字）
```

- 六 chips：`registry` 的 `SCREENS.slice(1)` 動態生成（色點吃 `def.color`、文字 `def.short`），`[data-go]` 委派點擊跳頁（沿用現行手法）。原六張大入口卡與 `TECH_TAG` 對照表刪除。
- 現行的 `#toOverview` CTA 按鈕語意保留（點擊= Enter），改為 kbd chip 樣式。
- 進場動畫：kicker → 大標 → 副標 → chips → CTA 依序 stagger fade-up（位移 8-16px、每組錯 80-120ms）；文字進場後永遠靜止，畫面唯一恆動的是影片。
- 罩幕（cover 態）：上下漸層淺罩（文字落點加重），大標區對比以最亮幀為準。

### 3.2 總覽（OVERVIEW）

```
[同一影片持續播放 + 深罩幕 rgba(7,11,17,.7) 級]
.swrap 版心（讓開 rail）
  標題列  高雄港即時生態快照 ＋ LIVE chip ＋ spacer ＋ KPI 一行 mono 小字
          （128 艘 · 47/62 席 · 3.4 hr · 4,820 t）
  主體    六模組大卡 3×2 grid 填滿剩餘高度
          每卡：色點＋模組名（上）／關鍵數字大 mono（中）／迷你趨勢條（下）
          點擊跳該功能頁（[data-go]）
```

- 移除：四張 KPI statRow 卡、`ovMap` 迷你地圖（`ovmap.ts` 整檔刪）、近 7 日 bar chart。
- 玻璃紀律：六卡全部 `lg-static`（大量重複元件照 Kit 規範；同時避免影片逼 backdrop-filter 每幀重算）。標題列如需玻璃元件同樣從簡。
- 迷你趨勢條：純 CSS/inline SVG 輕量呈現（漸層條或 sparkline），資料吃 `modules[].trend`。
- 字級底線（16:9 大螢幕簡報）：關鍵數字 ≥ 48px、任何文字 ≥ 22px（1080p）、次要文字不低於 60% 白。

### 3.3 轉場 choreography

- Enter（或 CTA 點擊）：封面文字群 200-300ms 上移淡出（退場快）→ 罩幕 250ms 壓暗 → 標題列、六卡 stagger 進場（每張錯 80ms、進場慢），總長 ≤ 1.2s。
- 反向（總覽 → 封面）：對稱、可較快。
- 跨段錨點：封面 chips 與總覽六卡同色點同順序（chips 淡出、卡片原節奏進場，不做 FLIP morph）。
- 既有行為不動：`Enter` toggle（`hero:toggle` 事件）、`0` 回總覽、CTA 單向 cover→ov、切出再切回保留總覽態（`show()` 的 `queueMicrotask` setMode 修正照舊）、`body[data-hero]` 屬性機制照舊。

## 4. 影片底圖機制

- 資產：`src/screens/hero/hero-bg.mp4`（自 Mux HLS 重封，H.264 High yuv420p、1620×1080@30、10.18s、306 幀、約 1.4MB；首尾幀 PSNR 45.5dB 無縫 loop 已驗證）＋ `hero-poster.jpg`（ffmpeg 抽首幀）。Vite asset import（`?url`）。
- markup（`#s-hero` section 內、`.cover`/`.overview` 之下層）：

```html
<video class="herobg" autoplay muted loop playsinline
       poster="__POSTER__" preload="auto"
       disablepictureinpicture disableremoteplayback aria-hidden="true"></video>
<div class="heroscrim"></div>
```

- `object-fit: cover` 滿版（1620×1080 為 3:2，16:9 螢幕上下各裁約 10%，波浪主體在畫面中帶不受影響）。
- 罩幕：獨立 gradient overlay div，兩態由 `body[data-hero]` 切換（cover 淺罩 / ov 深罩），transition 250ms。**禁止**對 `<video>` 本身套 CSS filter/blend（破壞 Chromium hardware overlay path）。
- 生命週期：
  - `Screen.hide()` → `video.pause()`；`Screen.show()` → `play()`（`.play()` Promise 必須 catch，失敗時落 poster——poster 屬性本身即 fallback）。
  - `visibilitychange`：分頁隱藏 pause、可見且本頁 active 時 resume。
  - reduced-motion（讀共用 `prefersReduced()`）：不 autoplay、移除 autoplay 屬性、顯示 poster 靜態圖；進場動畫比照全站慣例直達終態。
- 音訊：素材無音軌（`-map 0:v:0` 重封時已只取視訊流）。

## 5. 資料契約（OverviewSnapshot）

- `modules[]` 每筆新增 `trend: number[]`（迷你趨勢條資料，固定長度 7）。
- `kpi` 保留 vessels/berthsUsed/berthsTotal/waitHr/co2T（標題列一行字用）；`vesselsDelta`/`waitDelta` 一行字不呈現，刪除。
- `sparks`、`weekly` 欄位刪除，`src/data/mock/overview.json` 同步改寫；`types.ts` 對齊。
- 比照前例：契約改動走 TDD，補/改 mock 契約測試（欄位存在性、modules 六筆與 registry id 對應、trend 長度）。

## 6. 檔案結構影響

| 檔案 | 動作 |
|---|---|
| `src/screens/hero/hero.html` | 重寫（video/scrim/封面/總覽新結構，佔位標記手法沿用） |
| `src/screens/hero/index.ts` | 重寫（chips/卡片生成、轉場、video 生命週期；刪 TECH_TAG、statRow/ovMap 相關） |
| `src/screens/hero/hero.css` | 新增（`#s-hero` 前綴，比照 alert/dispatch 前例） |
| `src/screens/hero/hero-bg.mp4`、`hero-poster.jpg` | 新增（資產） |
| `src/screens/hero/ovmap.ts` | 刪除 |
| `src/ui/tokens.css` | 清 hero 舊段（`.cover`/`.overview`/`.entry`/`.modcard`/`.mapbox` 等），須做跨頁洩漏補償檢查（前例：`.fchip .n`、`.gbar` 都曾中招） |
| `src/data/types.ts`、`src/data/mock/overview.json` | 契約改動（§5） |
| `tests/` | mock 契約測試更新/新增 |
| `src/shell/background.ts` | 不動 |

## 7. 驗收標準

1. 三綠燈：`npx tsc --noEmit` 0 errors、`npx vitest run` 全綠、`npm run build` 成功（確認 mp4 資產進 dist 且非 inline base64 巨檔）。
2. headless Chrome + CDP（SwiftShader flags、勿加 `--disable-gpu`）逐項：
   - 封面：影片播放中（currentTime 前進）、kicker/大標/副標/chips/CTA/署名渲染、stagger 進場、六 chips 點擊各自跳頁。
   - Enter 轉場：罩幕壓暗、封面退場、標題列+六卡 stagger 進場；反向切回；`0`/`Enter`/CTA 三路徑；切出 hero 再切回保留總覽態。
   - 六卡：色點/名稱/數值/趨勢條與 mock 一致、點擊跳頁。
   - 生命週期：切到別頁 `video.paused === true`、切回恢復播放；分頁隱藏暫停。
   - reduced-motion：影片不播、poster 顯示、版面完整非空白。
   - 8 頁全站迴歸 console 零 JS 例外。
3. demo 前真 Chrome 人工 click-through（影片質感、轉場手感、投影對比）。

## 8. 風險與注意

- 影片 3:2 裁切：超寬螢幕（如 21:9）裁切更多，demo 以 16:9 為準，不另做多比例適配。
- 首次載入 1.4MB 影片：本地 dev/dist 皆瞬時；若日後放上網路展示再考慮 preload 細調。
- 罩幕壓暗以「影片最亮幀」為對比基準；投影機吃對比，次要文字不低於 60% 白。
- 影片上方玻璃元件數量克制（`lg-static` 為主），若實測仍 jank，退而把卡片改半透明實色。
