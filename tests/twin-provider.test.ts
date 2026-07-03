import { describe, it, expect, vi } from 'vitest';
import { createTwinProvider } from '../src/data/exchange/twin';

describe('twin provider', () => {
  it('maps berths-khh.json to berths/trackCount', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        capturedAtMs: 1700000000000,
        berths: [
          { code: 'B1', lat: 22.6, lon: 120.28, angle: 12, nameZh: '第一碼頭' },
          { code: 'B2', lat: 22.61, lon: 120.29, angle: 34, nameZh: '第二碼頭' },
        ],
      }))));
    const p = createTwinProvider('http://x');
    expect(p.source).toBe('live');
    const s = await p.snapshot();
    expect(s).toEqual({
      berths: [
        { id: 'B1', name: '第一碼頭' },
        { id: 'B2', name: '第二碼頭' },
      ],
      trackCount: 2,
    });
  });
  it('reports empty berths when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('refused'); }));
    const s = await createTwinProvider('http://x').snapshot();
    expect(s).toEqual({ berths: [], trackCount: 0 });
  });
});
