/* 集中式背景影片層：全站共用單一 <video>，依 active screen 切 src。
   scrim 強度純 CSS（body[data-mode]）自動反應，本模組不碰 scrim 樣式。 */
import type { ScreenDef } from './registry';
import { prefersReduced } from '../screens/settings/storage';

export interface BackdropState {
  visible: boolean; // 顯示影片層？（false → 隱藏、露出 #harbor 點雲）
  src: string; // 影片 URL（visible=false 時為 ''）
  poster: string; // reduced-motion 靜態幀（無則 ''）
  play: boolean; // 是否播放（reduced-motion 或無 bg 時 false）
}

/** 純函式：由 ScreenDef 與 reduced-motion 旗標推導背景層狀態。 */
export function resolveBackdrop(def: Pick<ScreenDef, 'bg' | 'poster'>, reduced: boolean): BackdropState {
  if (!def.bg) return { visible: false, src: '', poster: '', play: false };
  return { visible: true, src: def.bg, poster: def.poster ?? '', play: !reduced };
}

export interface Backdrop {
  setScreen(def: Pick<ScreenDef, 'bg' | 'poster'>): void;
}

export function initBackdrop(video: HTMLVideoElement): Backdrop {
  let curSrc = '';
  let cur: BackdropState = { visible: false, src: '', poster: '', play: false };

  // autoplay 政策：play() 回傳 Promise 可能被拒（省電模式等），必須 catch——
  // 失敗時 video 停在 poster 幀，對比由 backdrop-scrim 保證，不需額外 fallback UI。
  function safePlay(): void {
    video.play().catch(() => {});
  }

  function apply(): void {
    if (!cur.visible) {
      document.body.removeAttribute('data-bg');
      video.pause();
      if (curSrc) {
        video.removeAttribute('src');
        video.load(); // 停止抓 bytes、釋放解碼
        curSrc = '';
      }
      return;
    }
    document.body.setAttribute('data-bg', 'on');
    if (cur.src !== curSrc) {
      video.src = cur.src;
      curSrc = cur.src;
    }
    video.poster = cur.poster;
    if (cur.play) safePlay();
    else video.pause();
  }

  // 分頁隱藏暫停解碼；回前景且目前有 active bg 且非 reduced-motion 才恢復。
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) video.pause();
    else if (cur.visible && cur.play) safePlay();
  });

  return {
    setScreen(def) {
      cur = resolveBackdrop(def, prefersReduced());
      apply();
    },
  };
}
