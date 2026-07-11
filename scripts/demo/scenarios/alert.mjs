/* 警報：定場（自動選中最高風險 + 圍欄）→ 模擬第一發（作業提示）→
   第二發（颱風紅色警報頂格：cell 全亮 + 手機全螢幕插播 + 雙漏斗滾數字）→ 手機 payoff。 */
export default {
  name: 'alert',
  targetSec: 34,
  prereq: '需連網（Mapbox 磚）；.env 需有 VITE_MAPBOX_TOKEN（本機已設）',
  post: { trimAtMark: 'sceneReady' },
  async run(ctx) {
    await ctx.go('alert');
    await ctx.page.waitForSelector('#amap canvas', { timeout: 20000 });
    await ctx.sleep(2200);
    ctx.mark('sceneReady');
    await ctx.sleep(3000); // 定場：事件流 + 覆蓋地圖 + 手機
    await ctx.cursor.click('#simBtn', { hover: 500 }); // 第一發：作業提示（雷擊）
    await ctx.sleep(4000); // 等動畫完（防重入窗口）
    await ctx.cursor.click('#simBtn', { hover: 450 }); // 第二發：紅色警報（颱風）頂格
    await ctx.sleep(6500); // cell 全亮 stagger + 波紋 + 手機插播抖動 + 漏斗滾數字
    await ctx.cursor.moveTo('#aphone', { ms: 900 });
    await ctx.sleep(3500); // payoff：手機紅色警報全螢幕插播
  },
};
