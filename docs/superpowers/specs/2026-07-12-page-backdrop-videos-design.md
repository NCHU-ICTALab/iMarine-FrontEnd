# 設計：集中式背景影片層（per-page seamless backdrop video）

> 日期：2026-07-12　狀態：設計定案，待寫實作計畫
> 目標：把目前只有 hero 具備的「滿版 seamless loop 影片底圖」推廣到其餘功能頁，
> 讓每頁依其功能有量身的動態背景，且以單一集中機制承載（不再逐頁複製生命週期邏輯）。

---

## 1. 決策紀錄（brainstorming 定案）

| # | 問題 | 決定 | 理由 |
|---|---|---|---|
| 1 | 影片素材來源 | **使用者自行提供 mp4 檔**（比照 hero-bg.mp4） | 品質最高、最像 hero；本層只負責接線與整合 |
| 2 | 上哪些頁 | **carbon / policy / dispatch / epidemic / alert / agent 六頁**；twin 除外 | twin 已是原生 WebGL 2.5D 場景、自填畫面，背景影片會被完全蓋住 |
| 3 | 架構 | **集中式背景層**（shell 層單一 backdrop 元件，依 active screen 切 src），**hero 一併收編** | 生命週期/scrim/reduced-motion 只寫一份；避免 7 份重複邏輯；registry 驅動比照既有 color/mode/icon |
| 4 | scrim 明暗 | 依 `data-mode`：**doc 重 / ov 輕 / cover 更輕** | 沿用 hero 現行 `.heroscrim` 兩態哲學；doc 頁保住文字可讀性 |
| 5 | poster | 使用者只給 mp4，**poster 由 asset-prep 腳本抽幀**（開發者換 mp4 後手動跑一次、產物 commit） | 降低使用者負擔；demo 管線已有 ffmpeg |
| 6 | 漸進上線 | registry `bg` 缺檔 → **自動退回點雲 canvas** | 可先做好整套接線、逐頁測；素材到位一頁「亮」一頁 |

---

## 2. 現況（真相來源）

全站背景堆疊（`index.html` + `src/ui/tokens.css`）：

```
#harbor   (canvas, z-0)   共用點雲港口背景（background.ts，動態散點 + 船跡）
.glowfx   (z-1)           裝飾輝光
#veil     (z-2)           黑罩，opacity 依 data-mode：doc .82 / cover .16 / full .05 / ov 預設
main#screens (z-10)       各 screen 容器；.screen 為 absolute inset-0、玻璃卡片在透明底上
```

- 除 hero 外所有頁：透明底 → 露出 `#harbor` 點雲，`#veil` 依 mode 壓暗。
- **hero 是唯一例外**：在自己的 `.screen` 內塞 `<video class="herobg">`（screen-local z-0）+ `.heroscrim`（z-1），
  因為 `.screen` 在 z-10（`#veil` 之上），hero 的影片與 scrim 完全不受全域 `#veil` 影響 → 畫面亮。
  play/pause / visibilitychange / reduced-motion 生命週期全寫在 `src/screens/hero/index.ts`。

問題：要把這套推廣到六頁，若逐頁複製 hero 作法會產生 7 份幾乎相同的生命週期邏輯。

---

## 3. 目標架構

### 3.1 新增 shell 模組 `src/shell/backdrop.ts`

單一職責：管理一個全站共用的背景影片層，依目前 active screen 切換影片來源。
**scrim 強度不由本模組管**——見 3.3，交給純 CSS（`body[data-mode]`）自動反應。

**對外介面（草案，實作計畫再定稿）：**

```ts
export interface Backdrop {
  /** 切到某 screen：吃該 screen 的 bg（有則設 src + 播放 + 顯示；無則隱藏影片、露出點雲）。
      切 src 本身即停掉上一支，故無需獨立的 pause/resume 對外方法。 */
  setScreen(def: ScreenDef): void;
}

export function initBackdrop(video: HTMLVideoElement, scrim: HTMLElement): Backdrop;
```

集中處理（全部封在模組內部，不對外暴露）：
- 依 `def.bg` 切 `video.src`（缺 → `video` 隱藏、露出 `#harbor` 點雲 fallback）。
- reduced-motion（`prefersReduced()`）：不 autoplay、顯示 poster 靜態幀、`pause()`。
- **一個**全域 `visibilitychange` 監聽（取代 hero 原本各自寫的那份）：分頁隱藏 `pause()`；
  回前景且目前有 active bg 才 `safePlay()`。屬模組內部細節，不進對外介面。
- `safePlay()`：`video.play()` Promise 被拒時 catch（比照 hero 現行）。

> **設計要點**：原先草案的 `setMode()`/`pause()`/`resume()` 均已移除——`setMode` 由純 CSS 取代（3.3）；
> 單一共用 video 切 src 即停舊播新，切頁的暫停/恢復隱含在 `setScreen()` 內；分頁可見性由內部監聽自管。
> 對外介面收斂到只有 `setScreen(def)`，符合「單一職責、最小介面」。

