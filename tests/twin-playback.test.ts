import { describe, it, expect } from 'vitest';
import { advancePerFrame, advancePlayhead } from '../src/screens/twin/time/playback';

// 播放頭數學（DOM 無關）。凍結 bug 的整合面（range input 把 slider.value snap 到 step、
// 捨去 sub-step 增量）只在真實瀏覽器重現得出——jsdom 不 snap，故整合面以 headless Chromium
// 實測（scratchpad repro），此處單元測試釘死播放頭的純數學：×1 每幀前進一個非零 float 量。
describe('twin playback 速度 + 播放頭前進', () => {
  const RANGE = 87_120_000; // ≈ 24.2hr replay 窗（真實 range，見 scene-init from/toMs）

  it('advancePerFrame：整體較原速慢 1/3（÷7200＝原 ÷4800 的 2/3）', () => {
    // 註解基準：step 8（80%）今日基準 = range/900（原 range/600 的 2/3）
    expect(advancePerFrame(RANGE, 8)).toBeCloseTo(RANGE / 900, 6);
    expect(advancePerFrame(RANGE, 5)).toBeCloseTo((RANGE * 5 / 4800) * (2 / 3), 3);
  });

  it('advancePlayhead：×1 每幀前進非零(不凍結)、且 < 一格 60s step', () => {
    // 根因：舊碼把 step-snapped slider.value 當累加器，×1 每幀 range/7200≈12100ms
    // 遠小於 replay slider 半格(30000ms)→snap 回原值→凍結。float 播放頭不受 snap 影響。
    const min = 1_781_824_915_000, max = min + 87_124_000, range = max - min;
    const next = advancePlayhead(min, range, 1, min, max);
    expect(next).toBeGreaterThan(min);                 // 不凍結（舊 snapped 累加器會停在 min）
    expect(next - min).toBeCloseTo(range / 7200, 3);   // ≈12100ms
    expect(next - min).toBeLessThan(60_000);           // 確實 < 一格 → 正是舊碼被捨去的情形
  });

  it('advancePlayhead：越過 max 回繞到 min、未越界正常累加', () => {
    const min = 0, max = 1000, range = 1000;
    expect(advancePlayhead(max - 1, range, 10, min, max)).toBe(min);            // 越界 → wrap
    expect(advancePlayhead(min, range, 10, min, max)).toBeCloseTo(range * 10 / 7200, 6); // 未越界
  });
});
