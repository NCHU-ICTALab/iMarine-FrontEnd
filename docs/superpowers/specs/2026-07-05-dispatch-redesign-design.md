# Dispatch 頁改版設計 — 短時微氣候 · 即時派工建議

日期：2026-07-05
狀態：設計定稿（brainstorming 完成，視覺方向經 companion 五輪迭代定案 = v4）
基準 wireframe：`.superpowers/brainstorm/564-1783222551/content/layout-d-final.html`（scratch，未進版控）

---

## 1. 背景與目標

現有 dispatch 頁（Task 9 產物）的核心假設與真實系統不符：

- 現有頁面以「逐 10 分鐘 winds/rains 序列 + 拖曳時間軸看熱區網格變化」為主互動，
  但實際 ConvLSTM 對未來 90 分鐘輸出的是**單一預測**（全港區彙總值），
  無逐時間步序列、無空間網格。
- 派工建議卡是四張寫死的卡片，未呈現「規則引擎可解釋」賣點（報告書 v6 §5-3：
  選規則引擎而非 ML 正是因為調度員必須能看懂為什麼）。

改版目標：

1. 資料呈現誠實對齊模型真實輸出形狀（90 分鐘單一預測 + 之後銜接 CWA 逐 3 小時預報）。
2. 把「天氣 → 派工翻譯」做成主視覺（作業 × 時間燈號矩陣），規則依據可逐列展開，
   官方條文與業界慣例分開標注。
3. demo 互動改為情境驅動：三組天氣劇本切換，全頁連動重渲染。

非目標：不接真模型、不接真 CWA API（純 mock）；不做空間網格 / 地圖主視覺
（與單一彙總值輸出不符，捨棄）。

## 2. 決策紀錄

| 決策 | 內容 | 理由 |
|---|---|---|
| ConvLSTM 輸出形狀 | 90 分鐘窗口單一預測：六級雨量分級 + 蒲福風級 + 10min 平均風速 + 陣風 | 使用者確認模型現況「90 分鐘輸出一個預測值，沒辦法做到每 10 分鐘」 |
| 雨量分級 | 無 / 小雨 / 大雨 / 豪雨 / 大豪雨 / 超大豪雨（六級，對齊 CWA 分級） | 使用者指定 |
| 風速分級 | 蒲福氏風級 + m/s 數值並列 | 使用者指定；法規文字用 10 分鐘平均（勞動部函釋） |
| CWA 預報段 | 展示到 +6 小時（+3h、+6h 兩窗，逐 3 小時、鄉鎮尺度） | 使用者選定；聚焦 ConvLSTM 段 |
| Layout | 方向 D 混血：矩陣骨架（StormGeo 式）+ 一句話結論帶（Apple Weather 式）+ 規則展開；捨棄地圖主視覺 | companion 四方向比選，使用者選 D 後迭代 v2→v4 定案 |
| demo 互動 | 四種：情境切換、模型更新倒數（自動）、逐作業驗規則、時間軸游標 | 使用者全選；手動更新鈕（v5 提案）經確認後退回不做 |
| 更新倒數 | 10:00 起跳（真實系統節奏，ConvLSTM 每 10 分鐘重跑） | 使用者選 10 分鐘（棄 demo 加速版 3:00） |
| 作業清單 | 7 種：橋式機貨櫃、散裝穀物、散裝煤礦、油品/化學品、引水/拖船、綁解纜、倉儲/櫃場 | 覆蓋報告書點名五種 + 差異化亮點（穀物見雨即停、油品雷電紅線、綁解纜反向加派） |
| CSI/POD/FAR | 縮成天氣大字塊角落小字（不佔獨立版面），三情境同值 | 模型品質指標與天氣情境無關 |
| 熱區 canvas | 退役刪除（heat.ts） | 空間網格與模型輸出不符 |
| 色彩紀律 | 可作業 `#35E0A6` / 戒備 `#F5A54A` / 停工 `#F0648C`，全頁嚴格同義；停工 ✕、戒備 ! 形狀冗餘 | METAR 式紀律 + 色盲可讀；三色皆在既有 tokens |

## 3. 版面結構（v4 定案）

標準 `ov` 頁（`.swrap` 版心、左 rail、空間型亮背景），模組色琥珀 `#F5A54A`。

