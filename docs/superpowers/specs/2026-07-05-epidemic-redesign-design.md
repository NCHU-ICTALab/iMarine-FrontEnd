# Epidemic 頁改版設計 — 疫情自動追溯

> 設計文件（spec）。狀態：brainstorming 定案，待實作。
> 基準檔（互動/視覺真相來源）：`docs/preview/preview-epidemic-redesign.html`
> 上位文件：`CLAUDE.md`、`HANDOFF.md`、報告書 v6（§二(三)、§三、§(四) 疫情預警選型）。

---

## 1. 動機與定位

現有 `epidemic` 是佔位頁（無專屬 css、樣式寄生 `tokens.css`），內容為單船靜態 mock。
本次比照 policy / dispatch 前例做完整改版，落實報告書的核心敘事：

> 自動整合進港船隻的過去 AIS 資料，重建停靠港口序列；交叉比對船舶軌跡與 WHO/疾管署/
> 國際疫情新聞的通報**時序**與**地點**；判定船舶近期停靠港是否出現疫情、或航跡是否與
> 通報時序重疊；建立疫情可能擴散範圍；並自動發送**細胞簡訊**通知港邊作業人員。

評分方法依報告書 §(四)：**規則式評分**（依 WHO《IHR 國際衛生條例》框架），
可解釋、新病原只需補規則、不用機器學習——不是 ML 推論頁。

視角：**港邊第一線人員**（引水、繫纜、裝卸、檢疫）。模組色玫紅 `--rose:#F0648C`。

### 內容規範（使用者定案）
- **不得出現任何真實具名事件/船隻/公司**（例：不提「新光輪」案例）。船名一律中性虛構。
  港名（真實地理位置）可用作營運情境背景，但疫情事件為示意、非影射真實疫情。
- **頁面不放解釋性散文**：不寫一句話結論、不寫白話摘要、不放案例段落。
  重點一律用**數據、chip、色彩**直接呈現。
- **配色必須具引導性**：常態壓灰去飽和，風險與命中才發亮跳出，視覺動線帶著使用者走
  「左欄最高風險 → 中央命中連接線 → 右欄細胞簡訊」。

---

## 2. 決策紀錄

| # | 決策 | 選擇 | 理由 |
|---|---|---|---|
| D1 | 敘事焦點 | **進高雄港船隊總覽 → 下鑽單船**；**只收目的港為高雄的船** | 對齊報告書「總覽介面」定位；使用者定案聚焦高雄港 |
| D2 | 中央主視覺 | **上真實世界地圖 + 下 Epi-Gantt 泳道，共用時間游標**；中央欄放大為主要呈現 | 空間「從哪來」× 時間「何時重疊」分層；使用者定案中央為主資訊、須大 |
| D3 | 地圖底圖 | **Mapbox GL JS**（深色 style，真實互動地圖磚） | 使用者定案「地圖用 Mapbox」。取捨：需 access token（`.env`，見 §7 敏感檔）+ demo 時需連網取磚（放棄純離線）；換得真實可平移縮放的世界地圖 |
| D4 | 評分 | **規則式評分純函式**（`correlate.ts`），mock 只存 factors | 單一真相來源、可 TDD、模擬偵測可重算 |
| D5 | 命中判定 | 時空雙條件：同港 ∩ 時間窗（重疊=rose / 潛伏窗內=amber 橘線） | 對應報告書「近期停靠出現疫情」與「航跡與通報時序重疊」兩種命中 |
| D6 | 互動範圍 | 四項全做：點船下鑽 / 時間游標拖曳 / 管線進場+點開來源 / 模擬偵測 | 完整 demo；管線與模擬偵測是自動化賣點的演出 |
| D7 | 模擬偵測劇情 | 池兩發：升級現有船 + 新增進港船，池盡重置循環 | 比照 policy 流入池；demo 可連演 |
| D8 | 內容口吻 | 無散文、數據/chip/色彩呈現 | 使用者定案（見 §1 內容規範） |
| D9 | 配色 | 引導性：常態壓灰、風險發亮 | 使用者定案 |

