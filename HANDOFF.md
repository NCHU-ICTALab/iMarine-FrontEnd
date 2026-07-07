# HANDOFF — iMarine-FrontEnd

> 活文件：目前進度、決策紀錄、下一步。接手先讀這份，再讀 `CLAUDE.md`。

最後更新：2026-07-07 Alert 頁改版 brainstorming 完成——spec 定案 + 互動 preview v2 使用者驗收通過，下一步 writing-plans 排 SDD tasks（Settings 頁已於同日合併 push 完結，見下）

---

## 1. 目前狀態

**Alert 頁改版：brainstorming 完成，spec + preview v2 皆經使用者驗收，待寫實作計畫（writing-plans）。**
- 定位：**獨立警報中心**——港區事件（疫情/派工/氣象）經分級規則引擎，以 Cell Broadcast 推播；
  事件卡帶來源模組色點呈現跨模組關係。版面 A 三分割（左事件流 0.95fr / 中 Mapbox 高雄港 2.5fr /
  右手機 mock + 送達漏斗 1fr）+ KPI 4 卡；分級體系＝港區三級（紅色警報/橙色警戒/作業提示）+
  PWS 對映與 mono `CH 4371/911/919` 徽章（調研沉澱：台灣 CBS 官方分級與訊息碼、WEA polygon
  geo-targeting、J-Alert 波紋、Grafana 狀態機、OneSignal 漏斗、NOC 5 秒可讀原則）。
- 四互動定案：點事件下鑽（flyTo+圍欄+cell 點亮+漏斗切換+卡內分級軌跡展開）、模擬事件池兩發
  （作業提示雷擊 → 紅色警報颱風頂格：cell 全亮 stagger+波紋+手機全螢幕插播抖動+雙漏斗滾數字，
  第三按重置）、cell hover tooltip 送達數、Ack 鈕（脈動→靜止）。獨立分級切換器不做；
  舊三顆推播規則 switch 移除（規則歸系統設定頁 alert 分區未來擴充）。
- v2 修訂（使用者回饋定案）：無解釋性散文（卡摘要/軌跡全數據化）+ 引導性配色（橙紅級標題
  常態帶 sev 色、選中卡光暈跟 sev 色）+ 進頁自動選中最高風險事件（重置亦然，不留空地圖）。
- spec：`docs/superpowers/specs/2026-07-07-alert-redesign-design.md`（決策表 8 條、AlertSnapshot
  資料契約、mock 劇本、互動規格、驗收標準、YAGNI）；視覺/互動基準
  `docs/preview/preview-alert-redesign.html`（token 佔位 `__MAPBOX_TOKEN__`；本機測試副本
  `docs/preview/.preview-alert-test.html` 含真 token **勿提交**）。
- preview 驗收：獨立 headless Chrome（埠 9431、SwiftShader）+ 自寫 CDP 腳本 43 斷言全過、
  console 零錯誤、截圖存 scratch。過程修掉兩個坑（已寫進 spec 開頭，實作必帶）：軌跡節點
  state 未映射 CSS class 不亮；Mapbox marker 根元素設 `position:relative` 會蓋掉
  `.mapboxgl-marker` 的 absolute 造成逐顆累積偏移。
- **下一步**：writing-plans 寫 `docs/superpowers/plans/2026-07-07-alert-redesign.md`（SDD tasks，
  比照 epidemic 前例：純邏輯 TDD → 契約+mock → 骨架+CSS → Mapbox → 互動 → 演練 → 全站驗收）。

**（以下為前一輪 Settings 頁，已完結）**

**系統設定頁（Settings）：SDD 8 tasks 全數逐 task review 通過 + 最終 whole-branch review (opus, Ready to merge) + 三項最終修復，使用者實機驗收通過，已合併回 main（fast-forward `b78e423`→`2474de9`、feature 分支已刪）並 push 到 origin。三綠燈 + CDP 全站驗收綠燈。README「畫面展示」已加系統設定頁截圖（`docs/screens/settings.png`）。本輪工作全部結束。**
- 定位：左側 rail 底部新增「系統設定」入口（第 8 個 screen，模組色中性銀灰 `#9FB0C0`、mode `doc`、鍵盤 `7`），
  承載全站前後端設定，分 7 分區（前端設定 + 六大功能模組）。核心價值是**框架先行**——schema 驅動的
  設定框架讓協作者**不碰 UI 程式碼**就能新增/刪除自己模組的設定項目；現在能確定的（policy 知識庫 +
  模型管理）做成完整互動 mock 當示範樣板，其餘四模組（twin/dispatch/epidemic/alert）為 disabled 佔位骨架。
- 真實程度：落地 localStorage（單一 key `imarine.settings.v1`）+ 有限生效——policy 地端/雲端切換、
  carbon API base、mapbox token、動效設定實際生效；其餘存而不用等後端。**只換讀取點，不動任何頁的操作邏輯**。
- **成果檔案**：`src/screens/settings/{index.ts,schema.ts,storage.ts,renderer.ts,settings.html,settings.css}` +
  `src/screens/settings/sections/{frontend,carbon,policy,twin,dispatch,epidemic,alert}.ts` 新增；
  接線改動（只換讀取點）：`src/shell/registry.ts`（第 8 筆 ScreenDef）、`src/shell/rail.ts`（spacer+hr+齒輪鈕）、
  `src/main.ts`（鍵盤 `7` + carbon base 讀取順序 settings→env）、`src/screens/policy/index.ts`（llmMode 初始化/
  回寫/subscribe 雙向同步）、`src/screens/epidemic/worldmap.ts`（mapbox token settings→env）、各頁 reduced-motion
  改讀共用 `prefersReduced()` helper（storage.ts）；測試新增 `tests/{settings-storage,settings-schema,settings-policy-preset}.test.ts`。
- **SDD 8 tasks（每個獨立 code review 皆 Spec 符合 + Quality Approved）**：(1) storage.ts + schema.ts（SettingField
  8 種 kind union / validateSections key 唯一性 throw）TDD；(2) shell 接入 + 7 分區導覽骨架 + settings.html/css；
  (3) renderer.ts（instant/explicit 語意）+ 前端設定 + 四佔位分區；(4) 有限生效接線（prefersReduced/進場動畫/
  mapbox/carbon base）；(5) 資料源總覽（carbon 真 /health 探測）+ carbon 分區（測試連線）；(6) policy 模型管理
  （供應商 Setup modal / 系統預設模型）+ llmMode 雙向同步；(7) policy 知識庫管理（多庫/KB modal/chunk/檢索策略
  progressive disclosure/rerank 導引）；(8) README 協作者指南 + 全站驗收 + 本文件收尾。
- **驗收（誠實分野）**：三綠燈全過（`tsc` 0 / `vitest` 14 檔 49 tests 全綠 / `build` ok）。純邏輯（storage
  round-trip / schema key 唯一性 / 預置資料契約）走 vitest；互動以獨立 headless Chrome（埠 9429、SwiftShader
  flags、勿加 `--disable-gpu`）+ 自寫 CDP 腳本逐項實機驗證，spec §10 全清單通過：rail 齒輪+鍵盤 `7`、`0-6` 迴歸、
  7 分區切換、instant/explicit 兩儲存語意 + 重載保留 + 捨棄還原、供應商 Setup 全流程（空值失敗→驗證→載模型→
  啟停→儲存轉已連線→系統預設 select 聯集→移除）、知識庫全流程（開庫/上傳假 indexing→available/刪文件/chunk
  儲存/hybrid 權重 slider/rerank 無模型導引跳轉/新增庫/刪庫/重置為預設）、llmMode 設定頁⇄policy 頁雙向同步 + 重載
  不失、mapbox 覆寫（settings 值壓過 .env）、reduced-motion 設定生效（epidemic 管線走同步終態分支）+
  prefers-reduced-motion 模擬、**8 頁全站迴歸 console 零錯誤**、settings 輸入框內打 `1`-`7` 不跳頁（既有 bail-out）。
  截圖 3 張（前端/policy Setup modal/KB modal，SwiftShader）存 scratch。demo 前建議真 Chrome 人工 click-through 一輪
  （切分區/開兩個 modal/拖 slider/切策略的手感）。
- **Task 8 全站驗收發現的視覺缺陷（未修，交 review 決策，見第 5 節）**：settings 頁內容**未包在 `.swrap` 版心**——
  其餘 7 個 screen 的 index.ts 都把內容包進 `<div class="swrap">`（`.swrap` 有 `padding-left:110px` 讓開固定
  rail），但 `settings/index.ts` 直接 `el.innerHTML = html.replace(...)` 無 `.swrap`（settings.css 註解誤以為
  「shell 已提供」）。實測：policy 左欄起於 x=151 已避開 rail（右緣 x=72），settings 的 `.sgrid`/`.subnav` 起於
  x=0 → 固定 rail 疊在左欄分區導覽上（垂直置中處的「沙盤推演/派工建議/疫情追溯/警報」列被 rail icon 遮住）。
  功能不受影響（CDP 94/94 全過、console 零錯誤、分區可點切），純視覺佔位錯誤。屬 Task 2（shell 接入）遺漏、
  逐 task review 未攔到，本 task 純文件+驗收依規約不自行修產品碼。最小修法：settings/index.ts 比照 carbon/
  policy/alert 把 header+sgrid 包進 `<div class="swrap">…</div>`（一行級），或於 settings.css 給 `#s-settings` 補
  `padding-left`。**建議在使用者實機驗收前先修此項。**
- 設計事實與 schema/決策見 `docs/superpowers/specs/2026-07-07-settings-page-design.md`（含 SettingField union、
  儲存語意、各分區規格、PolicyBackendSettings 資料契約、README 章節結構、驗收標準）；README 新增「協作者指南」章
  （新增/刪除設定欄位 + 讀取設定值 + mock→live + 前端頁面設計規範/PR 自查清單）作協作者 PR 檢查基準。
- **下一步**：最終 whole-branch review（opus/fable）→ 使用者實機驗收 → finishing（決定合併方式，比照
  policy/dispatch/epidemic 前例可能本地合併回 main、未 push）。詳見第 4 節。

**（以下為前一輪 Epidemic 改版，已於 2026-07-05 合併回 main 完成）**

**Epidemic 頁改版：SDD 8 tasks 全數完成並通過逐 task review + 最終 whole-branch review，已於 2026-07-05 合併回 main（commit `3a0a5f0`，本地，未 push）。分支 `epidemic-redesign`（自 main，baseline `f829e0b`）任務完結。**
- 定位：「疫情自動追溯」——進高雄港船隊總覽 → 下鑽單船；AIS 停靠序列 × WHO/疾管署/新聞疫情
  時序**時空交叉比對**（規則式評分依 WHO IHR，非 ML）→ 擴散預警 → 細胞簡訊。港邊人員視角、模組色玫紅。
