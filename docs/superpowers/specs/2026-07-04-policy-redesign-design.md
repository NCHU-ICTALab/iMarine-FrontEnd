# Policy 頁改版設計 — 政策情報中心（NotebookLM 三欄 × 看得見的生成過程）

日期：2026-07-04
狀態：已與使用者逐項確認（layout 經視覺 companion 三輪迭代定案）
範圍：`src/screens/policy/` 全面改版 + `PolicySnapshot` 資料契約改版。**純 mock**，不接真 LLM。

---

## 1. 背景與目標

現況 policy 頁是單一議題的五段式報告（Task 12 產物）：一條議題列、五段內文、Grounding 儀表、
引用來源清單、一顆「重新生成」（blur 假動畫）。內容單薄，無法展示報告書 v6 對本模組的完整定位
——「面對每天大量變化的資訊量，即時給出當前政策的決策輔助資訊」。

改版目標（三種使用情境，全部進收件匣敘事）：

1. **突發事件決策建議**：國際突發狀況（如航線中斷）→ 自動檢索過往做法 → 給出決策建議。
2. **新政策分析**：國際組織新政策 → 依過往資料和法規給出建議（= 現有五段式報告的情境）。
3. **Routine 日報**：每日 07:00 自動生成海運重點晨報。

加上 **LLM 接口切換**（地端部署 / 雲端 API）的展示。

設計語言參考（調研後由使用者選定）：**NotebookLM 三欄骨架** + **Perplexity「看得見 AI 在工作」
生成過程**。

## 2. 已定案的決策紀錄

| 決策點 | 定案 | 備註 |
|---|---|---|
| 資料範圍 | 純 mock，UI/UX 全面升級 | provider 仍 `source:'mock'`，無任何 HTTP |
| Layout | 三欄・極簡左欄 | 曾提出兩欄回歸站內節奏方案，使用者選三欄 |
| 左右欄分工 | 左＝純收件匣；右＝Grounding + 來源（勾選與引用合一） | NotebookLM 變體 2 |
| 報告版型 | 三類各自專屬版型 | 突發/政策/日報 |
| 生成動畫 | 只在按「重新生成」時播 | 點收件匣條目直接顯示現成報告 |
| LLM 切換命名 | 抽象：「地端部署」/「雲端 API」 | 不綁品牌；模型名「地端 LLM · 8B 量化版」/「雲端 API · 旗艦模型」顯示於回答 footer 與 toast |
| 主秀劇本 | 紅海航線中斷升級 | 避開 dispatch（氣象）與 epidemic（疫情）地盤 |
| 減負（使用者回饋「太繁雜」後定案） | 無過濾 chips；不顯示 meta 統計行（後續輪定案刪除）；來源勾選框 hover 才出現；突發類不做獨立嚴重度橫幅（資訊織入內文首段） | 詳見 §4 |
| 對話功能（mockup 驗收輪新增） | NotebookLM 純血：中欄即對話串，報告為串中第一張「結構化產出卡」；追問 chips 走每條情報的預錄劇本，自由輸入回覆誠實的示範說明 | 詳見 §4.6 |
| 標題列再減負（mockup 驗收輪新增） | 移除技術徽章 `.lg-chip` 與 MOCK 資料源 chip——標題列只剩 eyebrow、標題、LLM 切換器 | 本頁不顯示 srcChip，為使用者定案的頁面特例 |
| 模擬情報流入（mockup 驗收輪新增） | 進頁 ~9 秒自動插入新突發情報 + 收件匣「模擬偵測」按鈕可重複觸發（兩條情報池循環） | 詳見 §4.7 |
| 綜合對話（mockup 驗收輪新增） | 收件匣頂部固定入口「綜合對話 · 全部來源」：NotebookLM 式知識庫模式，跨全部情報的來源聯集可勾選 + 直接提問 | 詳見 §4.8 |

## 3. 版面結構（`#s-policy`，doc 模式壓暗背景不變）

