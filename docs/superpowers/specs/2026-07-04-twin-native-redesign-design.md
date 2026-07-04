# Twin 頁原生化改版設計（LiDAR 整包搬入 + 雙分頁戰情室）

日期：2026-07-04
狀態：已與使用者逐項定案（brainstorm + 互動 mockup v4 驗證通過）
視覺基準：`docs/preview/preview-twin-redesign.html`（自含 Kit，瀏覽器直接開；
artifact 同步版 https://claude.ai/code/artifact/7ce2a5b8-afee-47be-800a-0b6b2982d7f3 ）

---

## 1. 背景與動機

現行 twin screen（Task 8 產物）以 `<iframe>` 嵌入 LiDAR repo 的 kaohsiung-port 範例頁，
存在兩個根本問題：

1. **demo 依賴第二個 server**：必須先到 `~/Desktop/LiDAR` 起 `npm run dev -- --port 5174`，
   否則整頁降級成 OFFLINE 提示卡。
2. **兩套 UI 堆疊**：LiDAR 範例自帶完整戰情室 overlay（navbar/左右 rail/播放列），與本 repo
   疊上去的四張沙盤浮動面板互相重疊打架，版面不可控。

本改版把 LiDAR 的引擎與場景**整包搬進本 repo 成為原生模組**（比照 Carbon 自 PoC 搬入的先例），
刪除 iframe，UI 重新設計為「雙分頁戰情室」。

## 2. 目標與非目標

**目標**
- `npm run dev` 單一指令，`#/twin` 冷啟動直接渲染真實 3D 港區（不依賴任何外部 server）。
- 一條時間軸、兩個分頁：「即時回放」（過去 24hr 真實 AIS）與「未來推演」（沙盤 mock）。
- 只有右 rail 一條面板欄；3D 場景最大化。
- 納入案例調研的三項功能：航跡密度圖層、點船資訊 chip、視角預設。

**非目標**
- 不修改上游 `~/Desktop/LiDAR` repo 的任何檔案（唯讀複製）。
- 不做事件半徑查詢（與疫情模組故事重疊）、ML 船位預測、CFD 擴散模擬（簡報「未來方向」）。
- 不動其他六個 screen 與 shell 骨架既有行為。
- 引擎與場景演算法程式碼**逐字搬、零改動**；只重寫「殼」（進入點、UI、生命週期膠合）。
  唯一允許的機械式修改：import 路徑改指到新位置。

## 3. 決策記錄

| 決策 | 內容 | 依據 |
|---|---|---|
| 搬移方式 | 方案 A：引擎 + 範例程式碼 + runtime 資料整包複製進本 repo | 使用者定案；方案 B（npm library）跨資料夾依賴脆、方案 C（iframe+postMessage）需改上游 |
| UI 組成 | 只有右 rail；無左 rail、無 float-tl 標頭、無 MOCKUP 註記 | 使用者定案（mockup v2 驗證） |
| 分頁 | 頁面級雙分頁「即時回放／未來推演」，右上角 pill bar；各分頁時間軸語意與右 rail 內容不同 | 使用者提出；與 Corpus Christi OPTICS 的 real-time/future state 三時間態同構 |
| 即時回放右 rail | 船型篩選（10 類）＋在港趨勢圖，僅此兩卡 | 使用者定案 |
| 未來推演右 rail | 船型篩選（共用）＋情境切換＋泊位甘特＋KPI（在港船數） | 使用者定案；篩選兩分頁共用為後補決策 |
| 時間軸 | 一條，貼底。回放＝真實錄製窗口（06/19 16:13 → 06/20 16:25，24.2hr）；推演＝NOW+0→+24h。皆含播放鈕與倍速 stepper（×1-×10） | 使用者定案 |
| 推演時場景 | 凍結在切換當下的回放時刻（未來無 AIS 資料，不假裝場景會動） | 設計呈現時同意 |
| 案例學習 | 納入 A 航跡密度圖層（MPA）、B 點船資訊 chip（OPTICS）、C 視角預設（OPTICS）；跳過 D 事件半徑查詢 | 使用者複選定案 |
| KPI 推演值 | 以真實 24hr 在港曲線為基底 × 情境係數，卡上標註「推演值」，不假裝是觀測值 | 設計呈現時同意 |

調研出處（簡報可引用）：Port of Corpus Christi OPTICS（ArcGIS+Unity，"single pane of
glass"，反應時間快 5-10%）；MPA Singapore Maritime Digital Twin（2025/03 啟用，
歷史回放＋what-if 模擬＋交通密度熱圖）。

## 4. 檔案結構

