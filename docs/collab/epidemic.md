# epidemic 整合卡

<!-- 複製自 _template.md；「後端 API 為準」：§4 由後端負責人維護、契約變更隨 PR 更新 -->

## 1. 基本資訊

| 項目 | 值 |
|---|---|
| 模組 | epidemic（screen：`src/screens/epidemic/`） |
| 後端負責人 | iMarine 疫情組 |
| 後端 repo | https://github.com/NCHU-ICTALab/iMarine-disease-tracking |
| 預設 branch | `main` |

疫情自動追溯後端（FastAPI）：MOTC 航港局臺灣海域船位 → 真實抵達高雄的船；aisstream 外國
hub 以 MMSI 串聯還原前一外國港；交叉比對疾管署 / WHO 疫情通報 → 規則式風險評分。

## 2. 起服務

前置需求：Python 3.13、venv（後端 repo 有 `requirements.txt`）。

```
# 於後端 repo 根目錄
py -3.13 -m venv .venv
.venv\Scripts\pip install -r requirements.txt
# .env：AIS_PROVIDER=motc、TARGET_PORT_UNLOCODE=TWKHH、AISSTREAM_API_KEY=<你的>
.venv\Scripts\python scripts/link_sources.py    # 由收集資料產生 data/linked_arrivals.json
.venv\Scripts\python scripts/run_latest.py      # 抓疫情 + 全量評估 → 寫入 DB
.venv\Scripts\python -m uvicorn app.main:app --port 8300
```

> 若只是要讓前端接得上、不需重新評估，直接跑最後一行起 API 即可（DB 已有評估結果）。

健康檢查：`curl http://127.0.0.1:8300/health` → 預期輸出：
`{"status":"ok","target_port":"TWKHH","ais_provider":"motc"}`

## 3. env 變數

| 側 | 變數 | 說明 | 預設 |
|---|---|---|---|
| 前端 | `VITE_EPIDEMIC_API` | 後端位址（見 docs/collab/README.md 分配表） | `http://127.0.0.1:8300` |
| 後端 | `AIS_PROVIDER` | `motc`（串聯真實抵港）/ `aisstream` / `mock` | `mock` |
| 後端 | `TARGET_PORT_UNLOCODE` | 目標港 | `TWKHH` |
| 後端 | `AISSTREAM_API_KEY` | aisstream.io 金鑰（串聯外國 hub 用） | — |

後端已開 CORS（允許 `localhost:5173` / `127.0.0.1:5173`），供瀏覽器直接 fetch。

## 4. API 契約（後端為準，隨 PR 更新）

| Method | Path | 用途 |
|---|---|---|
| GET | `/health` | 健康檢查 |
| GET | `/assessments` | 即時風險資料庫：每艘抵港船最新評估（標準輸出格式） |

`GET /assessments` 回應範例（節錄，實際見後端 `demo_output.json`）：

```jsonc
{
  "generated_at": "2026-07-16T12:00:00",
  "target_port": "TWKHH (高雄港)",
  "data_note": "疫情為真實資料（疾管署/WHO）；抵港船為真實資料（MOTC）…",
  "assessments": [
    {
      "ship_code": "219027748",          // MMSI
      "ship_name": "NAKSKOV MAERSK",
      "prev_port": "HKHKG",               // 前一外國港 UN/LOCODE
      "risk_level": "high",               // low | medium | high | critical
      "score": 0.689,                     // 0..1
      "matched_outbreaks": [              // 比對到的真實疫情（前 N 筆）
        { "port": "HKHKG", "country": "HK", "disease": "新型A型流感",
          "report_date": "2026-06-16", "relation": "during_or_before",
          "source": "cdc", "source_url": "https://www.cdc.gov.tw/…" }
      ]
    }
  ]
}
```

欄位說明：`prev_port`/`matched_outbreaks[].port` 為 UN/LOCODE，前端 provider 轉中文港名並對到地圖座標；
`source` ∈ `cdc|who|news`。錯誤/無資料：回 `{ "assessments": [] }`（前端據此退 mock，不崩）。

> provider 端轉換：`risk_level`+`score` → 三分項 factors（重算同級）、`prev_port`+高雄 → 14 天窗口
> ports、`matched_outbreaks` → events/intel、級別 → advice/sms。細節見 `src/data/exchange/epidemic.ts`。
> 未來可加 `GET /ships/{code}/track`（真實靠港日期）讓航跡 day 更精確，與 recommendation/子維度分數（讓三分項有真實差異）——列入後續契約增修。

## 5. 前端接線

- provider：`src/data/exchange/epidemic.ts`（`createEpidemicProvider(base)`；接 live 時在 provider 內
  轉成 snapshot 形狀，UI 不動）。
- **維護者接線（本 PR 未動 `src/main.ts`，屬禁改）**：於 `src/main.ts` 的 `ctx.data` 加一行
  `epidemic: createEpidemicProvider(env.VITE_EPIDEMIC_API),`（比照 policy/carbon）。接線後 chip 自動轉 LIVE。
- fallback：live 失敗（後端不在 / `assessments` 空）整份退 mock（比照 `src/data/exchange/policy.ts`）。
- 資料源 chip 轉 LIVE 條件：`snapshot()` 實際取到非空 `assessments` → provider `source` getter 回 `'live'`
  （screen header 已改讀 `ctx.data.epidemic.source`）。

## 6. 驗收

- `npm run verify:contract -- epidemic`（先照 §2 起後端 8300）
- `npm run verify:live -- epidemic`（**接線後**才適用；本 PR 未接線，此項暫不適用）
- 人眼清單：進 epidemic 頁 → 船隊列出真實船名（如 NAKSKOV MAERSK / EVER MAGI）、右欄風險環與
  三分項、命中疫情（香港 · 新型A型流感）、SMS 文案含級別；資料源 chip 顯示 LIVE。
- 注意：Mapbox GL 需 `.env` 的 `VITE_MAPBOX_TOKEN`；無 token 時地圖顯示降級卡，頁面其餘照常。

## 7. demo 影片

- scenario：`epidemic`（見根 README「簡報 Demo 影片錄製」）
- 重錄：`npm run demo:record -- epidemic`（接上 live 後重錄，chip 自動轉 LIVE）

## 8. 變更紀錄

| 日期 | 變更 |
|---|---|
| 2026-07-16 | 認領模組並定案第一版契約：`GET /health`、`GET /assessments`（標準輸出格式）。新增 live provider `src/data/exchange/epidemic.ts`（轉換 + mock fallback）、填實 `scripts/verify/contracts/epidemic.mjs`、worldmap 補真實港座標、settings 區塊加後端位址欄位。main.ts 接線待維護者。 |

## 附錄：前端現有 mock 欄位形狀（參考，非契約承諾）

「後端 API 為準」之下，本附錄是前端讓後端知道 UI 需要哪些資訊的參考。
來源：`src/data/mock/epidemic.json`（完整值請直接看檔）。

- `timeRange`：`{ startDate, endDate, startDay, now }`
- `pipeline[]`（5 筆）：`{ key, label, count, detail }`
- `fleet[]`（5 筆）：`{ id, name, factors, ports, events, intel, advice, sms }`
- `inflowPool[]`（2 筆）：`{ kind, targetId, event, factors, intel, toast }`
