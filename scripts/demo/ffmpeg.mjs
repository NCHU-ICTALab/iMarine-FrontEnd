/* ffmpeg 參數建構（純函式，vitest 覆蓋）。
   speed ramp 用 trim+setpts+concat 三明治；時間一律絕對秒、toFixed(2)。 */

const VF = 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p';
const ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-an', '-movflags', '+faststart'];
const f2 = (n) => n.toFixed(2);

export function buildConvertArgs({ input, output, trimStartSec = 0, ramps = [] }) {
  if (!ramps.length) {
    const head = trimStartSec > 0 ? ['-y', '-ss', f2(trimStartSec), '-i', input] : ['-y', '-i', input];
    return [...head, '-vf', VF, ...ENC, output];
  }
  // 邊界序列：trimStart, (from,to)*, 末段開放
  const segs = [];
  let cursor = trimStartSec;
  for (const r of ramps) {
    segs.push({ start: cursor, end: r.from, factor: 1 });
    segs.push({ start: r.from, end: r.to, factor: r.factor });
    cursor = r.to;
  }
  segs.push({ start: cursor, end: null, factor: 1 });
  const parts = segs.map((s, i) => {
    const range = s.end == null ? `trim=start=${f2(s.start)}` : `trim=start=${f2(s.start)}:end=${f2(s.end)}`;
    const pts = s.factor === 1 ? 'setpts=PTS-STARTPTS' : `setpts=(PTS-STARTPTS)/${s.factor}`;
    return `[0:v]${range},${pts}[s${i}]`;
  });
  const labels = segs.map((_, i) => `[s${i}]`).join('');
  const fc = `${parts.join(';')};${labels}concat=n=${segs.length}:v=1,${VF}[v]`;
  return ['-y', '-i', input, '-filter_complex', fc, '-map', '[v]', ...ENC, output];
}

export function buildStillArgs(input, output) {
  return ['-y', '-sseof', '-0.3', '-i', input, '-frames:v', '1', '-update', '1', output];
}