- 使用者三大定案要求（全數落實）：**中性虛構船名**（不提任何真實具名事件/船/公司）、**無解釋性散文**
  （重點用數據/chip/色彩呈現）、**引導性配色**（常態壓灰、風險與命中發亮，視線帶「左欄最高風險
  → 中央命中 → 右欄簡訊」）。
- 版面：標頭 → 全寬自動化管線帶（爬情資→重建航跡→時空比對→規則評分→細胞簡訊）→ 三分割
  （左 0.72fr 進高雄船隊清單 / **中 2.9fr 放大為主要呈現** / 右 1fr 評分+情報+防護+簡訊）；
  中央上 **Mapbox 真實地圖**（深色 dark-v11，只收目的港為高雄的船、真實航線→高雄、疫區熱點、船位插值）
  + 下 Epi-Gantt 雙泳道（靠泊 × 通報 + 命中連接線），共用可拖曳時間游標。
- 四互動全做：點船下鑽、時間游標拖曳（船沿真實航線移動+命中脈衝）、管線進場動畫+點階段看來源、
  模擬偵測（池兩發：升級現有 NORDIC 88 41→68 + 新增 CORAL EXPRESS 85 紅級，池盡重置）。
- **成果檔案**：`src/screens/epidemic/{correlate.ts 新增,worldmap.ts 新增,swimlane.ts 新增,
  index.ts 重寫,epidemic.html 重寫,epidemic.css 新增}` + 刪 `route.ts` + `src/data/types.ts`
  （EpidemicSnapshot 改 fleet/pipeline/inflowPool 結構）+ `src/data/mock/epidemic.json`（全面改寫成
  六船皆進高雄，逐字轉錄自已驗收 preview）+ `tests/{epidemic-correlate.test.ts,epidemic-mock.test.ts}`
  新增 + `src/ui/tokens.css` 刪 epidemic 舊佔位段 + `package.json`（+mapbox-gl/@types）+ `.env.example`
  （+VITE_MAPBOX_TOKEN=）。
- **SDD 8 tasks（每個獨立 code review 皆 Spec ✅ + Quality Approved）**：(1) correlate.ts 規則式評分+
  時空命中 TDD；(2) 資料契約+mock 全面改寫+刪 route.ts 降過渡殼 TDD；(3) 三分割骨架+epidemic.css
  （#s-epidemic 前綴）+靜態渲染+tokens.css 清舊；(4) Mapbox 依賴+worldmap.ts+選中船地圖渲染；
  (5) swimlane.ts Epi-Gantt+點船下鑽全連動；(6) 時間游標拖曳/鍵盤+船沿航線插值+命中脈衝；
  (7) 管線進場動畫+點階段看來源+模擬偵測池兩發+show/hide 生命週期+reduced-motion；(8) 全站驗收+本文件。
- **驗收（誠實分野）**：三綠燈全過（tsc 0 / vitest 11 檔 40 tests 全綠 / build ok）。純邏輯（correlate/
  mock 契約）走 vitest TDD；地圖/互動每個 task 皆以獨立 headless Chrome + CDP（SwiftShader、勿加
  --disable-gpu；MCP 共用 profile 曾被別 session 污染故改獨立）逐項實機驗證；Task 8 全站整合驗收：
  7 頁迴歸全 active、epidemic Mapbox canvas+5 船+ring 72、下鑽 NORDIC 41、管線點階段 .pdetail 顯示、
  模擬三連擊（CORAL 85 置頂/NORDIC 68/重置）、reduced-motion 管線終態，全程 console 零錯誤；截圖存證。
  demo 前建議真 Chrome 人工 click-through 一輪（拖游標/切船/點管線/模擬偵測的手感）。
- **Mapbox token**：實作走 `.env` 的 `VITE_MAPBOX_TOKEN`（gitignored，本機已設）；範例頁
  `docs/preview/preview-epidemic-redesign.html` 的 token 已還原成佔位 `__MAPBOX_TOKEN__`（進版控無 token）；
  建議對 token 於 Mapbox 帳號設 URL 網域限制。**取捨：Mapbox 磚需連網，放棄純離線；demo 現場需備網路。**
- 設計事實與規則見 `docs/superpowers/specs/2026-07-05-epidemic-redesign-design.md`；實作計畫
  `docs/superpowers/plans/2026-07-05-epidemic-redesign.md`（8 tasks）；視覺/互動基準
  `docs/preview/preview-epidemic-redesign.html`；逐 task review 摘要 `.superpowers/sdd/progress.md`。
- **完結狀態**：最終 whole-branch review 通過 → 使用者實機驗收通過 → 已於 2026-07-05 本地合併回
  main（commit `3a0a5f0`，未 push，比照 dispatch/policy 前例）。分支任務完結。

**（以下為前一輪 Dispatch 改版，已完成）**

**Dispatch 頁改版：SDD 實作完成（7 tasks 全數逐 task review 通過），全站驗收綠燈，分支 `dispatch-redesign`（自 main，baseline `a43f249`）。待最終 whole-branch review + 使用者實機驗收 + 決定合併方式。**
- 動機：舊 dispatch mock 頁的核心假設與真實系統不符——ConvLSTM 對未來 90 分鐘輸出的是
  **單一預測**（全港區彙總：六級雨量分級 + 蒲福風級 + 10min 平均 + 陣風），無逐 10 分鐘序列、
  無空間網格；舊頁的「拖時間軸看熱區網格」與熱區 canvas（heat.ts）因此廢棄。
- 定案版面（視覺 companion 四方向比選 → D 混血 → v2/v3/v4 迭代，v5 手動更新鈕提案被否決退回
  v4）：hero 三塊（風險色大字塊 / 一句話結論 + 複合時間軸 slider / 更新進度環 10:00 自動倒數）
  + 七列作業燈號矩陣（ConvLSTM 寬欄含動作字 + CWA +3h/+6h 窄欄純色，列點擊原位展開規則依據含
  官方/慣例徽章）+ 右欄派工指令卡（含綁解纜「加派」型綠卡）。三情境 stable/rain/typhoon。
- 成果檔案：`src/screens/dispatch/{index.ts 重寫,dispatch.html 重寫,dispatch.css 新增,
  conclusion.ts 新增}` + 刪 `heat.ts` + `src/data/types.ts`（DispatchSnapshot 改三情境結構）
  + `src/data/mock/dispatch.json`（全面改寫成三情境，逐字轉錄自已驗收 preview）+
  `tests/{dispatch-conclusion.test.ts,dispatch-mock.test.ts}` 新增（+`mock.test.ts` 一個
  pre-existing 案例隨契約改版更新）+ `src/ui/tokens.css`（刪舊派工段）。
- **SDD 7 tasks（每個獨立 code review 皆 Spec ✅ + Quality Approved）**：
  (1) conclusion.ts parseConclusion（{{stop:}}→<em>、{{add:}}→<u>）TDD；
  (2) 資料契約三情境 + mock JSON 逐字轉錄 + 刪 heat.ts + 降過渡殼 TDD；
  (3) 版面骨架 + dispatch.css（自 preview 逐條轉錄、全 #s-dispatch 前綴）+ 靜態渲染 + tokens.css 清舊；
  (4) 情境切換 + 規則展開（單列互斥）；(5) 時間軸游標（三段泡泡 + 欄標頭連動 + 鍵盤隔離）；
  (6) 模型更新倒數（10:00 自動 + 推論動畫 + show/hide 生命週期 + reduced-motion + DEV-only 測試鉤）；
  (7) 全站驗收 + 本文件收尾。
- **驗收（誠實分野）**：三綠燈全過（tsc 0 / vitest 9 檔 29 tests 全綠 / build ok，DEV 鉤 grep dist=0）。
  控制器每個互動 task 皆以 headless Chrome + CDP 實機逐項驗證（Task3 靜態 8 斷言、Task4 情境+規則
  21、Task5 時間軸+鍵盤 12、Task6 倒數+生命週期+RM 17、Task7 七頁全站+整合+demo 動線 18），
  合計 76 斷言全 PASS、console 全程零錯誤；三情境（含 typhoon 玫紅態規則展開）截圖存證於 scratch。
  demo 前建議真 Chrome 再人工 click-through 一輪（拖時間軸/切情境/點列展開的手感）。
- 關鍵設計事實與規則庫依據見 `docs/superpowers/specs/2026-07-05-dispatch-redesign-design.md`
  （決策表 / 資料契約 DispatchScenario / 規則庫 15 條含官方條號出處 / 三情境劇本 / 互動規格 /
  驗收標準）；實作計畫 `docs/superpowers/plans/2026-07-05-dispatch-redesign.md`（7 tasks）；
  視覺/互動基準 `docs/preview/preview-dispatch-redesign.html`（36 CDP 斷言已驗收）。
- **下一步**：最終 whole-branch review（opus）→ 使用者實機驗收 → finishing（決定合併方式，
  比照 policy 前例可能本地合併回 main、未 push）。

**（以下為 Dispatch 改版 brainstorming 歷程記錄，實作見上）**
- 兩份 subagent 網路調研沉澱進 spec：(1) 港口作業天氣規範（法定強風 10 m/s 勞動部函釋 0042784、
  高雄港風災防救要點 7 級全港停工/5 級浮筒淨空/警戒加纜 5/7 條/危險品船出港、起重機 30 m/s
  錨定線、穀物見雨即停 WWD 慣例、油品雷電紅線 ISGOTT Ch.16、CWA 雨量分級）；(2) UI/UX 參考
  （StormGeo per-operation 紅黃綠矩陣、Apple Weather 一句話結論、Yahoo!天気雙資料源同軸縫合）。
- preview 迭代修正一個真問題：時間軸 `setPointerCapture` 對合成 pointer 事件拋 NotFoundError，
  已加 try/catch 防禦（實作 Task 5 帶入）。

**（以下為前一輪已完成工作）**

**Policy 頁改版：實作完成並已合併回 main（本地，未 push）。**
- SDD 執行 8 個 task（generate.ts TDD → 契約+mock JSON TDD → components.ts source optional →
  三欄骨架+版型+gbar → 對話串 → 生成動畫+情報流入 → 綜合對話知識庫 → 全站驗收），每 task 皆
  獨立 code review（Approved 或 Needs-fixes→修正 Approved）；最終 whole-branch review（opus）
  = Ready to merge（零 Critical/Important）；複審修正波 4 修正（hide() 動畫凍結、@keyframes
  pulse 改名 pgpulse 防跨頁衝突、gbar-note 去重、cite 對映測試硬化）。
- 成果：`src/screens/policy/{index.ts,policy.html,policy.css}` 重寫 + `generate.ts` 新增 +
  `src/data/types.ts` PolicySnapshot 改 briefs/inflow/globalQa discriminated union +
  `src/data/mock/policy.json` 全面改寫（9 情報 + globalQa）+ `src/ui/components.ts` source 改
  optional + `tests/policy-generate.test.ts`/`policy-mock.test.ts` 新增。視覺/互動基準為已核可
  的 `docs/preview/preview-policy-redesign.html`（v7）。