```
┌ screenHeader：● 航港局視角 · MODULE 02 ─ AI 政策輔助報告 ──────── [地端部署][雲端 API] ┐
├───────────┬───────────────────────────────────┬──────────────────┤
│ 左欄 ~19%   │ 中欄（對話串，NotebookLM 式）          │ 右欄 ~22%          │
│ 情報收件匣   │                                   │                  │
│ ✳綜合對話    │ 標頭（固定）：                        │ 來源卡（整欄）      │
│ ──────    │   標題 ──────────── [重新生成]        │  [1] 名稱          │
│ ●紅海航線中斷│   GROUNDING ▬▬▬▬▬▬ 87% 26/30 可追溯  │      類別 · 日期    │
│ ●IMO NZF   │                                   │  …（hover 卡片浮現  │
│ ●07-04晨報  │                                   │   勾選框；綜合對話   │
│ ●新加坡壅塞  │ ── thread（捲動）──────────────      │   模式＝五類分組     │
│ ●EU ETS    │  ▣ 結構化產出卡（報告，三類版型 §5）    │   摺疊+搜尋）       │
│ ●07-03晨報  │  ▷ 使用者提問氣泡                     │                  │
│ ●替代燃料   │  ◁ AI 回答氣泡（cite + 模型 footer）   │                  │
│            │ ── 底部（固定）─────────────────      │                  │
│            │  [建議追問 chips] [輸入列＋送出]        │                  │
└───────────┴───────────────────────────────────┴──────────────────┘
```
中欄為固定高度直欄（約 `100vh - 208px`）：標頭與 Grounding bar 固定、thread 內捲、chips 與輸入列固定
在底部；報告是 thread 中第一則「結構化產出卡」（卡頭標示產出類型）。

- 左欄條目 = **類型色點 + 標題**（極簡，無時間、無摘要文字）。選中列高亮（accent 外框或亮底）。
- 色點規則：政策 = 模組青 `#38BDF8`；日報 = 綠 `#35E0A6`；突發依嚴重度：高 = 玫紅 `#F0648C`、
  中 = 琥珀 `#F5A54A`。
- 排序：時間新 → 舊（即 mock JSON 順序）。初始選中第一條（紅海）。
- **不顯示 meta 統計行**（使用者於 mockup 驗收輪定案刪除）：模型名/時間/引用數等資訊只
  出現在回答氣泡 footer、生成完成 toast 與生成步驟動畫的計數中，標頭區保持乾淨——
  標題 + 重新生成鈕 + Grounding bar 三件而已。`retrieved` 欄位仍保留供步驟動畫
  「檢索 N 筆」使用。
- **Grounding 窄橫向 bar**（使用者回饋「儀表太搶眼」後定案）：不用 `.lg-gauge` 環形儀表，
  改為標頭下方一條低調的橫向 bar——`GROUNDING` 小標 + 180px 細填色軌（teal→cyan 漸層，
  切換條目時 0→值 過場）+ 百分比 + groundingNote；綜合對話模式顯示全情報平均 +
  「跨 N 條情報平均 · M 筆來源就緒」。右欄不再放 Grounding 卡，**整欄讓給來源清單**。
- 右欄來源列結構沿用 `.srcrow` 形態：`[no] 名稱` + meta 行 `類別 · 日期`；**類別**用 iMarine
  五類（全球航運指數 / 台灣數據統計 / 海運焦點新聞 / 航港法令 / 替代能源專區，對齊報告書 v6），
  取代舊的「分級」欄位。

## 4. 互動規格

### 4.1 收件匣切換
- 點條目 → 中欄**立即**顯示該條現成報告（不播生成動畫，可輕 fade），右欄 Grounding 值與來源
  清單同步更新。
- Grounding bar 為自訂輕量元件（非 Kit 屬性驅動儀表）：切換條目時填色寬度 0 → 值 過場
  （reduced-motion 直接設值），不需 Kit rescan。

### 4.2 生成過程動畫（「看得見 AI 在工作」）
- 觸發：**只在**按報告標頭的「重新生成」時。生成中不可重入（同現有防護）。
- 流程：報告內容淡出 → 原位顯示步驟區，四步逐一亮起，每步帶計數：
  1. 解讀議題：《議題標題》
  2. 檢索 iMarine 資料庫 · 命中 N 筆
  3. 閱讀來源：《來源名稱輪播》（k/n 進度，n = 勾選來源數）
  4. 綜合草稿與 Grounding 驗證
- 時長：地端 ~5.5s / 雲端 ~3.5s（體現地端較慢的擬真差異）。
- 完成：步驟區移除 → 報告段落 stagger 進場 → toast
  （沿用現有格式：`${groundingNote} · Grounding ${grounding}%`）。
