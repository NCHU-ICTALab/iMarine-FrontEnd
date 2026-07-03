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

    const prevId = currentId; // 供下方 load/mount 真正失敗時復原，與 supersede-abort 的處理分開
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
      try {
        const mod = await def.load();
        if (myToken !== token) {
          section.remove(); // 被更新的導覽取代：移除這個尚未快取的 section，否則之後 go(id) 會再建一個造成重複 id
          return;
        }
        await mod.default.mount(section, o.ctx);
        if (myToken !== token) {
          section.remove();
          return;
        }
        entry = { section, screen: mod.default };
      } catch {
        // 真正失敗（動態 import 被拒絕或 mount() 拋錯）——不同於上面兩個 supersede-abort，
        // 這裡要收拾孤兒 section、把 currentId 復原成前一頁，讓路由狀態維持一致，不繼續往下 activate。
        section.remove();
        // 復原前一頁的視覺狀態：go() 開頭已對它 hide() 並剝掉 .active/.entered，若只回滾 currentId
        // 而不重新顯示，畫面會空白，且再點同一顆 rail 會被開頭的 id===currentId 早退卡住。prev 可能為
        // undefined（開機首次導覽時 currentId 為空字串、cache 尚無前一頁），故加 if 防護。
        if (prev) {
          prev.section.classList.add('active', 'entered');
          prev.screen.show?.();
        }
        currentId = prevId;
        return;
      }
      cache.set(id, entry);
      // Kit 的 init() 只在開機掃一次 [data-lg]、refresh() 只 update 既有實例，兩者都不會掃到
      // mount() 之後才插入 DOM 的玻璃節點；故首次 mount 後對本 section 的玻璃子樹逐一 attach，
      // 否則螢幕內的 [data-lg] 元件在真 Chromium 下只是沒有折射的扁平色塊。attach() 冪等，可安全重入。
      section.querySelectorAll('[data-lg]').forEach((n) => {
        try {
          window.LiquidGlass.attach(n);
        } catch {}
      });
      // 同理，.lg-stat/.lg-meter/.lg-gauge/svg[data-lg-chart] 的彈簧數字/sparkline/量表/圖表
      // 是屬性驅動（data-lg-value 等），只在 init() 開機那次掃過；重新掃描本 section 才會生效，
      // 否則數值永遠停在初始 0（Kit 對已掃過的節點會自行略過，可安全重入）。
      try {
        window.LiquidGlass.behaviors.stats(section);
      } catch {}
    }
    const active: CacheEntry = entry;

    active.section.classList.add('active');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        active.section.classList.add('entered'); // 雙 rAF 重新觸發 stagger 進場
      });
    });
    // 注意：show() 與 applyMode 必須維持同步（中間不可插入 await）——hero 的 show() 用 queueMicrotask 覆寫模式，依賴此順序
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
