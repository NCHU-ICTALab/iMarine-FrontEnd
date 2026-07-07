/* Alert screen 過渡殼 — 改版進行中（Task 3 重寫版面）。 */
import type { Screen } from '../types';
import template from './alert.html?raw';

const s: Screen = {
  async mount(el) {
    el.innerHTML = '<div class="swrap">' + template + '</div>';
  },
};
export default s;