```
┌ eyebrow「港邊人員視角 · MODULE 04」
├ 標題「短時微氣候 · 即時派工建議」+ ConvLSTM 0-90 min 徽章 + MOCK chip
│                                右側：模擬情境分段控制器［現況穩定│強降雨逼近│颱風外圍］
├ Hero 列（三塊）
│  ┌ 天氣大字塊（唯一有色底，       ┌ 一句話結論（強調 span）        ┌ 模型更新
│  │  底色=當前風險色）             │ + 複合時間軸 slider            │  進度環
│  │  雨量分級大字「大雨」          │   （圓形把手+跟隨泡泡；        │  10:00 倒數
│  │  蒲福 6 級 · 12.6 平均         │    ConvLSTM 段 55% 亮藍、      │  （自動）
│  │  · 14.2 陣風；角落 CSI/POD/FAR │    CWA 段灰暗、分界虛線；      │
│  │  小字                          │    刻度 NOW/+90m/+3h/+6h）     │
├ 主體兩欄
│  ┌ 左 ~62%：七列作業燈號矩陣      ┌ 右欄：派工指令卡 3-5 張
│  │  欄=ConvLSTM 寬欄(含動作字)    │  標頭「派工指令 N」
│  │    + CWA 兩窄欄(純色,降飽和)   │  卡=標題+動作行+時效 badge
│  │  每列 ▶ chevron 可點展開       │  （紅=有時限/灰=常態）
│  │  規則依據（官方/慣例徽章）     │  左邊條=stop紅/warn琥珀/ok綠(加派型)
│  └ 底部圖例：綠/琥珀/玫紅         │
```

視覺動線：左上有色大字塊（第一眼）→ 結論句 + 時間軸 → 矩陣 → 指令卡。
頁內無解釋性文字；operability 靠 affordance：分段控制器（軌道+滑塊 active）、
slider 圓形把手+光暈、矩陣列 chevron+hover 浮起、倒數 conic 進度環。

## 4. 資料契約

Provider 仍 mock（`source:'mock'`）。`src/data/types.ts` 的 `DispatchSnapshot` 重寫：

```ts
type RainLevel = '無' | '小雨' | '大雨' | '豪雨' | '大豪雨' | '超大豪雨';
type OpStatus = 'ok' | 'warn' | 'stop';
type RuleTag = 'official' | 'industry';

interface DispatchScenario {
  id: 'stable' | 'rain' | 'typhoon';
  label: string;
  nowcast: { rainLevel: RainLevel; beaufort: number; windAvg: number; windGust: number };
  conclusion: string;              // 含 {{stop:文字}} / {{add:文字}} 標記
  cwa: [CwaWindow, CwaWindow];
  ops: OpRow[];                    // 固定 7 筆
  cards: DispatchCard[];           // 2-5 張（stable 常態 2 張、rain 4 張、typhoon 5 張）
  metrics: { csi: number; pod: number; far: number };
}
interface CwaWindow { window: '+3h' | '+6h'; rainLevel: RainLevel; beaufort: number; }
interface OpRow {
  id: 'crane' | 'grain' | 'coal' | 'tanker' | 'pilot' | 'mooring' | 'yard';
  name: string;
  now: { status: OpStatus; action: string };   // ConvLSTM 段：燈色+格內動作字
  cwa3: OpStatus; cwa6: OpStatus;              // CWA 段：只有燈色
  rules: { text: string; basis: string; tag: RuleTag }[];  // 2-3 條，含未命中的下一道門檻
}
interface DispatchCard {
  opId: string; title: string; body: string; level: OpStatus;
  badge?: { text: string; urgent: boolean };
}
interface DispatchSnapshot { scenarios: DispatchScenario[]; }  // 固定 3 筆
```

要點：

- 一切皆情境驅動：切情境 = 整頁從同一筆 `DispatchScenario` 重渲染，無散落狀態。
- 時間軸游標泡泡資料同源：0-90 段顯示 `nowcast`、CWA 段顯示對應 `CwaWindow`，無額外欄位。
- 規則內容寫死在 mock JSON（UI 不做規則運算）；官方條文引用真實條號。
- `conclusion` 的 `{{stop:..}}`（玫紅強調）/`{{add:..}}`（綠強調）由 `parseConclusion()`
  純函式解析（仿 policy `{{c:}}` 手法），TDD。
- 模型更新微調（windAvg/windGust ±0.2-0.4 視覺抖動）屬純 UI 行為，不進契約、不改燈號。

## 5. 規則庫（mock JSON 內容依據）

來源調研（2026-07-05，關鍵依據與出處）：

