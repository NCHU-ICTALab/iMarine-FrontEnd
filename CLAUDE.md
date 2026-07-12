# Claude Code 指南

> 本檔案是 Claude Code 在此工作區運作時的最高指導原則。在任何修改、建議、執行動作前，請先閱讀並遵守。
> **協作者注意**：若你是協作者（非 repo 擁有者）的 AI 助手，本檔為擁有者個人工作規則，請改以 `CONTRIBUTING.md` 為最高指導。

---

## 0. 最重要的規則（CORE RULE）
- **禁止** 對原檔做「順手的清理」、「型別補強」、「import 整理」、「typo 修正」、「註解優化」。
- **禁止** 添加emoji
- 若要解決問題，**先停下來、先問我**，說明：
  1. 哪個檔案需要改、改在哪一行
  2. 為什麼原本做不到
  3. 預期影響範圍
  得到我明確同意後才動手。
- 對話用中文回答
- 我寫文件偏好繁體中文 + 英文術語混用，程式碼與 commit 訊息可中可英、看上下文。
- Commit 由我自己下，**不要主動幫我 `git commit`**，除非我明確說「幫我 commit」。
- 不要主動 `git push`、開 PR、或對 GitHub 做任何「會被別人看到」的動作。
- Commit 訊息**不要**加任何 Claude/Anthropic 署名（如 `Co-Authored-By: Claude …`）——我不要出現在 GitHub Contributors。
- 任何重要更新與實作完成後都必須更新Handoff，以利我接續之後的工作

---

## 1. 專案簡介與真相來源

「永續智能航港生態系」的前端整合層（2026 航港大數據創意應用競賽）。一個 Vite + vanilla TS 的 shell 應用，統一承載 6 大功能模組的 UI 與資料交換層，設計語言為深色 Liquid Glass。用途是競賽 PPT 簡報 + 現場 demo，非正式產品。

**真相來源（有疑問先查這些，不要憑記憶）：**
- `HANDOFF.md` — 活文件：目前進度、下一步、決策紀錄。**每次接手先讀這份。**
- `docs/superpowers/specs/` — 設計文件：layout、screen 契約、資料交換層介面。
- 報告書 v6（上層資料夾 `內文V6/`）— 各模組的定位、參考數字與名詞，UI 文案以此為準。

## 2. 系統定位與四個相鄰工作區

```
UI (本 repo)                    Hero + 6 screens + 左側 rail
  ↓ 資料交換層 (src/data/)       每模組一個 provider，live 或 mock
碳權 PoC   ../iMarine-Carbon-Tokenization-POC   已完成，FastAPI + Hardhat 後端
數位孿生    ~/Desktop/LiDAR                       引擎+場景已 vendored 進 src/twin-engine/ 與
                                                 src/screens/twin/（原生直繪，無外部依賴）；
                                                 上游 repo 仍唯讀，僅供資產再生成
UI 元件庫   ~/Desktop/UI-ToolBox                  Liquid Glass Kit（liquid-glass.css/js）
```

**三個上游資產是唯讀的**：本 repo 只複製（Kit 兩檔、LiDAR 引擎+場景+資料）或呼叫（PoC 後端 API），不修改上游 repo 的檔案。上游要改，去該 repo 改。

- 舊的 `介面/port-eco-dashboard`（React 原型）**已棄用**，僅供版面參考，不要從那裡搬程式碼。

## 3. 六大功能與 screen 狀態

| # | Screen | 模組 | 資料 | 狀態 |
|---|---|---|---|---|
| - | `hero` | 封面（PPT 開場）+ 戰情總覽，兩段式切換 | mock | 版面已定 |
| 1 | `carbon` | 碳權代幣化交易（自 PoC 重構進來） | **live** | 待重構搬入 |
| 2 | `policy` | LLM + RAG 政策報告 | mock | 佔位頁 |
| 3 | `twin` | 2.5D 數位孿生 24hr 沙盤推演（原生直繪，LiDAR 引擎已 vendored） | **live** | live/native（自繪，無外部依賴） |
| 4 | `dispatch` | 短時微氣候 + 即時派工建議 | mock | 佔位頁 |
| 5 | `epidemic` | 疫情自動追溯 | mock | 佔位頁 |
| 6 | `alert` | 自動警報推播（細胞簡訊） | mock | 佔位頁 |

**Carbon 重構鐵則**：搬入 shell 時拿掉它的 fixed topbar，其餘操作邏輯、內部分頁、對後端的 API 呼叫**一律不動**，使用者操作方式要和原本完全一樣。

**mock 頁不是空殼**：用報告書的參考數字做完整假資料版面，之後功能上線只把 provider 從 mock 換 live。

## 4. 設計系統

- **元件一律用 Liquid Glass Kit**（`src/ui/liquid-glass.css/js`，自 UI-ToolBox 複製）。鐵則照 Kit 的 AI 規格書：不要手寫 `backdrop-filter`；小型/大量重複元件用 `lg-static`；儀表元件是「玻璃容器 + 實心內容」。完整規格見 `~/Desktop/UI-ToolBox/README.md`。
- **Tokens**（沿用 Carbon PoC 語言）：底 `#070b11`、主色 `--lg-accent:#35E0A6`、金 `#E9BC63`、資訊藍 `#38BDF8`、警示 `#F0648C`；字體 Inter/Noto Sans TC + Geist Mono；髮絲線 `rgba(255,255,255,.1)`。
- **每模組輔助色相**（只用在 rail active、eyebrow 圓點、徽章）：carbon 金 `#E9BC63`、policy 青 `#38BDF8`、twin 藍 `#7FB4FF`、dispatch 琥珀 `#F5A54A`、epidemic 玫紅 `#F0648C`、alert 橘紅 `#FF7A59`。
- **頁面節奏**：eyebrow 標頭 → 標題列（技術徽章 + 資料源 chip）→ KPI 統計列 → 主視覺(左 ~62%) + 右欄卡片；stagger 進場。
- **背景兩態**：空間型頁（hero/twin/dispatch/epidemic）背景亮、文件型頁（carbon/policy）罩幕壓暗（`data-mode="doc"`）。
- 畫面預覽基準（已驗收的視覺方向）：`docs/preview/` 內的截圖與預覽 HTML。

## 5. 資料交換層（src/data/）

每模組一個 provider，介面形狀相同，`source: 'live' | 'mock'`，UI 依此顯示資料源 chip。

- 本期只做 **carbon**（包 PoC FastAPI :8000）與 **twin**（包 LiDAR 的 AIS/泊位快照）兩個 live provider，其餘四個是 mock JSON。
- 換接真後端只改 provider 內部，不動 screen 程式碼。
- schema 與座標、時間戳欄位跟著 PoC 的 `shared/` 與 LiDAR 的 snapshot 格式走，不要自創。

## 6. 一鍵指令

| 指令 | 動作 |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | 產出靜態檔於 `dist/` |
| （carbon live 時）| 先在 PoC repo 起 `make chain` + `make api` |

## 7. 敏感檔案（勿提交）

`.env`、`node_modules/`、`dist/`、任何自 PoC 複製的金鑰或 `shared/contracts.*.json` — 都應在 `.gitignore`。PoC 的 Hardhat 金鑰僅限本地，**永遠不可用於正式網**。
