# HANDOFF — iMarine-FrontEnd

> 活文件：目前進度、決策紀錄、下一步。接手先讀這份，再讀 `CLAUDE.md`。

最後更新：2026-07-04 Task 6 完成

---

## 1. 目前狀態

**Task 7（Carbon screen，自 PoC 一比一搬入）完成**，進入 Task 8。
- 新增 `src/screens/hero/hero.html`（`?raw` 匯入的靜態 markup，含 `<!--ENTRIES-->`/`<!--STATS-->`/
  `<!--MODULES-->` 與 `__POINTS__`/`__LABELS__` 佔位標記）、`src/screens/hero/ovmap.ts`（`initOvMap(canvas)`
  自基準檔「總覽迷你地圖」JS 搬出，回傳 `{start,stop}`，rAF 迴圈自管，`prefers-reduced-motion` 時
  `start()` 只畫單幀）、重寫 `src/screens/hero/index.ts`（原「開發中」佔位頁換成完整兩段式 screen）。
- 封面（COVER）六入口卡與總覽（OVERVIEW）六模組卡皆由 `SCREENS.slice(1)` 動態生成（icon/short/color
  取自 registry），未手刻六份重複 markup；入口卡另加一組 hero 專屬的英文技術次標對照表（`SU TOKEN`／
  `LLM + RAG`… 六筆，registry 未定義此欄位，純裝飾用途，未擴充 registry 契約）。OVERVIEW 的四張 KPI 卡
  用 `statRow()` 綁 `overview.snapshot()`（`kpi.vessels`→今日進出港船舶… delta 文字含 U+2212 minus sign
  對齊基準檔字面）、六張模組卡摘要值用 `snapshot.modules` 依 id 對應、近 7 日 bar chart 綁
  `snapshot.weekly`。`mount()` 先 `await` snapshot 再一次性組完整 HTML 字串塞入，無二次載入態。
- 兩段式切換：CTA（`#toOverview`，單向 cover→ov，對齊基準檔）與 `hero:toggle` 事件（雙向切換，main.ts
  只在 `current()==='hero'` 時 dispatch，`mount()` 綁一次不解綁）共用 `setHeroState()`：切
  `body[data-hero]` 屬性、呼叫 `ctx.setMode`、開關 `ovMap.start()`/`stop()`。入口卡／模組卡共用
  `[data-go]` 委派點擊 → `location.hash`。
- 修正一個發現的時序問題（不在本 task 檔案清單，但不修會讓「總覽 → 點模組卡切到別的功能頁 → 按 `0`／
  點 rail 圖示切回 hero」這條路徑每次被重置回封面）：`router.go()` 對每個 screen 都固定「先呼叫
  `show()`，再呼叫 `applyMode(def.mode)`」，registry 給 hero 的 `mode` 固定是 `'cover'`，`show()` 若同步
  呼叫 `ctx.setMode` 會被那行立刻蓋掉。改用 `queueMicrotask` 延後寫入（仍在同一輪 event loop、下一次
  瀏覽器繪製前執行，Chromium 實測無閃爍），讓總覽態能在切出/切回 hero 後正確保留。未改動 `router.ts`。
- 已知的極小基準差異：模組卡／入口卡標題統一用 `registry.short`（"2.5D 沙盤推演"／"即時派工建議"／
  "疫情自動追溯"），基準檔 hero 頁本身寫的是較短版本（"沙盤推演"／"即時派工"／"疫情追溯"，與
  `overview.json` 的 `modules[].label` 一致但與 rail tooltip 用的 `registry.short` 不同）；判斷 registry
  為單一資料源、不另建平行對照表較穩妥，三個模組各少兩三個字，影響極小。
- 無新增單元測試（純視覺 screen，task-6-brief 未要求）。已用 Chromium（chrome-devtools MCP）驗證：
  COVER 態 rail 隱藏、六入口卡 icon/色彩/標籤正確、hover outline 隨 `--mc` 變色（實測 carbon 卡
  outline-color 變 `rgb(233,188,99)` 且卡片上移）、CTA 與署名行皆在；Enter／CTA → OVERVIEW：rail 滑入、
  四張 KPI 卡數字彈簧動畫＋sparkline、迷你地圖有陸地/突堤/泊位編號 108-113/航道/錨區/移動船點（實測
  600ms 間隔兩次 `canvas.toDataURL()` 不同，確認 rAF 真的在動）、六模組卡摘要值正確且可點擊跳頁、近
  7 日 bar chart 七根柱子渲染；切到 `#/carbon` 後確認 ovMap 的 canvas 停止變化（`hide()`/`stop()` 生效，
  不浪費背景運算）；按 `0` 從 carbon 切回 hero 確認正確回到 OVERVIEW（而非被重置成封面，驗證前述時序
  修正）；Enter 再次切回 COVER。全程 console 乾淨無 error/warning。
