/* Policy screen — 契約改版過渡佔位，Task 4 全面重寫（見 2026-07-05-policy-redesign plan）。 */
import type { Screen } from '../types';

const s: Screen = {
  async mount(el) {
    el.innerHTML = '<div class="swrap"><p class="mut">policy 改版施工中</p></div>';
  },
};
export default s;
