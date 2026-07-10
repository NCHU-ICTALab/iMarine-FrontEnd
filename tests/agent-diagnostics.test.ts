import { describe, expect, it } from 'vitest';
import { runDiagnostics } from '../src/screens/agent/diagnostics';

/* 極簡 ctx stub：diagnostics 只讀 data.carbon.base 與各 provider 的 source */
function ctxStub(): any {
  const mock = { source: 'mock', snapshot: async () => ({}) };
  return { data: {
    carbon: { source: 'live', base: 'http://c', snapshot: async () => ({}) },
    policy: { source: 'live', base: 'http://p', snapshot: async () => ({}) },
    twin: { source: 'live', snapshot: async () => ({}) },
    overview: mock, dispatch: mock, epidemic: mock, alert: mock,
  } };
}
const okFetch: any = async () => ({ ok: true, status: 200 });
const downFetch: any = async () => { throw new Error('refused'); };
const hangFetch: any = (_u: string, init: any) =>
  new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('abort'))));

describe('runDiagnostics', () => {
  it('後端全通 → carbon/policy ok 且有 latencyMs；mock 模組回 mock', async () => {
    const r = await runDiagnostics(ctxStub(), { fetchFn: okFetch, timeoutMs: 50 });
    expect(r.modules.carbon.status).toBe('ok');
    expect(r.modules.policy.status).toBe('ok');
    expect(r.modules.carbon.latencyMs).toBeTypeOf('number');
    expect(r.modules.dispatch.status).toBe('mock');
    expect(r.ranAt).toBeTruthy();
  });
  it('連線拒絕 → down 且 detail 帶說明', async () => {
    const r = await runDiagnostics(ctxStub(), { fetchFn: downFetch, timeoutMs: 50 });
    expect(r.modules.carbon.status).toBe('down');
    expect(r.modules.carbon.detail).toContain('離線');
  });
  it('逾時 → down（AbortController 生效，不會卡住）', async () => {
    const r = await runDiagnostics(ctxStub(), { fetchFn: hangFetch, timeoutMs: 30 });
    expect(r.modules.carbon.status).toBe('down');
  });
});
