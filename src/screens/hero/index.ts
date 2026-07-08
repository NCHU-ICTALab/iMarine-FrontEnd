/* Hero 畫面 — Task 1 過渡殼：OverviewSnapshot 契約改版後暫時渲染最小結構，
   Task 2 依 2026-07-08 spec 全面重寫（影片底圖 + 封面 chips + 模組儀表牆）。 */
import type { Screen, ScreenCtx } from '../types';
import { SCREENS } from '../../shell/registry';

type HeroState = 'cover' | 'ov';
let heroState: HeroState = 'cover';
let ctxRef: ScreenCtx | null = null;

function setHeroState(next: HeroState): void {
  heroState = next;
  document.body.setAttribute('data-hero', next);
  ctxRef?.setMode(next === 'ov' ? 'ov' : 'cover');
}

const s: Screen = {
  async mount(el, ctx) {
    ctxRef = ctx;
    const snap = await ctx.data.overview.snapshot();
    const mods = SCREENS.slice(1, 7); // 六功能頁；第 8 筆 settings 不進 hero
    const chips = mods.map((d) => `<button data-go="${d.id}">${d.short}</button>`).join('');
    const cards = snap.modules.map((m) => `<div>${m.label}：${m.value}</div>`).join('');
    el.innerHTML =
      `<div class="cover"><h1>永續智能航港生態系</h1><div>${chips}</div>` +
      `<button class="lg lg-btn lg-btn--pill go" data-lg id="toOverview">進入戰情總覽</button></div>` +
      `<div class="overview"><div class="swrap">${cards}</div></div>`;
    el.querySelector('#toOverview')?.addEventListener('click', () => setHeroState('ov'));
    // main.ts 只在 router.current()==='hero' 時 dispatch 'hero:toggle'，綁一次即可。
    window.addEventListener('hero:toggle', () => setHeroState(heroState === 'ov' ? 'cover' : 'ov'));
    el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-go]');
      if (btn) location.hash = '#/' + (btn.getAttribute('data-go') as string);
    });
    document.body.setAttribute('data-hero', 'cover');
  },
  show() {
    // registry 給 hero 的 mode 是 'cover'，router 在 show() 後會 applyMode 蓋掉，
    // 故 setMode 延到 microtask（沿用既有時序修正，Task 2 重寫時保留）。
    const state = heroState;
    queueMicrotask(() => ctxRef?.setMode(state === 'ov' ? 'ov' : 'cover'));
  },
  hide() {},
};

export default s;
