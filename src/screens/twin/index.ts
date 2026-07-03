import type { Screen } from '../types';

const s: Screen = {
  mount(el) {
    el.innerHTML = '<div class="swrap"><h1>twin（開發中）</h1></div>';
  },
};

export default s;