```
src/twin-engine/                  ← LiDAR repo src/ 整包唯讀複製
  index.ts  core/  emitters/  ramps/  scannables/  shaders/  env.d.ts
src/screens/twin/
  index.ts                        ← 重寫：Screen 契約膠合 + 分頁/面板/時間軸事件
  twin.html                       ← 重寫：viewbar + tabsbar + 右 rail 容器 + tline
  scene-init.ts                   ← LiDAR main.ts（404 行）改包成 initTwinScene(canvas)
  panels.ts                       ← 右 rail 面板渲染與更新（原 overlay.ts 職責重組）
  palette.ts  troika.d.ts         ← 逐字搬
  geo/    projection.ts tiles.ts                          ← 逐字搬
  scene/  portPoints shipModels layers textLabels orient
          portZones meshSampling meshTriangles viewCarving
          landmarks landmarkModels                        ← 逐字搬
  time/   ais-replay.ts occupancy.ts playback.ts          ← 逐字搬
  data/   ais.ts twport.ts join.ts osm.ts berthGeometry.ts ← 逐字搬（型別+join 邏輯）
  data/   （runtime 資料檔，見 §5）
```

- `twin-engine` 地位比照 `src/ui/liquid-glass.*`：vendored 唯讀副本，上游要改去 LiDAR repo 改。
- 搬入檔案的 import 路徑機械式調整（`../../src/index` → `../../twin-engine/index`），
  其餘內容逐字不動。
- `scene-init.ts` 的改包原則：main.ts 頂層執行的語句包進 `initTwinScene(canvas: HTMLCanvasElement)`
  函式體，演算法、常數、註解原樣保留；`document.getElementById('view')` 改收參數；
  `window.addEventListener('resize', ...)` 移出交給 index.ts 生命週期管理。回傳握把：

```ts
interface TwinScene {
  engine: LidarEngine;                    // start()/pause()/resize()/dispose()
  refresh(tMs: number): void;             // 回放 scrub（含 updateShips + 在港數）
  setFilter(enabled: Set<ShipCategory>): void;
  setDensity(on: boolean): void;          // 航跡密度圖層顯示/隱藏
  flyTo(preset: 'all' | 'pier' | 'mouth'): void; // 視角預設 tween
  pickShipAt(clientX: number, clientY: number): ShipPickInfo | null;
  fromMs: number; toMs: number; nowMs: number; peakInPort: number;
  inPortAt(tMs: number, enabled?: Set<ShipCategory>): number;  // 篩選感知的在港數
  occupancy: BerthInterval[];             // 真實泊位佔用區間（供甘特）
}
```

- 原 main.ts 的 dev 工具（`__twin`、trace、markCranes、labelCranes）原樣保留（惰性掛
  window，無副作用）。原 overlay.ts 的 `reviveGlass` 折射喚醒手法如在本 shell 環境仍需要
  則搬入 panels.ts（找不到 `<link>` 時安全 no-op）；若 router 既有 attach 流程已足夠則不搬，
  以 Chromium 實測為準。

## 5. 依賴與資料搬移清單

**package.json 新增依賴**（版本跟上游 LiDAR package.json 對齊）：
- dependencies：`three@^0.171.0`、`three-mesh-bvh@^0.8.3`、`troika-three-text@^0.52.4`
  （上游放 devDependencies 但屬 runtime 依賴，本 repo 歸位到 dependencies）
- devDependencies：`@types/three@^0.171.0`

**runtime 資料檔**（自 `~/Desktop/LiDAR/examples/kaohsiung-port/data/` 複製到
`src/screens/twin/data/`，共約 11MB）：

| 檔案 | 大小 | 用途 |
|---|---|---|
| `ais-tracks/khh-2026-06-19.json` | 4.6MB | 443 艘船 × 24.2hr 真實航跡（**只搬這一天**，06-18 的 2.2hr 檔不搬） |
| `basemap-khh.jpg` + `basemap-khh.json` | 2.1MB | NLSC 航照底圖 + bounds |
| `ship-models/*.json`（11 檔） | 1.3MB | 各船種取樣點雲模型 |
| `osm-khh.json` | 260KB | 海岸線/碼頭/防波堤/錨地/儲槽幾何 |
| `snapshots/khh-2026-06-19.json` | 97KB | TWPort 靠泊+進港預報快照（甘特佔用來源） |
| `berths-khh.json` | 12KB | 72 筆泊位座標（provider 也共用） |
| `crane-orient.json` | 小 | 起重機朝向烘焙（圖層已註解停用，但 landmarkModels import 它，照搬） |
| `fonts/zones-subset.woff` | 12KB | 泊位標籤字型 |