- `npx tsc --noEmit` 0 errors、`npx vitest run` 8/8 PASS（未新增測試，既有 3 個測試檔不受影響）、
  `npm run build` 產出正常（確認 `?raw` 匯入在 Rollup production build 下也能正常內聯）。

**Task 5（共用 UI 元件）完成**，進入 Task 6。
- `src/ui/components.ts` 新增三個純模板字串函式：`screenHeader(o)`（輸出 `<header class="anim" style="--d:0s">`，
  內含 `.eyebrow`〔圓點 `style="--mc:<color>"` + `.lbl`〕與 `.trow`〔`<h1>` + 技術徽章 `.lg-chip` chips +
  `srcChip()` + `.spacer` + `actionsHtml`〕；`--d:0s` 對齊基準檔每頁 header 皆最先進場，屬不變值故直接寫死）、
  `statRow(items)`（`.stats4` 格線包 N 張 `.lg.lg-stat` 卡，`data-lg-value`/`-prefix`/`-suffix`/`-decimals`/
  `-spark` 屬性驅動彈簧動畫與 sparkline，`delta` 為呼叫端字串原樣塞入 `.lg-stat__delta`〔不臆測漲跌樣式〕，
  `valueClass` 掛在 `.lg-stat__value` 上如 `goldc`）、`srcChip(source, label?)`（mock→灰 `.src` 預設
  「MOCK 資料」，live→綠 `.src.live` 預設「LIVE」，內含空 `<i>` 圓點）。未實作 `placeholderCard`——本計畫
  六個功能頁全部會做完，不會有模組維持佔位，brief 授權的範疇縮減（YAGNI）。
- 驗證時發現既有 gap 並一併修正：`router.ts` 首次 mount 只對新 section 的 `[data-lg]` 逐一 `attach()`
  處理玻璃折射，但 `.lg-stat`/`.lg-meter`/`.lg-gauge`/`svg[data-lg-chart]` 的屬性驅動彈簧數字/sparkline
  走另一條路徑（Kit 內部 `initStats`，只在開機 `LiquidGlass.init()` 掃過一次，`refresh()`/`attach()`
  都不會補掃動態 mount 的新內容），導致任何動態渲染的 `.lg-stat` 數值永遠停在初始 0。Kit 已把這個
  rescan 掛在既有公開 API `LiquidGlass.behaviors.stats(root)`（未改動 vendored 的 `liquid-glass.js`），
  因此在 `router.ts` 首掛流程補上 `window.LiquidGlass.behaviors.stats(section)` 一行呼叫，並於 `lg.d.ts`
  補上對應型別。此修正雖不在本 task 檔案清單，但不修就會讓 Task 6-12 任何用到這幾個儀表元件的頁面
  數值都是死的 0，故判斷必須一併處理，於本次 commit 一起送出。
- 無單元測試（純模板字串，由後續頁面驗證）。改以暫時渲染驗證：`src/screens/dispatch/index.ts` 的
  `mount()` 暫改呼叫 `screenHeader({...}) + statRow([...])`，樣本資料涵蓋全部 8 個欄位
  （label/value/suffix/prefix/decimals/delta/spark/valueClass）。`npm run dev` 後用 Chromium
  （chrome-devtools MCP）確認：eyebrow 圓點色與標籤、標題、技術徽章 chip、`srcChip` 的 mock（灰）與
  live（綠，含自訂 `sourceLabel`）兩種樣式皆正確；四張 `.lg.lg-stat` 玻璃卡的數字彈簧動畫、delta 徽章、
  sparkline、`goldc` valueClass、prefix/suffix/decimals 組合全數如預期渲染；切到 `#/twin` 再切回
  `#/dispatch` 確認無重複初始化或 console 錯誤。驗證後已將 `dispatch/index.ts` 還原為原本的
  「dispatch（開發中）」佔位內容（`git status` 確認該檔無異動）。
- `npx tsc --noEmit` 0 errors、`npx vitest run` 8/8 PASS（router.ts 改動未影響既有 4 個 router 測試）。