### 3.2 registry 契約擴充（`src/shell/registry.ts`）

`ScreenDef` 新增：

```ts
bg?: string;      // seamless loop 影片 URL；缺 → 無背景影片，退回點雲 canvas
poster?: string;  // reduced-motion 靜態幀 URL；由 asset-prep 腳本預先抽好、進版控
```

- registry 以**靜態** import 取得 URL 字串（`import bgUrl from '../screens/<id>/<id>-bg.mp4'`）。
  Vite 對 `*.mp4` 的 import 回傳的是**資產 URL 字串**、不是影片 bytes——eager import 只解析 URL，
  瀏覽器要到 backdrop 把它設成 `video.src` 才會真的抓 bytes。這正是「只載 active 頁」的機制。
- 六頁（carbon/policy/dispatch/epidemic/alert/agent）填入各自 `bg`/`poster`。
- twin **不填** → 永遠露出點雲（其 WebGL 自填、無影響）。
- hero 亦改用 `bg`/`poster`（收編，見 3.4）。

### 3.3 DOM 與 z 堆疊（`index.html` + `tokens.css`）

在 `#veil` 之後、`#screens` 之前插入：

```html
<video id="backdrop" muted loop playsinline preload="auto" disablepictureinpicture
       disableremoteplayback aria-hidden="true"></video>
<div id="backdrop-scrim"></div>
```

新堆疊：

```
#harbor        (z-0)   點雲（無影片頁的 fallback）
.glowfx        (z-1)
#veil          (z-2)
#backdrop      (z-3)   背景影片（滿版 object-fit:cover）  ← 在 #veil 之上，不被全域黑罩壓暗
#backdrop-scrim(z-4)   自帶漸層，強度依 data-mode
main#screens   (z-10)  各 screen 內容（玻璃卡片壓在影片上）
```

> **z 堆疊註記**：影片頁的 `#backdrop`(z-3) 會蓋掉 `.glowfx`(z-1) 與 `#veil`(z-2)——即影片頁看不到
> 環境輝光、也不吃全域黑罩，這是預期（影片自成氛圍、由 backdrop-scrim 獨立控對比）。無影片頁（twin）
> `#backdrop` 隱藏，`.glowfx`/`#veil` 行為完全不變。

`#backdrop-scrim` 依 `data-mode` 給三態漸層（CSS 走 `body[data-mode="…"] #backdrop-scrim`）：
- `doc`：較重漸層（保住 carbon/policy/agent 文字可讀性）。
- `ov`：較輕（dispatch/epidemic/alert 背景亮、空間感）。
- `cover`：最輕（hero 封面電影感）。
- `full`（twin）：影片隱藏，scrim 不作用。

預設數值先給一組（比照 hero `.heroscrim` 的 `rgba(7,11,17,.5→.15→.62)` 系），之後逐頁可微調。

### 3.4 hero 收編

- 移除 `src/screens/hero/hero.html` 的 `<video class="herobg">` 與 `<div class="heroscrim">`。
- 移除 `src/screens/hero/index.ts` 內 video 的 import/play/pause/visibilitychange/safePlay/reduced-motion 段。
- hero 於 registry 填 `bg = hero-bg.mp4`、`poster = hero-poster.jpg`（既有資產沿用）。
- hero 兩段式（`data-hero=cover/ov`）的罩幕明暗：
  - cover/ov 皆屬 hero screen；集中 scrim 以 `data-mode`（cover / ov）驅動即可覆蓋現有觀感
    （現行 hero ov 態多壓一層 `.heroscrim::after rgba(...,.66)`，改由 `body[data-mode="ov"] #backdrop-scrim` 對應）。
  - 需保持：封面亮、進總覽後略暗——以集中 scrim 的 cover/ov 兩態達成。
- 驗收需確認 hero 兩段式切換、reduced-motion poster、切走暫停等現有行為零回歸。

### 3.5 接線點（只動 `src/main.ts`，**不改 router.ts 簽章**）

router.ts 現況（已核對）：每次成功切頁在 `go()` 尾端（router.ts:107）呼叫 `o.onChange(def)`，帶 `def`
（含 `bg`/`mode`），此時 `show()`/`applyMode()` 已跑完。既有 `onChange` 已用於 `rail.setActive(def.id)`。

- `main.ts`：`const backdrop = initBackdrop(#backdrop, #backdrop-scrim)`。
- 在既有 `onChange` callback 內加一行 `backdrop.setScreen(def)`——**零 router.ts 改動**，符合 CORE RULE 最小碰觸。
- scrim 強度不經 JS：純 CSS `body[data-mode]`（3.3）自動反應導覽切頁與 hero 封面↔總覽 toggle 兩種 data-mode 變更。
- **不得擾動** router.ts:100-102 的「`show()` 與 `applyMode()` 之間不可插 await」約束：`onChange` 在
  `applyMode()` 之後才觸發，`setScreen()` 為同步、不 await，天然滿足此約束。
