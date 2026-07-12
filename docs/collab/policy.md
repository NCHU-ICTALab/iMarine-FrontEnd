# policy（AI 政策輔助報告）整合卡

## 1. 基本資訊

| 項目 | 值 |
|---|---|
| 模組 | policy（screen：`src/screens/policy/`） |
| 後端負責人 | 待填（rag-agent 協作者） |
| 後端 repo | 待填（URL；根 README 記載「rag-agent 的取得與啟動請洽負責該後端的協作者」） |
| 預設 branch | 待填 |

## 2. 起服務

待後端負責人填（前置需求、指令序、健康檢查端點）。現況：服務起在 `http://127.0.0.1:8100`。

## 3. env 變數

| 側 | 變數 | 說明 | 預設 |
|---|---|---|---|
| 前端 | `VITE_POLICY_API` | rag-agent 位址 | `http://127.0.0.1:8100` |
| 後端 | 待填 | | |

## 4. API 契約（後端為準；下表為前端 `src/data/exchange/policy.ts` 現行實際呼叫）

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/sources` | 知識庫清單（右欄來源、settings 知識庫管理） |
| GET | `/api/report/templates` | 報告模版清單 |
| POST | `/api/chat` | 綜合對話（附引用回答） |
| POST | `/api/report` | 產生結構化報告 |
| GET | `/api/policy/briefs` | 每日晨報（收件匣頂 live 情報卡，`snapshot()` 取用） |
| POST | `/api/policy/refresh` | 重抓新聞並重生成晨報（收件匣「更新新聞」按鈕、settings「立即更新一次」） |
| GET / POST | `/api/schedule` | 每日新聞自動更新排程（settings 排程區） |
| POST | `/api/settings/embed/test` | 測試 embedding 端點連線（回 dim） |
| POST | `/api/settings/embed` | 儲存 embedding 設定 |
| POST | `/api/settings/reembed` | 以目前 embedding 設定重編碼全部 chunk |

### GET /api/sources → 200

```json
[
  { "source_id": "s1", "source_name": "航港法規庫", "source_type": "regulation", "chunk_count": 120, "enabled": true }
]
```

- `source_id`: string（必填）
- `source_name`: string（選填，缺時前端以 source_id 代）
- `source_type`: string（選填；已知值 `regulation`/`news`/`alt_energy`/`uploaded`，前端映射五類分類標籤，未知值原樣顯示）
- `chunk_count`: number（選填，缺時前端視為 0）
- `enabled`: boolean（選填，缺時前端視為 true）

### POST /api/chat

request：`{ "message": string, "history": PolicyChatMsg[] }`（`PolicyChatMsg` 形狀見 `src/data/types.ts`；前端送最近 8 則）

response 200：

```json
{
  "answer": "回答文字，可含 [ev_xxx] 引用標記",
  "evidence_package": { "evidence_items": [ { "evidence_id": "ev_1", "title": "…", "source_id": "s1", "source_type": "regulation", "locator": { "article": "第 12 條" }, "published_at": "2025-01-01" } ] },
  "citation_coverage": 0.87,
  "provider": "…",
  "model": "…"
}
```

- `answer` 內的 `[ev_xxx]` 由前端轉成 cite span，`evidence_items` 映射右欄來源
- `citation_coverage`: 0–1（前端 ×100 顯示為 Grounding %）
- 各欄位皆為前端防禦式讀取（缺欄不炸，顯示降級）

### GET /api/report/templates → 200

模版物件陣列（前端原樣餵給模版下拉，形狀由後端定義並在此記錄）。

### POST /api/report

request：`{ "prompt": string, "source_ids": string[], "template": string }`

response 200：`{ "report_id", "topic", "template_id", "sections": [{ "key", "label", "text", "citations" }], "source_list": [{ "evidence_id", "source_id", "source_name", "locator", "date" }], "citation_coverage", "provider", "model" }`（`sections[].text` 可含 `[ev_xxx]`，以 `source_list` 順序編號對齊）

### GET /api/policy/briefs → 200

response：`{ "briefs": PolicyBrief[] }`（`PolicyBrief` 形狀見 `src/data/types.ts`；每則含 `id`/`title`/`time`/`grounding`/`retrieved`/`sources`/`qa`）

- `snapshot()` 取 `briefs`，以 `mergeLiveBriefs()` 讓 **live 晨報置頂、取代 mock 的 daily 類、保留突發/政策 mock 範例**
- 後端不在或 `briefs` 空 → 前端維持全 mock 收件匣（demo 不掛）

### POST /api/policy/refresh → 200

無 request body。response：`{ "briefs": PolicyBrief[] }`（重抓新聞→重生成後的最新晨報）。前端 `refreshNews()` 取 `briefs`；settings「立即更新一次」只取狀態不消費 briefs。

### GET / POST /api/schedule → 200

`ScheduleStatus`：`{ "enabled": boolean, "time": "HH:MM", "last_run_at": string|null, "last_result": unknown, "next_run": string|null }`。POST body：`{ "enabled": boolean, "time": "HH:MM" }`，回更新後的 `ScheduleStatus`。時間為**伺服器本地時間**。

### POST /api/settings/embed*（embedding 設定）

- `POST /api/settings/embed/test`，body `{ base_url, api_key, model }` → `{ "ok": boolean, "message": string, "dim": number }`
- `POST /api/settings/embed`，body `{ backend, model, base_url, api_key }` → 200（無 body）
- `POST /api/settings/reembed` → `{ "reembedded": number, "dim": number }`（換模型/維度改變後需執行，慢）

### 錯誤形狀

非 2xx 時前端 throw 並由呼叫端 fallback 回 mock 示範；錯誤 body 形狀待後端負責人補記。測試連線的 catch 依錯誤類型分流：連線類（後端沒開／`Failed to fetch`）退回示範驗證不跳紅字，後端有回但錯（429/404/embedding 非 chat）顯示分類訊息。

## 5. 前端接線

- provider：`src/data/exchange/policy.ts`（live；`snapshot()` 取 `GET /api/policy/briefs` 的 live 每日晨報置頂，其餘（突發/政策）仍用 mock 範例；後端不在退回全 mock）
- fallback：呼叫端 try/catch，後端不在退回 mock 情報聯集／罐頭訊息（`src/screens/policy/index.ts`、`src/screens/settings/sections/policy-kb-mock.ts`）
- live 特徵：policy 頁不顯資料源 chip（既有特例）；綜合對話總覽卡文案「已接入 N 個知識庫」＝live、「已就緒 N 條情報」＝fallback

## 6. 驗收

- `npm run verify:contract -- policy`（GET /api/sources、/api/report/templates 形狀；chat/report 為 LLM 呼叫不放 smoke）
- `npm run verify:live -- policy`（總覽卡 live 文案 + srcCount>0 + 零 pageerror）
- 人眼：綜合對話提問一次，回答附引用編號、右欄來源連動、Grounding 值合理；產報告流程能出報告

## 7. demo 影片

- scenario：`policy`；重錄 `npm run demo:record -- policy`（目前為 mock 態錄製，live 後端接上後重錄自動轉 LIVE chip）

## 8. 變更紀錄

| 日期 | 變更 |
|---|---|
| 2026-07-12 | 初版：自 `src/data/exchange/policy.ts` 現行呼叫整理 §4；§2 待後端負責人填 |
| 2026-07-12 | 加 `/api/policy/briefs`（snapshot live 晨報）、`/api/policy/refresh`（更新新聞）、`/api/schedule`（每日排程）、`/api/settings/embed*`（embedding 設定）；§5 snapshot 改記 live 晨報；`refreshNews()` 契約 |
