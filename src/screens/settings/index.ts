import html from './settings.html?raw';
import './settings.css';
import { screenHeader } from '../../ui/components';
import type { Screen, ScreenCtx } from '../types';
import { validateSections, type SettingsSection, type SettingsCtx } from './schema';

let SECTIONS: SettingsSection[] = [];
let cur = 'frontend';
let root: HTMLElement;
let sctx: SettingsCtx;

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

function renderNav(): void {
  const nav = root.querySelector('#setNav') as HTMLElement;
  nav.innerHTML = SECTIONS.map(
    (s) =>
      '<div class="sitem' + (cur === s.id ? ' on' : '') + '" data-nav="' + s.id + '">' +
      '<span class="d" style="background:' + s.color + '"></span>' +
      '<span class="nm">' + esc(s.label) + '</span><span class="st">' + esc(s.status()) + '</span></div>',
  ).join('');
}

function renderPanel(): void {
  const panel = root.querySelector('#setPanel') as HTMLElement;
  panel.innerHTML = '';
  const sec = SECTIONS.find((s) => s.id === cur);
  if (!sec) return;
  // Task 3 起改用 renderer.ts 的 renderSection；本 task 先出佔位文字驗證骨架
  panel.innerHTML = '<div class="gcard"><div class="ghead"><h3>' + esc(sec.label) + '</h3></div>' +
    '<div class="gnote">分區內容於後續 task 接上。</div></div>';
}

function select(id: string): void {
  cur = id;
  renderNav();
  renderPanel();
}

const screen: Screen = {
  mount(el: HTMLElement, ctx: ScreenCtx) {
    root = el;
    sctx = {
      data: ctx.data,
      toast: (o) => ctx.ui.toast(o),
      rerender: () => renderPanel(),
      goto: (sectionId: string, groupTitle?: string) => {
        select(sectionId);
        if (groupTitle) {
          const target = [...root.querySelectorAll('.gcard .ghead h3')].find((h) => h.textContent === groupTitle);
          const card = target?.closest('.gcard');
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.remove('hl');
            void (card as HTMLElement).offsetWidth;
            card.classList.add('hl');
          }
        }
      },
    };
    // 本 task：7 筆最小 stub；Task 3-7 逐一換成 sections/ 檔案
    SECTIONS = [
      { id: 'frontend', label: '前端設定', color: '#35E0A6', status: () => '生效中', groups: [] },
      { id: 'carbon', label: '碳權代幣化', color: '#E9BC63', status: () => 'API 可設定', groups: [] },
      { id: 'policy', label: '政策報告', color: '#38BDF8', status: () => '', groups: [] },
      { id: 'twin', label: '沙盤推演', color: '#7FB4FF', status: () => '後端待接入', groups: [] },
      { id: 'dispatch', label: '派工建議', color: '#F5A54A', status: () => '後端待接入', groups: [] },
      { id: 'epidemic', label: '疫情追溯', color: '#F0648C', status: () => '後端待接入', groups: [] },
      { id: 'alert', label: '警報推播', color: '#FF7A59', status: () => '後端待接入', groups: [] },
    ];
    validateSections(SECTIONS);
    el.innerHTML = html.replace(
      '<!--HEADER-->',
      screenHeader({ eyebrow: 'SYSTEM SETTINGS', color: '#9FB0C0', title: '系統設定' }),
    );
    el.addEventListener('click', (e) => {
      const nv = (e.target as HTMLElement).closest('[data-nav]');
      if (nv) select(nv.getAttribute('data-nav') as string);
    });
    renderNav();
    renderPanel();
  },
};
export default screen;
