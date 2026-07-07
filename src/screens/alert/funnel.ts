// 送達漏斗純函式：轉換率只由此算（單一真相來源）；mock 只存四段 raw 計數。
import type { AlertFunnel } from '../../data/types';

export const FUNNEL_STEPS = [
  ['triggered', '觸發'],
  ['published', '發布'],
  ['delivered', '送達'],
  ['acked', '回報'],
] as const;

export interface FunnelRates { published: number; delivered: number; acked: number }

const pct = (num: number, den: number): number => (den === 0 ? 0 : Math.round((num / den) * 1000) / 10);

export function funnelRates(f: AlertFunnel): FunnelRates {
  return {
    published: pct(f.published, f.triggered),
    delivered: pct(f.delivered, f.published),
    acked: pct(f.acked, f.delivered),
  };
}

export function sumDelivered(funnels: AlertFunnel[]): number {
  return funnels.reduce((s, f) => s + f.delivered, 0);
}
