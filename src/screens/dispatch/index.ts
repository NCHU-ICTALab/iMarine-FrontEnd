/* Dispatch screen — 2026-07-05 改版過渡殼（Task 2）：舊「熱區網格 + 逐10分鐘序列」
   版面已因資料契約改版而廢棄（heat.ts 已刪），完整新版面於 Task 3 起重建。 */
import type { Screen } from '../types';
import { screenHeader } from '../../ui/components';

const s: Screen = {
  async mount(el, ctx) {
    await ctx.data.dispatch.snapshot(); // 確認 provider 契約可用
    el.innerHTML =
      '<div class="swrap">' +
      screenHeader({
        eyebrow: '港邊人員視角 · MODULE 04',
        color: '#F5A54A',
        title: '短時微氣候 · 即時派工建議',
        badges: ['ConvLSTM 0-90 min'],
        source: 'mock',
      }) +
      '</div>';
  },
};
export default s;
