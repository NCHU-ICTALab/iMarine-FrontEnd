import './ui/liquid-glass.css';
import './ui/tokens.css';
import './ui/liquid-glass.js';
import { initBackground } from './shell/background';
import type { ScreenCtx } from './screens/types';
import { SCREENS } from './shell/registry';
import { applyMode, initRouter, parseHash } from './shell/router';
import { initRail } from './shell/rail';
import { createMockExchange } from './data/exchange/mock';
import { createCarbonProvider } from './data/exchange/carbon';
import { createTwinProvider } from './data/exchange/twin';
import { getSetting, subscribe } from './screens/settings/storage';
import { createPolicyProvider } from './data/exchange/policy';
// lg.d.ts 為 ambient 宣告（tsconfig include 已涵蓋），不需 import

document.documentElement.setAttribute('data-lg-theme', 'dark');
document.body.setAttribute('data-mode', 'cover');

// 動效設定 → body 屬性（CSS 端）；JS 端各頁走 prefersReduced()
const applyMotionAttrs = () => {
  if (getSetting('frontend.reduceMotion', false)) document.body.setAttribute('data-motion', 'reduce');
  else document.body.removeAttribute('data-motion');
  if (!getSetting('frontend.entrance', true)) document.body.setAttribute('data-anim', 'off');
  else document.body.removeAttribute('data-anim');
};
applyMotionAttrs();
subscribe('frontend.reduceMotion', applyMotionAttrs);
subscribe('frontend.entrance', applyMotionAttrs);

export const bg = initBackground(document.getElementById('harbor') as HTMLCanvasElement);

// overview/dispatch/epidemic/alert 為 mock provider；carbon（Task 4）、twin（Task 8）與
// policy（綜合對話 live）皆為 live provider（source 回報 'live'）。
// policy 的收件匣情報仍走 mock snapshot，只有綜合對話的自由提問打 rag-agent /api/chat。
const env = (import.meta as any).env ?? {};
const ctx: ScreenCtx = {
  data: {
    ...createMockExchange(),
    policy: createPolicyProvider(env.VITE_POLICY_API),
    carbon: createCarbonProvider(getSetting('carbon.apiBase', '') || env.VITE_CARBON_API),
    twin: createTwinProvider(),
  },
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
  const t = e.target as HTMLElement | null;
  if (e.metaKey || e.ctrlKey || e.altKey) return; // 不劫持 Cmd+0 縮放 / Cmd+1.. 等瀏覽器快捷鍵
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return; // carbon 表單輸入中不劫持導覽鍵
  if (e.key === 'Enter' && router.current() === 'hero') {
    window.dispatchEvent(new CustomEvent('hero:toggle'));
  }
  if (e.key === '0') router.go('hero');
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 7) router.go(SCREENS[n].id);
});

router.go(parseHash(location.hash, ids));