---

## 3. 版面

標準 `'ov'` 頁（`registry.ts` mode:'ov'），`.swrap` 版心（同 dispatch/epidemic 現況）。
背景空間型（亮，非 doc 罩幕）。由上而下：

```
┌ 標頭：eyebrow「港邊人員視角 · MODULE 05」· 標題「疫情自動追溯」· 徽章[AIS×WHO IHR·規則式評分] · MOCK chip · 模擬偵測鈕
├ 自動化管線帶（全寬）：五階段 爬取情資→重建航跡→時空比對→規則評分→細胞簡訊
│   每階段 狀態燈 + 計數；進場依序點亮 + 沿線流光；點階段 → 滑出 detail
├ 三分割 grid（左 0.72fr / 中 2.9fr / 右 1fr）——中央放大為主要呈現
│  ┌左欄┐ ┌────────中欄（主）────────┐ ┌右欄┐
│  │進高│ │重點 chip 列              │ │評分 │  風險環 + 三因子 meter
│  │雄船│ │Mapbox 真實地圖（放大）   │ │情報 │  WHO/疾管署/新聞 chip · 命中亮/未命中灰
│  │隊  │ │ 底圖 + 真實航線(→高雄)   │ │防護 │  action chip
│  │依風│ │ + 疫區熱點 + 船位插值     │ │簡訊 │  港邊派工卡
│  │險排│ │Epi-Gantt 雙泳道           │ └────┘
│  │序  │ │時間軸 + 游標              │
│  └────┘ └─────────────────────────┘
```

- **重點 chip 列**（取代散文）：最高風險站點 / 時序重疊天數 / 現況(高雄港在泊) / 停靠序列(N港/Md)。
  高風險 chip 邊框+數字著風險色，其餘灰。
- **中央欄放大**：中欄佔比最大（地圖為主要呈現資訊），左欄收窄為船隊清單，右欄為輔助卡片。
- **地圖**：真實世界地圖，區域涵蓋東亞/東南亞（高雄為所有航線目的港，明確標「目的港」）。
- 進場 stagger（`--d` 遞增），對齊全站節奏。

---

## 4. 資料契約 `EpidemicSnapshot`（`src/data/types.ts` 改寫）

由「單船靜態」改為「船隊 + 管線 + 流入池」。所有分數由 §5 純函式從 factors 算出，
契約**只存原始 factors 與 raw ports/events**，不存算好的分數（避免漂移）。