- 合併：使用者選「本地合併回 main」，fast-forward 到 580f3e4，feature 分支 policy-redesign 已刪，
  **未 push**（依專案慣例）。
- **驗收狀態（誠實分野）**：policy 全部測試綠（policy-generate 2/2、policy-mock 4/4）、tsc 0、
  build ok；全站七頁導覽 console 乾淨；綜合對話模式已用 Playwright 實機截圖確認。互動路徑
  （點船式互動除外，policy 無 3D）如點 chip 生成/追問/情報流入/搜尋/reduced-motion 由 SDD 過程
  中 headless CDP 逐項驗證，demo 前建議真 Chrome 再人工 click-through 一輪。
- **合併後測試殘留（非 policy 缺陷，見第 5 節）**：合併後全套重跑時 `tests/twin-provider.test.ts`
  的「snapshot 映射…」逾時（Test timed out in 5000ms，非斷言失敗）——twin 舊測試動態載入 4.6MB
  航跡在機器負載下超過 vitest 預設 5s；本分支未動任何 twin 檔。屬 pre-existing 環境 flaky。

**（以下為 Policy 改版 brainstorming 歷程記錄）**

**Policy 頁改版 brainstorming（已完成，實作見上）：設計定案，示範介面 v7 使用者驗收通過。**
- 方向（全部經使用者逐項確認）：政策情報中心＝ NotebookLM 三欄骨架 × Perplexity「看得見 AI
  在工作」生成過程。三種情境進同一個收件匣敘事：突發事件決策建議（主秀：紅海航線中斷升級）、
  新政策分析（現有 IMO NZF 五段報告原樣沿用）、routine 日報（07:00 自動生成晨報）；LLM 接口
  切換（抽象命名「地端部署／雲端 API」，只影響下一次生成）。**純 mock**，不接真 LLM。
- Layout 經視覺 companion 三輪迭代：初版三欄被使用者評「太繁雜」→ 減負（無過濾 chips、meta
  單行、來源勾選框 hover 才浮現、突發不做獨立嚴重度橫幅）→ 定案「三欄・極簡左欄」：左欄純收
  件匣（色點＋標題）、中欄報告（三類專屬版型 + 生成步驟動畫）、右欄 Grounding 儀表＋來源清單
  （勾選與引用合一，iMarine 五類徽章對齊報告書 v6）。
- spec：`docs/superpowers/specs/2026-07-04-policy-redesign-design.md`（決策紀錄表、互動規格、
  PolicyBrief discriminated union 資料契約、7 條 mock briefs 清單、檔案結構、驗收標準）。
- 互動示範：`docs/preview/preview-policy-redesign.html`（自含 Kit，比照 twin preview 前例組裝；
  headless Chromium 驗證 console 零錯誤 + 自動互動斷言全 PASS：條目切換、日報建議關注
  goto、LLM 切換、來源取消勾選後統計遞減、生成動畫完成/取消路徑）。
- **mockup 驗收輪修訂（使用者回饋後定案）**：(1) 中欄改為 NotebookLM 純血對話串——報告變成
  串中第一張「結構化產出卡」，下方建議追問 chips（每條 brief 帶 qa 預錄劇本）+ 輸入列；追問
  → 思考氣泡兩拍 → 回答氣泡（cite 連動右欄、footer 帶模型/引用數）；自由輸入回覆誠實示範
  說明；重新生成的四步驟動畫改在產出卡內原位播放、Q&A 氣泡保留。(2) 移除標題列技術徽章
  `.lg-chip` 與 mockup 專用 `.mocknote` 浮籤。spec 已同步（§2 決策表/§3 版面/§4.6/§6 qa 契約/
  §10 驗收）。v2 斷言 19 項全 PASS；headless 截圖驗證需 SwiftShader flags（`--use-gl=angle
  --use-angle=swiftshader --run-all-compositor-stages-before-draw`，否則玻璃層合成不出來——
  純 DOM 斷言不受影響）。
- **v3 修訂（使用者回饋第二輪）**：(1) 標題列 MOCK 資料源 chip 也移除——本頁不顯示 srcChip
  （使用者定案的頁面特例），標題列只剩 eyebrow/標題/LLM 切換器。(2) 新增「模擬情報流入」：
  進頁 ~9 秒自動插入第 8 條突發情報（巴拿馬運河配額削減，與紅海構成雙節點受限敘事）——頂部
  滑入 + 未讀圓點脈動 + toast「偵測到新事件」，不搶走目前選中，點開未讀消失；收件匣「怎麼來」
  的口徑（突發=異常偵測自動立項/政策=法規公告監測/日報=07:00 排程）寫入 spec §4.7。
  v3 斷言 11 項全 PASS、console 乾淨；spec 已同步（§2/§3/§4.7/§6 表加第 0 條/§10）。
- **v4 修訂（使用者回饋第三輪）**：(1) 收件匣標題列加「模擬偵測」按鈕——流入池兩條（巴拿馬
  → 馬六甲碰撞管制）依序流入、池用畢再點擊即重置循環，demo 可無限重複；~9 秒自動流入僅在
  未手動觸發過時執行。(2) 新增 NotebookLM 式「綜合對話」：收件匣頂部固定入口（漸層點 +
  分隔線）→ 知識庫模式——meta 顯示情報/來源/勾選統計、總覽卡（五類分佈）、右欄變全情報
  來源聯集（名稱去重重編號、勾選跨切換保留、流入自動擴充且不重置對話串）、Grounding 儀表
  顯全情報平均；綜合提問劇本 2 組，引用以 {{c:名稱}} 佔位、送出當下解析成聯集編號。
  「重新生成」於知識庫模式隱藏。v4 斷言 21 項全 PASS、console 乾淨；spec 已同步（§2/§4.7
  改寫/§4.8 新增/§6 流入池/§10）。
- **v5 修訂（使用者回饋第四輪：綜合對話來源平面清單太長難找）**：來源聯集改依 iMarine
  五類**分組摺疊**——群組標頭（三態群組勾選框 + 展開箭頭 + 類名 + 勾選數/總數）預設全部
  收合（24 筆 → 5 列）、頂部搜尋框（過濾即自動展開命中群組）、cite 點擊自動展開目標群組
  再捲動、hover 收合中來源改高亮群組標頭；一般條目模式（3-7 筆）維持平面清單。v5 斷言
  14 項全 PASS、console 乾淨；spec §4.8/§10 已同步。
- **v6 修訂（使用者回饋第五輪：Grounding 環形儀表太搶眼）**：移除右欄 `.lg-gauge` 儀表卡，
  改為中欄 meta 行下方的**窄橫向 bar**（GROUNDING 小標 + 180px 漸層細軌 + % + note，切換
  條目 0→值 過場、reduced-motion 直設）；meta 行去掉重複的「Grounding g%」字段；右欄整欄
  讓給來源清單。綜合對話模式 bar 顯全情報平均。v6 斷言全 PASS、console 乾淨；spec
  （§3 版面圖/§4.1/§4.8/§6 註解）已同步。
- **v7 修訂（使用者定案）**：移除中欄 meta 統計行（模型/時間/檢索/閱讀/引用那串字）——標頭
  只剩標題 + 重新生成鈕 + Grounding bar；模型/引用資訊只在回答 footer、toast 與生成步驟
  計數出現。斷言全 PASS、console 乾淨；spec 全文同步（決策表/版面圖/§4.2-4.4/§4.8/§10）。
- **mockup 迭代至 v7 使用者驗收通過。**
- **實作計畫已寫好**：`docs/superpowers/plans/2026-07-05-policy-redesign.md`（8 tasks：
  generate.ts TDD → 契約+mock JSON TDD → components.ts source optional → 三欄骨架+版型 →
  對話串 → 生成動畫+情報流入 → 綜合對話 → 全站驗收；每 task 檢查點由使用者 commit）。
- **Task 4 完成**（分支 `policy-redesign`）：重寫 `policy.html`/新建 `policy.css`/重寫
  `index.ts`——三欄骨架（收件匣/報告對話串/來源清單）+ 三類版型（突發雙案例卡、政策五段、
  日報四條+建議關注跳轉）+ Grounding 窄 bar + cite 連動 + 來源勾選即時灰列。CSS 遷移逐條對照
  brief 清單刪重複/前綴 `#s-policy`；過程中撈出一個真實 bug——tokens.css 既有的孿生模組
  `.gbar{position:absolute;...}`（未加前綴）會外漏污染同名 policy `.gbar`，把 Grounding bar
  拉出文件流疊到報告內文中間，已於 `#s-policy .gbar` 顯式覆寫 position/top/bottom/opacity/
  border-radius 修正，headless 截圖驗證前後對照確認。`npx tsc --noEmit` 0 錯、
  `npx vitest run` 21 PASS、`npm run build` 成功；MCP 內建瀏覽器工具（chrome-devtools/
  playwright）皆回報 profile 被鎖（多個並行 session 佔用），改用獨立 headless Chrome
  （`--remote-debugging-port` + 專屬 user-data-dir）自寫 CDP 腳本跑完 brief 驗收清單
  1-6 全數逐項驗證含互動（切換條目/勾選來源/cite hover-click/LLM 切換 toast），
  console 全程乾淨。
- **Task 5 完成**（分支 `policy-redesign`）：`index.ts` 接上追問互動——`renderChips`/
  `scrollThread`/`ask`/`currentQa`/`sendFree` + `cancelTimers()`/`answering`/`generating`
  狀態；chip 點擊/自由輸入 → 使用者氣泡 → 兩拍思考氣泡（檢索…→綜合回答與 Grounding
  驗證…）→ 回答氣泡（cite 連動右欄、footer 模型/時間/引用數）；chip 用掉即消失並依
  brief id 記憶（切條目重置對話串但保留記憶）；回答/生成互斥不可重入；切條目或切頁
  `cancelTimers()` 取消進行中 timeline（不洩漏回答到別條）；reduced-motion 跳過思考氣泡。
  僅動 `index.ts`；`npx tsc --noEmit` 0 錯、`npx vitest run` 21 PASS、`npm run build` 成功；
  MCP 內建瀏覽器（chrome-devtools/playwright）profile 仍被鎖，沿用 Task 4 手法改用獨立
  headless Chrome（`--remote-debugging-port` + 專屬 user-data-dir）+ 自寫 CDP 腳本（Node
  + `ws`）以真實時間流逝逐項驗證 brief 驗收清單 1-5 全數通過（含不可重入、切條目取消、
  reduced-motion 分支），console 全程乾淨。Task 6（生成動畫+情報流入）待下一輪。
