import type { Screen } from '../types';
import { screenHeader } from '../../ui/components';
import type { EpidemicSnapshot } from '../../data/types';

const s: Screen = {
  async mount(el, ctx) {
    const snap: EpidemicSnapshot = await ctx.data.epidemic.snapshot();
    el.innerHTML =
      '<div class="swrap">' +
      screenHeader({ eyebrow: '港邊人員視角 · MODULE 05', color: '#F0648C', title: '疫情自動追溯', badges: ['AIS × WHO IHR · 規則式評分'], source: 'mock' }) +
      `<div class="anim" style="--d:.1s">進高雄船隊 ${snap.fleet.length} 艘 · 過渡殼（Task 3 重寫）</div>` +
      '</div>';
  },
};
export default s;
