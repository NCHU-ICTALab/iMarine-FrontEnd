import { describe, it, expect } from 'vitest';
import { buildConvertArgs, buildStillArgs } from '../scripts/demo/ffmpeg.mjs';

const VF = 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p';

describe('buildConvertArgs', () => {
  it('無修剪無 ramp：單純 -vf 轉檔', () => {
    expect(buildConvertArgs({ input: 'a.webm', output: 'a.mp4' })).toEqual([
      '-y', '-i', 'a.webm',
      '-vf', VF,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-an', '-movflags', '+faststart', 'a.mp4',
    ]);
  });

  it('只修剪頭部：-ss 放在 -i 之前', () => {
    expect(buildConvertArgs({ input: 'a.webm', output: 'a.mp4', trimStartSec: 1.3 })).toEqual([
      '-y', '-ss', '1.30', '-i', 'a.webm',
      '-vf', VF,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-an', '-movflags', '+faststart', 'a.mp4',
    ]);
  });

  it('一段 ramp：filter_complex 三段 trim/setpts/concat', () => {
    const args = buildConvertArgs({
      input: 'a.webm', output: 'a.mp4', trimStartSec: 1,
      ramps: [{ from: 5, to: 9, factor: 2 }],
    });
    expect(args).toEqual([
      '-y', '-i', 'a.webm',
      '-filter_complex',
      '[0:v]trim=start=1.00:end=5.00,setpts=PTS-STARTPTS[s0];' +
      '[0:v]trim=start=5.00:end=9.00,setpts=(PTS-STARTPTS)/2[s1];' +
      '[0:v]trim=start=9.00,setpts=PTS-STARTPTS[s2];' +
      `[s0][s1][s2]concat=n=3:v=1,${VF}[v]`,
      '-map', '[v]',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-an', '-movflags', '+faststart', 'a.mp4',
    ]);
  });

  it('兩段 ramp：五段 concat', () => {
    const args = buildConvertArgs({
      input: 'a.webm', output: 'a.mp4',
      ramps: [{ from: 2, to: 4, factor: 1.5 }, { from: 8, to: 12, factor: 2 }],
    });
    const fc = args[args.indexOf('-filter_complex') + 1];
    expect(fc).toBe(
      '[0:v]trim=start=0.00:end=2.00,setpts=PTS-STARTPTS[s0];' +
      '[0:v]trim=start=2.00:end=4.00,setpts=(PTS-STARTPTS)/1.5[s1];' +
      '[0:v]trim=start=4.00:end=8.00,setpts=PTS-STARTPTS[s2];' +
      '[0:v]trim=start=8.00:end=12.00,setpts=(PTS-STARTPTS)/2[s3];' +
      '[0:v]trim=start=12.00,setpts=PTS-STARTPTS[s4];' +
      `[s0][s1][s2][s3][s4]concat=n=5:v=1,${VF}[v]`,
    );
  });
});

describe('buildStillArgs', () => {
  it('取倒數 0.3s 一幀', () => {
    expect(buildStillArgs('a.mp4', 's.png')).toEqual([
      '-y', '-sseof', '-0.3', '-i', 'a.mp4', '-frames:v', '1', '-update', '1', 's.png',
    ]);
  });
});
