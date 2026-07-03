import './ui/liquid-glass.css';
import './ui/tokens.css';
import './ui/liquid-glass.js';
import { initBackground } from './shell/background';
import type { ScreenCtx } from './screens/types';
import { SCREENS } from './shell/registry';
import { applyMode, initRouter, parseHash } from './shell/router';
import { initRail } from './shell/rail';
// lg.d.ts 為 ambient 宣告（tsconfig include 已涵蓋），不需 import

document.documentElement.setAttribute('data-lg-theme', 'dark');
document.body.setAttribute('data-mode', 'cover');
export const bg = initBackground(document.getElementById('harbor') as HTMLCanvasElement);

const ctx: ScreenCtx = {
  data: {} as any, // Task 3 補
  ui: {
    toast: (o) => window.LiquidGlass.toast(o),
    refresh: () => {
      try {
        window.LiquidGlass.refresh();
      } catch {}
    },
  },
  setMode: applyMode,
  background: bg,
};

// rail 需在 LiquidGlass.init() 之前建立：init() 只在開機當下對 [data-lg] 掃描一次並 attach，
// #rail 的 data-lg 屬性必須先存在才能被這次掃描收進去（之後 refresh() 只更新既有實例，不會補掃新元素）。
const rail = initRail(document.getElementById('rail') as HTMLElement, (id) => router.go(id));

window.LiquidGlass.init();

const router = initRouter({
  container: document.getElementById('screens') as HTMLElement,
  ctx,
  onChange: (def) => rail.setActive(def.id),
});

const ids = SCREENS.map((d) => d.id);

addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && router.current() === 'hero') {
    window.dispatchEvent(new CustomEvent('hero:toggle'));
  }
  if (e.key === '0') router.go('hero');
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 6) router.go(SCREENS[n].id);
});

router.go(parseHash(location.hash, ids));
