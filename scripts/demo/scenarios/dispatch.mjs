/* 派工：定場（stable）→ 切 typhoon 全版玫紅 → 點矩陣列展開法規依據 → 派工卡 payoff。 */
export default {
  name: 'dispatch',
  targetSec: 32,
  post: { trimAtMark: 'sceneReady' },
  async run(ctx) {
    await ctx.go('dispatch');
    await ctx.sleep(1800);
    ctx.mark('sceneReady');
    await ctx.sleep(3000); // 定場：風險大字塊 + 一句話結論 + 更新環
    await ctx.cursor.click('#segctl .scbtn[data-scn="typhoon"]', { hover: 500 });
    await ctx.sleep(3500); // 全版轉玫紅 + 矩陣變紅 + 推論動畫
    await ctx.cursor.click('#mxbody > *:nth-child(2)', { hover: 450 });
    await ctx.sleep(3500); // 原位展開規則依據（官方/慣例徽章）
    await ctx.cursor.moveTo('#mxbody > *:nth-child(2)', { ms: 600 });
    await ctx.sleep(1500);
    await ctx.cursor.moveTo('#cards', { ms: 900 });
    await ctx.sleep(4000); // payoff：派工指令卡（停什麼、加派什麼）
  },
};