- `prefers-reduced-motion: reduce`：跳過步驟動畫與 stagger，直接更新報告 + toast。
- 實作獨立成 `generate.ts`（步驟時序驅動），可用 fake timers 單元測試。

### 4.3 LLM 切換器
- 位置：screenHeader 的 `actionsHtml`，兩顆 chip「地端部署」「雲端 API」，active 互斥。
- 語意：**只影響下一次生成/回答**——模型名僅出現在回答氣泡 footer 與生成 toast，切換不改
  已顯示內容。
- 切換時 toast 提示（如「已切換至地端部署模型，下次生成生效」）。
- 模型名顯示：「地端 LLM · 8B 量化版」/「雲端 API · 旗艦模型」。

### 4.4 引用與來源
- 內文 cite `[n]` hover → 右欄對應來源列 `.hl` 高亮（現有資產保留）。
- 新增：cite **點擊** → 右欄對應來源列 scroll into view + 高亮約 2s。
- 來源勾選：hover 右欄來源卡時浮現勾選框；取消勾選 → 該列變灰標「未參與」；下次「重新生成」
  後步驟動畫的「閱讀 k/n」計數隨勾選數變化（n = 勾選來源數）。**報告內文的 cite 標記不動**（不做內文段落動態
  增減——mock 簡化，避免內文引用連鎖問題）。
- 未勾選來源仍可被 cite hover 連動（列為灰但高亮可見）。

### 4.5 日報「建議關注」串連
- 日報版型結尾「→ 建議關注」若帶 `goto`（指向收件匣某條目 id），點擊即切換到該條目——把
  日報和決策建議串成一個故事（demo 亮點，一行 click handler 成本）。

### 4.6 追問對話（中欄對話串）
- 每條 brief 帶 `qa` 預錄劇本（主秀三條各 2 組、其餘各 1 組）。未使用的劇本顯示為輸入列上方
  的「建議追問」chips；點擊 → 送出使用者氣泡 → 「思考中」氣泡（`檢索 iMarine 資料庫…` →
  `綜合回答與 Grounding 驗證…` 兩拍，地端 ~2.0s / 雲端 ~1.2s）→ 回答氣泡。
- 回答氣泡：內文含 cite（與報告卡共用 hover/點擊連動右欄）、footer 顯示
  `模型名 · 時間 · 引用 N 筆`（模型取送出當下的 LLM 切換狀態）。
- 已使用的 chip 消失且**記憶在該 brief 上**（切走再切回不重生）；對話串本身切換條目即重置
  （回到只有產出卡的初始態），mock 不保存跨條目對話歷史。
- 自由輸入（非 chips）：回覆固定的誠實示範說明（「此為示範環境，自由輸入的問題將由正式版
  LLM + RAG 依 iMarine 五類資料庫即時回答並附引用…」），不假造內容。
- 回答進行中不可重入（再送出忽略）；「重新生成」與追問互斥；切換條目取消進行中的回答。
- `prefers-reduced-motion`：跳過思考氣泡直接顯示回答。
- 「重新生成」的四步驟動畫改在**產出卡內原位**播放（取代卡內報告內容），完成後報告段落
  stagger 進場；既有的 Q&A 氣泡保留不清除。

### 4.7 模擬情報流入（收件匣「自動偵測」敘事，可重複觸發）
- 收件匣標題列右側有「模擬偵測」小按鈕；另於進頁約 9 秒自動觸發一次（若簡報者尚未手動
  觸發過）。流入池兩條突發情報依序流入：`inc-panama` 巴拿馬運河通行配額再削減（與紅海形成
  「雙節點受限」敘事）→ `inc-malacca` 馬六甲海峽碰撞單向管制；池用畢再點擊 → 移除已流入
  條目並立即重新流入第一條（demo 可無限循環）。
- 流入表現：收件匣頂部滑入動畫 + 條目尾端未讀圓點（脈動）+ toast「偵測到新事件：… ·
  信心度 N% · 已自動生成決策建議」。**不搶走目前選中**；點開該條目未讀圓點即消失；滑入
  動畫只播一次。綜合對話模式下流入：右欄來源聯集同步擴充，**對話串不重置**。
