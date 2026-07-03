import type { Screen } from '../types';

const s: Screen = {
  mount(el) {
    el.innerHTML = '<div class="swrap"><h1>dispatch（開發中）</h1></div>';
  },
};

export default s;
