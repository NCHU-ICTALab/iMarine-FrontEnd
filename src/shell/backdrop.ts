/* 集中式背景影片層：全站共用單一 <video>，依 active screen 切 src。
   scrim 強度純 CSS（body[data-mode]）自動反應，本模組不碰 scrim 樣式。 */
import type { ScreenDef } from './registry';

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
