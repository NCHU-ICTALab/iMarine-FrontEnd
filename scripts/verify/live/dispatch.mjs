/* dispatch live 斷言——live 資料只覆蓋 stable 情境（頁面預設情境），
   斷言：1) chip 轉 LIVE；2) hero 風速/蒲福數字非空；3) 作業矩陣 7 列都渲染。
   rain/typhoon 情境維持純 mock，不在本斷言範圍內（見 docs/collab/dispatch.md §4）。 */
export default {
  id: 'dispatch',
  async asserts(page) {
    const results = [];
    const section = page.locator('#s-dispatch');
    await section.waitFor({ timeout: 10000 });

    const chip = section.locator('.src.live');
    const chipCount = await chip.count();
    results.push({
      name: '#s-dispatch .src.live 存在（chip 轉 LIVE）',
      ok: chipCount > 0,
      detail: chipCount > 0 ? undefined : '找不到 .src.live，chip 仍為 mock 灰底',
    });

    const wxavg = ((await section.locator('#wxavg').textContent()) ?? '').trim();
    const wxbf = ((await section.locator('#wxbf').textContent()) ?? '').trim();
    results.push({
      name: '#wxavg / #wxbf（hero 風速數字）非空',
      ok: wxavg.length > 0 && wxbf.length > 0,
      detail: `wxavg="${wxavg}" wxbf="${wxbf}"`,
    });

    const rowCount = await section.locator('#mxbody .mrow').count();
    results.push({
      name: '#mxbody 作業矩陣渲染 7 列',
      ok: rowCount === 7,
      detail: `實際 ${rowCount} 列`,
    });

    return results;
  },
};
