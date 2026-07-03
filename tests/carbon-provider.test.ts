import { describe, it, expect, vi } from 'vitest';
import { createCarbonProvider } from '../src/data/exchange/carbon';

const sus = [
  { status: 'held', amount: 100 },
  { status: 'listed', amount: 50 },
  { status: 'retired', amount: 25 },
];

describe('carbon provider', () => {
  it('derives summary from /state', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.endsWith('/health') ? { ok: true, chainId: 31337 } : { roles: {}, sus }))));
    const p = createCarbonProvider('http://x');
    const s = await p.snapshot();
    expect(s).toEqual({ ok: true, issued: 3, tonsCirculating: 150, listed: 1, retired: 1 });
  });
  it('reports ok=false when backend down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('refused'); }));
    const s = await createCarbonProvider('http://x').snapshot();
    expect(s.ok).toBe(false);
  });
});
