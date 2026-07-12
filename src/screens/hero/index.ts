/* Hero 畫面 — 兩段式：影片底圖封面 COVER ⇄ 模組儀表牆 OVERVIEW（2026-07-08 spec）。
   影片：<video> 滿版底層 + gradient scrim（兩態走 body[data-hero]，CSS 過場）；
   JS 只管 play/pause 生命週期（show/hide + visibilitychange）與 reduced-motion 靜態降級。
   封面 chips 取 SCREENS.slice(1, 8)（六功能 + agent），總覽六卡取 slice(1, 7)（agent 進 chips 不進儀表牆；settings 兩者皆不進），
   同色點同順序＝轉場跨段錨點。 */
import type { Screen, ScreenCtx } from '../types';
import template from './hero.html?raw';
import { SCREENS, type ScreenDef } from '../../shell/registry';
import type { OverviewSnapshot } from '../../data/types';
import './hero.css';

type HeroState = 'cover' | 'ov';
let heroState: HeroState = 'cover';
let ctxRef: ScreenCtx | null = null;
let sectionEl: HTMLElement | null = null;

function chip(def: ScreenDef): string {
  return `<button class="hchip" data-go="${def.id}" style="--mc:${def.color}"><i></i>${def.short}</button>`;
}

// trend（長度 7）→ 100×24 viewBox 的 polyline points（首尾貼齊、上下留 2px 邊）
function sparkPoints(trend: number[]): string {
  const min = Math.min(...trend);
  const span = Math.max(...trend) - min || 1;
  return trend
    .map((v, i) => `${((i / (trend.length - 1)) * 100).toFixed(1)},${(22 - ((v - min) / span) * 20).toFixed(1)}`)
    .join(' ');
}

function modCard(def: ScreenDef, m: OverviewSnapshot['modules'][number], i: number): string {
  return (
    `<button class="mcard lg lg-static" data-go="${def.id}" style="--mc:${def.color};--i:${i}">` +
    `<span class="t"><i></i>${def.short}</span>` +
    `<span class="v">${m.value}</span>` +
    `<svg class="tr" viewBox="0 0 100 24" preserveAspectRatio="none"><polyline points="${sparkPoints(m.trend)}"/></svg>` +
    `</button>`
  );
}

function kpiLine(k: OverviewSnapshot['kpi']): string {
  return `${k.vessels} 艘 · ${k.berthsUsed}/${k.berthsTotal} 席 · ${k.waitHr.toFixed(1)} hr · ${k.co2T.toLocaleString('en-US')} t`;
}

function setHeroState(next: HeroState): void {
  heroState = next;
  document.body.setAttribute('data-hero', next);
  ctxRef?.setMode(next === 'ov' ? 'ov' : 'cover');
}

const s: Screen = {
  async mount(el, ctx) {
    ctxRef = ctx;
    sectionEl = el;
    const snap = await ctx.data.overview.snapshot();
    const chipMods = SCREENS.slice(1, 8); // 六功能 + agent 進封面 chips
    const cardMods = SCREENS.slice(1, 7); // 總覽儀表牆維持六卡 3×2
    const chipsHtml = chipMods.map(chip).join('');
    const cardsHtml = cardMods
      .map((def, i) => {
        const m = snap.modules.find((x) => x.id === def.id);
        return m ? modCard(def, m, i) : '';
      })
      .join('');

    el.innerHTML = template
      .replace('<!--CHIPS-->', chipsHtml)
      .replace('__KPILINE__', kpiLine(snap.kpi))
      .replace('<!--MODULES-->', cardsHtml);

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
    // router.go() 固定「先 show() 再 applyMode(def.mode)」且 registry 給 hero 的 mode
    // 是 'cover'——setMode 延到 microtask 才不會被蓋掉（沿用既有時序修正）。
    const state = heroState;
    queueMicrotask(() => ctxRef?.setMode(state === 'ov' ? 'ov' : 'cover'));
  },

  hide() {},
};

export default s;
