/* 總覽迷你地圖 — 自基準檔 docs/preview/preview-src-v3.html 的「總覽迷你地圖」區段搬出。
   繪陸地／突堤＋泊位編號 108-113／航道／錨區／移動船點。
   rAF 迴圈自管：只在 start() 之後才繪製與迴圈，stop() 取消；
   prefers-reduced-motion 時 start() 只畫單一幀，不進入迴圈（呼叫端 show()/hide() 決定何時開關）。 */
import { prefersReduced } from '../settings/storage';

interface OvShip {
  u: number; // 0–1 沿航道方向的位置
  v: number; // 0–1 垂直位置
  s: number; // 每幀位移速度（含方向）
  hot: boolean; // 焦點船（顯示為警示色）
}

export function initOvMap(canvas: HTMLCanvasElement): { start(): void; stop(): void } {
  const ctx = canvas.getContext('2d')!;
  const reduced = prefersReduced();

  let seed = 77;
  function rnd(): number {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  const ships: OvShip[] = [];
  for (let q = 0; q < 8; q++) {
    ships.push({ u: rnd(), v: 0.45 + rnd() * 0.45, s: (rnd() - 0.5) * 0.0012, hot: q === 5 });
  }

  function coast(u: number): number {
    return 0.3 + 0.09 * Math.sin(u * 5.2 + 0.8) + 0.04 * Math.sin(u * 11);
  }

  function paint(): void {
    const r = canvas.parentElement!.getBoundingClientRect();
    if (r.width === 0) return;
    const dpr = devicePixelRatio;
    if (canvas.width !== ((r.width * dpr) | 0)) {
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
    }
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#08131f';
    ctx.fillRect(0, 0, w, h);

    // 陸地
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let u = 0; u <= 1.001; u += 0.02) ctx.lineTo(u * w, coast(u) * h);
    ctx.lineTo(w, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(26,36,46,.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,180,195,.35)';
    ctx.lineWidth = dpr;
    ctx.stroke();

    // 突堤與泊位編號
    ctx.font = 10 * dpr + 'px ui-monospace,monospace';
    for (let p = 0; p < 6; p++) {
      const px = (0.09 + p * 0.16) * w;
      const py = coast(px / w) * h;
      const pl = 0.13 * h;
      ctx.fillStyle = 'rgba(190,200,210,.5)';
      ctx.fillRect(px - 3 * dpr, py, 6 * dpr, pl);
      ctx.fillStyle = 'rgba(255,255,255,.42)';
      ctx.fillText(String(108 + p), px - 8 * dpr, py + pl + 13 * dpr);
    }

    // 航道
    ctx.setLineDash([7 * dpr, 7 * dpr]);
    ctx.strokeStyle = 'rgba(56,189,248,.28)';
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.moveTo(0.02 * w, 0.82 * h);
    ctx.lineTo(0.98 * w, 0.62 * h);
    ctx.stroke();
    ctx.setLineDash([]);

    // 錨區
    ctx.strokeStyle = 'rgba(233,188,99,.3)';
    ctx.setLineDash([4 * dpr, 5 * dpr]);
    ctx.beginPath();
    ctx.arc(0.86 * w, 0.84 * h, 0.075 * h, 0, 7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(233,188,99,.5)';
    ctx.fillText('錨區', 0.83 * w, 0.845 * h);

    // 船舶
    for (const sh of ships) {
      sh.u += sh.s;
      if (sh.u > 1.05) sh.u = -0.05;
      if (sh.u < -0.05) sh.u = 1.05;
      const sx = sh.u * w;
      const sy = sh.v * h;
      const c = sh.hot ? '240,100,140' : '53,224,166';
      const dir = Math.sign(sh.s || 1);
      ctx.fillStyle = 'rgba(' + c + ',.3)';
      ctx.fillRect(sx - 11 * dpr * dir, sy - dpr / 2, 10 * dpr * dir, dpr);
      ctx.shadowColor = 'rgba(' + c + ',.9)';
      ctx.shadowBlur = 8 * dpr;
      ctx.fillStyle = 'rgba(' + c + ',.95)';
      ctx.beginPath();
      ctx.arc(sx, sy, 2.4 * dpr, 0, 7);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  let raf = 0;
  function loop(): void {
    paint();
    if (!reduced) raf = requestAnimationFrame(loop);
  }

  return {
    start() {
      if (reduced) {
        paint(); // 單幀，不迴圈
        return;
      }
      if (raf) return; // 已在跑，避免重入造成多條 rAF 鏈
      raf = requestAnimationFrame(loop);
    },
    stop() {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
  };
}
