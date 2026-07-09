/* 資料交換層型別 — Task 3 完整版。
   overview/policy/dispatch/epidemic/alert 五個 screen 走 mock provider（見 exchange/mock.ts）；
   carbon/twin 為 live provider，型別在此定義、實作留給 Task 4（carbon）與 Task 8（twin）。 */

export type Source = 'live' | 'mock';

export interface Provider<T> {
  readonly source: Source;
  snapshot(): Promise<T>;
}

export interface OverviewSnapshot {
  kpi: { vessels: number; berthsUsed: number; berthsTotal: number; waitHr: number; co2T: number };
  modules: { id: string; label: string; value: string; trend: number[] }[];
}

/* Policy 頁（政策情報中心）契約 — 2026-07-04 spec 改版。
   briefs = 收件匣情報（新→舊）；inflow = 模擬偵測流入池（依序流入，不在初始收件匣）；
   globalQa = 綜合對話（知識庫模式）預錄劇本，回答內含 {{c:來源名稱}} 引用佔位，
   由 UI 在送出當下對照當前來源聯集解析成 cite span。 */
export interface PolicySource {
  no: number; name: string;
  cat: string;            // iMarine 五類之一：全球航運指數/台灣數據統計/海運焦點新聞/航港法令/替代能源專區
  date: string;
  checked: boolean;       // 參與生成（右欄勾選初始值）
  sourceId?: string;      // live 知識庫的後端 source_id（產報告選來源用；mock 無此欄）
}
export interface PolicyQA {
  q: string;              // 建議追問（chip 文字 = 使用者氣泡）
  a: string;              // 回答 html，含 <span class="cite" data-src="n">（globalQa 則含 {{c:名稱}} 佔位）
}
interface PolicyBriefBase {
  id: string;
  title: string;          // 收件匣列 + 報告標題
  time: string;           // 顯示字串，如「今日 14:02」
  grounding: number;      // 中欄 Grounding bar
  groundingNote: string;
  retrieved: number;      // 生成步驟動畫「檢索 N 筆」
  sources: PolicySource[];
  qa: PolicyQA[];         // 追問劇本
}
export interface IncidentBrief extends PolicyBriefBase {
  type: 'incident';
  severity: 'high' | 'medium';
  confidence: number;     // 信心度 %
  summary: string;        // html，含 cite span
  cases: { title: string; duration: string; action: string; outcome: string; cite: number }[];
  impact: string | null;  // html；簡短條目可為 null（版型跳過該段）
  actions: string[];
}
export interface PolicyDocBrief extends PolicyBriefBase {
  type: 'policy';
  sections: { heading: string; html: string }[];
}
export interface DailyBrief extends PolicyBriefBase {
  type: 'daily';
  items: { text: string; cite: number }[];
  watch: { text: string; goto?: string };
}
export type PolicyBrief = IncidentBrief | PolicyDocBrief | DailyBrief;
export interface PolicySnapshot {
  briefs: PolicyBrief[];
  inflow: PolicyBrief[];
  globalQa: PolicyQA[];
}

/* 綜合對話 live 模式（policy provider 走真後端 rag-agent /api/chat）：
   收件匣情報仍走 snapshot() 的 mock 展示；只有「綜合對話 · 全部來源」的自由提問打 live。 */
export interface PolicyChatMsg { role: 'user' | 'assistant'; content: string }
export interface PolicyChatResult {
  answerHtml: string;              // 已把 [ev_xxx] 轉成 <span class="cite" data-src="n"> 的回答 HTML
  answerText: string;             // 原始純文字回答（供對話歷史回填）
  sources: PolicySource[];        // evidence_package.evidence_items 映射，no 對齊 answerHtml 的引用編號
  grounding: number;              // 後端 citation_coverage（0..100），供 Grounding bar 顯示
  provider: string;               // 實際生成的供應商（照實顯示，如「Ollama（本地）」）
  model: string;                 // 實際生成的模型 id（照實顯示，如「gemma3n:e4b」）
}

/* 產報告（NotebookLM 式：選來源 + 需求 + 模版 → /api/report）。 */
export interface PolicyReportTemplate { id: string; label: string; description: string }
export interface PolicyReportSection {
  key: string; label: string;
  html: string;                   // 已把 [ev_xxx] 轉成 cite span 的章節 HTML
  citations: string[];
}
export interface PolicyReportResult {
  reportId: string; topic: string; templateId: string;
  sections: PolicyReportSection[];
  sources: PolicySource[];        // 報告引用來源，no 對齊各章節 cite 編號
  grounding: number; provider: string; model: string;
}