- 敘事對應：突發類的來源管道是「海運焦點新聞＋國際情報源的異常偵測自動立項」；政策類對應
  法規公告監測、日報類對應每日 07:00 排程——demo 講「怎麼來」時以此為口徑，本期實作全部
  由 mock JSON 供資料（流入條目亦是預錄資料，僅延遲插入）。
- `prefers-reduced-motion`：不播滑入動畫（未讀圓點不脈動），直接出現。

### 4.8 綜合對話（NotebookLM 式知識庫模式）
- 收件匣**頂部固定入口**「綜合對話 · 全部來源」（漸層色點 + 下方分隔線，不屬於 briefs 資料，
  是 UI 固定項）。點入後：
  - 標題「綜合對話 — 跨情報知識庫」；「重新生成」鈕隱藏（無單一報告可重生成）。
  - 對話串初始為一張「知識庫總覽」卡：情報數、來源數、iMarine 五類分佈、操作提示。
  - Grounding bar 顯示全情報平均值，note「跨 N 條情報平均 · M 筆來源就緒」。
- **來源聯集**：依收件匣順序走訪所有 briefs 的 sources、以名稱去重、重新編號 1..M；全部
  預設勾選，勾選狀態以名稱為 key 跨切換保留；取消勾選 → 灰列「未參與」+ 群組計數即時更新。情報流入後聯集自動擴充。
- **分組摺疊（規模化，使用者回饋「平面清單太長難找」後定案）**：聯集不以平面清單呈現，
  改依 iMarine 五類分組——
  - 群組標頭 = 群組勾選框（全選/全不選/半選 indeterminate）+ 展開箭頭 + 類名 +
    「勾選數/總數」計數；**預設全部收合**（24 筆 → 5 列）。點標頭展開/收合該類。
  - 頂部**搜尋框**：輸入即按名稱過濾，命中群組自動展開、無命中群組隱藏；清空即還原。
  - 引用 [n] 點擊時若目標來源在收合群組內 → 自動展開該群組再捲動高亮；hover 到收合中
    的來源 → 高亮其群組標頭。
  - 一般條目模式（來源 3-7 筆）維持平面清單不變。
- **綜合提問**：`GLOBAL.qa` 預錄兩組跨情報劇本；回答內文的引用以 `{{c:來源名稱}}` 佔位
  書寫，**送出當下**才解析成當前聯集編號的 cite span（聯集會隨流入變動，送出時解析保證
  編號永遠正確）；cite hover/點擊連動右欄同一般模式。chips 用畢記憶；自由輸入同誠實示範
  說明；回答 footer 同樣帶模型名/引用數。
- 資料契約：綜合對話為 UI 層組合（聯集、平均值皆由 briefs 計算），**不新增 provider 欄位**；
  `GLOBAL.qa` 劇本屬 screen 層常數（或 mock JSON 頂層 `globalQa` 欄位，實作時擇一並在
  plan 定案）。

## 5. 三類報告版型（中欄）

### 5.1 突發（incident）— 主秀：紅海航線中斷升級
1. 事件摘要（含嚴重度/偵測時間/信心度等資訊織入內文首段，不做獨立 meta 橫幅——減負決策）
2. **歷史相似案例**：雙卡並排，每卡 = 案例名 + 持續時間 + 當時處置 + 成效 + cite
   （紅海條目用 2021 蘇伊士擱淺、2024 紅海危機）
3. 對高雄港影響評估（量化，含繞道 → 碳排增加的碳權模組串連點）
4. 建議行動（編號清單）

### 5.2 政策（policy）— 現有五段式原樣沿用
背景 / 國際案例 / 量化參考 / 政策選項 / 建議草稿。現行 IMO NZF mock 的五段文案與引用**原樣搬入**
對應條目，不重寫。

### 5.3 日報（daily）
日期標頭（含「07:00 自動生成」徽章）→ 條列重點（每條帶 cite）→「→ 建議關注」結語（可帶 goto）。

## 6. 資料契約（`src/data/types.ts` 改版）