| 規則 | 數字 | 依據 |
|---|---|---|
| 法定「強風」 | 10 分鐘平均風速 ≥ 10 m/s | 勞動部（原勞委會）台勞安二字第 0042784 號函釋 |
| 吊掛禁止 | 強風、大雨致有危險之虞禁止工作 | 起重升降機具安全規則 §22-6（固定式）、§40-4（移動式） |
| 高處作業停工 | 強風（10 m/s）/ 大雨（一次降雨 50mm） | 職業安全衛生設施規則 §226 + 上開函釋 |
| 船舶裝卸停工授權 | 惡劣天候由當地港口管理機關統一規定 | 碼頭裝卸安全衛生設施標準 §62 |
| 全港停止作業 | 港區平均風力達 7 級（13.9-17.1 m/s）+ 暴風圈抵達 | 高雄分公司風災防救作業要點 §5(2) |
| 浮筒淨空 | 第一/二港口任一測站風力達 5 級 | 同上 §5(3)6 |
| 警戒加纜 | 總噸 <1 萬艏艉纜各 ≥5 條、≥1 萬各 ≥7 條（含倒纜） | 同上 §5(3)9 |
| 危險品船出港 | 總噸逾 5,000 危險品船應出港避風 | 同上 §5(5)1 |
| 卸煤機/穀倉裝卸機固定 | 陸警發布、全港停止作業時 | 同上 §5(9)2、3 |
| 起重機錨定 | 瞬間風速有超過 30 m/s 之虞 | 起重升降機具安全規則 §22-1 |
| 穀物見雨即停 | 降雨即關艙停裝（防霉變） | 國際租船 WWD 慣例（Skuld P&I）— 標 [慣例] |
| 油品雷電紅線 | 雷暴接近即停止揮發性油品裝卸（與風雨無關） | ISGOTT 6th Ch.16 — 標 [慣例] |
| 引水停止登輪 | 20 m/s（8 級）；7 級即停止進出港 | 台中港封港案例 + 高雄要點 §5(2) — 混合 |
| 空櫃提前降級 | 空櫃受風面積大，提前一級 | 業界常識 — 標 [慣例] |
| CWA 雨量分級 | 大雨 1hr≥40mm；豪雨 3hr≥100mm；大豪雨 3hr≥200mm；超大豪雨 24hr≥500mm | CWA 豪(大)雨特報分級（2020-03 起） |

規則展開列的呈現原則：每列 2-3 條，第一條為命中規則（含數值比較式，如
「風速 12.6 ≥ 法定強風 10 m/s → 禁止吊掛」），其後為依據條文（tag 徽章
official=綠框「官方」/ industry=琥珀框「慣例」），可含一條「目前未達的下一道門檻」
（如「高雄港要點 7 級全港停止 — 目前未達」）。

## 6. 三情境劇本

CSI/POD/FAR 三情境同值 0.71 / 0.83 / 0.21。

### 6.1 stable「現況穩定」（進頁預設）
- nowcast：無 · 蒲福 4 級 · 平均 6.5 / 陣風 8.1 m/s → hero 綠
- 矩陣 7 列全綠「正常」；CWA +3h（無 · 4 級）/ +6h（小雨 · 4 級）全綠
- 結論：「未來 90 分鐘港區天候穩定 — 全作業線正常運轉」
- 卡片 2 張常態型：倉儲排水溝例行巡檢（2025-06 倒灌事件 SOP）、引水正常排班

### 6.2 rain「強降雨逼近」（主秀）
- nowcast：大雨 · 蒲福 6 級 · 平均 12.6 / 陣風 14.2 m/s → hero 琥珀
- 矩陣：crane ✕ 停工（12.6 ≥ 10）、grain ✕ 停裝關艙（見雨即停）、coal ! 戒備（揚塵）、
  tanker ! 續作+監控（未達雷擊門檻）、pilot ! 加派拖船、mooring ! 加派 +2、yard 正常
- CWA：+3h 豪雨 · 6 級（grain 續停、crane 轉戒備）；+6h 小雨 · 4 級（全面轉綠）
  —— 呈現「何時恢復」的 weather window
- 結論：「08:05 起風力達 6 級 — {{stop:橋式機、穀物停工}}，油品續作加派監控，
  {{add:綁解纜加派 2 員}}」
- 卡片 4 張：橋式機暫緩（badge「08:05 生效」urgent）、穀物停裝關艙（「即刻」urgent）、
  油品續作+監控（「14:30 前」）、綁解纜加派 2 員（「警戒期間」，level ok 綠=加派型）

### 6.3 typhoon「颱風外圍」（極端態，官方規則全開）
- nowcast：豪雨 · 蒲福 7 級 · 平均 14.5 / 陣風 19.6 m/s → hero 玫紅
- 矩陣：crane ✕ 停工+錨定準備、grain ✕ 停裝、coal ✕ 卸煤機固定、tanker ✕ 危險品船出港、
  pilot ✕ 停止進出港（7 級全港線）、mooring ! 加派加纜 5/7 條、yard ! 貨櫃加固
- CWA：+3h 大豪雨 · 8 級；+6h 豪雨 · 7 級（持續惡化，無恢復窗）
- 結論：「港區風力達 7 級、豪雨 — {{stop:全港停止裝卸作業}}，危險品船出港避風，
  {{add:綁解纜加派加纜 5/7 條}}」
