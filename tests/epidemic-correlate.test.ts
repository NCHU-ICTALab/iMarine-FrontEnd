import { describe, it, expect } from 'vitest';
import { scoreVessel, computeHits } from '../src/screens/epidemic/correlate';
import type { EpidemicPort, EpidemicEvent } from '../src/data/types';

describe('scoreVessel', () => {
  it('加權公式：0.25*dwell + 0.50*source + 0.25*dist，四捨五入', () => {
    expect(scoreVessel({ dwellDays: 64, sourceStrength: 85, distanceFactor: 52 }).score).toBe(72);
  });
  it('分級邊界（等值 factors → score = factor 值）', () => {
    expect(scoreVessel({ dwellDays: 80, sourceStrength: 80, distanceFactor: 80 }).tier).toBe('red');
    expect(scoreVessel({ dwellDays: 79, sourceStrength: 79, distanceFactor: 79 }).tier).toBe('orange');
    expect(scoreVessel({ dwellDays: 60, sourceStrength: 60, distanceFactor: 60 }).tier).toBe('orange');
    expect(scoreVessel({ dwellDays: 59, sourceStrength: 59, distanceFactor: 59 }).tier).toBe('yellow');
    expect(scoreVessel({ dwellDays: 40, sourceStrength: 40, distanceFactor: 40 }).tier).toBe('yellow');
    expect(scoreVessel({ dwellDays: 39, sourceStrength: 39, distanceFactor: 39 }).tier).toBe('green');
  });
  it('level 文案與色對齊 tier', () => {
    const s = scoreVessel({ dwellDays: 80, sourceStrength: 80, distanceFactor: 80 });
    expect(s.levelLabel).toBe('紅級 · 禁止登輪');
    expect(s.color).toBe('#F0648C');
  });
});

describe('computeHits', () => {
  const ports: EpidemicPort[] = [
    { name: '香港', dayIn: 3, dayOut: 5 },
    { name: '高雄', dayIn: 13, dayOut: 13, berthed: true },
  ];
  it('通報落在停靠窗內 → rose，mag = 停靠起算重疊天數', () => {
    const e: EpidemicEvent[] = [{ id: 'e1', port: '香港', day: 4, source: 'who', label: '群聚' }];
    const h = computeHits(ports, e);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ port: '香港', type: 'rose', mag: 2, markerDay: 4 });
  });
  it('離港後、潛伏窗（≤7d）內通報 → amber，mag = 間隔天數', () => {
    const p: EpidemicPort[] = [{ name: '釜山', dayIn: 2, dayOut: 4 }];
    const e: EpidemicEvent[] = [{ id: 'e2', port: '釜山', day: 9, source: 'who', label: '群聚' }];
    expect(computeHits(p, e)[0]).toMatchObject({ type: 'amber', mag: 5 });
  });
  it('離港後超過潛伏窗 → 不命中', () => {
    const p: EpidemicPort[] = [{ name: '釜山', dayIn: 2, dayOut: 4 }];
    const e: EpidemicEvent[] = [{ id: 'e3', port: '釜山', day: 12, source: 'who', label: '群聚' }];
    expect(computeHits(p, e)).toHaveLength(0);
  });
  it('通報地點無對應停靠港 → 不命中', () => {
    const e: EpidemicEvent[] = [{ id: 'e4', port: '東京', day: 4, source: 'news', label: 'x' }];
    expect(computeHits(ports, e)).toHaveLength(0);
  });
});