```ts
export interface EpidemicVessel {
  id: string;
  name: string;                 // 中性虛構船名
  factors: EpidemicFactors;     // 規則評分輸入（見 §5）
  ports: EpidemicPort[];        // 過去停靠序列（重建自 AIS）
  events: EpidemicEvent[];      // 與本船相關的疫情通報（多來源）
  intel: EpidemicIntel[];       // 右欄多來源情報列（WHO/疾管署/新聞）
  advice: string[];             // 防護動作（短 tag，非句子）
  sms: string;                  // 細胞簡訊內文（關鍵一行）
}

export interface EpidemicFactors {
  dwellDays: number;      // 靠港天數（0-100 正規化）
  sourceStrength: number; // 來源強度（通報權威性/嚴重度，0-100）
  distanceFactor: number; // 距離因子（疫區與本港時空接近度，0-100）
}

export interface EpidemicPort {
  name: string;    // 對應 PORT_COORDS 的鍵；序列末站必為 '高雄'（berthed）
  dayIn: number;   // 相對時間軸起點的日索引（含日期標籤由 timeRange 換算）
  dayOut: number;  // 離港日索引；在泊者 = timeRange.now
  berthed?: boolean; // 現於高雄港在泊
}

export interface EpidemicEvent {
  id: string;
  port: string;    // 通報地點（對應某 port.name / PORT_COORDS 鍵）
  day: number;     // 通報日索引
  source: 'who' | 'cdc' | 'news';
  label: string;   // 短標（例「呼吸道群聚」）
}

// 港口真實經緯度 [lon,lat]，供世界地圖投影；港節點/疫區熱點/航線/船位皆查此表定位。
// 定義在 worldmap.ts（或 mock），例：高雄 [120.30,22.61]、香港 [114.17,22.30]、
// 馬尼拉 [120.97,14.58]、釜山 [129.04,35.10]、新加坡 [103.85,1.29] …
export type PortCoords = Record<string, [number, number]>;

export interface EpidemicIntel {
  source: 'who' | 'cdc' | 'news';
  text: string;    // 短句
  hit: boolean;    // 是否為命中來源（true 亮、false 灰）
}

export interface EpidemicPipelineStage {
  key: string;
  label: string;   // 爬取情資 / 重建航跡 / 時空比對 / 規則評分 / 細胞簡訊
  count: string;   // 計數字（例「42」「443」「7」）
  detail: string[];// 點開滑出：吃了哪些情資/命中幾筆/原始連結（短列）
}

// 流入池：兩種形狀之一
export type EpidemicInflow =
  | { kind: 'escalate'; targetId: string; event: EpidemicEvent;
      factors: EpidemicFactors; intel: EpidemicIntel; toast: string; }
  | { kind: 'newship'; vessel: EpidemicVessel; toast: string; };

export interface EpidemicSnapshot {
  timeRange: { startDate: string; endDate: string; startDay: number; now: number };
  pipeline: EpidemicPipelineStage[];
  fleet: EpidemicVessel[];      // 初始船隊，依算出分數排序（實作時排序，不寫死順序）
  inflowPool: EpidemicInflow[]; // 兩發
}
```

`src/data/mock/epidemic.json` 全面改寫成上述結構（見 §6 劇本）。

---

## 5. 可測純邏輯 `src/screens/epidemic/correlate.ts`（TDD 單元）

把「規則式評分」與「時空交叉比對」抽成純函式——這頁真正該測的分析核心，
對齊 dispatch 的 `conclusion.ts`、policy 的 `generate.ts`。

### 5.1 `scoreVessel(f: EpidemicFactors): VesselScore`
```
score = round(0.25*dwellDays + 0.50*sourceStrength + 0.25*distanceFactor)
```
來源強度權重最高（呼應 IHR：WHO 正式通報 > 媒體）。分級：

| score | tier | level 文案 | 色（圓點/環/meter 一致） |
|---|---|---|---|
| ≥ 80 | `red`   | 紅級 · 禁止登輪 | 玫紅 `#F0648C` |
| 60–79 | `orange` | 橙級 · 限制登輪 | 琥珀 `#F5A54A` |
| 40–59 | `yellow` | 黃級 · 加強防護 | gold `#E9BC63` |
| < 40 | `green`  | 綠級 · 正常 | 綠 `#35E0A6`（去飽和壓灰呈現） |

回傳 `{ score, tier, levelLabel, actionLabel, color }`。**圓點色 = 環色 = 級別色**（單一 tier→色
映射，不另設一套）。玫紅（紅級）僅在分數 ≥80 出現——初始船隊最高為 HORIZON 217 橙級（琥珀），
**模擬偵測發2 新增 CORAL EXPRESS(85) 才冒出第一艘紅級玫紅船**，強化升級戲劇性。
注意區分兩種玫紅語意：**級別玫紅**（整船紅級，用於圓點/環）vs **命中玫紅**（`computeHits` 的 rose
命中港口/連接線）——兩者落在不同元素上，不衝突（如 HORIZON 為橙級琥珀環，但其香港站為 rose 命中發玫紅光）。

### 5.2 `computeHits(ports, events): Hit[]`
對每則 event，找同名 port 停靠，依時序判定：

- **重疊命中 `rose`**：event.day ∈ [port.dayIn, port.dayOut]（或窗重疊）→ `overlapDays > 0`。
  （對應「近期停靠港出現疫情」「航跡與通報時序重疊」。）
