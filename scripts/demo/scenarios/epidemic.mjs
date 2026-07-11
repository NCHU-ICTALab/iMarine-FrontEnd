/* 疫情追溯：定場（管線帶 + 自動選中最高風險船）→ 下鑽另一艘 → 拖時間游標 →
   模擬偵測（新威脅紅級置頂）→ 評分 payoff。 */
export default {
  name: 'epidemic',
  targetSec: 34,
  prereq: '需連網（Mapbox 磚）；.env 需有 VITE_MAPBOX_TOKEN（本機已設）',
  post: { trimAtMark: 'sceneReady' },
  async run(ctx) {
    await ctx.go('epidemic');
    await ctx.page.waitForSelector('#epiMap canvas', { timeout: 20000 }); // 地圖磚就緒
    await ctx.sleep(2500); // 管線進場動畫
    ctx.mark('sceneReady');
    await ctx.sleep(3000); // 定場：三分割 + 自動選中最高風險船
    await ctx.cursor.click('#epiFleet > *:nth-child(2)', { hover: 450 }); // 下鑽另一艘
    await ctx.sleep(3000); // 地圖航線 + Epi-Gantt 重繪
    await ctx.cursor.drag('#epiCursor', { dx: 180, dy: 0 }, { ms: 1600 }); // 時間游標：船沿航線移動
    await ctx.sleep(2000);
    await ctx.cursor.click('#epiSim', { hover: 500 }); // 模擬偵測：新威脅
    await ctx.sleep(4000); // 紅級置頂動畫 + 命中脈衝
    await ctx.cursor.click('#epiFleet > *:nth-child(1)', { hover: 450 }); // 選中置頂的最高風險新威脅
    await ctx.sleep(2500); // 地圖航線 + 評分面板重繪為該船
    await ctx.cursor.moveTo('#epiScore', { ms: 800 });
    await ctx.sleep(3500); // payoff：最高分紅級 + WHO IHR 評分依據
  },
};