**Task 4（碳權 live provider）完成**，進入 Task 5。
- `src/data/exchange/carbon.ts` 實作 `createCarbonProvider(base?: string)` 函式：
  (1) 並列呼叫 `fetch(base + '/health')` 與 `fetch(base + '/state')`；
  (2) 從 `/state` 的 `sus` 陣列衍生 `CarbonSummary`（issued = 總數、tonsCirculating = status!=='retired' 的 amount 加總、listed/retired = 狀態計數）；
  (3) 任何 fetch 失敗時返回 `ok:false` 的預設值。`source: 'live'`，`base` 屬性可讀（簽約 `Provider<T> & { base: string }`）。
- TDD：`tests/carbon-provider.test.ts` 全域 mock fetch（vi.stubGlobal）驗證 2 案例（正常回應 + 後端當機），
  紅燈 → 綠燈。`npx vitest run` 全 8 tests PASS（碳權 2 + 路由 4 + mock 2）。`npx tsc --noEmit` 0 errors。
- `src/main.ts` 碳權佔位 stub 換成真實 provider 呼叫 `createCarbonProvider(env.VITE_CARBON_API)`，
  保留 `twin` 佔位（Task 8）。孿生 mock 仍保留 `mockProvider`。
- 已用 Chromium（chrome-devtools MCP）驗證：`npm run dev` 後頁面正常加載（hero 開發中屏幕），
  console 僅 Vite 連線訊息無 error。

**Task 3（資料交換層：types + mock providers）完成**，進入 Task 4。
- `src/data/types.ts` 由 Task 2 的最小 stub 換成完整版：`Provider<T>`、五個 mock screen 的
  Snapshot 型別（Overview/Policy/Dispatch/Epidemic/Alert）+ `CarbonSummary`/`TwinSnapshot`、
  `DataExchange`。新增 `src/data/exchange/mock.ts`（`mockProvider` source:'mock' +
  `structuredClone` 深拷貝、`createMockExchange` 組裝五個 provider）與 `src/data/mock/*.json`
  五檔，數值逐一自 `docs/preview/preview-src-v3.html` 抄出（overview KPI 128/47-62/3.4/4820、
  policy 五段 html+5 來源+grounding 93、dispatch WINDS/RAINS+4 建議卡+CSI/POD/FAR、epidemic
  SHIN KUANG 168/72 橙級+三因子+四港序列+新光輪案例、alert 4 KPI+6 feed+2 sms）。`main.ts` 的
  `ctx.data` 接上 `createMockExchange()`，carbon/twin 暫用 `mockProvider` stub 佔位
  （`base`/`url` 讀 `import.meta.env`，Task 4/8 換 live）。`tsconfig.json` 加
  `resolveJsonModule: true`。
- TDD：`tests/mock.test.ts`（深拷貝 + dispatch 10 timesteps 兩案例）先跑過 RED 才實作，之後
  `npx vitest run` 6/6 PASS（含 Task 2 router 測試）、`npx tsc --noEmit` 0 errors。
- 已用 Chromium（chrome-devtools MCP）驗證：`npm run dev` console 乾淨，瀏覽器內動態 import
  `mock.ts` 執行 `createMockExchange()` 確認五個 provider 皆 `source:'mock'` 且欄位數值與基準檔
  一致；切到 `#/twin` 佔位頁確認未受 main.ts 改動影響。

**Task 2（Registry + Router + Rail + 鍵盤）完成**，進入 Task 3。
- 新增 `src/screens/types.ts`（Mode/ToastOpts/ScreenCtx/Screen 契約）、`src/shell/registry.ts`（7 筆
  ScreenDef，順序 hero/carbon/policy/twin/dispatch/epidemic/alert）、`src/shell/router.ts`（`parseHash`/
  `applyMode`/`initRouter`，快取式：每 screen 只 mount 一次、DOM 不銷毀、切頁靠 `.active`/`.entered` +
  `show()`/`hide()`）、`src/shell/rail.ts`（自基準檔 rail markup 生成，`setActive` 切光條）；
  `main.ts` 接上 ctx/rail/router/鍵盤（`0`/`1`-`6`/`Enter`）。七個 screen 資料夾各放最小佔位頁
  （Task 6-12 陸續取代）。另建 `src/data/types.ts` 最小 stub（僅 `export interface DataExchange {}`）
  ——`ScreenCtx.data` 的 `import('../data/types').DataExchange` 型別參照需要此檔存在，完整欄位留給 Task 3。
