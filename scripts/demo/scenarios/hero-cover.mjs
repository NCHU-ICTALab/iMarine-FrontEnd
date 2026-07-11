/* 封面 loop 素材：不點擊，游標優雅掃過七 chips 停在「數位員工」。 */
export default {
  name: 'hero-cover',
  targetSec: 12,
  post: { trimAtMark: 'sceneReady' },
  async run(ctx) {
    await ctx.go('hero');
    await ctx.sleep(1800); // stagger 進場完
    ctx.mark('sceneReady');
    await ctx.sleep(1600); // 靜置定場（標題 + 波浪）
    await ctx.cursor.moveTo('.hchip:nth-child(1)', { ms: 900 });
    await ctx.sleep(400);
    await ctx.cursor.moveTo('.hchip:nth-child(4)', { ms: 900 });
    await ctx.sleep(400);
    await ctx.cursor.moveTo('.hchip:nth-child(7)', { ms: 900 }); // 數位員工（紫）
    await ctx.sleep(1800);
    await ctx.cursor.moveTo({ x: 960, y: 780 }, { ms: 700 }); // 讓開 chips
    await ctx.sleep(2200); // 尾段乾淨波浪，PPT loop 用
  },
};
