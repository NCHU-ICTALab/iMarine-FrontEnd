import { SCREENS } from './registry';

// 自基準檔 docs/preview/preview-src-v3.html 的 <aside id="rail"> logo 搬入
const LOGO_ICON =
  '<path d="M3 17c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0"/>' +
  '<path d="M6 13l1.8-7h8.4L18 13"/>' +
  '<path d="M12 6V3"/>';

export function initRail(el: HTMLElement, onGo: (id: string) => void): { setActive(id: string): void } {
  el.classList.add('lg');
  el.setAttribute('data-lg', '');

  const mainDefs = SCREENS.filter((d) => d.id !== 'settings');
  const settingsDef = SCREENS.find((d) => d.id === 'settings');
  const btn = (def: (typeof SCREENS)[number]) =>
    '<button class="rbtn" data-go="' + def.id + '" style="--mc:' + def.color + '" data-lg-tip="' + def.short + '">' +
    '<svg viewBox="0 0 24 24">' + def.icon + '</svg></button>';

  el.innerHTML =
    '<div class="logo" data-lg-tip="永續智能航港生態系"><svg viewBox="0 0 24 24" fill="none">' + LOGO_ICON + '</svg></div>' +
    '<hr>' +
    mainDefs.map(btn).join('') +
    (settingsDef ? '<hr>' + btn(settingsDef) : '');

  el.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.rbtn');
    if (btn) onGo(btn.getAttribute('data-go') as string);
  });

  return {
    setActive(id: string) {
      el.querySelectorAll('.rbtn').forEach((b) => {
        b.classList.toggle('on', b.getAttribute('data-go') === id);
      });
    },
  };
}