- TDD：`tests/router.test.ts`（brief 給定的 4 個 parseHash 案例）先跑過 RED（router.ts 不存在）才實作，
  之後 `npx vitest run` 4/4 PASS。`npx tsc --noEmit` 在 `src/`/`tests/` 下 0 errors（node_modules 內
  vite/vitest/rollup 型別檔因缺 `@types/node`/`skipLibCheck` 而報錯，屬 Task 1 tsconfig 的既有落差，
  這次因為第一次有測試檔 import `vitest` 才浮現，不影響 `vitest run`/`vite dev`，留待之後視需要處理）。
- 已用 Chromium（chrome-devtools MCP）驗證：開機空 hash 進封面、rail 七顆按鈕滑鼠點擊與鍵盤
  `0`/`1`-`6`皆可切換、active 光條正確跟隨、`location.hash` 雙向同步、直接開 `#/twin` 冷啟動正確落在
  孿生佔位頁（並確認 `data-mode="full"` 有連動 Task 1 背景系統的增亮/泊位編號邏輯）、切走的 screen
  的 `<section>` 保留在 DOM 未被銷毀、重複導覽到同一頁不會產生重複 section 或多餘 console 訊息、
  全程 console 乾淨無 error。

**Task 1（專案骨架 + Kit + 背景系統）完成**，進入 Task 2。
- 視覺基準已定案並存檔：`docs/preview/preview-v3.html`（自含 Kit，瀏覽器直接開）與原始碼 `preview-src-v3.html`。
- 正式設計文件：`docs/superpowers/specs/2026-07-03-frontend-shell-design.md`（含 screen 契約、
  資料交換層介面、各頁規格、驗收標準）。
- 實作計畫：`docs/superpowers/plans/2026-07-03-frontend-shell.md`（12 tasks）。
- **Task 1 骨架+背景 完成**：Vite + vanilla TS 專案骨架（`package.json`/`vite.config.ts`/`tsconfig.json`）、
  Liquid Glass Kit 兩檔自 `~/Desktop/UI-ToolBox` 複製進 `src/ui/`、`tokens.css` 自預覽基準檔整塊搬入、
  `src/shell/background.ts` 完成點雲港口背景（build/coast/paint/loop/resize，含 full 模式增亮、
  泊位編號 108-113、SHIN KUANG 168 標記與 twinOffset 位移）並模組化為 `initBackground()`。
  已用 Chromium（chrome-devtools MCP）驗證：`npm run dev` 後畫面為深色點雲港口 + 光暈，console 乾淨
  （僅預期外的瀏覽器預設 favicon.ico 404），切換 `data-mode='full'` 背景增亮並顯示泊位編號。

歷程：

- 三個 layout 方向調研與比較（提案頁 artifact：https://claude.ai/code/artifact/24f960b5-26fb-4a46-bdef-9046ddfad841 ）
- 高擬真互動預覽，7 個畫面全部用真實 Liquid Glass Kit 元件拼成，已逐頁驗證無 console error
  （預覽 artifact：https://claude.ai/code/artifact/4a4a875e-004c-4cb8-ae28-4bdc6ac20fcd ；
  原始檔在 session scratchpad `imarine-ui-preview.html`，內含 Kit 全文，可直接在瀏覽器離線開）
- v2 修正：碳權頁改為一比一還原 PoC 原介面（使用者回饋 v1 差異太大）——工作台（篩選 rail
  + SU 卡片牆 + 排序/單筆發行）與稽核（減碳排行 bar chart + SU 帳本全表 + 逐筆驗證）兩分頁、
  四張統計卡（累計發行/總減碳噸數/已交易/已除役）、鏈路連線 chip 與批次發行上鏈鈕全數保留，
  僅原 topbar 品牌區由 shell 的 eyebrow 標頭與左側 rail 接手。**這就是 PoC 重構搬入的版面基準。**
- v3 全頁細節 refine（使用者回饋其他頁細節不足）：
  總覽主視覺改為有內容的迷你港圖（陸地/突堤/泊位編號 108-113/航道/錨區/移動船點）、
  等候時間改善改綠色徽章；封面加競賽署名行與入口卡模組色 hover；
  政策頁議題改輸入列樣式、生成報告有 blur 生成動畫 + toast、引用 chip hover 連動右欄來源；
  孿生頁 full 模式背景增亮、canvas 直繪泊位編號、焦點船 SHIN KUANG 168 標記、
  時間軸拖動連動船位、情境切換可點擊（觸發 toast）、甘特加 00-24 時間軸；
  派工頁熱區加海岸線/突堤地理脈絡（僅海面顯示網格）、滑桿連動下方風雨讀數、補 FAR 指標；
  疫情頁風險卡加三因子 lg-meter 拆解、航跡圖加各港陸地點群；
  警報頁加統計列（推播/觸及/送達/待回報）、分類篩選 chips（可過濾）、feed 增至 6 筆、
  手機改真機樣式（瀏海/時鐘/日期）、模擬推播觸發震動 + 新簡訊插入動畫。