- **Task 6 完成**（分支 `policy-redesign`）：`index.ts` 接上「重新生成」四步驟動畫與「模擬
  偵測」情報流入——`STEPMS`/`stepHtml`/`regenerate()` 在 `#reportBody` 內原位播放（解讀議題
  →檢索→閱讀來源逐一輪播勾選來源名→綜合驗證），完成後段落 `--gd` stagger 進場 + toast，
  reduced-motion 直通結果；受 `generating||answering||curId==='global'` 互斥保護，`model`
  捕捉觸發當下的 LLM 接口。`flowIn()`/`flowIdx`/`autoFlowArmed` 讓流入池（巴拿馬→馬六甲）
  依序滑入收件匣頂部、標未讀+一次性滑入動畫，不搶目前選中；池用畢下一擊重置並重新流入
  （若移除項含目前選中則退回第一條）；`updateAfterInflow()` 本 task 為 no-op，留給 Task 7
  接 global 聯集同步。`Screen.show()` 武裝 9 秒自動流入，僅在 `flowIdx===0` 且本頁 `.active`
  時觸發（離開頁面/被搶先手動觸發皆不誤跳 toast）。僅動 `index.ts`；`npx tsc --noEmit` 0 錯、
  `npx vitest run` 21 PASS、`npm run build` 成功；MCP 瀏覽器 profile 仍被鎖，沿用獨立 headless
  Chrome（`--remote-debugging-port` + 專屬 user-data-dir，SwiftShader flags 供截圖）+ 自寫
  CDP 腳本以真實時間流逝跑完 brief 驗收清單 1-7（含地端/雲端計時、取消勾選來源後計數變化、
  生成中切條目/切頁的取消語意、模擬偵測三次循環、9 秒自動流入與「先手動觸發則不自動」互斥、
  停在 hero 頁不跳 policy toast），console 全程乾淨；三張截圖存證（步驟動畫中/完成 stagger+
  toast/模擬流入雙 toast + 未讀點）。
- **Task 7 完成（最後一個功能 task，分支 `policy-redesign`）**：`index.ts` 接上「綜合對話」
  知識庫模式——`buildUnion()`（跨 briefs 來源聯集、名稱去重重編號、`globalChecked` 跨切換
  保留勾選）、`resolveTokens()`（`{{c:名稱}}` → 送出當下解析成聯集編號 cite span）、
  `renderUnionSources()`（五類分組摺疊、三態群組勾選用 `indeterminate` property、搜尋自動
  展開命中群組並隱藏無命中群組、搜尋框重繪後還原焦點與游標）；`select('global')` 分支接在
  `select()` 開頭（`cancelTimers()` 之後）、隱藏 `genBtn`、`thread.innerHTML` 無條件寫入知識
  庫總覽卡；`currentQa()`/qchips 委派/`updateAfterInflow()`/`bindCites()` 均擴充 global 分支
  （收合群組時 hover 高亮標頭、點擊自動展開+捲動）。僅動 `index.ts`；`npx tsc --noEmit` 0
  錯、`npx vitest run` 21 PASS、`npm run build` 成功；MCP 瀏覽器 profile 仍被鎖，沿用獨立
  headless Chrome（`--remote-debugging-port` + 專屬 user-data-dir）+ 自寫 CDP 腳本跑完 brief
  驗收清單 1-7（含群組全選/半選/清空、搜尋過濾、cite hover/click 收合展開、模擬偵測不重置
  對話串、勾選與 chip 記憶跨切換保留、切回一般條目 genBtn 恢復），另補一組針對性測試驗證
  Task 5 已知邊界情況——條目回答思考氣泡進行中切到「綜合對話」，`thread.innerHTML` 完整覆蓋
  無殘留思考氣泡、且原 timeline 被 `cancelTimers()` 真正取消不會延遲洩漏回答氣泡；
  console 全程乾淨。**六大功能 task（4-7）全數完成，Policy 頁改版剩 Task 8 全站驗收。**
- **Task 8 完成（全站驗收 + 文件收尾，分支 `policy-redesign`）：Policy 頁改版 8 個 task 全部完成。**
  未改動任何程式碼，純驗收：
  - **三綠燈**：`npx tsc --noEmit` 0 errors；`npx vitest run` 7 個測試檔 21 tests 全綠；
    `npm run build` 成功（173 modules，3.67s，既有 chunk-size 警告與本次無關）。
  - **spec §10 逐項驗收（1-9）**：MCP 瀏覽器（chrome-devtools/playwright）profile 仍被鎖，沿用
    Task 4-7 手法——獨立 headless Chrome（`--remote-debugging-port=9455` + 專屬 user-data-dir +
    SwiftShader flags）+ 四支自寫 CDP 腳本（Node + `ws`），共 106 項斷言全數通過：
    (1) 三條主秀劇本迴歸——紅海 4 區塊+雙案例卡、重新生成四步動畫（地端 7.8s 內完成含前置
    delay、雲端更快）+ stagger + toast；NZF 五段文案 + cite hover/click 連動右欄；07-04 晨報
    建議關注 goto → 正確跳轉 NZF。(2) LLM 切換：chip 互斥、toast、雲端/地端生成與回答計時差異、
    切換後不覆寫已顯示回答的 footer 模型名。(3) 來源勾選：checkbox 預設 `opacity:0`（hover
    才浮現，CSS 層級，不影響功能）、取消勾選→灰列「未參與」、重新生成閱讀計數隨勾選數變化。
    (4) 追問對話：chip→使用者氣泡→兩拍思考氣泡→回答氣泡（cite+footer 模型/時間/引用數）、
    chip 用畢跨切換記憶、自由輸入誠實示範說明、不可重入、生成/回答中切條目正確取消不洩漏。
    (5) 模擬情報流入：**首次全流程跑在單一長壽命 session 內時，因中途各項生成/回答動畫耗時
    加總已超過 9 秒，9 秒自動流入會提前於手動點擊插入，導致池計數表面「錯位」**——另補一支
    獨立腳本用全新分頁乾淨重測，確認：模擬偵測 3 連擊＝巴拿馬→馬六甲→池用盡重置回收（正確
    無誤，含未讀點/toast/不搶選中）、9 秒閒置自動流入（僅觸發一次）、離開頁面 9 秒內不跳
    policy toast 且收件匣不變——12/12 全通過，證實(1)的「錯位」是測試手法問題而非程式缺陷。
    (6) 綜合對話：知識庫模式（genBtn 隱藏/總覽卡/聯集去重編號/平均 Grounding）、五類分組摺疊
    三態勾選、搜尋過濾自動展開、跨情報 chip 回答 cite 正確映射聯集編號、收合群組 cite 點擊
    自動展開+捲動/hover 高亮群組標頭、流入時聯集同步擴充且對話串不重置、切回一般條目
    genBtn 恢復、勾選狀態跨切換保留。(7) 全部 8 筆收件匣入口（7 briefs + 綜合對話）逐一點擊
    右欄同步、console 全程零錯誤。
  - **鍵盤導覽迴歸**：`#qinput` focus 後以 CDP `Input.dispatchKeyEvent` 送出真實鍵盤事件輸入
    `1`-`6`，六碼正確落入欄位且 `location.hash` 全程未變；對照組確認同碼在非輸入框情境下
    仍正常觸發全站導覽（`main.ts` 既有的 `INPUT/TEXTAREA/SELECT/isContentEditable` bail-out
    確認涵蓋本頁新輸入框，無需改動）。
  - **`prefers-reduced-motion: reduce` 驗證**（CDP `Emulation.setEmulatedMedia`）：13 項全過——
    選條目無淡入即完整顯示、重新生成無四步動畫直接出結果+toast、追問無思考氣泡直接出答案、
    模擬流入條目無 slidein class 直接出現（未讀點仍標示，脈動效果屬 CSS 動畫由 media query
    抑制，class 層級無法量測但已確認邏輯路徑正確跳過）、Grounding bar 兩種模式皆直接設值非
    0%，內容皆完整非空白。
  - **7 頁全站迴歸**：hero→carbon（PoC 後端剛好在線，LIVE 資料）→policy→twin（原生 WebGL 3D
    場景截圖確認真實渲染，非空白/未拋錯）→dispatch→epidemic→alert→回 hero，全程 `.screen.active`
    正確切換、console 零新增錯誤。
  - **殘留/未盡事項**：無阻斷性殘留；驗收過程發現的「模擬流入計數錯位」純屬第一支驗收腳本的
    測試手法瑕疵（沿用同一活頁跑滿全部項目導致背景 9 秒計時器提前觸發），已用獨立分頁重測
    排除疑慮，不影響任何交付程式碼。完整逐項證據（含截圖）見
    `.superpowers/sdd/task-8-report.md`（scratch，未進版控）。
  - **Policy 頁改版 8 個 task（TDD generate.ts → 契約+mock JSON → components.ts 微調 → 三欄
    骨架+版型 → 對話串 → 生成動畫+情報流入 → 綜合對話 → 全站驗收）全部完成，分支
    `policy-redesign` 待使用者實機驗收 + 決定整支複審/合併方式。**

**（以下為已完成的前一輪工作）**

**Twin 頁原生化改版：10 個 task 全部完成，全站驗收通過。**
- 動機：原本 iframe 嵌 LiDAR 有兩個根本問題——demo 要多起一個 server（埠 5174）、
  LiDAR 自帶戰情室 UI 與本 repo 四張沙盤浮動面板堆疊打架。
- 定案方向（全部經使用者逐項確認）：LiDAR 引擎+場景+資料**整包搬進本 repo 原生化**
  （方案 A，比照 Carbon 搬入先例，上游唯讀）；UI 重做為**雙分頁戰情室**（即時回放＝
  過去 24hr 真實 AIS 回放／未來推演＝沙盤 mock），**只有右 rail**（無左 rail、無標頭）、
  一條底部時間軸（語意隨分頁切換）、船型篩選兩分頁共用；納入案例調研三功能：航跡密度
  圖層（學 MPA 熱圖）、點船資訊 chip（學 Corpus Christi OPTICS）、視角預設運鏡。
- 資料盤點：LiDAR 的 423MB `models/` 是離線管線素材**不搬**；runtime 只需 ~8.5MB
  （4.6MB 單日航跡 443 艘×24.2hr + 2.1MB 航照底圖 + 1.3MB 船模點雲 + 零頭）。
- 產出：spec `docs/superpowers/specs/2026-07-04-twin-native-redesign-design.md`（含檔案
  結構、資料清單、分頁行為表、三功能規格、生命週期、驗收標準）；互動 mockup
  `docs/preview/preview-twin-redesign.html`（自含 Kit，v4，兩分頁/篩選/密度/點船/視角
  全部可操作，headless Chromium 驗證 console 乾淨）；分支 `twin-native-redesign`
  （baseline commit `6355e90`）。
