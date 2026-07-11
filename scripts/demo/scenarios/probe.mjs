/* 10 秒畫質 probe：hero 封面（有影片底圖 + 細字）+ 游標移動，供 DSF 定案目檢。 */
export default {
  name: 'probe',
  targetSec: 10,
  post: { trimAtMark: 'sceneReady' },
  async run(ctx) {
    await ctx.go('hero');
    await ctx.sleep(1500); // stagger 進場
    ctx.mark('sceneReady');
    await ctx.sleep(2000);
    await ctx.cursor.moveTo('.hchip:nth-child(2)');
    await ctx.sleep(800);
    await ctx.cursor.moveTo('#toOverview');
    await ctx.sleep(3000);
  },
};
