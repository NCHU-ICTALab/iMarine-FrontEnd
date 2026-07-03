# HANDOFF — iMarine-FrontEnd

> 活文件：目前進度、決策紀錄、下一步。接手先讀這份，再讀 `CLAUDE.md`。

最後更新：2026-07-03

---

## 1. 目前狀態

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
4. **下一步 → Task 2**：Registry + Router + Rail + 鍵盤（`0` 總覽、`1-6` 功能頁、`Enter` 封面切換）
5. Hero 兩段式實作（含孿生背景影片素材錄製）
6. Carbon PoC 重構搬入（版面基準 = 預覽 v3 碳權頁）
7. LiDAR iframe 嵌入 + twin provider
8. 四個 mock 頁面（版面與互動 = 預覽 v3，資料走 mock provider）

## 5. 已知風險 / 注意

- Liquid Glass 折射只在 Chromium 完整支援，其他瀏覽器自動降級磨砂——demo 機請用 Chrome/Edge。
- 玻璃需要豐富背景才看得見：文件型頁（carbon/policy）用罩幕壓暗而非純黑。
- Carbon live 需要先在 PoC repo 起 `make chain` + `make api`，demo 前要有開機 checklist。
- 預覽頁中的地圖/點雲是 canvas 假資料，正式版 hero 總覽主視覺與 twin 頁由 LiDAR 資產供給。
