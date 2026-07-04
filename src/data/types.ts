/* 資料交換層型別 — Task 3 完整版。
   overview/policy/dispatch/epidemic/alert 五個 screen 走 mock provider（見 exchange/mock.ts）；
   carbon/twin 為 live provider，型別在此定義、實作留給 Task 4（carbon）與 Task 8（twin）。 */

export type Source = 'live' | 'mock';

export interface Provider<T> {
  readonly source: Source;
  snapshot(): Promise<T>;
}

export interface OverviewSnapshot {
  kpi: { vessels: number; vesselsDelta: number; berthsUsed: number; berthsTotal: number; waitHr: number; waitDelta: number; co2T: number };
  sparks: { vessels: number[]; berths: number[]; wait: number[]; co2: number[] };
  weekly: { labels: string[]; points: number[] };
  modules: { id: string; label: string; value: string }[];
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

export interface DispatchSnapshot {
  metrics: { csi: number; pod: number; far: number };
  winds: number[]; rains: number[];                      // 各 10 筆，t=0..90 step10
  suggestions: { level: 'rose' | 'amber' | 'ok'; title: string; body: string; why: string }[];
}

export interface EpidemicSnapshot {
  ship: string; risk: number; level: string;
  factors: { name: string; value: number }[];
  ports: { name: string; date: string; note: string; mark: 'dim' | 'rose' | 'amber' }[];
  advice: string[]; reference: string;
}

export interface AlertSnapshot {
  kpi: { today: number; reached: number; avgSec: number; pending: number };
  feed: { cat: 'epi' | 'wx' | 'ok'; sev: string; title: string; body: string; time: string }[];
  sms: { text: string; old: boolean }[];
}

export interface CarbonSummary { ok: boolean; issued: number; tonsCirculating: number; listed: number; retired: number }
// 欄位語意（對齊 PoC su 資料表，欄位名已查證 backend/ledger.py：amount/status/owner/purpose/data_hash）：
//   issued = sus 總數；tonsCirculating = status!=='retired' 的 amount 加總；
//   listed = status==='listed' 數；retired = status==='retired' 數
export interface TwinSnapshot { berths: { id: string; name: string }[]; trackCount: number }

export interface DataExchange {
  overview: Provider<OverviewSnapshot>;
  policy: Provider<PolicySnapshot>;
  dispatch: Provider<DispatchSnapshot>;
  epidemic: Provider<EpidemicSnapshot>;
  alert: Provider<AlertSnapshot>;
  carbon: Provider<CarbonSummary> & { base: string };
  twin: Provider<TwinSnapshot>;
}
