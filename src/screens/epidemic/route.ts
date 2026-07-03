/* 疫情航跡 canvas — 自基準檔 docs/preview/preview-src-v3.html 的「疫情航跡」註解段（原 drawRoute）
   逐字搬出，僅原生 JS → TS 型別化，運算/繪製邏輯不變：
     1) 深底 + 500 點雜訊（示意海面紋理）；
     2) 各港周邊陸地點群（每港 130 點，繞固定散射角 ANG 隨機甩開，地理脈絡示意，非真實地圖）；
     3) 玫瑰色虛線依序連接四港（航跡）；
     4) 港口節點：dim 純灰點；rose/amber 額外疊兩圈同心警示環（半徑 16/26），文字標籤置右上。
   座標表沿用基準檔四點百分比配置（POS）與陸地點群散射角（ANG），皆為固定站位配置，與「地理真實
   座標」無關；港名/mark 顏色改吃 ports 參數（呼叫端傳入 snapshot.ports），不再是基準檔寫死的字串。

   drawRoute(canvas, ports) 每次呼叫都重新量測畫布容器（.route）目前尺寸並整幅重繪，不做增量繪製、
   不自帶 resize 監聽——由呼叫端（index.ts）決定何時觸發重繪：show()（每次切入本頁，含首次；因
   router 快取式故尺寸相關重繪必須綁 show 而非 mount）、以及本頁 active 時的視窗 resize
   （同 dispatch/heat.ts 的 draw(t) 手法）。

   內部以固定種子（sd=99）的 Park-Miller LCG 產生「隨機」雜訊點與陸地點群，種子變數宣告在函式體內，
   故每次呼叫都從同一種子重跑——同一份 ports 資料，每次重繪視覺結果一致（非真隨機、非逐幀變動）。 */

import type { EpidemicSnapshot } from '../../data/types';

type Port = EpidemicSnapshot['ports'][number];

// 四港百分比站位（x%, y%），沿用基準檔 pts 的固定配置，按 ports 陣列索引配對（索引 0..3 對應
// 馬尼拉/香港/基隆/高雄 108）。陸地點群散射角（弧度）亦沿用基準檔 pts 內嵌的 ang 常數。
const POS: readonly [number, number][] = [
  [0.12, 0.78],
  [0.38, 0.42],
  [0.66, 0.22],
  [0.82, 0.58],
];
const ANG: readonly number[] = [2.6, 3.9, 5.2, 0.6];

const MARK_RGB: Record<Port['mark'], string> = {
  dim: '150,170,190',
  rose: '240,100,140',
  amber: '245,165,74',
};

export function drawRoute(canvas: HTMLCanvasElement, ports: EpidemicSnapshot['ports']): void {
  const rctx = canvas.getContext('2d')!;
  const r = canvas.parentElement!.getBoundingClientRect();
  const dpr = devicePixelRatio;
  canvas.width = r.width * dpr;
  canvas.height = r.height * dpr;
  const w = canvas.width;
  const h = canvas.height;

  rctx.fillStyle = 'rgba(8,17,28,.88)';
  rctx.fillRect(0, 0, w, h);

  // 固定種子 LCG：函式內區域變數，每次呼叫都重新從 99 起跑，重繪視覺穩定不閃爍。
  let sd = 99;
  function rr(): number {
    sd = (sd * 16807) % 2147483647;
    return (sd - 1) / 2147483646;
  }

  // 背景雜訊點（示意海面紋理）
  rctx.fillStyle = 'rgba(120,150,175,.10)';
  for (let i = 0; i < 500; i++) rctx.fillRect(rr() * w, rr() * h, dpr, dpr);

  const pts = ports.map((p, i) => {
    const pos = POS[i] ?? POS[POS.length - 1];
    return { x: pos[0] * w, y: pos[1] * h, name: p.name, mark: p.mark };
  });

  // 各港周邊陸地點群（地理脈絡，非真實地圖）
  pts.forEach((p, pi) => {
    const ang = ANG[pi] ?? ANG[ANG.length - 1];
    for (let d = 0; d < 130; d++) {
      const rad = (18 + rr() * rr() * 90) * dpr;
      const th = ang + (rr() - 0.5) * 1.7;
      rctx.fillStyle = `rgba(150,168,185,${(0.06 + rr() * 0.12).toFixed(3)})`;
      rctx.fillRect(p.x + Math.cos(th) * rad, p.y + Math.sin(th) * rad, dpr, dpr);
    }
  });

  // 虛線航跡：依序連接各港
  rctx.strokeStyle = 'rgba(240,100,140,.65)';
  rctx.lineWidth = 1.6 * dpr;
  rctx.setLineDash([6 * dpr, 5 * dpr]);
  rctx.beginPath();
  pts.forEach((p, i) => (i ? rctx.lineTo(p.x, p.y) : rctx.moveTo(p.x, p.y)));
  rctx.stroke();
  rctx.setLineDash([]);

  // 港口節點：rose/amber 加兩圈同心警示環（半徑 16/26），dim 僅實心點；文字標籤置右上
  pts.forEach((p) => {
    const col = MARK_RGB[p.mark];
    if (p.mark !== 'dim') {
      rctx.strokeStyle = `rgba(${col},.4)`;
      rctx.beginPath();
      rctx.arc(p.x, p.y, 16 * dpr, 0, 7);
      rctx.stroke();
      rctx.strokeStyle = `rgba(${col},.18)`;
      rctx.beginPath();
      rctx.arc(p.x, p.y, 26 * dpr, 0, 7);
      rctx.stroke();
    }
    rctx.fillStyle = `rgba(${col},.95)`;
    rctx.beginPath();
    rctx.arc(p.x, p.y, 4 * dpr, 0, 7);
    rctx.fill();
    rctx.fillStyle = 'rgba(255,255,255,.75)';
    rctx.font = `${11 * dpr}px ui-monospace`;
    rctx.fillText(p.name, p.x + 10 * dpr, p.y - 8 * dpr);
  });
}
