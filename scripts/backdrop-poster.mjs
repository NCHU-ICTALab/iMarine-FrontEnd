// 由某頁的 <id>-bg.mp4 抽一幀當 reduced-motion poster（非 vite build 期，開發者換 mp4 後手動跑一次）。
// 用法：node scripts/backdrop-poster.mjs <screenId> [seconds]
//   seconds 預設 0.5，避開某些 mp4 首幀為黑幀。
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const id = process.argv[2];
const at = process.argv[3] ?? '0.5';
if (!id) {
  console.error('用法：node scripts/backdrop-poster.mjs <screenId> [seconds]');
  process.exit(1);
}
const mp4 = resolve('src/screens', id, `${id}-bg.mp4`);
const jpg = resolve('src/screens', id, `${id}-poster.jpg`);
if (!existsSync(mp4)) {
  console.error(`找不到影片：${mp4}`);
  process.exit(1);
}
execFileSync('ffmpeg', ['-y', '-ss', at, '-i', mp4, '-frames:v', '1', '-q:v', '3', jpg], { stdio: 'inherit' });
console.log(`已產生 poster：${jpg}`);