- **Task 1-9（實作）逐一完成並通過 review**（commits `0aa9ffc`..`c3d2c12`）：
  - Task 1：`npm install three`/`three-mesh-bvh`/`troika-three-text` 三件套 + `@types/three`；
    `tsconfig.json` 補 `lib`/`esModuleInterop`；`cp -R ~/Desktop/LiDAR/src src/twin-engine`
    （23 檔，`diff -rq` 確認逐位元組相同的唯讀 vendored 副本）。
  - Task 2：場景/geo/time/data/palette 等模組 + `berths.ts`（執行時發現的傳遞依賴，補入
    複製清單）+ ~8.5MB runtime 資料搬進 `src/screens/twin/data/`。
  - Task 3：`scene-init.ts` 忠實改包上游 `main.ts`（404 行邏輯），新增
    `flyTo`/`setDensity`/`pickShipAt`/`inPortAt`/`categoryCounts` 等握把 API，TDD 補 6 個
    單元測試。
  - Task 4：新版面骨架 `twin.html`/`twin.css`（`#s-twin` scope，無手寫 backdrop-filter）+
    `index.ts` 重寫生命週期（mount/show/hide）+ viewbar（視角預設運鏡）+ tabsbar（雙分頁）；
    舊 iframe／連線探測／`OFFLINE` fallback／`setTwinOffset` 全數刪除。
  - Task 5：右 rail 篩選（10 列船型）／密度圖層開關／在港趨勢 SVG（`panels.ts`）。
  - Task 6：底部時間軸 `timeline.ts`（回放 scrub、未來推演 NOW+分鐘、播放/倍速，分頁語意
    切換 + 凍結時停用 rAF）。
  - Task 7：未來推演右 rail 面板——情境切換（4 顆按鈕 + toast）、泊位甘特（資料驅動選窗，
    本快照選中最忙連續 8 泊位 63-70）、KPI 在港船數彈簧動畫；Task 7 review 後一次修正
    `#gantt{position:relative}`（commit `6527e0a`，現在線對齊問題）。
  - Task 8：點船資訊 chip——`pickShipAt` 點擊命中 → 固定骨架 `innerHTML` + 動態欄位改
    `textContent`（XSS 安全），四種收起觸發（空點/scrub/切分頁/切視角）齊全。
  - Task 9：twin provider 改寫為原生資料版（`source:'live'`，讀 vendored JSON，無 `url`
    欄位、無任何 HTTP 呼叫；4.6MB 航跡資料只在 `snapshot()` 內動態 `import()`，build chunk
    驗證證實懶載入不進 58KB 開機 entry）；連帶清理 `types.ts`/`screens/types.ts` 過期的
    iframe/`url` 字眼、`.env.example` 移除 `VITE_TWIN_URL`。
  - 三項案例調研功能全數落地並個別驗證：航跡密度圖層（Task 5）、點船資訊 chip（Task 8）、
    視角預設運鏡（Task 3+4）。全程 `npx tsc --noEmit` 0 errors、`npx vitest run` 由 10/10
    累加到 16/16、`npm run build` 皆成功；每個 task 皆有獨立 code review（Approved 或
    Needs-fixes→已修正 Approved），Minor 級發現彙整於 `.superpowers/sdd/progress.md`
    留給下一輪 whole-branch review。
- **Task 10（樣式殘留清理 + 文件更新 + 全站驗收）完成**：
  - `src/ui/tokens.css` 移除孿生區段已死的 `.float-tl`/`.float-r` 規則（含窄螢幕 media query
    內的 `.float-r{display:none;}`）——twin.css 現已有自己 scope 過的版面選擇器，這兩組舊
    浮動面板選擇器（iframe 時代遺留）確認全站無其他引用。
  - `README.md` 全文掃描：`.env` 現只剩一個變數（`VITE_CARBON_API`）、刪除
    `VITE_TWIN_URL`/iframe 表列與說明、「Live Demo 前置作業」改為僅 carbon 需要，twin
    明確標示原生內建、`npm run dev` 即可、無需任何前置服務。
  - `CLAUDE.md` §2 相鄰工作區表格：數位孿生列註明引擎+場景已 vendored 進
    `src/twin-engine/` 與 `src/screens/twin/`，上游 LiDAR repo 僅供資產再生成；§3 twin 列
    狀態改為「live/native（自繪，無外部依賴）」，取代舊的「待嵌入」。
  - 全站驗收（對照 spec §13）：`tsc`/`vitest`/`build` 三綠燈；埠 5174 確認無需求（twin 不
    再發出任何對外連線）；Chromium headless 驗證 twin 頁 3D 直繪 + 右 rail + 時間軸，以及
    全七頁（hero/carbon/policy/twin/dispatch/epidemic/alert）逐一到達、console 零錯誤。
  - 完整報告：`.superpowers/sdd/task-1-report.md` ~ `task-10-report.md`（scratch，未進版控）；
    `.superpowers/sdd/progress.md` 有逐 task review 摘要。
- **最終 whole-branch review（opus）完成：Ready to merge**——零 Critical/Important 跨 task
  缺陷；承載性接縫（modeApi/timeline/panels/chip 接線順序、共用 filter 兩分頁傳播、凍結
  語意、`engine.start()` 冪等、懶載入邊界、WebGL throw 由 router 錯誤路徑復原）全數確認
  正確。累積 Minor 全部判 defer-acceptable，詳見 `.superpowers/sdd/progress.md` 末段。
- **已合併回 `main`（fast-forward 到 `ce19963`，12 個 commit）並 push 到 origin**
  （`github.com/NCHU-ICTALab/iMarine-FrontEnd`）；feature 分支 `twin-native-redesign` 已刪除；
  合併結果 `tsc` 0 / `vitest` 16/16 綠燈；使用者實機驗收通過。
- **畫面展示入 README**：`docs/screens/twin.png`（原生 3D 數位孿生，SwiftShader 實拍）+
  `docs/screens/carbon.png`（carbon LIVE 真實資料，PoC 後端 8000 在跑時擷取），README
  新增「畫面展示」段引用。
- 殘留（非阻斷，見第 5 節）：opus 建議的一行 polish（`panels.ts`/`timeline.ts` 的
  `Math.round(min%60)` 快速播放可能閃「HH:60」，改 `Math.floor`）尚未動，待使用者指示；
  互動路徑（點船/拖曳/分頁轉場/運鏡/reduced-motion）demo 前建議真 Chrome 人工 click-through。
- twin 頁原生化改版至此全部完成，無其他排定 task。

**（以下為既有進度記錄）**

**全站複審最終修正波（8 項，接續 Task 12 之後）完成。**
- Fix 1（重要，真缺陷）：`src/main.ts` 全域 `keydown` 導覽鍵（`0`/`1-6`/`Enter`）先前未檢查
  `e.target`，在 carbon 的單筆發行/上架等 modal 輸入框（`#one-ship`/`#one-gfi`/`#one-mj`/
  `#list-price` 等）打數字會誤觸導覽、跳離畫面。修正：handler 開頭加兩道 bail-out——
  `e.metaKey/ctrlKey/altKey` 直接略過（不劫持瀏覽器快捷鍵）、`e.target` 為 `INPUT`/
  `TEXTAREA`/`SELECT`/`isContentEditable` 也直接略過，其餘導覽邏輯不動。
- Fix 2/3（M10/M11）：`src/screens/carbon/carbon.css`——`.wrap` 頂部 padding 由 PoC 舊 topbar
  時代遺留的 `104px` 改回 `24px`（shell 標題列取代 topbar 後不需再讓出空間），側/底距不動；
  刪除 `#s-carbon .eyebrow .dot{background:#fff}` 這條蓋掉 shell 金色模組色的洩漏 PoC 樣式，
  改吃 `tokens.css` 的 `.eyebrow .dot{background:var(--mc)}` + `screenHeader` 給的
  `--mc:#E9BC63`，header 圓點現正確顯示金色。副作用（非缺陷）：碳權頁內部沒有帶
  `--mc` 的次要 eyebrow（工作台工具列「SU 資產」、稽核表頭、drawer、各 modal 標頭）原本也被同一條
  規則強制染白，移除後改吃 shell 預設青綠色 `#35E0A6`，非本次修正範圍、维持現狀。
- Fix 4（M3）：`src/shell/router.ts` 的 `go()` 首次掛載區塊——`await def.load()` /
  `await mod.default.mount()` 原本沒有 try/catch，動態 import 失敗或 mount() 拋錯會留下
  孤兒 `<section>`（未快取、未移除）且 `currentId` 卡在半吊子狀態。修正：兩個 await 包進
  try/catch，catch 內 `section.remove()` + `currentId` 復原成前一頁 + `return`；與既有的
  supersede-abort（`myToken !== token`）邏輯並存但語意分開，happy path 不動。
- Fix 5（M7）：同檔 `show()`/`applyMode` 呼叫處加一行註解，明記兩者必須同步（中間不可插入
  `await`）——hero 的 `show()` 用 `queueMicrotask` 覆寫模式即依賴此順序，純文件補充、無行為改動。
- Fix 6（M2）：`index.html` `<head>` 加 `<link rel="icon" href="data:,">`，消除瀏覽器對
  `/favicon.ico` 的預設請求（先前 Task 12 驗收記錄的「僅預期內的 favicon 404」自此不再出現）。
- Fix 7（lg.d.ts）：`src/ui/lg.d.ts` 的 `LiquidGlass.behaviors` 型別原本只有 `stats`，補齊
  Kit 實際存在的 `tabs?`/`slider?`/`switchTension?`/`dock?`（對照 `liquid-glass.js` 第 1561
  行的 `behaviors` 物件），純型別補充，各 screen 既有的 `as {...}` cast 不受影響。
- Fix 8（M13）：新增 `tests/twin-provider.test.ts`（仿 `carbon-provider.test.ts` 風格，stub
  全域 `fetch`）：驗證 `createTwinProvider` 成功時把 `{berths:[{code,lat,lon,angle,nameZh}]}`
  映射成 `{berths:[{id,name}],trackCount}` 且 `source==='live'`；fetch 拒絕時回退為
  `{berths:[],trackCount:0}`。`npx vitest run` 由 8 → 10 通過（4 個測試檔）。
- **驗收**：`npx tsc --noEmit` 0 errors；`npx vitest run` 10/10 通過；`npm run build` 成功
  （39 modules）。Chromium：(a) carbon 頁開「單筆發行」modal（此次驗證時 PoC 後端剛好在線，
  108 筆真實 SU），在 `#one-ship`/`#one-gfi` 打 `1`/`2`/`3`/`0`/`5`/`6`，數字正確落入欄位、
  `location.hash`/`data-mode` 全程未變（未跳頁）；關閉 modal、focus 移到非輸入元素後按 `2`
  仍正確導覽到 policy、按 `0` 仍正確回到 hero。(b) carbon 頁標題列下無多餘空白、eyebrow 圓點
  電腦色值為 `rgb(233,188,99)`（即 `#E9BC63` 金色，非白色）。(c) `list_network_requests`
  全程（含跨頁導覽）38→115 筆請求皆無 `favicon.ico`；`list_console_messages` 全程僅
  `[vite] connecting/connected` debug 訊息，零錯誤。