// ── dispatch（2026-07-05 spec 改版：ConvLSTM 90 分鐘單一預測 + 三情境劇本）──
export type RainLevel = '無' | '小雨' | '大雨' | '豪雨' | '大豪雨' | '超大豪雨';
export type OpStatus = 'ok' | 'warn' | 'stop';
export type RuleTag = 'official' | 'industry';
export interface CwaWindow { window: '+3h' | '+6h'; rainLevel: RainLevel; beaufort: number }
export interface OpRow {
  id: 'crane' | 'grain' | 'coal' | 'tanker' | 'pilot' | 'mooring' | 'yard';
  name: string;
  now: { status: OpStatus; action: string };   // ConvLSTM 段：燈色 + 格內動作字
  cwa3: OpStatus; cwa6: OpStatus;              // CWA 段：只有燈色
  rules: { text: string; basis: string; tag: RuleTag }[];
}
export interface DispatchCard {
  opId: string; title: string; body: string; level: OpStatus;
  badge?: { text: string; urgent: boolean };
}
export interface DispatchScenario {
  id: 'stable' | 'rain' | 'typhoon';
  label: string;
  nowcast: { rainLevel: RainLevel; beaufort: number; windAvg: number; windGust: number };
  conclusion: string;                          // 含 {{stop:..}}/{{add:..}} 標記
  cwa: [CwaWindow, CwaWindow];
  ops: OpRow[];                                // 固定 7 筆
  cards: DispatchCard[];                       // 2-5 張
  metrics: { csi: number; pod: number; far: number };
}
export interface DispatchSnapshot { scenarios: DispatchScenario[] }  // 固定 3 筆

export interface EpidemicFactors { dwellDays: number; sourceStrength: number; distanceFactor: number }
export interface EpidemicPort { name: string; dayIn: number; dayOut: number; berthed?: boolean }
export interface EpidemicEvent { id: string; port: string; day: number; source: 'who' | 'cdc' | 'news'; label: string }

export interface EpidemicIntel { source: 'who' | 'cdc' | 'news'; text: string; hit: boolean }
export interface EpidemicPipelineStage { key: string; label: string; count: string; run?: boolean; detail: string[] }
export interface EpidemicVessel {
  id: string; name: string;
  factors: EpidemicFactors;
  ports: EpidemicPort[];        // 末站必為 '高雄' berthed
  events: EpidemicEvent[];
  intel: EpidemicIntel[];
  advice: string[];
  sms: string;
}
export type EpidemicInflow =
  | { kind: 'escalate'; targetId: string; event: EpidemicEvent; factors: EpidemicFactors; intel: EpidemicIntel; toast: string }
  | { kind: 'newship'; vessel: EpidemicVessel; toast: string };
export interface EpidemicSnapshot {
  timeRange: { startDate: string; endDate: string; startDay: number; now: number };
  pipeline: EpidemicPipelineStage[];
  fleet: EpidemicVessel[];
  inflowPool: EpidemicInflow[];
}

export type AlertSev = 'red' | 'orange' | 'notice' | 'clear';
export interface AlertFunnel { label: string; triggered: number; published: number; delivered: number; acked: number }
export interface AlertTrace { rule: string; threshold: string; pws: string; ch: string; publishSec: number }
export interface AlertSms { unit: string; event: string; area: string; action: string }
export interface AlertEvent {
  id: string;
  cat: 'epi' | 'wx' | 'ok';
  sev: AlertSev;
  source: 'epidemic' | 'dispatch' | 'weather' | 'system';
  title: string; body: string; time: string;
  ch: string;
  lngLat: [number, number];
  fence: [number, number][];
  cellsLit: string[];
  funnels: AlertFunnel[];
  trace: AlertTrace;
  sms: AlertSms;
  acked: boolean;
}
export interface AlertCell { id: string; lngLat: [number, number]; delivered: number }
export interface AlertSnapshot {
  kpi: { published: number; reachedPeople: number; reachedShips: number; avgSec: number; deliveryRate: number };
  cells: AlertCell[];
  feed: AlertEvent[];
  drillPool: AlertEvent[];
}

export interface CarbonSummary { ok: boolean; issued: number; tonsCirculating: number; listed: number; retired: number }
// 欄位語意（對齊 PoC su 資料表，欄位名已查證 backend/ledger.py：amount/status/owner/purpose/data_hash）：
//   issued = sus 總數；tonsCirculating = status!=='retired' 的 amount 加總；
//   listed = status==='listed' 數；retired = status==='retired' 數
export interface TwinSnapshot { berths: { id: string; name: string }[]; trackCount: number }

export interface DataExchange {
  overview: Provider<OverviewSnapshot>;
  // policy.chat / knowledgeBases 只在 live provider 存在；mock provider 無此方法，UI 據此 fallback。
  policy: Provider<PolicySnapshot> & {
    chat?(message: string, history: PolicyChatMsg[]): Promise<PolicyChatResult>;
    knowledgeBases?(): Promise<PolicySource[]>;   // 綜合對話右欄的真實知識庫清單
    reportTemplates?(): Promise<PolicyReportTemplate[]>;
    report?(prompt: string, sourceIds: string[], templateId: string): Promise<PolicyReportResult>;
  };
  dispatch: Provider<DispatchSnapshot>;
  epidemic: Provider<EpidemicSnapshot>;
  alert: Provider<AlertSnapshot>;
  carbon: Provider<CarbonSummary> & { base: string };
  twin: Provider<TwinSnapshot>;
}
