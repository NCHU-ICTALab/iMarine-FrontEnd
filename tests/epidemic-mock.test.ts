// tests/epidemic-mock.test.ts
import { describe, it, expect } from 'vitest';
import snap from '../src/data/mock/epidemic.json';
import type { EpidemicSnapshot } from '../src/data/types';
import { scoreVessel } from '../src/screens/epidemic/correlate';

const s = snap as unknown as EpidemicSnapshot;

describe('epidemic mock 契約', () => {
  it('timeRange / pipeline(5) / fleet(≥5) / inflowPool(2)', () => {
    expect(s.timeRange.now).toBeGreaterThan(s.timeRange.startDay);
    expect(s.pipeline).toHaveLength(5);
    expect(s.fleet.length).toBeGreaterThanOrEqual(5);
    expect(s.inflowPool).toHaveLength(2);
  });
  it('每艘船停靠序列末站為高雄 berthed、factors 三欄齊', () => {
    for (const v of s.fleet) {
      const last = v.ports[v.ports.length - 1];
      expect(last.name).toBe('高雄');
      expect(last.berthed).toBe(true);
      expect(typeof v.factors.dwellDays).toBe('number');
      expect(typeof v.factors.sourceStrength).toBe('number');
      expect(typeof v.factors.distanceFactor).toBe('number');
    }
  });
  it('主秀 HORIZON 217 算出 72 橙級', () => {
    const h = s.fleet.find((v) => v.name === 'HORIZON 217')!;
    expect(scoreVessel(h.factors).score).toBe(72);
    expect(scoreVessel(h.factors).tier).toBe('orange');
  });
  it('流入池：發1 escalate 目標存在、發2 newship 末站高雄', () => {
    const esc = s.inflowPool.find((f) => f.kind === 'escalate');
    const nw = s.inflowPool.find((f) => f.kind === 'newship');
    expect(esc && s.fleet.some((v) => v.id === (esc as any).targetId)).toBe(true);
    expect(nw && (nw as any).vessel.ports.at(-1).name).toBe('高雄');
  });
});
