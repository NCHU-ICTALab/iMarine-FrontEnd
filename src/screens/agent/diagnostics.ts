/* 數位員工的確定性健檢 probe — 純程式碼，不進 LLM（spec §6）。
   LLM 只拿本函式的 DiagReport 去解讀與對照 runbook。 */
import type { ScreenCtx } from '../types';
import type { AgentModule, DiagModuleReport, DiagReport } from '../../data/types';
import { getSetting } from '../settings/storage';

export interface DiagOpts {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  carbonBase?: string;
  policyBase?: string;
}

async function probe(url: string, fetchFn: typeof fetch, timeoutMs: number):
  Promise<{ up: boolean; ms: number; detail: string }> {
  const t0 = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchFn(url, { signal: ctrl.signal });
    const ms = Math.round(performance.now() - t0);
    return r.ok ? { up: true, ms, detail: `HTTP ${r.status} · ${ms}ms` }
                : { up: false, ms, detail: `HTTP ${r.status}` };
  } catch {
    return { up: false, ms: Math.round(performance.now() - t0), detail: '後端離線或逾時' };
  } finally { clearTimeout(timer); }
}

export async function runDiagnostics(ctx: ScreenCtx, opts: DiagOpts = {}): Promise<DiagReport> {
  const fetchFn = opts.fetchFn ?? fetch.bind(globalThis);
  const timeoutMs = opts.timeoutMs ?? 3000;
  const env = (import.meta as any).env ?? {};
  const carbonBase = opts.carbonBase ?? ctx.data.carbon.base;
  const policyBase = opts.policyBase ?? ((ctx.data.policy as any).base ?? 'http://127.0.0.1:8100');

  const [c, p] = await Promise.all([
    probe(carbonBase + '/health', fetchFn, timeoutMs),
    probe(policyBase + '/api/sources', fetchFn, timeoutMs),
  ]);

  const mockOf = (m: AgentModule): DiagModuleReport =>
    ctx.data[m].source === 'live'
      ? { status: 'ok', detail: '本地 live provider' }
      : { status: 'mock', detail: '示範資料（設計如此，非故障）' };

  /* settings 完整性 + mapbox token 存在性（node/jsdom 環境防禦，比照 storage.ts 慣例） */
  let settingsRep: DiagModuleReport = { status: 'ok', detail: 'localStorage 設定可讀' };
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('imarine.settings.v1') : null;
    JSON.parse(raw ?? '{}');
  } catch { settingsRep = { status: 'degraded', detail: '設定 JSON 損毀，建議重置為預設' }; }
  const hasMapbox = !!(getSetting('frontend.mapboxToken', '') || env.VITE_MAPBOX_TOKEN);

  return {
    ranAt: new Date().toISOString(),
    modules: {
      carbon: c.up ? { status: 'ok', latencyMs: c.ms, detail: c.detail }
                   : { status: 'down', latencyMs: c.ms, detail: `碳權後端${c.detail}（:8000）` },
      policy: p.up ? { status: 'ok', latencyMs: p.ms, detail: p.detail }
                   : { status: 'down', latencyMs: p.ms, detail: `rag-agent ${p.detail}（:8100），頁面自動退示範` },
      twin: mockOf('twin'),
      dispatch: mockOf('dispatch'),
      epidemic: hasMapbox ? mockOf('epidemic')
                          : { status: 'degraded', detail: 'Mapbox token 缺少，地圖無法載入' },
      alert: mockOf('alert'),
      settings: settingsRep,
    },
  };
}
