# dispatch 整合卡

<!-- 複製自 _template.md；「後端 API 為準」：§4 由後端負責人維護、契約變更隨 PR 更新 -->

## 1. 基本資訊

| 項目 | 值 |
|---|---|
| 模組 | dispatch（screen：`src/screens/dispatch/`） |
| 後端負責人 | mingliu-create |
| 後端 repo | https://github.com/NCHU-ICTALab/iMarine-mircoclimate-I-O |
| 預設 branch | main |

## 2. 起服務

前置需求：Python 3.13、pip；`kaohsiung_microclimate_lstm/models/` 已含訓練好的模型檔案（有納入版控），不需要重新訓練即可直接跑。

```
# 指令序（維護者照抄可起）
git clone https://github.com/NCHU-ICTALab/iMarine-mircoclimate-I-O.git
cd iMarine-mircoclimate-I-O
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -r kaohsiung_microclimate_lstm/requirements.txt
Copy-Item .env.example .env
uvicorn app.api:app --host 127.0.0.1 --port 8200
```

健康檢查：`curl http://127.0.0.1:8200/health` → 預期輸出：`{"status": "ok", "collector": "...", "latest_fetched_at": "...", "row_count": ...}`

## 3. env 變數

| 側 | 變數 | 說明 | 預設 |
|---|---|---|---|
| 前端 | `VITE_DISPATCH_API` | 後端位址（見 docs/collab/README.md 分配表） | `http://127.0.0.1:8200` |
| 後端 | `CORS_ALLOWED_ORIGINS` | 允許的前端來源（逗號分隔）；本機開發預設 `*` 已涵蓋 Vite dev server（`http://localhost:5173`），正式部署才需要明確指定 | `*` |
| 後端 | `CWA_API_KEY` | 中央氣象署開放資料金鑰（選填；沒有的話部分CWA相關資料回傳「不可用」而非報錯，不影響本模組核心端點） | 空 |

## 4. API 契約（後端為準，隨 PR 更新）

**⚠️ 前後端資料模型落差（送PR前務必讀）**：後端沒有「情境（scenarios）」概念，
`/api/v1/dispatch/risk` 回傳的是**單一即時查詢結果**（某個 `target_area` 當下的
H1~H4預測），不是前端mock的3情境清單。目前的接法（見§5）是把live資料merge進
`stable` 情境，`rain`/`typhoon` 兩情境維持純demo模擬用途不變，並非後端提供「情境」。

另外，`ops[]`（7種港區作業類型的法規/慣例派工規則文字）後端完全沒有對應資料，
規則文字（`rules[]`）維持前端靜態法規庫；只有 `now.status`/`now.action`/`cwa3`/`cwa6`
這幾個「燈號」欄位由前端 provider 依即時風速/雨量與一份反推的門檻表重新計算
（門檻表非港務單位正式核可，見 `src/data/exchange/dispatch.ts` 檔頭註解與PR說明，
需域專家後續覆核）。`conclusion`/`cards[]`/`metrics` 目前維持mock靜態值，不做動態生成。

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/v1/dispatch/risk` | 主要端點：查詢某目標區域當下H1~H4（30/60/90/120分鐘）派工風險預測（本模組實際只用到這一個） |
| GET | `/health` | 健康檢查 |

<!-- 每個端點附 request/response JSON 範例 + 欄位說明 + 錯誤回應形狀 -->

### GET /api/v1/dispatch/risk

**Query參數**：`target_area`（string，本模組固定傳 `KHH`）

**Request範例**

```
GET http://127.0.0.1:8200/api/v1/dispatch/risk?target_area=KHH
```

**Response範例**（節錄，本模組只讀取 `forecast_anchors` 與 `cwa` 兩個頂層欄位，
完整欄位遠多於此，其餘為後端內部稽核用途）

```json
{
  "forecast_anchors": [
    {
      "label": "H1",
      "offset_minutes": 30,
      "rain": { "amount_level": "小雨" },
      "wind_speed": { "predicted_mps": 7.068, "beaufort": { "scale": 4 } },
      "wind_gust": { "predicted_mps": 8.169 }
    },
    { "label": "H2", "offset_minutes": 60, "...": "同上結構" },
    { "label": "H3", "offset_minutes": 90, "...": "同上結構" },
    { "label": "H4", "offset_minutes": 120, "...": "同上結構" }
  ],
  "cwa": [
    { "window": "+3h", "rainLevel": "大雨", "beaufort": 6 },
    { "window": "+6h", "rainLevel": "大雨", "beaufort": 6 }
  ]
}
```

**欄位說明（本模組實際使用的部分）**

| 欄位 | 型別 | 說明 |
|---|---|---|
| `forecast_anchors[0]` | object | H1（+30分鐘）錨點，本模組用作 `nowcast` 來源（最貼近「現在」的預測） |
| `forecast_anchors[].rain.amount_level` | string | `無`\|`小雨`\|`大雨`\|`豪雨`\|`大豪雨`\|`not_applicable`；`not_applicable` 時前端fallback成 `無` |
| `forecast_anchors[].wind_speed.beaufort.scale` | number | 蒲福風級，門檻表判斷用 |
| `forecast_anchors[].wind_speed.predicted_mps` / `.wind_gust.predicted_mps` | number | 對應 `nowcast.windAvg` / `nowcast.windGust` |
| `cwa` | array（固定2筆） | `[+3h, +6h]`，跟前端 `CwaWindow` 型別 `{window, rainLevel, beaufort}` 完全對齊，可直接用 |

**錯誤回應**

| 情境 | HTTP狀態碼 | Body |
|---|---|---|
| 備援測站歷史資料檔案不存在 | 404 | `{"detail": "No observed hourly data for fallback_station_id=467441"}` |
| `config.yaml` 遺失 | 503 | `{"detail": "Microclimate dispatch risk config is missing"}` |

provider（`src/data/exchange/dispatch.ts`）對非2xx回應或fetch例外一律整份回退mock，
不會把上述錯誤往UI拋。

## 5. 前端接線

- provider：`src/data/exchange/dispatch.ts`（live；打 `/api/v1/dispatch/risk`，在 provider
  內把結果merge進mock的 `stable` 情境形狀，`rain`/`typhoon` 兩情境不動，UI（`index.ts`）不需改動）
- fallback：live 失敗（fetch例外或非2xx）必退純mock（比照 `src/data/exchange/policy.ts`）
- 資料源 chip 轉 LIVE 條件：`main.ts` 是否把 `dispatch` 接上 `createDispatchProvider(...)`
  （比照 `carbon`/`twin` 既有慣例：chip反映「此模組是否wired到live provider」，不是「這次
  請求是否真的連到後端」——後端斷線時chip仍顯示LIVE，但內容悄悄retain/退回mock，不會顯示錯誤畫面）

## 6. 驗收

- `npm run verify:contract -- dispatch`
- `npm run verify:live -- dispatch`
- 人眼清單：
  - stable情境hero數字（雨量等級/蒲福級/平均風速/陣風）跟後端
    `curl http://127.0.0.1:8200/api/v1/dispatch/risk?target_area=KHH` 的 `forecast_anchors[0]` 一致
  - 作業矩陣（`crane/grain/coal/tanker/pilot/mooring/yard`）燈號跟 §4 門檻表算出的結果一致
  - 切到「強降雨逼近」「颱風接近」情境時內容完全不受live資料影響（維持demo原樣）
  - 把後端關掉、重新整理頁面：畫面優雅退回mock，不出現錯誤畫面，LIVE chip仍會顯示（見§5說明）

