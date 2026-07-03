/* ══ 點雲港口背景 ══ */

export interface Background {
  repaint(): void;
  setTwinOffset(h: number): void;
}

interface Dot {
  x: number;
  y: number;
  c: string;
  cb: string;
  r: number;
}

interface Ship {
  x: number;
  y: number;
  vx: number;
  hot: boolean;
}

interface Pier {
  x: number;
  y: number;
  len: number;
}

export function initBackground(canvas: HTMLCanvasElement): Background {
  const ctx = canvas.getContext('2d')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0;
  let H = 0;
  let dots: Dot[] = [];
  let ships: Ship[] = [];
  let piers: Pier[] = [];
  let twinOffset = 0;
  let seed = 1337;

  function rnd(): number {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  function coast(x: number): number {
    return H * (0.36 + 0.14 * Math.sin(x / W * 3.6 + 1.1) + 0.05 * Math.sin(x / W * 9.1));
  }

  function build(): void {
    W = canvas.width = innerWidth * devicePixelRatio;
    H = canvas.height = innerHeight * devicePixelRatio;
    canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    dots = []; ships = []; piers = []; seed = 1337;
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * W, cy = coast(x), land = rnd() < 0.58;
      const y = land ? cy - rnd() * rnd() * H * 0.34 : cy + rnd() * rnd() * H * 0.62;
      if (y < 0 || y > H) continue;
      const a = land ? 0.10 + rnd() * 0.16 : 0.04 + rnd() * 0.10;
      dots.push({
        x, y,
        c:  land ? 'rgba(185,196,205,' + a + ')' : 'rgba(80,150,195,' + a + ')',
        cb: land ? 'rgba(195,206,215,' + Math.min(1, a * 2.1) + ')' : 'rgba(95,165,210,' + Math.min(1, a * 2.1) + ')',
        r: devicePixelRatio * (land ? 0.8 + rnd() : 0.6 + rnd() * 0.8),
      });
    }
    for (let p = 0; p < 6; p++) {
      const px = W * (0.1 + p * 0.155), py = coast(px);
      piers.push({ x: px, y: py, len: 55 * H * 0.0042 });
      for (let j = 0; j < 55; j++)
        dots.push({
          x: px + (rnd() - .5) * 16 * devicePixelRatio, y: py + j * H * 0.0042,
          c: 'rgba(200,210,220,.30)', cb: 'rgba(215,225,235,.55)', r: devicePixelRatio,
        });
      for (let g = 0; g < 26; g++)
        dots.push({
          x: px - 30 * devicePixelRatio + (g % 6) * 11 * devicePixelRatio,
          y: py - 24 * devicePixelRatio - Math.floor(g / 6) * 9 * devicePixelRatio,
          c: 'rgba(233,188,99,.20)', cb: 'rgba(233,188,99,.42)', r: devicePixelRatio * 1.1,
        });
    }
    for (let k = 0; k < 9; k++)
      ships.push({
        x: W * (0.06 + rnd() * 0.88), y: H * (0.56 + rnd() * 0.36),
        vx: (rnd() - .5) * 0.14 * devicePixelRatio, hot: k === 2,
      });
  }

  function paint(): void {
    const full = document.body.getAttribute('data-mode') === 'full';
    const dpr = devicePixelRatio;
    ctx.fillStyle = '#08111c'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      ctx.fillStyle = full ? d.cb : d.c; ctx.fillRect(d.x, d.y, d.r, d.r);
    }
    if (full) {
      ctx.font = (10 * dpr) + 'px ui-monospace,monospace';
      for (let p = 0; p < piers.length; p++) {
        ctx.fillStyle = 'rgba(255,255,255,.4)';
        ctx.fillText(String(108 + p), piers[p].x - 8 * dpr, piers[p].y + piers[p].len + 16 * dpr);
      }
    }
    const shift = twinOffset * 26 * dpr;
    for (let k = 0; k < ships.length; k++) {
      const s = ships[k];
      s.x += s.vx; if (s.x < -20) s.x = W; if (s.x > W + 20) s.x = -10;
      const sx = s.x + s.vx * shift;
      const c = s.hot ? '240,100,140' : '53,224,166';
      const rr = (full ? 2.8 : 2.2) * dpr;
      ctx.fillStyle = 'rgba(' + c + ',.28)'; ctx.fillRect(sx - 14 * dpr, s.y - 1, 12 * dpr, 2);
      ctx.shadowColor = 'rgba(' + c + ',.95)'; ctx.shadowBlur = 10 * dpr;
      ctx.fillStyle = 'rgba(' + c + ',.95)';
      ctx.beginPath(); ctx.arc(sx, s.y, rr, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      if (full && s.hot) {
        ctx.strokeStyle = 'rgba(240,100,140,.55)'; ctx.lineWidth = dpr;
        ctx.beginPath(); ctx.arc(sx, s.y, 11 * dpr, 0, 7); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.7)';
        ctx.font = (10 * dpr) + 'px ui-monospace,monospace';
        const onRight = sx > W - 200 * dpr;
        ctx.textAlign = onRight ? 'right' : 'left';
        ctx.fillText('SHIN KUANG 168', sx + (onRight ? -15 : 15) * dpr, s.y - 8 * dpr);
        ctx.textAlign = 'left';
      }
    }
  }

  function loop(): void {
    paint();
    if (!reduced) requestAnimationFrame(loop);
  }

  build();
  loop();
  addEventListener('resize', () => {
    build();
    if (reduced) paint();
  });

  return {
    repaint: paint,
    setTwinOffset(h: number) {
      twinOffset = h;
      if (reduced) paint();
    },
  };
}