- 導覽失敗回滾路徑（router.ts:62-74）不呼叫 `onChange`，故 backdrop 維持前一頁 bg，與畫面回滾一致，無需特別處理。

---

## 4. 資產契約（使用者提供）

| 項目 | 規格 |
|---|---|
| 格式 | mp4 / H.264 |
| 解析度 | 約 1620×1080（比照 hero），16:9 為準 |
| 迴圈 | seamless（無縫接點，首尾可對接） |
| 檔案大小 | 單支建議 < 2MB（六支合計控在合理首載量） |
| 放置 | `src/screens/<id>/<id>-bg.mp4`（沿用 hero 慣例） |
| poster | **不用提供**；由 asset-prep 腳本以 ffmpeg 抽幀存 `src/screens/<id>/<id>-poster.jpg` |

**poster 產生時機**（釐清，非 vite build 當下）：poster 是 registry 靜態 import 的對象，必須在 build 前
即以檔案存在。模型為——**開發者加/換某頁的 mp4 後，跑一次 asset-prep 腳本**（`scripts/` 下一支小工具，
比照 demo 管線 ffmpeg 用法），產出 `<id>-poster.jpg` 並 commit 進版控；之後 Vite 正常 import。
抽幀時間點取非 0（如 0.5s）以防某些 mp4 首幀是黑幀。

各頁功能主題（供使用者備素材參考，非強制）：
- carbon 碳權：帳本/代幣/金融流動意象（doc，會被較重 scrim 壓暗）
- policy 政策：文件/資訊流/知識庫意象（doc）
- dispatch 派工：天空/微氣候/雲雨動態（ov，空間感強）
- epidemic 疫情：擴散網絡/生物節點意象（ov）
- alert 警報：港區夜景/廣播波紋意象（ov，中央有 Mapbox 地圖，scrim 需兼顧地圖對比）
- agent 數位員工：資料流/神經網絡/科技感（doc）

**漸進上線**：`bg` 缺檔時該頁自動退回點雲 canvas，功能不受影響。可先合入整套接線，素材到位再逐頁補檔。

---

## 5. 邊界處理與既有不回歸

- **twin**：無 `bg` → 影片隱藏，`#harbor` 點雲照舊（其 WebGL 自填、視覺無影響）。
- **doc 頁可讀性**：`#backdrop-scrim` doc 態較重 + 玻璃卡片壓字；驗收須逐頁確認文字對比達標。
- **alert Mapbox**：中央地圖為互動主體，scrim 需保證地圖周邊對比；alert 若感過亮可個別加重該頁 scrim。
- **點雲 canvas**：保留為 fallback，`background.ts` 不動。
- **`#veil`**：非影片頁（twin）行為不變；影片頁因影片在 `#veil` 之上，`#veil` 對其不生效（改由 backdrop-scrim 管）。
- **demo 錄影管線**：`scripts/demo/` 之後 `npm run demo:record -- <scenario>` 重錄會自動帶新背景；本輪不重錄，僅註記。
- **reduced-motion**：poster 靜態、不 autoplay，全站一份邏輯。

---

## 6. 測試策略

- **純邏輯（vitest）**：
  - 依 `ScreenDef.bg` 決定「設 src + 顯示影片 vs 隱藏影片、露出點雲」的分派純函式（缺檔 fallback）。
  - reduced-motion 分支（不 autoplay / poster 靜態）的決策純函式。
  - （scrim 強度為純 CSS `body[data-mode]`、無 JS 函式，改由 CDP 端驗渲染，不進 vitest。）
- **渲染/生命週期（headless Chrome + CDP，比照歷次驗收）**：
  - 六頁各自載入正確 bg、切頁 src 切換、切走 `pause()`、回來 `resume()`。
  - twin 無影片、點雲照舊。
  - hero 兩段式切換 + 罩幕明暗零回歸。
  - reduced-motion：poster 靜態、`video.paused`、無 autoplay。
  - 全站 console 零 JS 例外。

---

## 7. 風險與未決

- **素材尚未存在**：本輪先做接線 + hero 收編，六頁 bg 以 fallback 呈現（點雲），素材到位再補。
  → 驗收分兩段：接線正確性（可測）、實際觀感（素材到位後人眼看）。
- **doc 頁觀感**：影片在較重 scrim 下可能偏暗、價值有限——若使用者實看後覺得 doc 頁不值得，可個別關掉（`bg` 移除即退回點雲），架構已保留此彈性。
- **首載量**：registry 靜態 import 只解析出 URL 字串（非影片 bytes，見 3.2）；`video.src` 只在切到該頁時才設，
  故僅 active 頁的 mp4 會被抓。`preload="auto"` 對尚未設 src 的元件不生效——實作須驗證只載當前頁、切頁才抓下一支。
- **poster asset-prep 腳本**：一次性、開發者手動跑（非 vite build 期），產物 commit（見 §4）；抽幀時間點非 0 防黑幀。
