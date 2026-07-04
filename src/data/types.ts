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

export interface PolicySnapshot {
  topic: string; grounding: number; groundingNote: string;
  sections: { heading: string; html: string }[];        // html 內含 <span class="cite" data-src="n">
  sources: { no: number; name: string; grade: string; date: string }[];
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