- 本次修正未變更任何 spec 行為範圍以外的程式碼；詳細 file:line 對照與自我審查見
  `.superpowers/sdd/final-fix-report.md`（scratch 報告，未進版控）。

**Task 12（Policy screen + README + 全站驗收）完成 —— 12 個 task 全部完成。**
- 新增 `src/screens/policy/policy.html` + 重寫 `src/screens/policy/index.ts`（原為 stub）：標頭改用
  `screenHeader`；議題列（`.topic`，含「重新生成」鈕）、報告五段（`<h3>`+`<p>`，`html` 內含 cite span
  原樣塞入不逃逸）、Grounding 環形儀表（`data-lg-value` 吃 `snapshot.grounding`）與引用來源清單
  （`.srcrow` + `data-no`）皆由 `ctx.data.policy.snapshot()` 動態產生；`policy.html` 只留 `__TOPIC__`/
  `<!--SECTIONS-->`/`__GROUNDING__`/`__GNOTE__`/`__SRCCOUNT__`/`<!--SOURCES-->` 六個佔位標記（對齊
  dispatch/epidemic 既有手法）。互動逐字對齊基準檔 `/* 政策：生成動畫 + 引用連動 */`：「重新生成」
  點擊 → `#reportBody.skl`（blur 1.4s，含重入防護與按鈕文字「生成中…」）→ 還原 + `ctx.ui.toast`
  （訊息組字串 `${groundingNote} · Grounding ${grounding}%`，因 mock 無「量化數字總數」欄位，改用
  snapshot 既有兩個 grounding 欄位重組語意相近的句子，非臆造新數字）；`.cite` hover → 對應
  `.srcrow[data-no]` 加 `.hl`（mouseleave 移除）。Grounding 儀表由 router 首掛後既有的
  `behaviors.stats(section)` 掃描接手，無需本檔另呼叫 Kit API。
- 新增 `README.md`：專案簡介、安裝/啟動、`.env` 設定（複製 `.env.example`）、兩個 live demo 前置
  （carbon：PoC repo `make chain`+`make deploy`+`make api`；twin：`~/Desktop/LiDAR` 執行
  `npm run dev -- --port 5174`）、鍵盤快捷（`0`/`1-6`/`Enter`）、Chromium 瀏覽器需求。全文無 emoji。
- **全站驗收（對照 spec 第 10 節，逐項見下）全數通過**：
  1. `npx tsc --noEmit` 0 errors；`npx vitest run` 8/8 PASS（未新增測試，policy 為純視覺+互動
     screen）；`npm run build` 成功、無警告（39 modules transformed）。
  2. Chromium 冷啟動 → 封面 COVER →`Enter`→ 總覽 OVERVIEW → 按鍵 `1`-`6` 依序到達
     碳權/政策/孿生/派工/疫情/警報 → `0` 返回總覽（非重置回封面，Task 6 時序修正仍正確）→
     `Enter` 回封面：每一步 console 皆乾淨（僅預期內的 favicon.ico 404，全程零 JS 錯誤）。
  3. 四個 mock 頁互動逐一實測：政策「重新生成」（`skl` 動畫 + toast，以頁面內同步 JS 驗證
     immediate/after 兩個時間點的 class/文字狀態，避免 MCP 工具呼叫間延遲誤判）與 `.cite` hover
     （src=1、src=5 皆正確連動對應來源列）；派工滑桿拖到 90 分鐘讀數與熱區正確更新；警報分類篩選
     與模擬推播（buzz + 插入新泡泡 + 上限 3 則）皆正確；疫情頁純視覺渲染確認無誤。政策頁另與
     `docs/preview/preview-v3.html` 開分頁直接比對——內容/版面逐字一致，唯一差異：Grounding 說明文字
     基準檔用 `<br>` 強制分兩行，本頁 `groundingNote` 是純字串未含標記，故走文字自然流動（本次視窗寬度
     下顯示為一行）——刻意判斷不主動插入基準檔寫死位置的 `<br>`，避免對資料欄位做字面猜測式分割，
     純視覺差異、非行為或資料錯誤。
  4. 意外之喜：碳權 PoC 後端（埠 8000）與 LiDAR twin server（埠 5174）在驗收當下剛好都在執行中
     （非本 task 啟動，狀態延續自先前 session），故碳權頁與孿生頁這次直接看到真實 LIVE 資料
     （碳權：108 筆 SU、真實 dataHash；孿生：真實 3D 港區場景），而非降級模式；兩者的完整互動
     （碳權發行/掛單/購買/除役全流程、孿生時間軸拖曳與情境切換）在 Task 7/Task 8 已個別詳盡驗證過，
     本次不重跑，僅確認頁面可正常到達且渲染真實資料、console 無新增錯誤。
  5. `prefers-reduced-motion: reduce` 模擬（chrome-devtools MCP 的 `emulate` 工具未提供此參數，
     改用 Playwright MCP 的 `browser_run_code_unsafe` 呼叫真正的 `page.emulateMedia()`，確認
     `matchMedia(...).matches===true` 且 `.anim` 的 computed style 確實變成
     `opacity:1;transition:none`）：封面/總覽/碳權/政策/孿生/派工/疫情/警報全部八個畫面完整渲染，
     canvas（熱區/航跡）與儀表數字皆非卡在初始 0 或空白，整場 console 僅一則 favicon 404、無新增錯誤。
- 殘留事項（見第 5 節）：hero 背景素材仍是 canvas 點雲假資料（spec 4.2 註記「實作版可換」，未在
  12 個 task 範圍內，屬後續美化項）；本機累積了數個先前 task session 留下的背景 `npm run dev`
  進程（埠 5173/5175/5176，連同本次 5177）未關閉，demo 前建議清一次埠。

**Task 11（Alert screen）完成**，進入 Task 12。
- 新增 `src/screens/alert/alert.html` + 重寫 `src/screens/alert/index.ts`（原為 stub）：標頭改用
  `screenHeader`（模擬推播鈕塞進 `actionsHtml`）；四張 KPI 卡由 `statRow()` 產生；篩選 chips
  （全部/疫情/氣象/解除）與推播規則三顆 switch 為固定markup（`AlertSnapshot` 無對應欄位，非資料
  驅動）；feed 六列（含嚴重度色條 `sev`→`rose`/`amber`/`flame`/`ok` 四色查表）與手機 sms 泡泡改由
  `snapshot` 動態產生。篩選邏輯與「模擬推播」（toast + `.buzz` + 插入 `.sms.pop`、上限 3 則）逐字
  對齊基準檔。另補一手 `behaviors.switchTension`：`.lg-switch` 的 goo 液滴裝飾只在開機 boot() 掃
  一次，本頁三顆 switch 掛載較晚會錯過，比照 carbon/dispatch 手動補跑一次的既有手法。Chromium 已
  驗證：四卡動畫、四種篩選、六列色條、手機 mock、模擬推播（toast/buzz/插入/上限 3）、三顆 switch
  皆正確，主控台零錯誤。

**Task 10（Epidemic screen）完成**，進入 Task 11-12。
- 新增 `src/screens/epidemic/route.ts`：`drawRoute(canvas, ports)`，自基準檔「疫情航跡」JS（原
  `drawRoute`）逐字搬出並型別化。四港百分比站位（`POS`）與陸地點群散射角（`ANG`）沿用基準檔固定配置，
  按 `ports` 陣列索引配對；港名／`mark`（`dim`/`rose`/`amber`）顏色改吃 `ports` 參數，不再是基準檔
  寫死的字串。固定種子（`sd=99`）Park-Miller LCG 產生雜訊點與陸地點群，種子宣告於函式體內，每次呼叫
  皆重新起跑，故同一份 ports 重繪視覺一致。
- 新增 `src/screens/epidemic/epidemic.html`：自基準檔 `<!-- 疫情 -->` 的 `.cols` 區塊搬出（標頭不在
  此檔內）。風險環數字/等級、三因子 meter、停靠序列卡、防護建議、參考案例皆為動態內容，故只留
  `<!--PORTS-->`/`<!--FACTORS-->`/`<!--ADVICE-->` 三個清單佔位與 `__CAP__`/`__RISK__`/`__LEVEL__`/
  `__FACTORLBL__`/`__REFERENCE__` 五個單值佔位（對齊 hero.html／dispatch.html 既有手法）。
- 重寫 `src/screens/epidemic/index.ts`：標頭改用 `screenHeader`；`.tnode` 停靠卡依 `mark` 決定
  outline／文字色（`dim` 無標記、`rose`→`var(--rose)`/`.rosec`、`amber`→`var(--amber)`/`.amberc`），
  卡片間 `.tsep` 以 `join` 銜接（最後一張後不留分隔線）；三因子 meter 名稱/數值皆從 `snapshot.factors`
  映射產生（含風險環下方「靠港天數 × 來源強度 × 距離因子」文字亦由 `factors.map(f=>f.name).join(' × ')`
  組成，避免與 meter 清單重複寫死同一組名稱）；防護建議清單/參考案例/航跡圖說皆綁對應 snapshot 欄位
  （圖說船名沿用 `snapshot.ship`，取代基準檔寫死的 `SHIN KUANG 168`）。來源強度三個 pill（WHO/CDC/
  媒體）為固定文案，`EpidemicSnapshot` 無對應資料欄位，維持基準檔原樣寫死。
- **航跡 canvas 重繪綁在 `show()`（含首次），非 `mount()`**：手法對齊 Task 9 review 後定案的
  dispatch 版本——`redraw` 於 `mount()` 內指定（closure 捕捉當次 `snapshot.ports` 與 canvas 參照，
  不需另立模組層 `ports` 變數，因本頁無互動會改動它，不同於 dispatch 的 `currentT` 滑桿值），
  `Screen.show()` 呼叫 `redraw?.()`；另加一道「本頁 `.active` 時才生效」的視窗 `resize` 監聽。
- 無新增單元測試（task-10-brief 未要求；純視覺 screen，既有 3 個測試檔 8 tests 不受影響）。已用
  Chromium（chrome-devtools MCP）驗證：(1) 冷啟動 `#/epidemic`：航跡圖虛線依序連接馬尼拉→香港→
  基隆→高雄108、香港與高雄108節點正確疊兩圈警示環、陸地點群與雜訊點正確繪出；四張停靠卡 outline
  色（無/rose/無/amber）正確；風險環 72／橙級・限制登輪；三因子 meter 64/85/52 填色比例正確；
  來源強度 pill／防護建議三行／新光輪參考案例皆正確渲染。(2) 切到 hero、視窗縮至 1280×832、未經
  其他互動直接切回 epidemic：canvas backing store 1364×604（box 682×302，dpr2）與新尺寸精確吻合
  （ratio=1，非拉伸）。(3) 本頁 active 時再次 resize 至 1600×900：canvas 立即重繪為 1458×604 吻合
  新尺寸。全程 console 僅預期內的 favicon 404，無 JS 例外。
