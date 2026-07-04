import { describe, it, expect } from 'vitest';
import { createTwinProvider } from '../src/data/exchange/twin';

describe('twin provider（原生資料版）', () => {
  it('source 為 live 且不再暴露 url', () => {
    const p = createTwinProvider();
    expect(p.source).toBe('live');
    expect('url' in p).toBe(false);
  });
  it('snapshot 映射 72 筆泊位與 443 條真實航跡數', async () => {
    const s = await createTwinProvider().snapshot();
    expect(s.berths).toHaveLength(72);
    expect(typeof s.berths[0].id).toBe('string');
    expect(typeof s.berths[0].name).toBe('string');
    expect(s.trackCount).toBe(443);
  });
});
