import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runTimeline } from '../src/screens/policy/generate';

describe('runTimeline', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('依 at 順序觸發 events，totalMs 時呼叫 done', () => {
    const order: string[] = [];
    runTimeline(
      [
        { at: 100, run: () => order.push('a') },
        { at: 300, run: () => order.push('b') },
      ],
      500,
      () => order.push('done'),
    );
    vi.advanceTimersByTime(99);
    expect(order).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(order).toEqual(['a']);
    vi.advanceTimersByTime(400);
    expect(order).toEqual(['a', 'b', 'done']);
  });

  it('cancel 阻止後續 events 與 done，且可重複呼叫', () => {
    const order: string[] = [];
    const h = runTimeline(
      [
        { at: 100, run: () => order.push('a') },
        { at: 300, run: () => order.push('b') },
      ],
      500,
      () => order.push('done'),
    );
    vi.advanceTimersByTime(150);
    h.cancel();
    h.cancel(); // 重複 cancel 不得拋錯
    vi.advanceTimersByTime(1000);
    expect(order).toEqual(['a']);
  });
});
