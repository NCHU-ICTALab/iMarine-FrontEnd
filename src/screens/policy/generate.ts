/* 生成/回答步驟動畫的時序排程 — 純 setTimeout 包裝，好讓 index.ts 的動畫可被
   fake timers 單元測試。reduced-motion 降級由呼叫端決定（直接跳過本模組）。 */

export interface TimelineEvent { at: number; run: () => void }
export interface TimelineHandle { cancel(): void }

export function runTimeline(
  events: TimelineEvent[],
  totalMs: number,
  done: () => void,
): TimelineHandle {
  const timers: ReturnType<typeof setTimeout>[] = [];
  for (const e of events) timers.push(setTimeout(e.run, e.at));
  timers.push(setTimeout(done, totalMs));
  return {
    cancel() {
      while (timers.length) clearTimeout(timers.pop()!);
    },
  };
}
