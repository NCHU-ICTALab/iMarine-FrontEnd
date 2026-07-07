import html from './settings.html?raw';
import './settings.css';
import { screenHeader } from '../../ui/components';
import type { Screen, ScreenCtx } from '../types';
import { validateSections, type SettingsSection, type SettingsCtx } from './schema';
import { renderSection } from './renderer';
import { frontendSection } from './sections/frontend';
import { twinSection } from './sections/twin';
import { dispatchSection } from './sections/dispatch';
import { epidemicSection } from './sections/epidemic';
import { alertSection } from './sections/alert';

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
  const sec = SECTIONS.find((s) => s.id === cur);
  if (sec) renderSection(panel, sec, sctx);
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
    // Task 3：frontend + 四佔位換成真 sections；carbon/policy 仍為 Task 2 stub（Task 5/6 才換）
    SECTIONS = [
      frontendSection,
      { id: 'carbon', label: '碳權代幣化', color: '#E9BC63', status: () => 'API 可設定', groups: [] },
      { id: 'policy', label: '政策報告', color: '#38BDF8', status: () => '', groups: [] },
      twinSection,
      dispatchSection,
      epidemicSection,
      alertSection,
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
