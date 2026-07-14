# Twin 頁：停船朝向穩定化 + 船隻跟隨模式 — 設計文件

日期：2026-07-14
狀態：已與使用者確認方向，待實作

## 背景與問題

1. **停靠打轉**：船在泊位/錨地停止時原地轉來轉去。根因在 `src/screens/twin/scene-init.ts` 的朝向邏輯——只有「整段軌跡淨位移 < 100m 且貼近碼頭」的船會鎖碼頭切線（`trackMeta.pierAligned`，整段軌跡一刀切）；「開進來再靠泊」的船不算 stationary，回放到停靠時段時朝向落到 `time/ais-replay.ts` `positionAt` 的相鄰點方位角——停船 GPS 抖動使相鄰點方位隨機，每過一個 AIS 點船就轉一次。錨泊船同理。
2. **跟隨模式**：希望點選某艘船後「再點一下」進入 Cities: Skylines 式跟隨——相機鎖定該船隨其移動，使用者仍可自由環繞/縮放。

## 使用者已確認的決策

- 停船朝向：**貼碼頭 → 對齊碼頭切線；其他（錨地等）→ 保持進來的航向**（逐時刻判定，非整段軌跡一刀切）。
- 跟隨相機：**鎖定目標 + 可自由環繞/縮放**（非鎖死電影視角）。
- 進入/退出：**同船再點一次進入；Esc / 點空白 / 點別船退出**。
- 修法採「載入時預算穩定化朝向時間線」（確定性純函式，非執行期低通濾波——濾波有狀態、scrub 亂跳/倒轉結果不一致）。
- 跟隨邏輯全部做在 `src/screens/twin/` 層，**不動 vendored 的 `src/twin-engine/`**（engine 已暴露 `camera3D`、`controls.target`、`addUpdate()`，夠用）。

## §1 朝向穩定化

### 新模組 `src/screens/twin/time/heading.ts`（純函式、可單測）

載入時對每條軌跡預算一次「逐點穩定朝向」：

1. **逐段判動靜**：相鄰兩點距離 ÷ 時間 → 段速度；≥ 0.5 kn（`STOP_KN = 0.5`）視為移動、否則停止。
2. **移動點**：沿用現行邏輯（AIS heading 優先，否則點間方位角）。
3. **停止點**：沿用「最後一段有效移動航向」；軌跡開頭就停的，往時間軸未來方向找第一段移動航向來用；全程沒動過的用 AIS heading，沒有就碼頭切線。
4. **靠泊鎖定**：停止且離最近碼頭 < 300m（重用既有 `PIER_SNAP_MAX`）→ 鎖碼頭切線。碼頭切線是無向的（±180° 歧義），**取與進來航向夾角較小的那個方向**，避免對齊時瞬間掉頭。
5. 產出（每軌跡）：`stableHeadingDeg: Float32Array(n)` + `berthLocked: Uint8Array(n)`（n = path 點數），以 mmsi 為鍵存 Map——與既有 `trackMeta` 預算快取同層、同手法。
6. 查詢函式 `headingAt(...)`：給 tMs 回傳兩點間**最短弧插值**的穩定朝向（重用 `lerpAngleDeg`）。停止段朝向恆定所以不再打轉；進出港時段兩端穩定值之間自然平滑轉向。

### 接線（`scene-init.ts`）

- `updateShips` 的朝向改查預算結果（取代現行 `meta.pierAligned ? meta.pierH : rp.headingDeg` 分支）。
- `positionAt` **不動**——`vesselsInPortAt` 與 `pickShipAt` 的航速估算只用位置，零波及。
- `pickShipAt` 的狀態文字（靠泊/錨泊/航行中）改用**當下時刻**的 `berthLocked`（比整段一刀切的 `trackMeta.pierAligned` 更準；`trackMeta` 其餘欄位照舊）。

### 性質

任何時刻的朝向都是 tMs 的純函式：scrub 亂跳、倒轉、重播完全一致。載入一次 O(總點數) 預算，之後每幀零額外開銷。

## §2 跟隨模式

### scene-init.ts 增加