- **潛伏窗臨界 `amber`**：port 離港後、`0 < event.day − port.dayOut ≤ INCUBATION(7)` →
  通報在離港後潛伏窗內冒出 → 時序臨界（橘線）。
- 否則不命中。

回傳 `Hit[]`：`{ portName, eventId, type:'rose'|'amber', magnitude(重疊/間隔天數),
markerDay(連接線落點日索引) }`。驅動泳道連接線（色/線寬=magnitude）與命中港口發光。

### 5.3 測試（`tests/epidemic-correlate.test.ts`）
- scoreVessel：四個分級邊界（39/40/59/60/79/80）、加權公式定值、round 行為。
- computeHits：重疊 → rose、離港後 5 天 → amber、離港後 10 天 → 無、不同港不命中、
  多 event 對多 port、在泊（dayOut=now）與通報同日 → rose。

`tests/epidemic-mock.test.ts`：驗 mock 契約（fleet≥5、每船 factors 三欄齊、ports 座標 0-1、
inflowPool 兩發且形狀正確、pipeline 五階段、timeRange 合法）。

---

## 6. mock 劇本

`timeRange`：06-19 → 07-02（14 天），now = 07-02。

**所有船目的港皆為高雄（序列末站 = 高雄，berthed）。**

### 初始船隊（5 艘；分數由 §5.1 算出，此處標註預期值）
| 船名(虛構) | dwell/source/dist | 算出 | 級別 | 停靠序列（→高雄） · 情境 |
|---|---|---|---|---|
| HORIZON 217 | 64 / 85 / 52 | 72 | 橙 · 限制登輪 | 馬尼拉→香港→**高雄**；**主秀**：香港與 WHO 通報重疊 +2d |
| MERIDIAN 9 | 66 / 58 / 50 | 58 | 黃 · 加強防護 | 新加坡→馬六甲→**高雄**；新加坡離港後潛伏窗內通報（amber 橘線臨界） |
| NORDIC 88 | 50 / 42 / 30 | 41 | 黃 · 加強防護 | 釜山→那霸→**高雄**；目前僅觀察（**發1 升級目標**） |
| PACIFIC DAWN | 25 / 15 / 18 | 18 | 綠 · 正常 | 香港→**高雄**；無命中 |
| BLUE HERON | 20 / 8 / 12 | 12 | 綠 · 正常 | 廈門→**高雄**；無命中 |

主秀 HORIZON 217：馬尼拉(06-19 離)→香港(06-22~06-24,停3d)→高雄(07-02 在泊)。
events：WHO 香港「呼吸道群聚」day4（與香港停靠重疊 → rose 命中 +2d）；
        疾管署 港澳建議 L1；新聞×2 門診異常（intel.hit=true/true/false）。
右欄防護動作：登輪限縮檢疫+領航 · N95+面罩 · 接觸名單建檔 · 離船14d自主管理。
sms：「HORIZON 217 抵高雄108 · 橙級 · 限制登輪」。

### 流入池（兩發）
- **發1 `escalate`**（升級現有船）：新 WHO event「釜山 呼吸道群聚」流入 →
  NORDIC 88 factors 改 `source 42→82, dist 30→58`（dwell 不變）→ 重算 **68 橙級** →
  左欄重排上升、釜山停靠新增泳道命中連接線 +2d、intel 補一列 WHO 命中、自動草擬 sms。
  toast：「偵測到新通報 · 釜山，NORDIC 88 升級橙級」。
- **發2 `newship`**（新增進港船）：CORAL EXPRESS（香港→廈門→高雄），factors 80/88/85 →
  **85 紅級 · 禁止登輪**，從清單頂部滑入、標未讀點、**不搶目前選中**。toast：「新進港船 · CORAL EXPRESS 紅級」。
- 池用盡 → 下一擊**重置循環**（移除發2 新船、還原 NORDIC，回到初始，可重演）。

---

## 7. 互動規格

