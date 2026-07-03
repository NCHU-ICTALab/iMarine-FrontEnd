/* 派工熱區 — 自基準檔 docs/preview/preview-src-v3.html 的「派工熱區」註解段（原 drawHeat/
   heatVal/heatColor/hcoast）逐字搬出，僅原生 JS → TS 型別化，運算/繪製邏輯不變。
   heatVal(gx,gy,t) 為兩個高斯熱點疊加（示意用假資料，隨 t 沿海岸線斜向平移＋輕微時間擾動）；
   hcoast(gx) 給出海岸線所在的 grid-y 列（正弦曲線，非真實地理座標），一詞兩用：
     1) 沿 0..1 掃描畫出陸地帶／海岸線輪廓 + 5 座突堤（地理脈絡）；
     2) 判斷每個網格 (gx,gy) 的格心是否在陸地帶內（gy+0.5 < hcoast(gx+0.5)），是則整格跳過不繪，
        確保降雨機率格僅畫在海面。
   draw(t) 每次呼叫都重新量測畫布容器（.heatbox）目前尺寸並整幅重繪，不做增量繪製、不自帶
   resize 監聽——由呼叫端（index.ts）決定何時觸發重繪：slider input（拖曳）、show()（每次切入本頁，
   含首次；因 router 快取式故尺寸相關重繪必須綁 show 而非 mount）、以及本頁 active 時的視窗 resize。 */

const GX = 26;
const GY = 15;

function heatVal(gx: number, gy: number, t: number): number {
  const cx = 5 + (t / 90) * 16;
  const cyy = 4 + (t / 90) * 6;
  const d2 = ((gx - cx) * (gx - cx)) / 34 + ((gy - cyy) * (gy - cyy)) / 14;
  const v = Math.exp(-d2) * (0.55 + 0.45 * Math.sin((t / 90) * 3 + gx * 0.2));
  const d2b = ((gx - cx + 7) * (gx - cx + 7)) / 50 + ((gy - cyy - 3) * (gy - cyy - 3)) / 20;
  return Math.min(1, v + Math.exp(-d2b) * 0.5);
}

function heatColor(v: number): string {
  if (v < 0.25) return `rgba(53,224,166,${v * 0.9})`;
  if (v < 0.5) return `rgba(233,188,99,${0.25 + v * 0.5})`;
  if (v < 0.75) return `rgba(245,165,74,${0.3 + v * 0.5})`;
  return `rgba(240,100,140,${0.35 + v * 0.5})`;
}

function hcoast(gx: number): number {
  return 3.4 + 1.6 * Math.sin((gx / GX) * 5 + 1);
}

export function initHeat(canvas: HTMLCanvasElement): { draw(t: number): void } {
  const hctx = canvas.getContext('2d')!;

  function draw(t: number): void {
    const r = canvas.parentElement!.getBoundingClientRect();
    const dpr = devicePixelRatio;
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    const cw = canvas.width / GX;
    const ch = canvas.height / GY;

    hctx.fillStyle = 'rgba(8,17,28,.88)';
    hctx.fillRect(0, 0, canvas.width, canvas.height);

    // 陸地帶 + 海岸線 + 突堤（地理脈絡）
    hctx.beginPath();
    hctx.moveTo(0, 0);
    for (let u = 0; u <= 1.001; u += 0.02) hctx.lineTo(u * canvas.width, hcoast(u * GX) * ch);
    hctx.lineTo(canvas.width, 0);
    hctx.closePath();
    hctx.fillStyle = 'rgba(30,40,50,.85)';
    hctx.fill();
    hctx.strokeStyle = 'rgba(170,190,205,.4)';
    hctx.lineWidth = dpr;
    hctx.stroke();
    for (let p = 0; p < 5; p++) {
      const px = (0.12 + p * 0.19) * canvas.width;
      const py = hcoast((px / canvas.width) * GX) * ch;
      hctx.fillStyle = 'rgba(190,200,210,.45)';
      hctx.fillRect(px - 2.5 * dpr, py, 5 * dpr, 0.14 * canvas.height);
    }

    // 機率網格（僅海上：格心落在陸地帶內就整格跳過）
    hctx.strokeStyle = 'rgba(255,255,255,.05)';
    for (let gx = 0; gx < GX; gx++) {
      for (let gy = 0; gy < GY; gy++) {
        if (gy + 0.5 < hcoast(gx + 0.5)) continue;
        const v = heatVal(gx, gy, t);
        if (v > 0.06) {
          hctx.fillStyle = heatColor(v);
          hctx.fillRect(gx * cw + 1, gy * ch + 1, cw - 2, ch - 2);
        } else {
          hctx.strokeRect(gx * cw + 0.5, gy * ch + 0.5, cw - 1, ch - 1);
        }
      }
    }
  }

  return { draw };
}