**不搬**：`models/`（423MB GLB 原始素材，離線管線用）、所有 `fetch-*.ts`/`record-*.ts`/
`probe-*.ts` 資料抓取腳本、`land-sea-boundary.json`（僅離線工具用）、LiDAR 的
`ui/liquid-glass.css/js`（用 shell 既有 Kit）、`ui/overlay.ts`（職責由 panels.ts 重組）。

資料檔採上游同款 import 形式（JSON import、`import.meta.glob('./data/ais-tracks/khh-*.json')`、
`?url`、jpg import），本 repo 同為 Vite，相對路徑關係保持不變即可運作。twin chunk 由 router
既有的 `def.load()` 動態 import 懶載入，~8.5MB 資產只在進入 twin 頁時載一次。
**大型資料檔只允許被 `src/screens/twin/` 底下的模組 import**（保持懶載入邊界），
`src/data/exchange/` 等開機即載的模組不得靜態 import 它們（見 §10）。

## 6. 畫面組成

```
┌────────────────────────────────────────────────────┐
│[全港鳥瞰|碼頭近景|港嘴]              [即時回放|未來推演]│ ← viewbar（左上）/ tabsbar（右上）
│                                            ┌──────┐│
│                                            │右rail ││
│                LiDAR 3D（本頁直繪）           │      ││
│                                            └──────┘│
│ [×5][▶] ━━━━━●━━━━━ 時間軸 · 時鐘                    │ ← tline（貼底，左起 64px、右讓出 rail）
└────────────────────────────────────────────────────┘
```

**共用元素**
- `viewbar`：三顆視角預設 pill（見 §7C），active 互斥。
- `tabsbar`：兩顆分頁 pill，active 互斥，模組色 `#7FB4FF` 描邊。
- 右 rail：寬 300px，`top:74px; bottom:96px; right:22px`，卡片玻璃（`.panel .lg[data-lg]`），
  縱向可捲（隱藏卷軸）。
- 無 float-tl 標頭、無資料源 chip（時間軸 label 的「AIS 回放」字樣承擔資料源語意；
  若日後要加回小型 LIVE chip，掛 tabsbar 旁）。
- 船型篩選卡（兩分頁共用，rail 最上方）：10 類（貨櫃/油品/散雜/LNG/工作/軍艦/客運/遊艇/
  工程/其他，順序與顏色逐字對齊 `palette.ts`）兩欄排列，每列＝色點（圖例）+ 名稱 + 當前
  場景數量 + checkbox；卡底部「航跡密度圖層」開關列（§7A）。

**分頁行為對照**

| | 即時回放 | 未來推演 |
|---|---|---|
| 右 rail | 船型篩選、在港趨勢圖 | 船型篩選、情境切換、泊位甘特、KPI 在港船數 |
| 時間軸範圍 | `fromMs..toMs`（真實錄製窗口 24.2hr） | NOW+0 → +24h（step 0.5h 或連續分鐘） |
| 時鐘格式 | `MM/DD HH:mm`（fmtClock，台北時區） | `NOW +HH:MM` |
| 3D 場景 | `refresh(tMs)` 船位跟回放動 | 凍結在切換當下時刻（不再呼叫 refresh） |
| 播放/倍速 | ✓（`advancePerFrame` + stepper ×1-×10） | ✓（同機制，推進推演軸） |
| 點船 chip | ✓ | ✓（凍結場景上的船仍可點） |

**篩選連動範圍**（兩分頁皆生效）：3D 場景船隻（`updateShips` enabled set）、在港趨勢曲線、
KPI 在港船數基數、泊位甘特 bar 淡化（被濾掉船種的 bar → opacity ~0.12，不移除）。

**面板資料來源**
- 在港趨勢圖：`inPortAt` 沿回放窗口取樣 48 點（篩選感知），折線 + 面積填色 + 3-4 條淡格線
  + 回放時刻游標線（`#35E0A6`）+ 當前值讀數列。單一序列不設圖例。
- 情境切換：4 顆 `.scn` pill（油價 +10% / EUA +20% / 颱風偏移 50km / 基準情境），active
  互斥 + `ctx.ui.toast`（沿用現有文案「情境已套用／「…」重新推演未來 24 小時」）。
  情境係數（mock）：基準 1.00、油價 0.96、EUA 0.93、颱風 1.08。