## 7. demo 影片

- scenario：`dispatch`（見根 README「簡報 Demo 影片錄製」）
- 重錄：`npm run demo:record -- dispatch`（接上 live 後重錄，chip 自動轉 LIVE）

## 8. 變更紀錄

| 日期 | 變更 |
|---|---|
| 2026-07-14 | 首次接上live：新增 `src/data/exchange/dispatch.ts`，merge `/api/v1/dispatch/risk` 的H1（nowcast來源）與 `cwa`（+3h/+6h）進 `stable` 情境；新增7種作業的燈號門檻表（反推自mock 3情境×7作業，非正式規則，待域專家覆核）；`rain`/`typhoon` 情境不受影響；填實第4節API契約與 `scripts/verify/contracts/dispatch.mjs`、`scripts/verify/live/dispatch.mjs`。 |
| 2026-07-14 | 後端補上 `/api/v1/dispatch/risk` 頂層 `metrics`（H1 rain_probability 的 CSI/POD/FAR，`available=false` 時保留mock靜態值不用null覆蓋）；前端 `renderHero()` 拆出 `renderHeroValues()`，時間軸拖曳到 RandomForest 0-120min 區段時會用 `liveAnchors`（H1~H4）取最近一筆即時切換hero數字，拖到CWA +3h/+6h區段則改顯示 `cwa[0]`/`cwa[1]` 真實值（無精確m/s，`windAvg`/`windGust`顯示「—」）；`ConvLSTM`→`RandomForest`、`0-90min`→`0-120min` 全面更名修正（含mock情境結論文字）；`rain`/`typhoon` 情境仍完全不受影響。 |
| 2026-07-15 | 後端第49項補上 `metrics.by_horizon`（H1~H4逐anchor CSI/POD/FAR）後，前端全面比對「後端有、前端沒用到」的欄位並補上三項：①拖曳到 RandomForest 區段時 `#wxmet`（CSI/POD/FAR）跟著切換到對應錨點的真實數字（新增 `DispatchScenario.metricsByHorizon`），CWA zone維持顯示「—」（無對應後端指標）；②`forecast_anchors[].dispatch_suggestion`（真實派工建議文字）接上 `#concl`，拖曳RandomForest區段時跟著切換，CWA zone與缺值時維持原本mock靜態文字不變；③`forecast_anchors[].dispatch_risk_level`（後端5級 normal/watch/warning/high_risk/stop）收斂成前端3態後接上hero底色（`normal`/`watch`→`ok`、`warning`/`high_risk`→`warn`、`stop`→`stop`），取代原本只看`rainLevel`的`WXCLS`查表，CWA zone與mock情境維持`WXCLS`查表不變。同時盤點過 `reliability`、`current_station_usage`、`station_display_rows`、`model_registry_summary` 等系統稽核類欄位，判斷不適合出現在港務派工UI，刻意不接。`rain`/`typhoon` 情境仍完全不受影響。 |

## 附錄：前端現有 mock 欄位形狀（參考，非契約承諾）

「後端 API 為準」之下，本附錄是前端讓後端知道 UI 需要哪些資訊的參考。
來源：`src/data/mock/dispatch.json`（完整值請直接看檔）。

- `scenarios[]`（3 筆）：`{ id, label, nowcast, conclusion, cwa, ops, cards, metrics }`