```ts
// PolicySnapshot 由單議題改為情報多條目
export interface PolicySnapshot { briefs: PolicyBrief[]; }

export type PolicyBrief = IncidentBrief | PolicyDocBrief | DailyBrief;

interface PolicyBriefBase {
  id: string;
  title: string;          // 收件匣列 + 報告標題
  time: string;           // 顯示字串，如「今日 14:02」
  grounding: number;      // 中欄 Grounding bar
  groundingNote: string;
  retrieved: number;      // 「檢索 N 筆」
  sources: PolicySource[];
  qa: PolicyQA[];         // 追問劇本（§4.6）
}
export interface PolicySource {
  no: number; name: string;
  cat: string;            // iMarine 五類之一
  date: string;
  checked: boolean;       // 參與生成
}
export interface PolicyQA {
  q: string;              // 建議追問（chip 文字 = 使用者氣泡）
  a: string;              // 回答 html，含 cite span
}
// PolicyBriefBase 另含 qa: PolicyQA[]（主秀三條各 2 組、其餘各 1 組）
export interface IncidentBrief extends PolicyBriefBase {
  type: 'incident';
  severity: 'high' | 'medium';
  confidence: number;                 // 信心度 %
  summary: string;                    // html，含 cite span
  cases: { title: string; duration: string; action: string; outcome: string; cite: number }[];
  impact: string;                     // html，含 cite span
  actions: string[];
}
export interface PolicyDocBrief extends PolicyBriefBase {
  type: 'policy';
  sections: { heading: string; html: string }[];   // 現契約 sections 原樣
}
export interface DailyBrief extends PolicyBriefBase {
  type: 'daily';
  items: { text: string; cite: number }[];
  watch: { text: string; goto?: string };
}
```

- html 欄位沿用現契約慣例：內含 `<span class="cite" data-src="n">n</span>`，塞入時不逃逸。
- 舊 `PolicySnapshot` 欄位（topic/sections/sources 頂層）移除；`grade` 欄位由 `cat` 取代。

### mock 資料（`src/data/mock/policy.json` 全面改寫）

7 條 briefs（新 → 舊排序）：

| # | type | 標題 | 內容深度 |
|---|---|---|---|
| 0a | incident（高，**流入池 1**） | 巴拿馬運河通行配額再削減 | 中等（摘要/1 案例/影響/2 行動/1 追問；§4.7 流入） |
| 0b | incident（中，**流入池 2**） | 馬六甲海峽碰撞單向管制 | 簡短（摘要/1 案例/2 行動/1 追問；§4.7 流入） |
| 1 | incident（高） | 紅海航線中斷升級 | **完整**（主秀：摘要/雙案例卡/影響/行動，來源 7 筆含 2 筆未勾選） |
| 2 | policy | IMO NZF 港埠費新規評估 | **完整**（現有五段文案 + 5 來源原樣搬入） |
| 3 | daily | 07-04 海運晨報 | **完整**（3-4 條重點 + 建議關注 goto → #2） |
| 4 | incident（中） | 新加坡港壅塞外溢 | 簡短（摘要 + 1 案例 + 2 行動） |
| 5 | policy | EU ETS 配額修正案 | 簡短（2-3 段） |
| 6 | daily | 07-03 海運晨報 | 簡短（3 條重點，無 goto） |
| 7 | policy | 替代燃料補貼草案 | 簡短（2-3 段） |

數字與名詞以報告書 v6 為準（NZF/Surplus Units/EU ETS/Grounding 等既有詞彙；來源類別用 iMarine
五類）。所有條目皆有完整的 sources 陣列與 grounding 值（右欄永遠有內容）。

## 7. 檔案結構與樣式規範

| 檔案 | 動作 |
|---|---|
| `src/screens/policy/policy.html` | 重寫：三欄骨架 + 佔位標記（沿用 `__X__` / `<!--X-->` 慣例） |
| `src/screens/policy/policy.css` | 新增：`#s-policy` scope 的三欄版面/收件匣/步驟動畫/來源勾選樣式 |
| `src/screens/policy/index.ts` | 重寫：收件匣切換、對話串（產出卡 + 追問氣泡 + chips + 輸入列）、三類版型渲染、引用連動、LLM 切換、勾選邏輯 |
| `src/screens/policy/generate.ts` | 新增：生成/回答步驟動畫模組（時序驅動 + reduced-motion 降級 + 取消） |
| `src/data/types.ts` | `PolicySnapshot` 依 §6 改版（既有檔案，改動範圍僅 policy 相關型別） |
| `src/data/mock/policy.json` | 依 §6 全面改寫 |

- 元件一律 Liquid Glass Kit：玻璃容器 `data-lg`、小型重複元件（收件匣條目、來源列）用
  `lg-static`；不手寫 `backdrop-filter`。