- 泊位甘特：**真實資料**——`occupancy.ts` 的 `buildIntervals(snapshot.berthing + forecast)`
  的佔用區間映射到 0-24h 軌道（軸原點 = 快照 `capturedAtMs`）；顯示窗**資料驅動**：取
  「與 24h 窗重疊區間數」最大的連續 8 個泊位（本快照實測為 63-70、15 筆；原 mockup 寫死
  108-115 實查僅 3 軌有資料，故改動態，快照更新也不退化）；bar 色 = 該船船種色（TWPort
  `shipType` → `shipCategoryIndex`）；推演時刻現在線（`#35E0A6`）跟時間軸走；
  軸標 00/06/12/18/24。
- KPI 在港船數：`inPortAt((凍結時刻 + 推演偏移) mod 窗口, enabled) × 情境係數`，數字彈簧
  動畫（Kit `data-lg-value` 或 panels 內建 tween 擇一，以 Kit 優先）；卡上「推演值」tag 與
  說明文字（「以過去 24hr 真實在港曲線為基底，乘上『情境』係數推估；非即時觀測值」）。

## 7. 案例學習三功能規格

**A. 航跡密度圖層**（學 MPA 交通密度熱圖）
- 船型篩選卡底部開關列，預設關。
- 實作：把 443 條航跡各自沿 path 以固定間距取樣成點，全部塞進一個獨立 `PointCloud`
  （`persistence:'accumulate'`、低亮度單色暗青、additive 疊加下重疊處自然增亮＝密度視覺），
  `engine.addLayer` 掛進場景（不入 bloom 或入低強度群組），開關切 `visible`。
- 首次開啟時才建點（懶初始化），之後只切顯示。點數若逾百萬，取樣間距放寬到視覺可接受為止
  （實作時以 Chromium 幀率實測定值）。

**B. 點船資訊 chip**（學 OPTICS click-to-inspect）
- 沿用 main.ts 既有的 screen-space 最近船心點擊判定（28px 門檻），把原本
  `overlay.showVessel(大卡片)` 換成船邊輕量 chip：船名（TWPort join 有中文名用中文名，
  否則 AIS name）、船種色點+類別、狀態（靠泊·N 泊位/錨泊/航行中）、航速。
- 點空白處、拖時間軸、切視角、切分頁 → chip 收起。chip 為 `position:fixed` 單例 DOM，
  `pointer-events:none`。

**C. 視角預設**（學 OPTICS viewpoint jump）
- viewbar 三顆 pill：全港鳥瞰（初始 auto-frame 視角）/ 碼頭近景（框住 108-115 泊位群）/
  港嘴（框住航道入口）。
- 實作：tween `engine.camera3D.position` 與 `controls.target` 650ms easeInOut；
  `prefers-reduced-motion: reduce` 時直接跳定。tween 進行中使用者拖曳軌道相機則中止 tween。
- 三個錨點座標由泊位/航道世界座標推導，實作時在 Chromium 內調到構圖滿意為止（mockup 的
  構圖為準）。

## 8. 生命週期與 shell 整合

- `mount(el, ctx)`：注入 twin.html → `initTwinScene(canvas)` → panels 綁定 → 事件掛接 →
  `engine.start()`。router 快取式只 mount 一次。
- `hide()`：`engine.pause()`（切走停 rAF/GPU，比照 hero ovMap.stop 慣例）。
- `show()`：`engine.start()` + `engine.resize()`（涵蓋「切走→resize→切回」，同 Task 9/10
  定案手法）；另掛「本頁 `.active` 時才生效」的視窗 resize 監聽。
- registry 的 twin `mode` 維持 `'full'`（背景增亮；3D canvas 蓋在最上，背景點雲僅在
  載入瞬間可見，無妨）。
- 引擎 `keyboardPan:true`（方向鍵/空白/Ctrl 平移升降）與 shell 全域導覽鍵（`0-6`/`Enter`）
  互不衝突（鍵位不重疊；shell handler 已有 INPUT bail-out）。驗收時確認切到其他頁後
  方向鍵不影響 twin 相機（engine pause 中）。

## 9. 樣式隔離

- 不搬 LiDAR 的 Kit 副本；用 shell 既有 `src/ui/liquid-glass.css/js`。
- LiDAR `theme.css` 只挑需要的規則搬進 twin 專屬樣式，**所有 `:root` token 覆寫
  （`--lg-accent:#CBD5DF` 銀鉻等）一律改 scope 到 `#s-twin`**，不污染全站青綠主題。
  戰情室銀鉻語彙只在本頁生效。
- 新版面選擇器（viewbar/tabsbar/rail/chip/densrow/tline 修訂）與搬入的 theme 規則統一放
  twin 專屬檔 `src/screens/twin/twin.css`（由 index.ts import，比照 carbon.css 先例），
  不塞進 tokens.css；tokens.css 中淘汰的舊孿生選擇器（float-tl/float-r，經 grep 確認無
  他頁使用後）一併清掉。
