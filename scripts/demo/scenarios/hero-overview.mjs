/* 封面 → Enter 戰情總覽：轉場 + 儀表牆 stagger + hover 模組卡。 */
export default {
  name: 'hero-overview',
  targetSec: 13,
  post: { trimAtMark: 'sceneReady' },
  async run(ctx) {
    await ctx.go('hero');
    await ctx.sleep(1800);
    ctx.mark('sceneReady');
    await ctx.sleep(1500);
    await ctx.cursor.click('#toOverview', { hover: 500 });
    await ctx.page.waitForSelector('.overview .modwall', { timeout: 10000 });
    await ctx.sleep(2500); // 儀表牆 stagger + sparkline 進場
    await ctx.cursor.moveTo('.modwall > *:nth-child(1)', { ms: 800 });
    await ctx.sleep(1200);
    await ctx.cursor.moveTo('.modwall > *:nth-child(6)', { ms: 900 });
    await ctx.sleep(3000); // payoff：六卡儀表牆全景
  },
};