- `tokens.css` 的舊 policy 區段規則（`.report`/`.topic`/`.srcrow` 等）**本次不動**：新 markup
  沿用其中仍合用的 class；版面衝突的部分在 policy.css 以 `#s-policy` scope 覆寫或改用新 class 名。
  死碼清理留待之後獨立 task（比照 twin Task 10 前例）。
- registry 的 `mode:'doc'` 不變；screenHeader 的 eyebrow/badges/srcChip(mock) 維持現樣式。

## 8. 錯誤處理與降級

- mock provider 無網路呼叫，無失敗路徑；`snapshot()` 拒絕時維持 mock.ts 既有行為。
- `prefers-reduced-motion`：步驟動畫與段落 stagger 全部跳過，直接顯示結果（全站既有驗收標準）。
- 生成中不可重入；生成中切換收件匣條目 → 取消進行中的動畫 timer、直接顯示新條目報告
  （避免 timer 完成後把舊報告塞回新條目）。
- 生成中切離 policy 頁（`hide()`）→ 清除動畫 timer。

## 9. 測試

- `tests/policy-generate.test.ts`（新增）：fake timers 驗證步驟時序（四步依序、完成 callback）、
  reduced-motion 直通路徑、重入防護、取消路徑。
- 既有 16 tests 不受影響；`PolicySnapshot` 改版由 `tsc --noEmit` 全鏈驗證。
- mock 契約若 `tests/mock.test.ts` 有 policy 相關斷言則同步更新（現況只測深拷貝與 dispatch，
  預期不需動）。

## 10. 驗收標準

1. `npx tsc --noEmit` 0 errors、`npx vitest run` 全綠（新增測試計入）、`npm run build` 成功。
2. Chromium：三條主秀劇本逐一驗證——
   - 紅海（incident）：收件匣選中 → 版型四區塊正確；「重新生成」→ 四步動畫（地端 ~5.5s）→
     報告 stagger 進場 → toast。
   - IMO NZF（policy）：五段文案與現版一致；cite hover/點擊連動右欄。
   - 07-04 晨報（daily）：條列 + 建議關注點擊 → 跳到 NZF 條目。
3. LLM 切換：chip 互斥、toast、切換後生成/回答時長變化、回答 footer 的模型名只在新回答後改變。
4. 來源勾選：hover 浮現勾選框、取消 → 灰列「未參與」、重新生成步驟動畫的閱讀計數隨勾選數變化。
5. 追問對話：chip 送出 → 思考氣泡兩拍 → 回答氣泡（cite 連動右欄、footer 模型/引用數）；
   chip 用畢消失且切回時記憶；自由輸入得到示範說明回覆；回答中不可重入；生成/回答進行中
   切換條目正確取消。
6. 模擬情報流入：~9 秒自動流入 + 「模擬偵測」按鈕依序流入池內兩條、池用畢循環重置；
   滑入 + 未讀圓點 + toast、不搶選中；點開未讀消失、報告（單案例卡版型）與追問正確。
7. 綜合對話：固定入口進入知識庫模式（重新生成隱藏、總覽卡、聯集去重編號、平均 Grounding）；
   聯集勾選 → 群組計數即時更新且跨切換保留；綜合提問回答的 cite 編號正確對應聯集列；
   知識庫模式下流入 → 聯集擴充且對話串不重置。分組摺疊：五群組預設收合、群組勾選三態
   （全選/半選/全不選）、搜尋過濾自動展開命中群組、cite 點擊自動展開目標群組、一般條目
   模式維持平面清單。
8. 全部條目（含流入條與綜合對話入口）可點、右欄同步、console 零錯誤；
   `prefers-reduced-motion` 模擬下全部功能直通可用。
9. 全站七頁導覽 console 乾淨（迴歸）。
10. 視覺基準：`docs/preview/preview-policy-redesign.html`（自含 Kit 互動 mockup，已經使用者驗收）。

## 11. 不做的事（YAGNI）

- 不接真 LLM/後端（本期範圍外；provider 介面形狀不變，日後換 live 只動 provider）。
- 不做收件匣過濾 chips、鍵盤導覽、內文引用隨勾選動態增減、報告匯出。
- 自由輸入不做假回答（誠實示範說明），不保存跨條目對話歷史。
- 不動 tokens.css 既有規則、不動 registry/router/其他 screen。
