/* 政策報告：點情報 → 生成動畫 → 綜合對話（用預置 qchip，確定性）→ 引用 payoff。 */
export default {
  name: 'policy',
  targetSec: 32,
  post: { trimAtMark: 'sceneReady' },
  async run(ctx) {
    await ctx.go('policy');
    await ctx.sleep(1800);
    ctx.mark('sceneReady');
    await ctx.sleep(3000); // 定場：三欄 + MOCK chip
    await ctx.cursor.click('#inboxList > *:nth-child(1)', { hover: 500 });
    await ctx.sleep(4500); // 生成動畫（gbar 進度 + 情報流入）
    await ctx.cursor.moveTo('.thread', { ms: 800 });
    await ctx.sleep(2500); // 看報告內容
    const chip = ctx.page.locator('#qchips > *:nth-child(1)');
    await chip.waitFor({ timeout: 8000 });
    await ctx.cursor.click('#qchips > *:nth-child(1)', { hover: 500 });
    await ctx.sleep(4000); // 綜合對話回答生成
    await ctx.cursor.moveTo('.thread .cite >> nth=0', { ms: 800 }).catch(() => {});
    await ctx.sleep(3500); // payoff：帶 iMarine 引用的回答
  },
};