- `npx tsc --noEmit` 0 errors、`npx vitest run` 8/8 PASS（未新增測試，既有 3 個測試檔不受影響）。

**Task 9（Dispatch screen）完成**，進入 Task 10-11。
- 新增 `src/screens/dispatch/heat.ts`：`initHeat(canvas) → {draw(t)}`，自基準檔「派工熱區」JS
  （`drawHeat`/`heatVal`/`heatColor`/`hcoast`）逐字搬出並型別化。`hcoast(gx)` 一詞兩用：畫陸地帶／
  海岸線／5 座突堤，並用來判斷每格格心是否落在陸地帶內（`gy+0.5 < hcoast(gx+0.5)`）藉此跳過陸地格，
  確保降雨機率網格只畫在海面。
- 新增 `src/screens/dispatch/dispatch.html`：自基準檔 `<!-- 派工 -->` 的 `.cols` 區塊搬出（標頭不在
  此檔內，見下）。四張建議卡與風速圖 `data-lg-points` 皆為動態內容，故只留兩個佔位標記
  `<!--SUGGESTIONS-->`／`__WINDS__`（對齊 hero.html 的 `<!--ENTRIES-->` 手法），不手刻固定筆數卡片。
- 重寫 `src/screens/dispatch/index.ts`：標頭改用 `screenHeader`（CSI/POD/FAR 三個 `.pill`
  `data-lg-tip` 塞進 `actionsHtml`，值來自 `snapshot.metrics.toFixed(2)`）；建議卡 `.sev` 顏色依
  `level` 對應 `rose`→`var(--rose)`／`amber`→`var(--amber)`／`ok`→`var(--lg-accent)`；滑桿（0-90，
  step 10）`input` 時呼叫 `heat.draw(t)` + 更新 `+t min` 與讀數列，規則逐字對齊基準檔 `updDisp()`：
  雨量 ≥70 強降雨／≥50 大雨／否則陣雨，風速 ≥15 rose／≥13 amber／否則 teal（讀數列「12 →」的
  基準風速改綁 `snapshot.winds[0]`，不沿用基準檔寫死的字面 `12`，避免未來 mock 資料改動時跟文字
  兜不起來）。
- **熱區重繪綁在 `show()`（含首次），非 `mount()`**：`router.go()` 是「先 `await mount()`，mount
  完成後才同步幫 `<section>` 補上 `.active`」（`.screen{display:none}`／`.screen.active{display:block}`，
  見 tokens.css），且 router 為快取式——每個 screen 只 `mount()` 一次，之後每次切入只重加 `.active`
  並呼叫 `show?.()`（router.ts:84）。因此 canvas 這種「尺寸取自容器當下 `getBoundingClientRect`」的重繪
  必須綁 `show()`：(a) `mount()` 當下祖先仍 `display:none`，同步 `heat.draw` 會量到 0×0；(b) 若只在
  首次 `mount` 畫一次，使用者切到別頁時調整視窗大小、再切回本頁（未動滑桿）canvas 會維持舊尺寸被
  CSS 拉伸變形。做法對齊 `hero/index.ts` 的 `ovMap`：模組層 `currentT`（初始 30，slider input 時更新）
  + `redraw = () => apply(currentT)`；`Screen.show()` 呼叫 `redraw?.()`——router 補上 `.active` 之後才
  呼叫 `show()`，section 已可見、canvas 量得到正確尺寸，一手包辦「首次進入」與「每次重新進入」，不需
  rAF。另加一道「本頁 `.active` 時才生效」的視窗 `resize` 監聽，讓正在看本頁時調整視窗能即時重排熱區。
  （初版曾用 `requestAnimationFrame(() => apply(30))` 只在 `mount()` 內首繪，review round 1 指出這條
  路徑無法覆蓋「切走→resize→切回」的重繪，已改為上述 `show()` 版本。）
- 無新增單元測試（task-9-brief 未要求；純視覺 screen，既有 3 個測試檔 8 tests 不受影響）。已用
  Chromium（chrome-devtools MCP）驗證：(1) 直接冷啟動 `#/dispatch`：熱區首繪即正確（陸地帶／海岸線／
  5 座突堤／機率網格僅海面，無需先摸滑桿）、CSI 0.71／POD 0.83／FAR 0.21 三個 pill 與
  `data-lg-tip` tooltip（`pointerenter` 觸發，顯示「臨界成功指數」）皆正確、四張建議卡嚴重度色
  （rose/amber/amber/teal）與基準檔一致、風速折線圖正確繪出 10 點波峰。(2) 拖滑桿到 `t=0/60/90`：
  熱區熱點隨 t 沿海岸線平移、讀數列文字與顏色正確切換（含邊界值驗證：`t=60` 時風速剛好 13 → amber、
  雨量 48 → teal，門檻判斷為 `>=` 而非 `>` 確認無誤；`t=0` 顯示「現在」而非「未來 0 分鐘」）。
  (3) 由 hero 封面點「即時派工建議」入口卡走真實 SPA 導覽進入 dispatch（非 URL 冷啟動）首繪正確。
  (4) review round 1 重驗「切走→resize→切回」：1600px 時 canvas backing store 1458（box 729×dpr2），
  切到 hero、視窗縮到 1100px（本頁非 active，resize 監聽正確未觸發）、未動滑桿切回 dispatch，canvas
  backing store 重繪為 1145（box 573×dpr2）與新尺寸吻合、畫面銳利無拉伸，讀數列正確顯示 t=30 內容；
  切回後拖滑桿仍正常移動熱區與變色。全程 console 僅預期內的 favicon 404 與 Vite HMR 訊息，無 JS 例外。
- `npx tsc --noEmit` 0 errors、`npx vitest run` 8/8 PASS（未新增測試，既有 3 個測試檔不受影響）。

**Task 8（Twin screen + twin provider）完成**，進入 Task 9-11。
- 新增 `src/data/exchange/twin.ts`：`createTwinProvider(url?)` 逐字照 brief 實作，`snapshot()` 讀
  `/data/berths-khh.json`（新增 `public/data/berths-khh.json`，自 `~/Desktop/LiDAR/examples/
  kaohsiung-port/data/` 複製，72 筆泊位，形狀 `{capturedAtMs, berths:[{code,lat,lon,angle,nameZh}]}`）
  只取 code/nameZh 映射成 `{id,name}`（lat/lon/angle 屬 LiDAR 3D 世界座標，不進本層）；trackCount
  暫以 berths 長度代替，待 AIS 快照接入再補。`.url` 預設 `http://localhost:5174/examples/
  kaohsiung-port/index.html`（可用 `VITE_TWIN_URL` 覆寫）。
- 新增 `src/screens/twin/{index.ts,twin.html}`：自基準檔 `<!--孿生-->` 搬 float-tl 標頭／float-r 四張
  浮動面板（Pareto 候選方案/KPI/泊位甘特/情境切換）／底部 tline 時間軸——這些選擇器 Task 1 已整批
  複製進 `tokens.css`，不必另寫版面 CSS，也不用 `screenHeader`（twin 是滿版浮動玻璃頁）。主視覺區
  改為 `<iframe id="twinFrame">` 嵌 LiDAR kaohsiung-port 範例。時間軸 `input` → `NOW +HH:MM` 標籤 +
  KPI 兩格 `data-lg-value`（彈簧，公式對齊基準檔 2.7±0.6hr/4390±260t 正弦擺動）+
  `ctx.background.setTwinOffset(h)`；情境切換 4 顆按鈕 active 互斥 + `ctx.ui.toast`。`#twinTime` 是
  掛載後才插入 DOM，額外手動補跑一次 `LiquidGlass.behaviors.slider(el)`（否則填色卡在 CSS 預設
  50%，不會跟著拖曳更新，對齊 carbon/index.ts 對 `.lg-tabs` pill 的同一種補跑手法）。
- **實測發現並修正一個不在 brief 字面內的問題**：iframe `onload` 對「連線被拒」的失敗導覽一樣會
  觸發（Chromium 把該次導覽的內建錯誤頁當成一次「載入完成」），光靠 onload 完全無法分辨 LiDAR
  dev server 是否真的啟動——若照 brief 字面（純 onload 隱藏提示卡）實作，會在 server 未開時整頁
  被一塊不透明的空白錯誤頁蓋住，提示卡與背景點雲都看不到，直接違反本 task「fallback 卡 + full
  模式背景要露出」的驗收標準。改用背景 `fetch(url, {mode:'no-cors', cache:'no-store'})` 探測埠是否
  有人聽（連得上就 resolve，連線被拒/逾時才 reject）作為唯一依據；探測失敗時除了讓提示卡維持可見，
  還額外把 iframe 本身設 `display:none`（否則那塊不透明錯誤頁仍會蓋住卡片以外的區域）。探測成功則
  隱藏提示卡，iframe 維持顯示。
- `src/main.ts`：`twin` 由暫時的 mock stub 換成 `createTwinProvider(env.VITE_TWIN_URL)`；移除不再
  使用的 `mockProvider` import；改寫已過期的「carbon/twin 暫用 mock stub」註解為「carbon/twin
  現皆為 live provider」。
- 無新增單元測試（task-8 brief 未要求；既有 3 個測試檔 8 tests 不受影響）。已用 Chromium
  （chrome-devtools MCP）雙路徑驗證：(1) 必驗：埠 5174 無服務時，提示卡正確顯示、`data-mode="full"`
  背景點雲透過（隱藏後的）iframe 露出（含泊位編號、SHIN KUANG 168 標記）、float 面板玻璃折射正常、
  時間軸拖到 18 時 clock 顯示「NOW +18:00」、KPI 彈簧到 2.1 hr / 4,250 t（驗算 sin 公式相符）、
  slider 填色隨拖曳更新、情境按鈕互斥切換 + toast「情境已套用／「基準情境」重新推演未來 24 小時」
  正確跳出，console 僅預期內的 favicon 404 與埠 5174 連線被拒兩則網路訊息，無 JS 例外。(2) 選驗：
  於 `~/Desktop/LiDAR` 執行 `npm run dev -- --port 5174`（node_modules 已存在，未重跑 npm install）
  後重整本頁，確認 iframe 內正確顯示真實 3D 港區場景（船點/泊位輪廓/LiDAR 自己的疊加 UI），提示卡
  自動隱藏，本頁 float 面板仍正確蓋在 iframe 之上。
- `npx tsc --noEmit` 0 errors、`npx vitest run` 8/8 PASS。

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

