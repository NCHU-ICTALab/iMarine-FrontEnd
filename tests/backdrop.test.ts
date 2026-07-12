import { describe, it, expect } from 'vitest';
import { resolveBackdrop } from '../src/shell/backdrop';

describe('resolveBackdrop', () => {
  it('無 bg → 隱藏影片、退回點雲', () => {
    expect(resolveBackdrop({}, false)).toEqual({ visible: false, src: '', poster: '', play: false });
  });

  it('有 bg + 允許動效 → 顯示且播放', () => {
    expect(resolveBackdrop({ bg: '/a.mp4', poster: '/a.jpg' }, false)).toEqual({
      visible: true, src: '/a.mp4', poster: '/a.jpg', play: true,
    });
  });

  it('有 bg + reduced-motion → 顯示但不播、poster 靜態', () => {
    expect(resolveBackdrop({ bg: '/a.mp4', poster: '/a.jpg' }, true)).toEqual({
      visible: true, src: '/a.mp4', poster: '/a.jpg', play: false,
    });
  });

  it('有 bg 但無 poster → poster 為空字串', () => {
    expect(resolveBackdrop({ bg: '/a.mp4' }, false)).toEqual({
      visible: true, src: '/a.mp4', poster: '', play: true,
    });
  });
});
