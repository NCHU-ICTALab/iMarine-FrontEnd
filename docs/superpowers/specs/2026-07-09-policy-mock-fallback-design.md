# Policy/Settings mock fallback 整合 — 設計文件

> 2026-07-09。前提：協作者 PR #1（`feat/policy-rag-integration`，head `9033aba`）的 live 功能**一字不動**，
> 把 PR 改版時失去的原有 mock 示範能力整合回來。分支 base 在 PR 上（不等合併）。

---

## 1. 背景

PR #1 把 policy 頁綜合對話與 settings「政策報告」分區接上 rag-agent 後端（`VITE_POLICY_API`，預設 `:8100`）。
commit 訊息稱「後端不在時一律 fallback 回 mock」，實際盤點（逐行 diff 覆核）：

| 區塊 | 後端不在時（PR 現況） |
|---|---|
| policy 頁綜合對話 | ✅ `loadGlobalSources()` catch 後退回 mock 情報聯集，正確 |
| policy 頁收件匣/報告/追問 | ✅ 本來就是 mock，不受影響 |
| settings 知識庫分區 | ❌ 只顯示「後端未連線」note，原五庫 mock 卡牆整組消失 |
| settings 模型管理「測試連線」 | ❌ catch 後顯示「✗ 連線失敗」，原 1.2s 假驗證流程消失 |
| KB modal 檢索策略/hybrid/rerank/embedding | ❌ UI 被刪，後端在也沒有（後端無對應 API） |

本設計補齊下面三列。策略哲學與 PR 對齊：per-call try/catch、失敗即退 mock、不做全域探測。

**事實錨點（撰寫時已逐一驗證）：**
- 原 mock 全套程式在 `main:src/screens/settings/sections/policy.ts`（git history 可還原）。
- 資料層 `KB_PRESET`／`getKbs()`（key `policy.kbs`）／`setKbs()` PR 未刪，
  `tests/settings-policy-preset.test.ts` 4 案例現仍全綠。
- PR 對 `settings.css` **零刪除行**：`.strat/.scard/.subopt/.savebar/.rng/.tgl` 等 mock modal 樣式全數健在，
  CSS 只需 MOCK chip 一行級微調。
- 合併相容性已驗：`main(4bd2be3) + PR` 於隔離 worktree test-merge 零衝突、tsc 0／vitest 17 檔 63／build ok。

## 2. 決策紀錄表

| 決策 | 內容 | 理由 |
|---|---|---|
| 整合範圍 | ① settings 知識庫 mock fallback 全套 ② 測試連線 mock fallback ③ 檢索策略/rerank/hybrid 畫面 live/mock 皆有 | 使用者定案（複選三項） |
| policy 進頁預設 | 維持 PR 的「綜合對話 · 全部來源」 | 使用者未選改回第一條情報 |
| fallback 標示 | 低調 MOCK chip（沿用 `.gbadge` 語言）＋假驗證訊息帶「（示範）」 | 使用者定案：「要，低調標示」 |
| 架構 | 方案 B：還原碼放**新檔**＋對 PR 檔案僅**插入點級**改動 | 新檔零 rebase 衝突；「PR 功能不動」可被 diff 驗證 |
| 分支 | 自 `origin/feat/policy-rag-integration` 開 `policy-mock-fallback` | 使用者定案：不等 PR 合併 |
| 模式判定 | 沿用 PR per-call try/catch；`listSources()` 失敗即 mock；不做熱切換（重進分區重新 probe） | 與 PR/policy 頁哲學一致，零新框架 |
| live 檢索策略儲存 | 新 localStorage key `policy.kbParams`（`source_id → {chunk, retrieval}`），**存而不用** | 後端無 API；settings 頁既有哲學「存而不用等後端」，之後只改讀取點 |
| mock 檢索策略儲存 | 維持原樣存 `Kb` 物件（key `policy.kbs`） | 不動既有契約測試 |

## 3. 行為規格

### 3.1 Settings 知識庫分區（kbGroup）