**目前的下一步（2026-07-07 起）：Alert 頁改版——brainstorming/spec/preview v2 已完成（見第 1 節），接續 writing-plans 排 SDD tasks 後實作。**
- ~~swrap 版心缺陷~~ 已修（commit `cc44ec3`）。~~最終 whole-branch review（opus）~~＝Ready to merge，新發現的 Important（getDefaults 漏深拷貝）+ 兩 Minor 已於 `2474de9` 修完再審 clean。~~finishing~~ 本地合併 + push 完成。~~使用者實機驗收~~ 通過。
- policy / dispatch / epidemic 頁改版皆已完成並合併回 main（見第 1 節）。
- 六大功能頁改版進度：carbon(live)/twin(live 原生)/policy(已改版)/dispatch(已改版)/epidemic(已改版)；
  尚餘 alert 仍為初版 mock 佔位頁（未來若要比照前例做深度改版再各自 brainstorming）。
- 系統設定頁（Settings）為新增的第 8 個 screen（本輪完成），承載全站前後端設定 + 協作者 schema 框架。

（以下為 shell 建置期的歷史步驟，皆已完成）

1. ~~使用者審閱 spec（已通過 2026-07-03）~~ 完成
2. ~~實作計畫：`docs/superpowers/plans/2026-07-03-frontend-shell.md`（12 tasks，每 task 結尾為檢查點、由使用者 commit）~~ 完成
3. ~~Task 1：建 Vite 專案骨架 + 複製 Kit 兩檔 + 點雲港口背景系統~~ 完成
4. ~~Task 2：Registry + Router + Rail + 鍵盤（`0` 總覽、`1-6` 功能頁、`Enter` 封面切換）~~ 完成
5. ~~Task 3：資料交換層（types + mock providers）~~ 完成
6. ~~Task 4：Carbon live provider~~ 完成
7. ~~Task 5：共用 UI 元件~~ 完成
8. ~~Task 6：Hero screen（兩段式）~~ 完成
9. ~~Task 7：Carbon screen（自 PoC 一比一搬入）~~ 完成——拆成 carbon.{html,css,ts}+index.ts 四檔；PoC `<script>` 逐字搬入 `initCarbon`（僅 API→apiBase、查詢改綁 root 的 byId/qs/qsa、`// @ts-nocheck`），操作邏輯零改動；三件套（tabs/health-chip/發行鈕）以原 id 進 shell 標題列。**LIVE 驗證通過**：即時 stat/卡片/稽核、工作台⇄稽核切換、單筆發行→掛單→購買→除役全流程、離線 chip 降級皆與 PoC 一致，主控台零錯誤。
10. ~~Task 8：Twin screen + twin provider（LiDAR iframe 嵌入）~~ 完成——twin provider 讀真實泊位資料（72 筆）、screen 嵌 LiDAR iframe 並修正 onload 不可靠問題（改用 fetch no-cors 探測 + iframe display:none fallback）、24hr 時間軸與情境切換皆可互動。**兩路徑皆驗證**：無 server 時 fallback+背景點雲正確顯示；起 LiDAR dev server 後 iframe 正確顯示真實 3D 場景。
11. ~~Task 9：Dispatch screen（熱區 canvas + 預測時間軸 + 派工建議卡 + 風速圖）~~ 完成——拆成
    `heat.ts`（`initHeat` 自基準檔熱區 JS 搬出，含海岸線判斷僅海面繪格）+ `dispatch.html`
    + `index.ts` 三檔；CSI/POD/FAR pill、四張建議卡、風速圖皆綁 `dispatch.snapshot()`；滑桿
    讀數規則與色彩門檻逐字對齊基準檔。熱區重繪綁在 `Screen.show()`（快取式 router 每次切入都呼叫，
    含首次於 mount 之後）而非 `mount()`，一手涵蓋「首次進入」「切走→resize→切回」「本頁 active 時
    resize」三種尺寸重繪情境（review round 1 修正，對齊 hero 的 ovMap 手法）。Chromium 已驗證冷啟動、
    從 hero 點入口卡、切走→縮視窗→切回三條路徑熱區皆正確銳利。
12. ~~Task 10：Epidemic screen（航跡 canvas + 停靠序列卡 + 風險評分/三因子 meter + 防護建議 +
    參考案例）~~ 完成——`route.ts` 港點座標/陸地點群沿用基準檔固定配置，港名與 mark 顏色改吃
    `snapshot.ports`；canvas 重繪比照 Task 9 review 後定案的 `show()`/resize 手法（本頁無互動會
    改動 ports，故省去 dispatch 的 `currentT` 那層模組變數，直接讓 `redraw` closure 捕捉）。
    Chromium 已驗證冷啟動渲染、以及「切走→resize→切回」與「本頁 active 時 resize」兩條 canvas
    重繪路徑皆正確銳利。
13. ~~Task 11：Alert screen（KPI 統計列 + 分類篩選 feed + 手機 mock 模擬推播 + 推播規則開關）~~
    完成——篩選 chips 與模擬推播（toast/buzz/插入 sms/上限 3 則）逐字對齊基準檔；feed 六列嚴重度
    色條吃 `sev` 色彩關鍵字四色查表；`.lg-switch` 補跑 `behaviors.switchTension` 取得 goo 液滴動畫。
14. ~~Task 12：Policy screen（議題列 + 報告五段 + Grounding 儀表 + 引用來源，含生成動畫與引用連動
    互動）+ README.md + 全站驗收（對照 spec 第 10 節）~~ 完成——**12 個 task 全部完成**。驗收詳情見
    第 1 節 Task 12 條目；`tsc`/`vitest`/`build` 三者皆綠燈，Chromium 全站導覽（封面→總覽→六功能頁
    →返回）console 全程乾淨，四個 mock 頁互動與 `prefers-reduced-motion` 降級皆驗證通過。
    shell 骨架至此無下一個排定 task；殘留的美化/清理項見第 5 節。

## 5. 已知風險 / 注意

- **【Settings Task 8 驗收發現】settings 頁缺 `.swrap` 版心 → 固定 rail 疊在左欄分區導覽上（視覺缺陷，未修）**：
  其餘 7 個 screen 的 index.ts 都把內容包進 `<div class="swrap">`（`.swrap` 於 tokens.css 有 `padding-left:110px`
  讓開 `position:fixed` 的 `#rail`），但 `src/screens/settings/index.ts` 直接 `el.innerHTML = html.replace('<!--HEADER-->', …)`
  沒有 `.swrap` 包層（`settings.css` 開頭註解誤標「.swrap（shell 已提供）」——實則 shell 不自動提供，每個 screen
  各自在 index.ts 補）。CDP 實測：policy `.pcols` 左緣 x=151 已避開 rail（右緣 x=72），settings `.sgrid`/`.subnav`
  左緣 x=0 → rail（垂直置中，約 y=230–680）疊住左欄「沙盤推演/派工建議/疫情追溯/警報」等列。**功能完全不受影響**
  （Task 8 CDP 94/94 全過、8 頁 console 零錯誤、7 分區可點切、兩 modal 全流程正常），是純視覺佔位錯誤。屬 Task 2
  遺漏、逐 task review 未攔到。最小修法（product code，本 task 純文件+驗收依規約未自行改）：settings/index.ts 比照
  carbon/policy/alert 把 `screenHeader()+#s-settings 內容` 包進 `<div class="swrap">…</div>`（一行級），或 settings.css
  給 `#s-settings` 補 `padding` 左內距。**建議在使用者實機驗收前先修**。
- **twin-provider 測試 flaky（機器負載相關，非 policy 缺陷）**：`tests/twin-provider.test.ts`
  的「snapshot 映射 72 筆泊位與 443 條真實航跡數」在機器負載高時（如剛跑完 build）會逾時
  （Test timed out in 5000ms，非斷言失敗）——twin provider 的 `snapshot()` 動態載入 4.6MB
  航跡 JSON，超過 vitest 預設 5s testTimeout。機器閒置時通常過。若要根治：該 it 案例加第三參
  數 timeout（如 `20000`）或 `vitest.config` 設 `testTimeout`——屬 twin 檔，動前先問使用者。
  policy 改版本身測試（policy-generate 2/2、policy-mock 4/4）與其餘皆穩定綠。
- Liquid Glass 折射只在 Chromium 完整支援，其他瀏覽器自動降級磨砂——demo 機請用 Chrome/Edge。
- 玻璃需要豐富背景才看得見：文件型頁（carbon/policy）用罩幕壓暗而非純黑。
- Carbon live 需要先在 PoC repo 起 `make chain` + `make api`，demo 前要有開機 checklist。
- 預覽頁中的地圖/點雲是 canvas 假資料，正式版 hero 總覽主視覺與 twin 頁由 LiDAR 資產供給。
- `tsconfig.json` 未設 `skipLibCheck`/`@types/node`：獨立跑 `npx tsc --noEmit` 會對
  `node_modules` 內 vite/vitest/rollup 的型別檔報錯（缺 Node 環境型別），Task 2 加入第一個
  import `vitest` 的測試檔後才浮現；不影響 `vitest run`/`vite dev`/`vite build`，之後測試檔變多
  會持續出現，建議之後補 `skipLibCheck: true`（一行小改動，但屬既有檔案，先問過再動）。
  **（2026-07 更新：commit `90f8512`已補上 `skipLibCheck: true`，本項風險已解除，`npx tsc --noEmit`
  現況為 0 errors；段落保留作歷史紀錄，不再需要處理。）**
- **殘留事項（Task 12 收尾時盤點，非阻斷性，屬後續美化/環境整理）**：
  - hero 封面/總覽的主視覺仍是 `#harbor` canvas 點雲假資料（陸地/突堤/移動船點皆程式繪製），
    spec 4.2 原註記「實作版可換成孿生錄製影片或降級靜態圖」——12 個 task 皆未排入此素材製作，
    維持 canvas 版本作為展示已足夠使用，但若簡報前想換更擬真的背景，這是唯一還沒做的視覺項目。
  - 本機累積了數個先前 task session（Task 6/7/9/11 等）啟動後未關閉的背景 `npm run dev`
    進程（實測埠 5173/5175/5176 皆仍在回應，連同 Task 12 本次新起的 5177 共 4 個），皆為同一份
    原始碼、行為一致，不影響驗收結果，但正式 demo 前建議 `killall node`（或找出對應 PID）清一輪，
    避免上台時開錯分頁看到舊埠。
  - carbon 的「發行→掛單→購買→除役」全流程，Task 12 驗收時因為 PoC 後端（埠 8000）恰好仍在
    執行而確認了「能看到真實 LIVE 資料、console 無新增錯誤」，但完整的逐步操作流程未在
    Task 12 重跑一次（Task 7 當時已詳盡驗證過，判斷不需要每個 task 都重跑一次全流程）；demo
    前仍建議照 README 的前置步驟親自跑一次完整流程作最終確認。
    **（2026-07 更新：twin 頁已於「Twin 頁原生化改版」10 個 task 內完成原生化，不再是 iframe
    嵌入、不再需要另起 LiDAR server（埠 5174）或任何前置服務，上述 twin 相關部分已隨之作廢；
    demo checklist 現僅剩 carbon 這一項前置作業。）**
