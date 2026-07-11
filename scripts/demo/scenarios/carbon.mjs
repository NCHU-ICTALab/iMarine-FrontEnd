/* 碳權（live 上鏈）：單筆發行「現場驗證數據」真鑄造 → 持有中+航商篩選點卡開 drawer →
   上架掛單真上鏈 → 稽核分頁鏈上事件軌跡 payoff。
   selector 依 Task 7 實測定稿（carbon.ts/carbon.html 逐行核對）。
   購買(#m-buy)步驟捨棄：transfer-once + 需可買 listed SU 最脆弱，發行+掛單+稽核軌跡已充分證明 live 上鏈。
   防禦式：合成游標無 actionability 檢查，多 modal 流程用 waitFor 確認每個 modal 開/關 + 填值到位，
   讓合成點擊不會打到轉場中的 overlay。 */
export default {
  name: 'carbon',
  targetSec: 34,
  prereq: 'PoC 後端需已啟動（:8545 hardhat + :8000 api）；資料源 chip 應顯「本地模擬鏈 PoC」',
  post: { trimAtMark: 'sceneReady' },
  async run(ctx) {
    const { page } = ctx;
    // 發行用「執行期唯一船號」：後端 (ship,period) 只能發一次，成功即鑄掉該 combo；
    // 用時間戳末 6 碼組 IMO9xxxxxx 保證每次錄製都是新船、絕不撞已發行、可重錄。
    const ISSUE = { ship: 'IMO9' + String(Date.now()).slice(-6), period: '2031-03', gfi: '71.5', mj: '100000000' };
    await ctx.go('carbon');
    await ctx.sleep(1800);
    ctx.mark('sceneReady');
    await ctx.sleep(2500); // 定場：LIVE chip「本地模擬鏈 PoC」+ KPI 統計帶（累計發行 108）

    // 單筆發行：現場驗證數據 → 真鑄造 SU（ERC-721）
    await ctx.cursor.click('[data-lg-open="#m-issue-one"]', { hover: 500 });
    await page.waitForSelector('#one-ship', { state: 'visible', timeout: 8000 });
    await ctx.sleep(700); // modal 開場動畫穩定
    // 欄位以視覺游標點擊聚焦、page.fill 保證值到位（合成 type 對 modal 內輸入不夠穩）
    await ctx.cursor.moveTo('#one-ship', { ms: 450 });
    await page.fill('#one-ship', ISSUE.ship);
    await ctx.sleep(150);
    await page.fill('#one-period', ISSUE.period);
    await ctx.sleep(150);
    await page.fill('#one-gfi', ISSUE.gfi); // 低於目標 89 → 有超額可發
    await ctx.sleep(150);
    await page.fill('#one-mj', ISSUE.mj);
    await ctx.sleep(500);
    await ctx.cursor.click('#btn-issue-one-go', { hover: 500 });
    await page.waitForSelector('#m-issue-one', { state: 'hidden', timeout: 15000 }); // 成功即關（上鏈鑄造完）
    await ctx.sleep(1200); // toast「已發行 SU #N」+ KPI 108→109 + refresh 沉澱

    // 上架掛單：持有中 + 航商持有篩選（掛單鈕只在 held+shipping 出現，買家持有只能除役）→ 點卡開 drawer
    await ctx.cursor.click('.fchip[data-fs="held"]', { hover: 400 });
    await ctx.sleep(700);
    await ctx.cursor.click('.fchip[data-fr="shipping"]', { hover: 400 });
    await ctx.sleep(900); // 卡牆篩為持有中 + 航商持有
    await ctx.cursor.click('#page-workbench .su-card', { hover: 450 }); // 首張 held+shipping SU
    await page.waitForSelector('#d-actions [data-lg-open="#m-list"]', { state: 'visible', timeout: 8000 }); // drawer 開且為可掛單 SU
    await ctx.sleep(1000); // SU 詳情 drawer（鏈上資料 + 上架掛單鈕）
    await ctx.cursor.click('#d-actions [data-lg-open="#m-list"]', { hover: 500 });
    await page.waitForSelector('#list-price', { state: 'visible', timeout: 8000 });
    await ctx.sleep(500); // 掛單 modal 穩定
    await ctx.cursor.moveTo('#list-price', { ms: 500 });
    await page.fill('#list-price', '1280'); // 掛單價 mUSD
    await ctx.sleep(500);
    await ctx.cursor.click('#btn-list-go', { hover: 500 });
    await page.waitForSelector('#m-list', { state: 'hidden', timeout: 15000 }); // 上鏈掛單成功即關
    await ctx.sleep(1200); // toast「已上架」沉澱（drawer 仍開，顯示該 SU 已轉掛單中）
    // 關閉 SU 詳情 drawer（其 overlay 會蓋住稽核 tab，不關則合成點擊打到 overlay 反而關 drawer）
    await page.keyboard.press('Escape');
    await page.waitForSelector('#su-drawer', { state: 'hidden', timeout: 8000 });
    await ctx.sleep(700);

    // 稽核分頁：鏈上事件軌跡
    await ctx.cursor.click('#nav-tabs .lg-tabs__tab[data-page="audit"]', { hover: 500 });
    await page.waitForSelector('#page-audit.active', { timeout: 8000 }); // 確認分頁切換
    await ctx.sleep(1500); // 稽核頁載入（鏈上事件表）
    await ctx.cursor.moveTo('#page-audit', { ms: 800 }); // 游標移入稽核區（tbody 無 box，用頁區塊）
    await ctx.sleep(3500); // payoff：鏈上事件流水（新鑄造 + 掛單事件）
  },
};