| 情境 | 行為 |
|---|---|
| 後端在 | **PR 原樣**：真實庫卡牆（啟用/停用 checkbox、uploaded 可刪）、建/刪庫、KB modal 文件列表＋上傳（真索引、chunk 參數上傳時套用）＋**新增檢索策略區塊（見 3.3）** |
| 後端不在 | `refresh()` 的 catch 分支改為呼叫 `mountMockKb(el, ghead, ctx)`：整組還原 main 版 mock 體驗——五庫預置卡牆、`n 庫 · m 文件` badge、「重置為預設」鈕、點卡開原版 modal（文件假 indexing 3s 轉 available／chunk＋embedding＋檢索策略三選＋hybrid slider＋rerank 開關與無模型導引／儲存·捨棄 savebar）、新增庫 modal（含描述欄）、刪庫 confirm |
| mock 標示 | ghead badge 旁插一顆 `MOCK` chip；live 模式不出現 |

mock 掛載採**整組接管**：`mountMockKb` 重寫 `el.innerHTML`（原版卡牆＋原版兩 modal），
PR 渲染的 live DOM（含其 modal）一併被替換——catch 發生在任何 live 互動之前，無狀態殘留問題。
Escape 生命週期沿用原版 escOff 模式（掛 document、開掛關卸）。

### 3.2 模型管理「測試連線」fallback

PR 流程中**本地驗證不動**（URL 格式、API KEY 必填檢查在 fetch 之前，維持原樣）。
只改 catch 分支：真後端呼叫（`listOllamaModels` 或 `testConnection`）失敗時，不再顯示
「✗ 連線失敗」，改走原版假驗證的結果路徑——`pmTestedModels` 取 `prov.models` 或 catalog
（chat 預啟用）、渲染模型清單、`saveBtn` 解鎖——成功訊息為：

> `✓ 驗證通過（示範）· 已載入 N 個模型`

catch 後**直接顯示**結果，不再附加人工延遲（真實 fetch 失敗已消耗了 spinner 時間）。
真後端成功路徑（含 Ollama 列真實模型、寫回 llm_config）一字不動。

### 3.3 檢索策略區塊 — live modal 也有

在 PR live modal 的「分段參數」之後加回一段（UI 與 mock 版相同語言）：

- 檢索策略三選卡（vector／fulltext／hybrid）
- hybrid 時顯示語意/關鍵字權重 slider（progressive disclosure）
- rerank 開關；開啟且無可用 rerank 模型時顯示導引連結 → `ctx.goto('policy', '模型管理')`
- embedding 模型 select（讀 `connectedModels('embedding')`）
- 儲存／捨棄 savebar（draft 語意，同原版）

**儲存**：寫入 `policy.kbParams[source_id] = { chunk: {size, overlap}, retrieval: {...} }`。
`chunk` 取儲存當下輸入框值；開 modal 時若 `kbParams` 有該庫存值則預填 chunk 輸入框與策略區塊
（無存值則維持 PR 預設 512／64、策略預設 vector）。**上傳仍照 PR 邏輯讀輸入框當下值**（此為
additive 預填，不改上傳行為）。此設定後端無 API，屬「存而不用」，UI 註明之（gnote 一句：
「檢索策略目前存於本機，後端支援後生效」）。

### 3.4 明確不動（non-goals）

- policy 頁全部（`screens/policy/*`）：綜合對話 fallback PR 已正確；進頁預設綜合對話維持。
- `src/data/exchange/policy.ts`、`src/screens/settings/backend.ts`、`src/data/types.ts`、`src/main.ts`。
- 既有 storage key `policy.kbs`／`policy.providers`／`policy.defaults` 的形狀與契約測試。
- 不做 live/mock 熱切換、不做全域後端健康探測。

## 4. 資料契約

```ts
/* 新增（settings storage，key 'policy.kbParams'）— live 知識庫的本機檢索參數，存而不用 */
export interface KbParams {
  chunk: { size: number; overlap: number };
  retrieval: {
    strategy: 'vector' | 'fulltext' | 'hybrid';
    hybridWeight: number;        // 0-100
    rerank: boolean;
    rerankModel: string;
    embeddingModel: string;
  };
}
// 儲存形狀：Record<string /* source_id */, KbParams>
// 預設值（無存值時）：{ chunk:{size:512, overlap:64}, retrieval:{strategy:'vector',
//   hybridWeight:60, rerank:false, rerankModel:'', embeddingModel: connectedModels('embedding')[0] ?? ''} }
```