### 7.1 點船下鑽
點左欄船列 → 中央（重點 chip 列 / 航線圖 / 泳道 / 時間軸）與右欄（評分 / 情報 / 防護 / 簡訊）
全部重繪成該船。選中列高亮（玫紅描邊 + 不壓灰）。切船時時間游標歸位到 now。
航線圖與泳道重繪綁 `show()`（首次可見才量得到尺寸，同現有 route.ts 手法）。

### 7.2 時間游標拖曳（複用 dispatch 手法）
底部時間軸游標可拖曳/點擊/鍵盤（←→ 步進、Home/End 端點）。拖曳時：
- 地圖**船位沿航跡插值**（含數秒淡出拖尾）到游標對應時刻的位置；
- 泳道命中點/連接線在游標**越過重疊那一刻脈衝發光**（命中環）；
- `setPointerCapture` 對合成事件包 try/catch（dispatch 前例已知 NotFoundError）。
- 鍵盤事件在游標聚焦時 `stopPropagation`，不觸發全站導覽（對齊 main.ts bail-out）。

### 7.3 管線進場動畫 + 點開來源
`show()` 時五燈依序點亮（done→run→wait 漸進）+ 沿線流光；完成後定格於「時空比對 run」態
（示意持續監看）。點任一階段 → 原位滑出該階段 `detail`（吃了哪些情資 / 命中幾筆 / 原始連結短列，
Perplexity 式揭露；連結為 mock 佔位不外連）。`prefers-reduced-motion` → 直接顯示終態、無流光。

### 7.4 模擬偵測（標頭放「模擬偵測」鈕）
點擊依序播 §6 流入池兩發 + 重排動畫 + toast + 未讀點；池盡下一擊重置循環（比照 policy `flowIn`）。
`show()` 進頁 ~9 秒若未手動觸發則自動流入發1（僅本頁 `.active` 時；離頁不誤跳 toast，比照 policy）。
升級重排用 FLIP/transition，未讀點脈動受 reduced-motion 抑制。

---

## 8. 配色與設計系統（引導性）

- **引導層級**：常態元素 `opacity:.5` + 去飽和灰（綠級圓點 `#3a4757`、正常港節點灰）；
  風險越高越亮並發光（玫紅 > 琥珀 > gold），命中連接線/命中港口發玫紅光。
- 風險：紅玫紅 `#F0648C` / 橙琥珀 `#F5A54A` / 黃 gold `#E9BC63` / 綠 `#35E0A6`。
- 來源 chip：WHO 玫紅 · 疾管署 gold · 新聞 dim；命中亮、未命中 `opacity:.55`。
- 時間游標 cyan `#38BDF8`；船位標記 cyan。管線燈：完成綠 / 進行藍脈動 / 待處理灰。
- Kit 鐵則：不手寫 `backdrop-filter`；面板用 `lg`/`lg-static`；儀表=玻璃容器+實心內容。
  面板承載面深藍灰（非純黑），髮絲線 `rgba(255,255,255,.08)`。
- 全 css scope `#s-epidemic` 前綴，避免跨頁洩漏（policy `.gbar` 洩漏前例殷鑑）。

---

## 9. 檔案結構

