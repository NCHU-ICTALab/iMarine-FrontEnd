# 系統設定頁（Settings）設計文件

日期：2026-07-07
狀態：設計定案，待 preview 基準頁驗收後進實作計畫

---

## 1. 目標與定位

在左側 rail 底部新增「系統設定」入口，承載全站前後端設定。頁面分 7 個分區：前端設定 + 六大功能模組（碳權代幣化交易 / AI 政策輔助報告 / 2.5D 沙盤推演 / 短時微氣候·即時派工建議 / 疫情自動追溯 / 自動警報推播）的後端設定。

核心約束：**與協作者分工，多數模組的後端需求尚未定案**。因此本頁的首要價值是「框架先行」——schema 驅動的設定框架讓協作者之後**不碰 UI 程式碼**就能新增/刪除自己模組的設定項目；現在能確定的內容（policy 的知識庫管理 + 模型管理）做成完整互動 mock 當作示範樣板。

定位：主要給團隊協作用，簡報可能帶到（展示系統完整度/可設定性）——視覺比照全站 Liquid Glass 完成度，不做展演式動畫劇本。

## 2. 決策紀錄表

| 決策 | 定案 | 理由/備註 |
|---|---|---|
| 真實程度 | 落地 localStorage + 有限生效 | policy 地端/雲端切換、carbon API base、mapbox token、動效設定實際生效；其餘存而不用等後端 |
| Rail 位置 | rail 底部（spacer + hr 隔開）| Vercel/Linear 慣例，系統層與功能頁語意區隔 |
| 鍵盤 | `7` 直達 settings | 延伸現有 0-6 對應表 |
| 整頁 layout | 頁內左側二級導覽（方案 A）| 7 區深淺不均，sidebar 不失衡；左欄 = 全頁狀態地圖。視覺 companion 三方案比選定案 |
| policy 分區內部 | 垂直堆疊（模型管理上、知識庫下），知識庫點卡開 modal | 使用者定案「一般垂直堆疊即可」；重點是協作者可方便增刪設定項 |
| 擴充機制 | Schema 驅動 | 每區一個宣告式 sections 檔，框架統一渲染/驗證/持久化；複雜塊走自訂渲染器 escape hatch |
| 知識庫粒度 | 多知識庫結構（Dify 式）| 協作者後端未定案，多庫是通用形（單庫為其特例），預置 policy 頁五大分類 |
| 前端設定內容 | 資料源總覽 + 動效 + Mapbox token | 使用者複選定案；鍵盤快捷一覽不做 |
| 模組色 | 中性銀灰 `#9FB0C0` | 系統層用中性色，與六模組色相區隔 |
| mode | `doc`（罩幕壓暗）| 表單密集頁，同 carbon/policy |
| 分區切換 | 純前端狀態，不動 URL hash | 避免與 shell 路由打架；預設落在「前端設定」 |
| 儲存語意 | Primer 分流：toggle/select/slider 即時生效；文字欄位群 explicit（dirty + 儲存列）| 同 group 不混用；回饋用 inline 而非 toast |
| 協作者文件 | README 新章「協作者指南」| 加欄位/讀值/mock→live/**前端頁面設計規範**（技術契約+設計系統+版面節奏+內容原則）+ PR 自查清單，作 PR 檢查基準 |
| 驗收方式 | 先做 `docs/preview/preview-settings.html` 互動基準頁，使用者驗收通過才實作 | 比照 policy/dispatch/epidemic 前例 |

## 3. Shell 接入

- `src/shell/registry.ts` 新增第 8 筆 ScreenDef：
  `{ id:'settings', title:'系統設定', short:'系統設定', color:'#9FB0C0', mode:'doc', icon:<齒輪 SVG path>, load:()=>import('../screens/settings/index') }`
- `src/shell/rail.ts`：七顆功能鈕之後加 flex spacer + `<hr>`，齒輪鈕固定 rail 底部；點擊行為同其他鈕（`data-go="settings"`）。rail active 光條沿用 `.on` 機制。
- `src/main.ts` 鍵盤：`7` → `settings`（既有 `1-6` 對應延伸；INPUT/TEXTAREA/SELECT/contentEditable bail-out 既有邏輯已涵蓋本頁輸入框，不需改）。
- hash：`#/settings`，冷啟動直達可用（快取式 router 既有能力，無新需求）。

## 4. 頁面版面

```
┌ screenHeader（eyebrow「SYSTEM SETTINGS」·標題「系統設定」·無資料源 chip）┐
├──────────────┬─────────────────────────────────────────┤
│ 左欄分區導覽    │ 右側：選中分區內容（垂直堆疊 group 卡，頁內捲動）│
│ ~200px 固定    │                                          │
│ 7 項：色點+名稱 │  group 卡 = 玻璃容器 + 實心表單內容          │
│ +狀態小字      │  （lg-static 原則，不手寫 backdrop-filter）  │
└──────────────┴─────────────────────────────────────────┘
```

- 容器 `.swrap` + `screenHeader()`；本頁不顯示 srcChip（比照 policy 頁特例——設定頁非資料展示頁）。
- 左欄項目：模組色圓點 + 名稱 + 狀態小字（「生效中」/「後端待接入」/「n 模型已連線」等，由各 section 的 `status()` 提供）；active 樣式用 settings 銀灰。
- 分區切換為頁內狀態（模組層變數），切換時右側重渲染該 section；stagger 進場僅首次。
- 響應式：<1100px 左欄塌為頂部橫向 chips（沿用 tokens.css 既有斷點慣例）。

## 5. Schema 驅動設定框架（核心）

### 5.1 檔案結構

```
src/screens/settings/
  index.ts          — Screen 生命週期（mount/show/hide）+ 左欄導覽 + 分區調度
  schema.ts         — 型別定義（SettingsSection/SettingGroup/SettingField union）
  renderer.ts       — schema → DOM 統一渲染器 + 事件綁定 + dirty 追蹤 + 讀寫 storage
  storage.ts        — localStorage 封裝：單一 key `imarine.settings.v1`
                      get/set/subscribe/getSetting，帶 version 欄位留遷移空間
  sections/
    frontend.ts     — 前端設定
    carbon.ts       — 碳權（API base 真欄位 + 連線測試）
    policy.ts       — 政策（schema + 兩個自訂渲染器：模型管理/知識庫管理）
    twin.ts / dispatch.ts / epidemic.ts / alert.ts — 佔位骨架
  settings.html     — 骨架佔位標記（對齊既有 screen 手法）
  settings.css      — 全部選擇器 `#s-settings` 前綴
```

### 5.2 欄位型別（discriminated union）

```ts
type SettingField =
  | { kind:'text';     key:string; label:string; placeholder?:string; help?:string; disabled?:boolean }
  | { kind:'password'; key:string; label:string; help?:string; disabled?:boolean }
      // 遮罩+眼睛 toggle；已存值只顯示尾四碼，按「更換」才開輸入框（Stripe 慣例）
  | { kind:'select';   key:string; label:string; options:()=>{value:string;label:string}[]; disabled?:boolean }
      // options 為函式：支援動態來源（如「已連線供應商的已啟用模型」聯集）
  | { kind:'toggle';   key:string; label:string; help?:string; disabled?:boolean }
  | { kind:'number';   key:string; label:string; min?:number; max?:number; step?:number; disabled?:boolean }
  | { kind:'slider';   key:string; label:string; min:number; max:number; step?:number; disabled?:boolean }
  | { kind:'action';   label:string; run:(ctx:SettingsCtx)=>Promise<ActionResult>; disabled?:boolean }
      // 如「測試連線」；ActionResult = { ok:boolean; message:string } → inline 顯示
  | { kind:'note';     text:string }

interface SettingGroup {
  title: string;
  badge?: string;                        // 如「後端待接入」
  saveMode: 'instant' | 'explicit';      // 同 group 不混語意
  fields?: SettingField[];
  custom?: (el:HTMLElement, ctx:SettingsCtx) => void;   // escape hatch：自訂渲染器
}

interface SettingsSection {
  id: string; label: string; color: string;
  status: () => string;                  // 左欄狀態小字
  groups: SettingGroup[];
}
```

- `key` 為 storage 路徑（如 `policy.llmMode`、`frontend.mapboxToken`），全域唯一，schema 載入時驗證重複即 throw（vitest 覆蓋）。
- **協作者新增設定 = 在自己模組的 sections 檔 groups/fields 加一筆物件**；刪除 = 刪物件。渲染、持久化、dirty 追蹤、儲存列全由 renderer 接手。
- 佔位欄位 `disabled:true` 統一呈現：降飽和 + 不可互動 + group badge。

### 5.3 storage 與消費 API

- 單一 localStorage key `imarine.settings.v1`，JSON 物件，扁平 key path → value；含 `_version` 欄位。
- `getSetting<T>(key, fallback?)`：settings → fallback 鏈；供其他頁消費。
- `subscribe(key, cb)`：跨頁同步（policy 頁 segmented 與設定頁雙向）。
- 讀寫皆同步（localStorage），介面形狀刻意做成可換 async——之後協作者後端進來，storage 層換 API 呼叫、加 loading 態即可，schema 與 renderer 不動。

### 5.4 儲存語意（GitHub Primer 規範）

- `saveMode:'instant'`（toggle/select/slider）：撥了即寫 storage + 即生效，無儲存鈕。
- `saveMode:'explicit'`（text/password/number 群）：欄位變更 → group 底部浮出「未儲存變更 — [捨棄] [儲存]」列；儲存後 inline 綠勾回饋 1.5s 淡出。**不用 toast**（設定回饋留在原地）。
- 切分區/切頁時有未儲存變更 → 保留 dirty 狀態（回來還在），不做 beforeunload 攔截（demo 場景不需要）。

## 6. 各分區規格

### 6.1 前端設定（生效中）

| group | saveMode | 內容 |
|---|---|---|
| 資料源總覽 | —（唯讀，custom）| 六模組表：色點+名稱+source chip（mock 灰/live 綠）+ 連線狀態。carbon 真打 `/health`（ok/離線）；twin 顯示「內建資料」；其餘顯示「mock」 |
| 動效 | instant | 「減少動態效果」toggle（覆寫 prefers-reduced-motion——各頁動畫分支改讀共用 `prefersReduced()` helper，見 §7）；「進場動畫」toggle（關閉時 body 加 `data-anim="off"`，tokens.css 對 `.anim` 一條覆寫規則直接顯示終態，不逐頁改） |
| 地圖服務 | explicit | Mapbox token（password）——epidemic worldmap 讀取順序 settings → env |

### 6.2 AI 政策輔助報告（完整互動 mock，協作示範樣板）

**模型管理**（custom 渲染器，上半）：
- 供應商卡牆，預置 4 張：Ollama（地端）/ OpenAI 相容 / Anthropic / + 自訂供應商。
  卡片：名稱 + 狀態（未設定 → Setup 鈕；已連線 → 綠點 + key 尾四碼 + 已啟用模型數）。
- Setup modal（`.lg-modal`）：API URL（text）+ API KEY（password，遮罩+眼睛）+ **測試連線** action 四態：
  idle → spinner「驗證中…」→ 成功（綠勾 + 載入該供應商預錄模型清單，checkbox 逐一啟停）/ 失敗（紅字原因）。
  mock 驗證規則：URL 非空且格式合法 + KEY 非空 → 1.2s 假延遲後成功；否則失敗。儲存後卡片轉已連線。
  已連線供應商卡片可重開 modal 修改/移除（移除需 confirm）。
- **系統預設模型**：三個 select——推理模型 / Embedding 模型 / Rerank 模型，選項 = 已連線供應商的已啟用模型聯集；
  聯集為空時 select disabled + 導引文字「請先設定至少一個供應商」。
- **地端/雲端接線**：`policy.llmMode`（'local'|'cloud'）落地 storage；policy 頁 header segmented 改為初始化自
  `getSetting('policy.llmMode','local')` 且切換時回寫；設定頁與 policy 頁雙向同步（subscribe），重載不失。

**知識庫管理**（custom 渲染器，下半）：
- 知識庫卡牆：預置五庫（航港法令 / 海運焦點新聞 / 全球航運指數 / 台灣數據統計 / 替代能源專區，
  文件數對齊 policy 頁 mock 來源數）+「+ 新增知識庫」虛線卡（modal：名稱 + 描述）。
  卡片顯示：庫名 + 文件數 + 檢索策略摘要；hover 出刪除鈕（confirm 後刪；預置庫也可刪，demo 可重置——
  提供「重置為預設」還原）。
- 點卡 → 知識庫 modal：
  (a) 文件表：檔名 / 狀態（available 綠、indexing 琥珀，3s 假轉 available）/ 刪除；
  (b) 上傳 dropzone（`.lg-upload`）：選檔只取檔名入表 + 假 indexing（不真正上傳）；
  (c) 參數：chunk size（number，預設 512）/ overlap（number，預設 64）/ embedding 模型（select，來源同系統預設模型的動態聯集）/
      檢索策略（vector / full-text / hybrid radio）。
  **Progressive disclosure**：hybrid → 出現語意/關鍵字權重 slider；rerank toggle 開 → rerank 模型 select；
  系統無已連線 rerank 可用模型時，toggle 旁導引「先至模型管理設定 rerank 模型」+ 點擊捲動至模型管理 group（Dify 手法）。
- 參數群 saveMode:'explicit'（modal 內底部儲存列）；文件操作即時生效。

**資料形狀照未來 REST 設計**（換接真後端只改 storage/provider 層，UI 不動）：

```ts
interface PolicyBackendSettings {
  llmMode: 'local' | 'cloud';
  providers: { id:string; name:string; apiUrl:string; apiKeyMasked:string;   // 永不存/回傳完整 key 的介面形狀
               connected:boolean; models:{ id:string; label:string; enabled:boolean;
               kind:'chat'|'embedding'|'rerank' }[] }[];
  defaults: { reasoning?:string; embedding?:string; rerank?:string };        // model id
  kbs: { id:string; name:string; desc?:string;
         docs:{ id:string; name:string; status:'available'|'indexing' }[];
         chunk:{ size:number; overlap:number };
         retrieval:{ strategy:'vector'|'fulltext'|'hybrid'; hybridWeight?:number;
                     rerank:boolean; rerankModel?:string; embeddingModel?:string } }[];
}
```

註：mock 階段 API KEY 明文存 localStorage（demo 用假 key），但介面形狀遵守「回傳 masked key」慣例；
README 指南明記真後端接入時 key 只送不回。

### 6.3 碳權代幣化交易（半真）

| group | saveMode | 內容 |
|---|---|---|
| API 連線 | explicit | API Base URL（text，placeholder 顯示 env 預設值）+ 測試連線（action，**真打** `{base}/health`）|
| 鏈路資訊 | —（唯讀，custom）| 後端在線時顯示 `/health` 回傳摘要；離線顯示降級說明 |

生效：`main.ts` 組 carbon provider 改 `getSetting('carbon.apiBase') || env.VITE_CARBON_API`。
（provider 在開機時組裝——變更 base 後提示「重新整理後生效」，不做熱替換。）

### 6.4 四個佔位分區（twin / dispatch / epidemic / alert）

依報告書 v6 模組定位推測 2-3 個合理欄位骨架，全部 `disabled:true` + group badge「後端待接入」+
note「後端整合後由協作者依實際需求增修此區欄位（見 README 協作者指南）」：

- **twin**：AIS 資料源端點（text）/ 快照更新頻率（select）。
- **dispatch**：ConvLSTM 推論端點（text）/ 模型更新週期（select）/ CWA 資料源 key（password）。
- **epidemic**：情資爬蟲來源（text）/ WHO/疾管署 API 端點（text）/ 比對排程（select）。
  另有一個**生效中** group：Mapbox token 於前端設定分區管理，此處放 note 連結指引（不重複欄位）。
- **alert**：細胞簡訊發送 API（text）/ 發送門檻（select）/ 測試發送（action，disabled）。

佔位欄位呈現：降飽和骨架（完整畫出 label + 控件外形），展示規劃深度並作為協作者的填空模板。

## 7. 有限生效接線總表（動到的既有檔案）

| 檔案 | 改動 | 性質 |
|---|---|---|
| `src/shell/registry.ts` | 第 8 筆 ScreenDef | 新增 |
| `src/shell/rail.ts` | spacer + hr + 齒輪鈕 | 新增 |
| `src/main.ts` | 鍵盤 `7`；carbon base 讀取順序 settings → env | 各一行級 |
| `src/screens/policy/index.ts` | `llm` 初始化自 settings + 切換回寫 + subscribe 同步 | 讀取點替換 |
| `src/screens/epidemic/worldmap.ts` | token 讀取順序 settings → env | 一行級 |
| 各頁 reduced-motion 判斷 | 新增共用 `prefersReduced()` helper（settings 覆寫 → matchMedia），逐頁把 `matchMedia('(prefers-reduced-motion: reduce)')` 呼叫點換成 helper | 讀取點替換 |
| `src/ui/tokens.css` | 若有 settings 舊佔位段則清除（現況無）| 清理 |

鐵則：只換「讀取點」，不動任何頁的操作邏輯與動畫實作。

## 8. README 協作者指南（新章節）

README 新增「協作者指南」章，分四節（1-3 講設定與資料、4 講前端設計）。目標：協作者照著做即可
開發自己模組的設定與主頁面，發 PR 時本章即為檢查基準。

1. **新增/刪除設定欄位**：sections/<模組>.ts 的 schema 格式 + 欄位型別表 + 可複製範例
   （一個 text + 一個 toggle + saveMode 說明）；刪除 = 刪物件。
2. **讀取設定值**：`getSetting('模組.key', fallback)` 用法 + `subscribe` 跨頁同步。
3. **mock → live**：provider 介面（`source`/`snapshot()`）、換真後端只改 `src/data/exchange/` 對應 provider、
   UI 與 screen 不動；設定頁「測試連線」action 怎麼指到真端點；API key 只送不回原則。
4. **前端頁面設計規範（主頁面開發 + PR 檢查基準）**：
   - **技術契約**：Screen 介面（`mount` 只跑一次 / `show()`/`hide()` 每次切入切出 / DOM 快取不銷毀）；
     頁面檔案結構慣例（`src/screens/<id>/{index.ts, <id>.html, <id>.css}`，CSS 全部 `#s-<id>` 前綴）；
     canvas/尺寸依賴的重繪綁 `show()` 而非 `mount()`；計時器/rAF 於 `hide()` 清除；
     reduced-motion 分支用共用 `prefersReduced()` helper。
   - **設計系統**：一律用 Liquid Glass Kit 元件、不手寫 `backdrop-filter`；小型/大量重複元件用
     `lg-static`；儀表元件 =「玻璃容器 + 實心內容」；design tokens（底色 `#070b11`、主色 `#35E0A6`、
     髮絲線 `rgba(255,255,255,.1)`、字體 Inter/Noto Sans TC + Geist Mono）；各模組輔助色表與
     使用限制（只用在 rail active、eyebrow 圓點、徽章）。
   - **版面節奏**：eyebrow 標頭（`screenHeader()`）→ 標題列（技術徽章 + 資料源 chip `srcChip()`）→
     KPI 統計列（`statRow()`）→ 主視覺（左 ~62%）+ 右欄卡片；stagger 進場；背景兩態
     （空間型頁背景亮 / 文件型頁 `data-mode="doc"` 罩幕壓暗）如何選。
   - **內容原則**：mock 頁不是空殼——用報告書參考數字做完整假資料版面，之後只把 provider 換 live；
     不臆造資料欄位、schema 跟後端契約走。
   - 附一段「新模組頁面 PR 自查清單」（checkbox 條列上述各項），review 時逐條核對。

## 9. Preview 基準頁

實作前先交付 `docs/preview/preview-settings.html`（自含 Kit，比照 policy/dispatch/epidemic 前例）：
7 分區切換、policy 供應商 Setup 全流程（含測試連線四態）、知識庫 modal（上傳/刪除/參數/progressive disclosure）、
instant/explicit 兩種儲存語意、佔位分區骨架樣式，全部可互動。headless 驗證 console 零錯誤 + 互動斷言，
**使用者驗收通過後才進實作計畫**。定稿後 preview 即為視覺/互動基準，實作逐條轉錄。

## 10. 測試與驗收標準

**vitest（純邏輯）**：
1. schema 驗證：欄位 key 全域唯一（重複 throw）、union 型別完整性。
2. storage round-trip：set → get、`_version` 欄位存在、`getSetting` fallback 鏈（storage → fallback 參數）。
3. policy llmMode：預設 'local'、寫入後讀回、subscribe 回呼觸發。
4. 預置資料契約：五庫/四供應商 mock 形狀符合 `PolicyBackendSettings`。

**headless CDP 逐項（實作各 task）**：
1. rail 齒輪鈕在底部、點擊與按鍵 `7` 皆到達 `#/settings`、active 光條正確；`0-6` 迴歸不受影響。
2. 7 分區切換、左欄狀態小字、佔位區 disabled 樣式與 badge。
3. instant：toggle 撥動即寫 localStorage（重載保留）；explicit：改字 → 儲存列浮出 → 儲存 → inline 綠勾 → 重載保留；捨棄還原。
4. 供應商 Setup 全流程：空值失敗紅字 → 合法值 spinner → 成功載模型清單 → 啟停模型 → 儲存後卡片轉已連線 → 系統預設模型 select 選項聯集正確。
5. 知識庫：新增庫 / 刪庫 confirm / 上傳假文件 indexing→available / chunk 參數儲存 / hybrid→權重 slider 出現 / rerank 無模型時導引跳轉。
6. 雙向同步：設定頁改 llmMode → 切到 policy 頁 segmented 已同步；policy 頁切換 → 回設定頁已同步；重載不失。
7. mapbox token 覆寫：設定假 token 後 epidemic 頁讀到覆寫值（以 window 斷言，不需真地圖成功載入）。
8. 「減少動態效果」開啟後至少一頁驗證動畫分支走 reduced 路徑。
9. `prefers-reduced-motion` 模擬 + 全站 8 頁（7+settings）迴歸 console 零錯誤。
10. 三綠燈：`npx tsc --noEmit` 0 errors / `npx vitest run` 全綠 / `npm run build` 成功。

## 11. 範圍外（明確不做）

- 真實後端呼叫（carbon `/health` 與既有 provider 除外）；真檔案上傳；真 LLM/embedding。
- 設定匯出/匯入、多使用者、權限。
- carbon provider 熱替換（改 base 後提示重整）。
- beforeunload 未儲存攔截。
- 佔位四區的欄位內容定案（等協作者後端，屆時依 README 指南自行增修）。
