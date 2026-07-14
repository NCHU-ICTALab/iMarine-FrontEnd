/**
 * Milliseconds to advance the timeline scrubber per animation frame.
 *
 * Today's fixed sweep advanced `(max-min)/900` per frame; that is defined as
 * step 8 (80%). The stepper exposes 1–10 (10%–100%), so speed scales as
 * `step/8` relative to today: step 10 → 1.25x, step 1 → 0.125x.
 *
 * @param rangeMs full timeline span (maxMs - minMs)
 * @param step    stepper value, integer 1–10
 */
export function advancePerFrame(rangeMs: number, step: number): number {
  return (rangeMs * step) / 7200;
}

/**
 * Advance the play head one frame and wrap at the end. Accumulate on the returned
 * FLOAT — never on the step-snapped slider value, or sub-step advances (range/7200 per
 * frame at ×1 is far below the replay slider's 60s step) get rounded away by the range
 * input and playback freezes at low speeds.
 *
 * @param cur     current play-head position (same units as min/max)
 * @param rangeMs full timeline span (max - min)
 * @param step    stepper value, integer 1–10
 * @param min     timeline start
 * @param max     timeline end
 */
export function advancePlayhead(cur: number, rangeMs: number, step: number, min: number, max: number): number {
  const v = cur + advancePerFrame(rangeMs, step);
  return v > max ? min : v;
}
