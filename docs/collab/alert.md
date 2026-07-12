# alert 整合卡

<!-- 複製自 _template.md；「後端 API 為準」：§4 由後端負責人維護、契約變更隨 PR 更新 -->

## 1. 基本資訊

| 項目 | 值 |
|---|---|
| 模組 | alert（screen：`src/screens/alert/`） |
| 後端負責人 | 待填 |
| 後端 repo | 待填（URL） |
| 預設 branch | 待填 |

## 2. 起服務

前置需求（語言版本、套件管理器）：待填

```
# 指令序（維護者照抄可起）
待填
```

健康檢查：`curl http://127.0.0.1:8400/<health-path>` → 預期輸出：待填

## 3. env 變數

| 側 | 變數 | 說明 | 預設 |
|---|---|---|---|
| 前端 | `VITE_ALERT_API` | 後端位址（見 docs/collab/README.md 分配表） | `http://127.0.0.1:8400` |
| 後端 | 待填 | | |

## 4. API 契約（後端為準，隨 PR 更新）

契約待定——後端定案的第一個 live PR 填實本節 + `scripts/verify/contracts/alert.mjs`。

| Method | Path | 用途 |
|---|---|---|
| 待填 | | |

<!-- 每個端點附 request/response JSON 範例 + 欄位說明 + 錯誤回應形狀 -->

## 5. 前端接線

- provider：`src/data/exchange/alert.ts`（目前 mock；接 live 時在 provider 內轉換成 snapshot 形狀，UI 不動）
- fallback：live 失敗必退 mock（比照 `src/data/exchange/policy.ts`，demo 現場後端沒起也不能崩）
- 資料源 chip 轉 LIVE 條件：待填

## 6. 驗收

- `npm run verify:contract -- alert`
- `npm run verify:live -- alert`
- 人眼清單：待填（頁面該看到什麼）

## 7. demo 影片

- scenario：`alert`（見根 README「簡報 Demo 影片錄製」）
- 重錄：`npm run demo:record -- alert`（接上 live 後重錄，chip 自動轉 LIVE）

## 8. 變更紀錄

| 日期 | 變更 |
|---|---|
| | |

## 附錄：前端現有 mock 欄位形狀（參考，非契約承諾）

「後端 API 為準」之下，本附錄是前端讓後端知道 UI 需要哪些資訊的參考。
來源：`src/data/mock/alert.json`（完整值請直接看檔）。

- `kpi`：`{ published, reachedPeople, reachedShips, avgSec, deliveryRate }`
- `cells[]`（9 筆）：`{ id, lngLat, delivered }`
- `feed[]`（6 筆）：`{ id, cat, sev, source, title, body, time, ch, lngLat, fence, cellsLit, funnels, trace, sms, acked }`
- `drillPool[]`（2 筆）：同 `feed[]` 形狀
