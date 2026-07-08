import { describe, it, expect } from 'vitest';
import { createMockExchange } from '../src/data/exchange/mock';

describe('overview mock 契約（2026-07-08 hero 改版）', () => {
  it('kpi 五欄齊全且不再有 delta/sparks/weekly 欄位', async () => {
    const o = await createMockExchange().overview.snapshot();
    expect(o.kpi).toEqual({ vessels: 128, berthsUsed: 47, berthsTotal: 62, waitHr: 3.4, co2T: 4820 });
    expect(o).not.toHaveProperty('sparks');
    expect(o).not.toHaveProperty('weekly');
  });
  it('modules 六筆依 registry 順序且 trend 固定長度 7', async () => {
    const o = await createMockExchange().overview.snapshot();
    expect(o.modules.map((m) => m.id)).toEqual(['carbon', 'policy', 'twin', 'dispatch', 'epidemic', 'alert']);
    for (const m of o.modules) {
      expect(m.trend).toHaveLength(7);
      expect(m.value.length).toBeGreaterThan(0);
    }
  });
});