- 正式設計文件：待預覽獲同意後寫入 `docs/superpowers/specs/`

## 2. 已定案的決策

| 決策 | 內容 |
|---|---|
| Layout | 方向 A（左側玻璃 icon rail + 整頁 screen）為骨架 |
| Hero | 兩段式：電影感封面（PPT 開場）→ Enter/點擊 → 戰情總覽（demo 用） |
| 技術棧 | Vite + vanilla TS，不用 React；舊 `介面/port-eco-dashboard` 棄用 |
| 元件 | 一律 Liquid Glass Kit（UI-ToolBox），不手寫玻璃 CSS |
| Carbon PoC | 重構成 shell 的一個 screen；拿掉其 topbar，操作邏輯與 API 呼叫完全不動 |
| 數位孿生 | 沙盤推演頁嵌入 LiDAR kaohsiung-port（iframe 先行）；hero 封面背景用孿生錄製影片 |
| 資料交換層 | 本期只做 carbon + twin 兩個 live provider，policy/dispatch/epidemic/alert 為 mock |
| 鍵盤 | `0` 總覽、`1-6` 功能頁、`Enter` 封面切換（簡報快捷） |

## 3. 使用場景（影響所有取捨）

競賽 PPT 簡報 + 現場 demo：hero 封面當 PPT 開頭，六個功能子頁在介紹各功能時展示。
16:9 大螢幕優先，資訊密度可高，動效要有記憶點但不干擾講解。

## 4. 下一步（依序）

1. ~~使用者審閱 spec（已通過 2026-07-03）~~ 完成
2. ~~實作計畫：`docs/superpowers/plans/2026-07-03-frontend-shell.md`（12 tasks，每 task 結尾為檢查點、由使用者 commit）~~ 完成
3. ~~Task 1：建 Vite 專案骨架 + 複製 Kit 兩檔 + 點雲港口背景系統~~ 完成
4. ~~Task 2：Registry + Router + Rail + 鍵盤（`0` 總覽、`1-6` 功能頁、`Enter` 封面切換）~~ 完成
5. ~~Task 3：資料交換層（types + mock providers）~~ 完成
6. ~~Task 4：Carbon live provider~~ 完成
7. ~~Task 5：共用 UI 元件~~ 完成
8. ~~Task 6：Hero screen（兩段式）~~ 完成
9. ~~Task 7：Carbon screen（自 PoC 一比一搬入）~~ 完成——拆成 carbon.{html,css,ts}+index.ts 四檔；PoC `<script>` 逐字搬入 `initCarbon`（僅 API→apiBase、查詢改綁 root 的 byId/qs/qsa、`// @ts-nocheck`），操作邏輯零改動；三件套（tabs/health-chip/發行鈕）以原 id 進 shell 標題列。**LIVE 驗證通過**：即時 stat/卡片/稽核、工作台⇄稽核切換、單筆發行→掛單→購買→除役全流程、離線 chip 降級皆與 PoC 一致，主控台零錯誤。
10. **下一步 → Task 8**：Twin screen + twin provider（LiDAR iframe 嵌入）
11. Task 9-11：Dispatch / Epidemic / Alert screen（mock provider 資料，版面與互動 = 預覽 v3）
12. Task 12：Policy screen + 全站驗收

## 5. 已知風險 / 注意

- Liquid Glass 折射只在 Chromium 完整支援，其他瀏覽器自動降級磨砂——demo 機請用 Chrome/Edge。
- 玻璃需要豐富背景才看得見：文件型頁（carbon/policy）用罩幕壓暗而非純黑。
- Carbon live 需要先在 PoC repo 起 `make chain` + `make api`，demo 前要有開機 checklist。
- 預覽頁中的地圖/點雲是 canvas 假資料，正式版 hero 總覽主視覺與 twin 頁由 LiDAR 資產供給。
- `tsconfig.json` 未設 `skipLibCheck`/`@types/node`：獨立跑 `npx tsc --noEmit` 會對
  `node_modules` 內 vite/vitest/rollup 的型別檔報錯（缺 Node 環境型別），Task 2 加入第一個
  import `vitest` 的測試檔後才浮現；不影響 `vitest run`/`vite dev`/`vite build`，之後測試檔變多
  會持續出現，建議之後補 `skipLibCheck: true`（一行小改動，但屬既有檔案，先問過再動）。
