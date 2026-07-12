/* policy live 斷言——policy 頁不顯資料源 chip（既有特例），
   以綜合對話總覽卡 live 文案（「已接入 N 個知識庫」）為 live 特徵；
   fallback 文案為「已就緒 N 條情報」（rag-agent 未啟動）。 */
export default {
  id: 'policy',
  async asserts(page) {
    const results = [];
    const thread = page.locator('#s-policy #thread');
    await thread.waitFor({ timeout: 10000 });

    let live = false;
    try {
      await page.waitForFunction(
        () => document.querySelector('#s-policy #thread')?.textContent?.includes('已接入'),
        null,
        { timeout: 10000 },
      );
      live = true;
    } catch {
      /* 逾時＝停在 fallback 文案 */
    }
    const text = (await thread.textContent()) ?? '';
    results.push({
      name: '綜合對話總覽卡為 live 文案（已接入 N 個知識庫）',
      ok: live,
      detail: live
        ? undefined
        : `實際文案開頭：「${text.trim().slice(0, 40)}…」（含「已就緒」＝mock fallback，rag-agent 未啟動）`,
    });

    const srcCount = Number((await page.locator('#s-policy #srcCount').textContent()) ?? '0');
    results.push({ name: '右欄來源計數 > 0', ok: srcCount > 0, detail: `srcCount=${srcCount}` });

    return results;
  },
};
