import type { Mode, Screen, ScreenCtx } from '../screens/types';
import { SCREENS, type ScreenDef } from './registry';

export function parseHash(hash: string, ids: string[]): string {
  const id = hash.startsWith('#/') ? hash.slice(2) : '';
  return ids.includes(id) ? id : 'hero';
}

export function applyMode(m: Mode): void {
  document.body.setAttribute('data-mode', m);
}

interface CacheEntry {
  section: HTMLElement;
  screen: Screen;
}

// 快取式路由：每個 screen 只 mount 一次，DOM 保留於 <section id="s-<id>">，
// 切頁只切 .active/.entered 與呼叫 show()/hide()（spec 第 9 節：twin iframe 不因切頁重載）。
export function initRouter(o: {
  container: HTMLElement;
  ctx: ScreenCtx;
  onChange(def: ScreenDef): void;
}): { go(id: string): Promise<void>; current(): string } {
  const ids = SCREENS.map((d) => d.id);
  const cache = new Map<string, CacheEntry>();
  let currentId = '';
  // 每次 go() 遞增一個 token；若在 lazy load/mount 等待期間又有更新的 go() 呼叫進來，
  // 舊的呼叫在恢復執行後會發現自己已過期而中止，避免兩個 screen 同時變 active。
  let token = 0;

  async function go(id: string): Promise<void> {
    if (id === currentId) return; // 已在該頁（含 hashchange 自我觸發的迴圈）→ 不重複處理
    const def = SCREENS.find((d) => d.id === id);
    if (!def) return;
    const myToken = ++token;

    const prev = cache.get(currentId);
    prev?.screen.hide?.();
    prev?.section.classList.remove('active', 'entered');
    currentId = id;

    let entry = cache.get(id);
    if (!entry) {
      const section = document.createElement('section');
      section.className = 'screen';
      section.id = 's-' + id; // tokens.css / carbon.css 選擇器以此定界
      o.container.appendChild(section); // 不清空 container，保留其餘已快取的 screen
      const mod = await def.load();
      if (myToken !== token) return; // 被更新的導覽取代，中止
      await mod.default.mount(section, o.ctx);
      if (myToken !== token) return;
      entry = { section, screen: mod.default };
      cache.set(id, entry);
    }
    const active: CacheEntry = entry;

    active.section.classList.add('active');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        active.section.classList.add('entered'); // 雙 rAF 重新觸發 stagger 進場
      });
    });
    active.screen.show?.();
    applyMode(def.mode);
    if (location.hash !== '#/' + id) location.hash = '#/' + id;
    try {
      window.LiquidGlass.refresh();
    } catch {}
    o.onChange(def);
  }

  addEventListener('hashchange', () => {
    go(parseHash(location.hash, ids));
  });

  return { go, current: () => currentId };
}