- 卡片 5 張，含颱風態專屬官方措施（危險品船出港避風、橋式機錨定）

三情境的敘事層次：綠（無規則命中）→ 琥珀（法定強風線 + 慣例規則）→
玫紅（高雄港風災防救要點全港級措施）。

## 7. 互動規格

1. **情境切換**（分段控制器，標題列右）：點擊 → active 滑塊移動 → 整頁自對應
   scenario 重渲染（hero 變色漸變、結論重寫、矩陣翻轉、卡片重排 + 輕量 stagger）
   + toast（如「已切換情境：颱風外圍 — 全港停止作業預備」）。切換時關閉展開中的
   規則列、取消進行中的更新動畫（cancelTimers 手法，不洩漏舊情境內容）。
2. **時間軸游標**（slider，圓形把手 + 跟隨泡泡）：拖曳/點擊 → 泡泡顯示
   「+N min · ConvLSTM · 大雨」或「+3h · CWA · 小雨」；游標落段連動矩陣欄標頭高亮
   （0-90 段 → CONVLSTM 欄亮藍；CWA 段 → 對應 +3H/+6H 欄亮起）。只影響泡泡與
   欄標頭，不改燈號。
3. **規則展開**：點矩陣列 → chevron 轉 90° 變藍、列高亮、原位展開命中規則；
   同時只開一列，再點收合。
4. **模型更新（自動）**：進度環 10:00 倒數 → 歸零 → 環轉圈「推論中…」約 2s →
   windAvg/windGust ±0.2-0.4 抖動 + toast「ConvLSTM 已更新 · HH:MM 推論完成」→
   倒數重置。只在本頁 `.active` 時計時（`show()`/`hide()` 開關）；無手動觸發。
5. **通用**：進場 stagger（header → hero → 矩陣 → 卡片）比照全站；
   `prefers-reduced-motion` 無 stagger/漸變/轉圈，直接顯示結果；鍵盤導覽沿用
   `main.ts` 既有 INPUT bail-out（slider focus 時按 1-6 不跳頁）。

## 8. 檔案結構

| 檔案 | 動作 |
|---|---|
| `src/screens/dispatch/index.ts` | 重寫 |
| `src/screens/dispatch/dispatch.html` | 重寫（hero 三塊 + 矩陣 + 卡片欄佔位標記） |
| `src/screens/dispatch/dispatch.css` | 新增（選擇器全 `#s-dispatch` 前綴；檢查 tokens.css 舊 dispatch 樣式外漏，比照 policy `.gbar` 教訓） |
| `src/screens/dispatch/heat.ts` | 刪除 |
| `src/screens/dispatch/conclusion.ts` | 新增：`parseConclusion()` 純函式（TDD） |
| `src/data/types.ts` | `DispatchSnapshot` 重寫 |
| `src/data/mock/dispatch.json` | 三情境全面改寫 |
| `tests/dispatch-conclusion.test.ts` | 新增 |
| `tests/dispatch-mock.test.ts` | 新增（契約驗證：3 情境 × 7 ops、status 枚舉、規則 ≥1 條、卡片 2-5 張） |

元件一律 Liquid Glass Kit；小型/大量重複元件（矩陣格、卡片）用 `lg-static`；
不手寫 backdrop-filter。

## 9. 流程

spec 定稿 → `docs/preview/preview-dispatch-redesign.html` 互動示範
（自含 Kit、headless 驗證 console 乾淨 + 互動斷言）→ 使用者驗收 mockup →
writing-plans → SDD 逐 task 實作（每 task 檢查點由使用者 commit）。

## 10. 驗收標準

1. `npx tsc --noEmit` 0 錯誤；`npx vitest run` 全綠（新增 2 個測試檔）；`npm run build` 成功。
2. 三情境切換：hero 變色、結論、矩陣、卡片、toast 全連動正確；切換中止進行中的動畫。
3. 規則展開：單列互斥、chevron 態正確、官方/慣例徽章正確、含未命中門檻行。
4. 時間軸：把手拖曳、泡泡內容隨段落切換資料源、欄標頭高亮連動。
5. 更新倒數：只在本頁 active 計時、歸零 → 推論動畫 → 抖動 + toast → 重置；
   抖動不改變燈號。
6. `prefers-reduced-motion` 降級路徑完整（無動畫仍有完整內容）。
7. 鍵盤導覽迴歸：slider focus 時 1-6 不跳頁；非輸入元素 focus 時導覽正常。
8. 全站七頁導覽迴歸、console 全程零錯誤。
9. heat.ts 刪除後無殘留引用；tokens.css 無 dispatch 舊樣式外漏。
