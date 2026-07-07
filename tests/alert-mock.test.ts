import { describe, it, expect } from 'vitest';
import snap from '../src/data/mock/alert.json';
import type { AlertSnapshot, AlertEvent } from '../src/data/types';

const s = snap as unknown as AlertSnapshot;
const CH_BY_SEV: Record<string, string[]> = {
  red: ['CH 4371'], orange: ['CH 911'], notice: ['CH 911'], clear: ['CH 919'],
};
const allEvents: AlertEvent[] = [...s.feed, ...s.drillPool];

describe('alert mock 契約', () => {
  it('kpi 五欄 / cells(9) / feed(6) / drillPool(2)', () => {
    expect(s.kpi.published).toBe(14);
    expect(s.kpi.reachedPeople).toBeGreaterThan(0);
    expect(s.kpi.reachedShips).toBeGreaterThan(0);
    expect(s.cells).toHaveLength(9);
    expect(s.feed).toHaveLength(6);
    expect(s.drillPool).toHaveLength(2);
  });
  it('feed 首筆為最高風險（orange · epidemic 來源）——進頁自動選中的視線起點', () => {
    expect(s.feed[0].sev).toBe('orange');
    expect(s.feed[0].source).toBe('epidemic');
  });
  it('每筆事件：cellsLit id 都存在於 cells、fence ring ≥ 3 點、sev↔CH 對映符合分級表', () => {
    const cellIds = new Set(s.cells.map((c) => c.id));
    for (const e of allEvents) {
      e.cellsLit.forEach((id) => expect(cellIds.has(id)).toBe(true));
      expect(e.fence.length).toBeGreaterThanOrEqual(3);
      expect(CH_BY_SEV[e.sev]).toContain(e.ch);
      expect(e.trace.ch).toBe(e.ch);
    }
  });
  it('紅色警報事件雙漏斗（人員+船舶）、其餘單漏斗；漏斗四段遞減', () => {
    for (const e of allEvents) {
      expect(e.funnels.length).toBe(e.sev === 'red' ? 2 : 1);
      for (const f of e.funnels) {
        expect(f.triggered).toBeGreaterThanOrEqual(f.published);
        expect(f.published).toBeGreaterThanOrEqual(f.delivered);
        expect(f.delivered).toBeGreaterThanOrEqual(f.acked);
      }
    }
  });
  it('演練池：發1 notice 雷擊、發2 red 颱風（cellsLit 全 9 格）', () => {
    expect(s.drillPool[0].sev).toBe('notice');
    expect(s.drillPool[1].sev).toBe('red');
    expect(s.drillPool[1].cellsLit).toHaveLength(9);
  });
  it('sms 四欄 PWS 結構齊全', () => {
    for (const e of allEvents) {
      expect(e.sms.unit.length).toBeGreaterThan(0);
      expect(e.sms.event.length).toBeGreaterThan(0);
      expect(e.sms.area.length).toBeGreaterThan(0);
      expect(e.sms.action.length).toBeGreaterThan(0);
    }
  });
});