| 檔案 | 動作 |
|---|---|
| `src/screens/epidemic/epidemic.html` | 重寫（三分割骨架 + 佔位標記） |
| `src/screens/epidemic/epidemic.css` | 新增（`#s-epidemic` scope、無手寫 backdrop-filter） |
| `src/screens/epidemic/index.ts` | 重寫（生命週期 + 四互動接線） |
| `src/screens/epidemic/worldmap.ts` | 新增（**取代 route.ts**）：Mapbox GL JS 初始化（深色 style）+ 航線 line layer(→高雄) + 疫區熱點 circle layer + 船位 marker 經緯度插值 + `fitBounds` 至選中船航線；含 `PORT_COORDS` |
| `src/screens/epidemic/swimlane.ts` | 新增（Epi-Gantt 雙泳道繪製 + 命中連接線） |
| `src/screens/epidemic/correlate.ts` | 新增（scoreVessel + computeHits，TDD） |
| `src/screens/epidemic/route.ts` | 刪除（原示意航線 canvas，由 worldmap.ts 取代） |
| `package.json` | `npm install mapbox-gl` + `@types/mapbox-gl`（dev） |
| `.env.example` / `.env` | 新增 `VITE_MAPBOX_TOKEN=`（`.env` gitignored，見 §7）；worldmap 讀 `import.meta.env.VITE_MAPBOX_TOKEN` |
| `src/data/types.ts` | 改 `EpidemicSnapshot` 及相關 interface |
| `src/data/mock/epidemic.json` | 全面改寫（§6 劇本，皆進高雄） |
| `src/ui/tokens.css` | 清除舊 epidemic 佔位殘留樣式（若有專屬段） |
| `tests/epidemic-correlate.test.ts` | 新增 |
| `tests/epidemic-mock.test.ts` | 新增（另驗每船序列末站為高雄 berthed） |

provider（`src/data/`）維持 mock，`source:'mock'`，介面形狀不變（只換 snapshot 型別）。
**Mapbox**：深色 style（`mapbox://styles/mapbox/dark-v11` 或近似）；航線/熱點以 GeoJSON source + layer
畫、船位/港口以 marker；選中船 `fitBounds` 至其航線範圍；船位插值以經緯度 `setLngLat` 更新 marker；
新增 source/layer 需在 `map.on('load')` 後；**地圖容器掛載前需淨空**（Mapbox 對非空容器發警告，
降級提示卡在建圖前 `remove()`）。token 缺失時 worldmap 優雅降級（顯示提示卡、不崩頁）。
Mapbox worker/CSP：本 repo `index.html` 無 CSP meta，無需調整；若日後加 CSP 需放行 `worker-src blob:`
與 `api.mapbox.com`。**token 安全**：`VITE_MAPBOX_TOKEN` 放 `.env`（gitignored）；建議在 Mapbox 帳號
對該 token 設 URL 限制（僅本站網域），不硬編進版控檔。

---

## 10. 驗收標準

1. 三綠燈：`npx tsc --noEmit` 0 errors、`npx vitest run` 全綠（含新增兩測試檔）、`npm run build` 成功。
2. 內容規範：全頁 grep 無真實具名事件/船隻/公司；無解釋性散文段落；重點以數據/chip/色彩呈現。
3. 四互動（headless CDP 逐項）：
   - 點船下鑽：≥3 艘切換，中欄+右欄正確重繪、選中高亮、游標歸位。
   - 時間游標：拖曳→船位插值移動 + 命中脈衝；鍵盤步進不觸發全站導覽。
   - 管線：進場依序點亮；點階段滑出 detail；reduced-motion 直接終態。
   - 模擬偵測：發1 升級 NORDIC→68 重排、發2 新增 CORAL 未讀不搶選中、池盡重置；
     9 秒自動流入僅未手動時觸發、離頁不誤跳。
4. 引導性配色：常態壓灰、風險/命中發亮，視覺動線成立（截圖存證三情境：初始/升級後/新船）。
5. `prefers-reduced-motion: reduce`：所有動畫直接終態、內容完整非空白。
6. 七頁全站迴歸：hero→carbon→policy→twin→dispatch→epidemic→alert→hero，console 零新增錯誤。

---

## 11. 非目標（YAGNI）

- 不接真實 LLM / 真實 AIS / 真實 WHO API（船隊/通報/評分皆 mock；地圖底圖為 Mapbox 真實磚）。
- 不做 3D 時空立方（判讀成本高；平面 Mapbox 地圖 + 泳道足夠）。
- 不做船隊多選比對、graph 傳播網路圖（單船下鑽主線足夠；列為未來）。
- 不承諾純離線（Mapbox 磚需連網）；demo 環境需備網路，token 缺失時 worldmap 優雅降級不崩頁。
