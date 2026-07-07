import { describe, it, expect } from 'vitest';
import { funnelRates, sumDelivered, FUNNEL_STEPS } from '../src/screens/alert/funnel';
import type { AlertFunnel } from '../src/data/types';

describe('funnelRates', () => {
  it('各段相對前一段轉換率，四捨五入到 1 位小數', () => {
    const f: AlertFunnel = { label: '人員', triggered: 420, published: 415, delivered: 408, acked: 377 };
    expect(funnelRates(f)).toEqual({ published: 98.8, delivered: 98.3, acked: 92.4 });
  });
  it('前一段為 0 → 轉換率 0（不除以零）', () => {
    const f: AlertFunnel = { label: 'x', triggered: 0, published: 0, delivered: 0, acked: 0 };
    expect(funnelRates(f)).toEqual({ published: 0, delivered: 0, acked: 0 });
  });
  it('100% 邊界', () => {
    const f: AlertFunnel = { label: '船舶', triggered: 47, published: 47, delivered: 47, acked: 41 };
    expect(funnelRates(f).published).toBe(100);
    expect(funnelRates(f).delivered).toBe(100);
    expect(funnelRates(f).acked).toBe(87.2);
  });
});

describe('sumDelivered', () => {
  it('多行 delivered 加總', () => {
    expect(sumDelivered([
      { label: '人員', triggered: 2400, published: 2400, delivered: 2362, acked: 1875 },
      { label: '船舶', triggered: 47, published: 47, delivered: 47, acked: 41 },
    ])).toBe(2409);
  });
  it('空陣列 → 0', () => { expect(sumDelivered([])).toBe(0); });
});

describe('FUNNEL_STEPS', () => {
  it('四段固定順序', () => {
    expect(FUNNEL_STEPS.map(s => s[0])).toEqual(['triggered', 'published', 'delivered', 'acked']);
  });
});
