/* 數位員工收官（live Gemini）：巡檢 → 指令1 跨模組盤點（plan+工具卡+citation）→ 點 citation 跳頁返回
   → 指令2 祈使掛單 → 互動確認卡（改價+人確認、真上鏈）→ payoff。
   雙指令刻意分工：盤點指令 Gemini 穩定產出豐富編排+citation；祈使掛單指令穩定觸發 place_carbon_order 出確認卡
   （讓它自己挑會只建議不執行、指名 token 才會真呼叫寫入工具）。實測定稿見 Task 8。
   Gemini 等待段以 marks 圍住、後製 ramp；每次回答不同 → 跑 2-3 take 挑最好。 */
const CMD1 = '幫我盤點六大模組現在的狀態，整理成一份今日戰情摘要';
const CMD2 = '很好，接著把我持有的 3 號碳權 SU 以總價 2900 美元上架掛單，直接幫我執行';

// 等任務跑完（#aStop 由顯示轉隱藏 = 不再 running）
async function waitDone(page, ms = 120000) {
  await page.waitForFunction(() => {
    const s = document.querySelector('#aStop');
    return !s || s.offsetParent === null;
  }, { timeout: ms });
}

export default {
  name: 'agent-finale',
  targetSec: 85,
  prereq: 'PoC 後端已啟動（:8000）；Gemini key 經 .env 或環境變數提供；建議 --take 1..3 多錄挑選',
  post: {
    trimAtMark: 'sceneReady',
    ramps: [
      { from: 't1', to: 'a1', factor: 1.9 },   // 指令1 盤點 Gemini 思考/工具鏈
      { from: 't2', to: 'card', factor: 1.9 },  // 指令2 送出 → 確認卡出現
      { from: 't3', to: 'a2', factor: 1.9 },    // 確認掛單 → 上鏈完成
    ],
  },
  async run(ctx) {
    const { page } = ctx;
    await ctx.go('agent');
    await ctx.sleep(1500);
    ctx.mark('sceneReady');
    // 幕 1：開場自我巡檢（7 燈卡 + 招呼 + 3 chips）
    await page.waitForSelector('#aChips > *', { timeout: 30000 });
    await ctx.sleep(2500);
    await ctx.cursor.moveTo('.lampwall', { ms: 900 });
    await ctx.sleep(1800);
    // 幕 2：指令1 跨模組盤點
    await ctx.cursor.moveTo('#aInput', { ms: 600 });
    await page.fill('#aInput', CMD1);
    await ctx.sleep(500);
    await ctx.cursor.click('#aSend', { hover: 350 });
    ctx.mark('t1');
    await page.waitForSelector('#aStop', { state: 'visible', timeout: 15000 }).catch(() => {});
    await waitDone(page); // 盤點回答完（plan + 工具卡 + citation + suggest）
    ctx.mark('a1');
    await ctx.sleep(2500); // 讀答案：模組色 citation chips
    // 幕 3：點 citation 跳對應模組頁 → 返回（溯源），guarded
    const cite = page.locator('.mchip').first();
    if (await cite.count()) {
      await ctx.cursor.click('.mchip >> nth=0', { hover: 500 });
      await ctx.sleep(2500);
      await page.keyboard.press('7'); // 返回 agent，thread 保留
      await page.waitForSelector('#s-agent.active', { timeout: 8000 }).catch(() => {});
      await ctx.sleep(1800);
    }
    // 幕 4：指令2 祈使掛單 → 互動確認卡
    await ctx.cursor.moveTo('#aInput', { ms: 500 });
    await page.fill('#aInput', CMD2);
    await ctx.sleep(500);
    await ctx.cursor.click('#aSend', { hover: 350 });
    ctx.mark('t2');
    await page.waitForSelector('.confirmcard', { timeout: 120000 }); // place_carbon_order 出確認卡
    ctx.mark('card');
    await ctx.sleep(1500);
    // 幕 5：確認卡——改總價、看每噸換算、人確認（human-in-the-loop，真上鏈）
    await ctx.cursor.moveTo('.confirmcard', { ms: 700 });
    await ctx.sleep(800);
    const price = page.locator('.confirmcard .cprice').first();
    if (await price.count()) {
      await ctx.cursor.click('.confirmcard .cprice', { hover: 350 });
      await page.keyboard.press('Meta+a');
      await page.keyboard.type('3100', { delay: 70 });
      await ctx.sleep(1500); // .cper 折合每噸即時換算
    }
    await ctx.cursor.click('.confirmcard .cbtn.ok', { hover: 600 });
    ctx.mark('t3');
    await waitDone(page); // 上鏈掛單 + 收尾回答
    ctx.mark('a2');
    await ctx.sleep(2500);
    // 幕 6：payoff 停格（GEMINI LIVE 入鏡）；有 SUGGEST 則 hover，否則停回答尾
    if (await page.locator('.schip').count()) {
      await ctx.cursor.moveTo('.schip >> nth=0', { ms: 800 });
    } else {
      await ctx.cursor.moveTo('#aThread', { ms: 800 });
    }
    await ctx.sleep(4000);
  },
};