- mockup 的手寫 chip 樣式（`backdrop-filter:blur(6px)`）違反「不手寫 backdrop-filter」鐵則，
  正式版 chip 改用 Kit 玻璃或 `lg-static` 實作。

## 10. 資料交換層

- `createTwinProvider` 簡化：移除 `url` 欄位與 `VITE_TWIN_URL` env（iframe 廢除）；
  不再 fetch `public/data/berths-khh.json`。`berths-khh.json`（12KB）可靜態 import（進主
  bundle 無妨）；航跡檔（4.6MB）**只准動態 `import()`**——`snapshot()` 被呼叫時才懶載入
  取 `meta`/`ships.length` 得出 `trackCount`（443），確保開機主 bundle 不被拖肥。
- `public/data/berths-khh.json` 移除（資料已隨 twin chunk 打包）。
- `main.ts`：`createTwinProvider()` 呼叫處同步簡化；`.env.example` 拿掉 `VITE_TWIN_URL`。
- `tests/twin-provider.test.ts` 改寫：不再 stub fetch，驗證 snapshot 形狀（berths 72 筆
  映射 `{id,name}`、trackCount>0）與 `source:'live'`。

## 11. 刪除清單

- twin.html 的 `<iframe id="twinFrame">`、OFFLINE 降級卡、`fetch no-cors` 埠探測邏輯。
- 舊四張沙盤浮動面板（Pareto 候選方案卡整組拿掉；KPI 等候/碳排正弦公式退役——在港船數
  KPI 為新規格；甘特改真實資料；情境切換移到右 rail）。
- `ctx.background.setTwinOffset` 呼叫（3D 常駐後背景點雲不可見；`background.ts` 本身不動，
  該 API 留給未來）。
- README 的「twin live 前置：LiDAR repo 起 server」段落改寫為「twin 已原生內建，無前置」。
- CLAUDE.md §2/§3 與 HANDOFF 的 twin 描述隨實作更新（LiDAR 上游仍唯讀，但關係從「嵌入」
  變「已複製 vendored」）。

## 12. 錯誤處理

- basemap 貼圖載入失敗 → 隱藏底圖平面（上游既有行為，保留）。
- 標籤字型載入失敗 → 隱藏泊位標籤（上游既有行為，保留）。
- WebGL 建立失敗 → `initTwinScene` throw；`mount` 不 catch，交給 router Fix 4 的
  try/catch 復原導覽（demo 機為 Chromium，屬極端情境）。
- AIS/快照 JSON 為打包資產，不存在網路失敗路徑。

## 13. 測試與驗收標準

**自動化**：`npx tsc --noEmit` 0 errors；`npx vitest run` 全綠（twin-provider 測試改寫）；
`npm run build` 成功。

**Chromium 實測**（LiDAR dev server 全程不啟動、埠 5174 淨空）：
1. 冷啟動 `#/twin`：真實 3D 港區直接渲染（航照底圖、泊位標籤、船舶點雲模型）。
2. 即時回放：拖曳/播放/倍速正確；船位跟動；趨勢游標同步；點船 chip 正確顯示與收起；
   10 類篩選同步過濾場景與趨勢；密度圖層開關生效且幀率可接受。
3. 三顆視角預設平滑運鏡；`prefers-reduced-motion` 直接跳定。
4. 未來推演：時間軸換語意、場景凍結、甘特（真實區間+現在線+篩選淡化）、KPI（彈簧+情境
   係數+toast）皆正確；切回即時回放狀態保留。
5. 「切走→resize→切回」畫面尺寸正確；切走後 `engine.pause` 生效（GPU 不空轉）；
   鍵盤 `0-6`/`Enter` 導覽不受影響。
6. 全站其他六頁行為不變；console 全程零錯誤。

## 14. 風險與備註

- **repo 尺寸**：+~8.5MB 資料進 git（一次性）；build 產物 twin chunk ~9-10MB（含引擎與
  three），僅本地 demo 用，可接受。
- **效能**：shipPC 容量 1.5M 點 + 密度圖層新增點雲，16:9 大螢幕 demo 機（Chromium）需
  實測幀率；密度層取樣間距為調節閥。
- **Kit 玻璃與 WebGL canvas 疊合**：右 rail 玻璃折射取樣自 canvas 之上的 DOM 背景，
  LiDAR 範例已驗證同構場景可行（其 overlay 即疊在 WebGL canvas 上）；若遇折射空白，
  panels.ts 保有 reviveGlass 後手。
- demo checklist 更新：twin 不再需要開機前置，carbon 仍需 PoC `make chain`+`make api`。
