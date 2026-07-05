// 規則式評分 + 時空交叉比對純函式（依 WHO IHR 框架，可解釋、可測）。
// 分數只由此算（單一真相來源）；mock 只存 factors/ports/events raw 值。
import type { EpidemicFactors, EpidemicPort, EpidemicEvent } from '../../data/types';

export type RiskTier = 'red' | 'orange' | 'yellow' | 'green';
export interface VesselScore { score: number; tier: RiskTier; levelLabel: string; color: string }

const LEVELS: { min: number; tier: RiskTier; levelLabel: string; color: string }[] = [
  { min: 80, tier: 'red', levelLabel: '紅級 · 禁止登輪', color: '#F0648C' },
  { min: 60, tier: 'orange', levelLabel: '橙級 · 限制登輪', color: '#F5A54A' },
  { min: 40, tier: 'yellow', levelLabel: '黃級 · 加強防護', color: '#E9BC63' },
  { min: 0, tier: 'green', levelLabel: '綠級 · 正常', color: '#35E0A6' },
];

export function scoreVessel(f: EpidemicFactors): VesselScore {
  const score = Math.round(0.25 * f.dwellDays + 0.5 * f.sourceStrength + 0.25 * f.distanceFactor);
  const L = LEVELS.find((l) => score >= l.min)!;
  return { score, tier: L.tier, levelLabel: L.levelLabel, color: L.color };
}

export const INCUBATION = 7;
export interface Hit { port: string; eventId: string; type: 'rose' | 'amber'; mag: number; markerDay: number }

export function computeHits(ports: EpidemicPort[], events: EpidemicEvent[]): Hit[] {
  const hits: Hit[] = [];
  for (const e of events) {
    const p = ports.find((p) => p.name === e.port);
    if (!p) continue;
    if (e.day >= p.dayIn && e.day <= p.dayOut) {
      hits.push({ port: p.name, eventId: e.id, type: 'rose', mag: Math.min(p.dayOut, e.day) - p.dayIn + 1, markerDay: e.day });
    } else if (e.day > p.dayOut && e.day - p.dayOut <= INCUBATION) {
      hits.push({ port: p.name, eventId: e.id, type: 'amber', mag: e.day - p.dayOut, markerDay: e.day });
    }
  }
  return hits;
}