- `ShipPickInfo` 加 `mmsi: string` 欄位。
- `TwinScene` 加 `follow(mmsi: string, onEnd?: () => void): void` 與 `unfollow(): void`。
- **進入動畫**：重用 `flyTo` 的 650ms ease tween 飛向船；目標距離依船長取景（LOA×4，設下限避免小船貼太近）；tween 終點每幀追船的**當下**位置（船在移動也追得上）；`prefersReduced()` 時直接跳定（與 `flyTo` 同慣例）。
- **每幀鎖定**（`engine.addUpdate` hook，tween 完成後生效）：算船在 `currentMs` 的世界座標，`controls.target` 與相機位置**等量平移**——使用者的環繞角度/縮放距離不被覆蓋，拖曳旋轉、滾輪縮放照常作用。
- **自動退出**（呼叫 `onEnd` 讓 UI 同步）：
  - 船在當前時刻無軌跡資料（scrub 出該船時間範圍/軌跡結束）；
  - 該船種被右欄篩選器濾掉。

### index.ts 交互接線

- 點船 A → 現有 chip 照舊顯示，**加一行提示「再點一次跟隨」**。
- 再點同一艘（比對 mmsi）→ `scene.follow(mmsi)`；chip 換為**跟隨態**（船名 + 狀態 + 「Esc 退出」提示），停靠在固定位置（不再貼滑鼠點）。
- 退出條件：
  - **Esc**（鍵盤監聽，僅本頁 active 時生效）；
  - **點空白處**（pick 無命中）；
  - **點另一艘** → 退出跟隨並改選新船（顯示新船 chip，再點一次才跟隨新船）；
  - **切「未來推演」分頁**（場景凍結，跟隨無意義）；
  - **按視角預設按鈕**（all/pier/mouth）→ 先退出再 flyTo。
- 時間軸 scrub / 播放 / 倍速**不退出**跟隨（相機持續追船）。
- 現有「scrub 收 chip」行為：非跟隨態照舊收起；跟隨態下保留跟隨指示不收。

### 樣式（twin.css，小改）

chip 提示行與跟隨態（固定停靠位置）樣式。無 emoji。

## §3 檔案改動一覽

| 檔案 | 改動 |
|---|---|
| `src/screens/twin/time/heading.ts` | 新增：穩定化預算 + `headingAt` 查詢（純函式） |
| `tests/twin-heading.test.ts` | 新增單元測試（見驗收） |
| `src/screens/twin/scene-init.ts` | 預算接線、`updateShips` 朝向查表、`pickShipAt` 加 mmsi + 逐時刻狀態、`follow`/`unfollow` + 每幀 hook |
| `src/screens/twin/index.ts` | 雙點進入、Esc/點空白/換船/切分頁/視角鈕退出、chip 跟隨態 |
| `src/screens/twin/twin.css` | chip 提示行與跟隨態樣式 |

不動：`src/twin-engine/`（vendored）、`positionAt`、`panels.ts`、`timeline.ts`。

## 驗收

1. `npm run check` 三綠燈（tsc / vitest / build）。
2. **單元測試**（`tests/twin-heading.test.ts`）：
   - 抖動停船（位置微抖、方位亂跳）→ 穩定朝向 = 進港航向，恆定；
   - 近碼頭停止 → 鎖碼頭切線，且方向與進來航向夾角 ≤ 90°（不掉頭）；
   - 移動段 → 與現行邏輯一致（AIS heading 優先/方位角 fallback）；
   - 純函式確定性：同 tMs 多次查詢結果相同。
3. **打轉修正目視**：headless SwiftShader（照 `twin-headless-verify` 既有手法，勿加 `--disable-gpu`）在 console 對一艘「開進來再靠泊」的船於停靠時段取多個時刻斷言朝向恆定。
4. **跟隨模式互動路徑**（拖曳環繞、滾輪縮放、Esc 退出）需人工或 MCP 瀏覽器目視確認。

## 風險與邊界

- 播放 wrap-around（時間軸播到底跳回起點）：跟隨相機會跟著瞬移——可接受，不特殊處理；若跳回後該船無資料則自動退出。
- 進出港過渡時段：穩定朝向在「移動→靠泊」兩端之間最短弧插值，呈現自然轉向；不模擬真實迴旋軌跡（超出本案範圍）。
- `berthLocked` 判定依賴 OSM 碼頭線（`buildPierSegs`）品質；離碼頭 300m 門檻沿用現值，實測不對再調。