`retrieval` 形狀與既有 `Kb['retrieval']` 相同（沿用同一 interface，不另造）。

## 5. 檔案結構與衝突面控制

```
新增  src/screens/settings/sections/policy-kb-mock.ts
      ├─ mountMockKb(el, ghead, ctx)     還原 main 版 kbGroup custom 全套（卡牆/兩 modal/badge/重置）
      ├─ strategyBlockHtml() / bindStrategyBlock(...)   檢索策略區塊，live modal 共用
      ├─ kbParams 存讀 helpers（getKbParams/setKbParams，含預設值）
      └─ 自帶 esc() 小工具（不為此去動 PR 檔）
修改  src/screens/settings/sections/policy.ts   —— 僅插入點級：
      ① setKbs 加 export（一字級，供 mock 檔寫回）
      ② refresh() catch 分支：note 改為 mountMockKb(...)
      ③ testBtn catch 分支：改走假驗證結果路徑（3.2）
      ④ live kbModalHtml 字串拼入 strategyBlockHtml()；openKb 內 bindStrategyBlock + 預填
修改  src/screens/settings/settings.css          —— MOCK chip 低調變體（一行級；mock modal 樣式全數健在無需補）
新增  tests/settings-kb-params.test.ts           —— kbParams round-trip + 預設值形狀
```

**衝突面控制**：對 PR 檔案的 diff 限縮在上列四個插入點；PR 的 live 邏輯（fetch、渲染、事件）
零改動。協作者日後更新 PR 分支時，新檔零衝突、插入點易 rebase。

## 6. 驗收標準

1. **三綠燈**：`npx tsc --noEmit` 0；`npx vitest run` 全綠（既有 `settings-policy-preset` 4 案例
   必須持續綠＋新增 kbParams 測試）；`npm run build` 成功。
2. **CDP headless（獨立 Chrome、SwiftShader flags、勿 `--disable-gpu`）**：
   - **後端不在（預設情境）**：知識庫分區呈五庫 mock 卡牆＋MOCK chip；開 modal 假上傳 3s 轉
     available；策略三選切換、hybrid slider、rerank 無模型導引跳轉、儲存/捨棄、重置為預設；
     模型管理測試連線顯「✓ 驗證通過（示範）…」且 Setup modal 全流程可走完；
     policy 頁綜合對話 mock fallback 不迴歸。
   - **模擬 live（scratch 起最小 Node stub server 實作 `/api/sources`、`/api/kb/*` 等）**：
     真實卡牆照 PR 行為（啟停/建刪庫/文件列表）；live modal 出現檢索策略區塊，儲存後
     `localStorage` 的 `policy.kbParams` 有正確形狀、重開 modal 預填正確；**無 MOCK chip**；
     測試連線走真路徑。
   - **8 頁全站迴歸**：`.screen.active` 正確、console 全程零 JS 例外。
3. **「PR 功能不動」驗證**：`git diff origin/feat/policy-rag-integration...HEAD --
   src/screens/settings/sections/policy.ts` 僅含 §5 四個插入點；`src/data/exchange/policy.ts`、
   `backend.ts`、`screens/policy/*`、`types.ts`、`main.ts` 零 diff。

## 7. 風險與注意

- **PR 尚未合併**：本分支 base 在 PR head `9033aba` 上。若協作者 force-push 或大改 PR，
  需 rebase——衝突面已縮到四個插入點，成本可控。合併順序：PR 先進 main，本分支跟進。
- **stub server 僅供驗收**：放 scratch 不進版控；live 全功能（真上傳/真索引/真 chat）仍需
  協作者的 rag-agent 才能人工驗，demo 前照 checklist 起 `:8100`。
- **rag-agent 後端取得方式未明**：PR 未附後端 repo 位置與啟動文件，需向協作者索取
  （亦為 PR review 回饋事項，與本設計平行）。
- **同 session 熱切換不支援**（設計取捨）：後端中途起來，需切出再切回 settings 分區才會
  probe 到 live；demo 動線上先起後端再開頁即可，無實際影響。
