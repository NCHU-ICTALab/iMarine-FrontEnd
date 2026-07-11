/* 合成游標：headed 錄影不含 OS 游標，注入 overlay 圓點 + 點擊漣漪。
   節奏規則（spec §6）：移動 600-900ms easing、懸停 300-500ms、漣漪 ~400ms。 */

export function cursorInitScript() {
  return `(() => {
    if (window.__dcurInstalled) return; window.__dcurInstalled = true;
    // addInitScript 在部分 Chromium 情境下於 document.documentElement 尚未建立前就執行
    // （實測 readyState 仍為 'loading' 且 documentElement 為 null），直接 appendChild 會丟
    // TypeError 觸發 pageerror gate、每支錄影都會作廢；用 MutationObserver 延後到 <html> 出現再裝。
    function install() {
      const css = document.createElement('style');
      css.textContent = \`
        #__dcur{position:fixed;left:0;top:0;width:26px;height:26px;border-radius:50%;
          border:2px solid rgba(53,224,166,.9);background:rgba(53,224,166,.18);
          box-shadow:0 0 12px rgba(53,224,166,.35);pointer-events:none;z-index:2147483647;
          transform:translate(-50%,-50%);margin-left:-100px;margin-top:-100px}
        .__dripple{position:fixed;width:26px;height:26px;border-radius:50%;
          border:2px solid rgba(53,224,166,.9);pointer-events:none;z-index:2147483646;
          transform:translate(-50%,-50%) scale(1);opacity:.9;
          transition:transform .4s ease-out,opacity .4s ease-out}\`;
      document.documentElement.appendChild(css);
      const dot = document.createElement('div'); dot.id = '__dcur';
      document.documentElement.appendChild(dot);
      addEventListener('mousemove', (e) => {
        dot.style.marginLeft = '0'; dot.style.marginTop = '0';
        dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px';
      }, true);
      addEventListener('mousedown', (e) => {
        const r = document.createElement('div'); r.className = '__dripple';
        r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
        document.documentElement.appendChild(r);
        requestAnimationFrame(() => { r.style.transform = 'translate(-50%,-50%) scale(2.6)'; r.style.opacity = '0'; });
        setTimeout(() => r.remove(), 450);
      }, true);
    }
    if (document.documentElement) install();
    else new MutationObserver((_, mo) => { if (document.documentElement) { mo.disconnect(); install(); } }).observe(document, { childList: true });
  })();`;
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createCursor(page) {
  let pos = { x: 960, y: 540 };

  async function resolvePoint(target) {
    if (typeof target !== 'string') {
      if ('dx' in target || 'dy' in target) return { x: pos.x + (target.dx ?? 0), y: pos.y + (target.dy ?? 0) };
      return target;
    }
    const box = await page.locator(target).first().boundingBox();
    if (!box) throw new Error(`cursor: 找不到可視元素 ${target}`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  async function glide(to, ms) {
    const from = { ...pos };
    const steps = Math.max(12, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) {
      const k = ease(i / steps);
      await page.mouse.move(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k);
      await sleep(ms / steps);
    }
    pos = to;
  }

  return {
    async moveTo(target, { ms = 750 } = {}) { await glide(await resolvePoint(target), ms); },
    async click(target, { hover = 400, ms = 750 } = {}) {
      await glide(await resolvePoint(target), ms);
      await sleep(hover);
      await page.mouse.down(); await sleep(70); await page.mouse.up();
    },
    async drag(target, to, { ms = 900, hover = 300 } = {}) {
      await glide(await resolvePoint(target), 700);
      await sleep(hover);
      await page.mouse.down(); await sleep(120);
      await glide(await resolvePoint(to), ms);
      await sleep(120); await page.mouse.up();
    },
    async type(selector, text) {
      await this.click(selector);
      await page.keyboard.type(text, { delay: 55 });
    },
  };
}
