/* 數位孿生：全景（AIS 回放）→ 點船 chip → 切「未來推演」→ 拖 24hr 時間軸 →
   泊位 Gantt 變化 payoff。live（原生直繪，無外部後端）。 */
export default {
  name: 'twin',
  targetSec: 33,
  post: { trimAtMark: 'sceneReady' },
  async run(ctx) {
    await ctx.go('twin');
    await ctx.page.waitForSelector('#twinView', { timeout: 15000 });
    await ctx.sleep(2500); // 場景初繪
    ctx.mark('sceneReady');
    await ctx.sleep(1500); // 定場：港區全景
    await ctx.cursor.click('#play', { hover: 400 }); // 已驗證 timeline.ts 預設 playing=false → 需點播放
    await ctx.sleep(3000); // 船隻沿 AIS 軌跡回放動態
    await ctx.cursor.click('#twinView', { hover: 400 }); // 點船：中心附近射線挑船
    await ctx.sleep(2500); // #shipchip 船隻資訊
    await ctx.cursor.click('.mtab[data-tab="future"]', { hover: 500 });
    await ctx.page.waitForSelector('#tslider', { state: 'visible', timeout: 8000 });
    await ctx.sleep(2500); // 未來推演面板切入
    const box = await ctx.page.locator('#tslider').boundingBox();
    if (!box) throw new Error('twin: #tslider 無 boundingBox（未來推演分頁未露出時間軸）');
    await ctx.cursor.drag(
      { x: box.x + box.width * 0.15, y: box.y + box.height / 2 },
      { x: box.x + box.width * 0.85, y: box.y + box.height / 2 },
      { ms: 2600 },
    ); // 24hr 推演：由近而遠拖到未來時刻
    await ctx.sleep(2000);
    await ctx.cursor.moveTo('#gantt', { ms: 900 });
    await ctx.sleep(3500); // payoff：未來時刻泊位佔用
  },
};
