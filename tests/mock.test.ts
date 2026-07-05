import { describe, it, expect } from 'vitest';
import { mockProvider, createMockExchange } from '../src/data/exchange/mock';

describe('mockProvider', () => {
  it('is mock-sourced and returns a copy', async () => {
    const p = mockProvider({ a: [1] });
    expect(p.source).toBe('mock');
    const s = await p.snapshot();
    s.a.push(2);
    expect((await p.snapshot()).a).toEqual([1]);
  });
});
describe('createMockExchange', () => {
  it('dispatch snapshot has 3 scenarios', async () => {
    const ex = createMockExchange();
    const d = await ex.dispatch.snapshot();
    expect(d.scenarios).toHaveLength(3);
  });
});
