/* Mapbox 真實地圖 — 逐字轉錄 docs/preview/preview-alert-redesign.html（v2）的
   initMap/setFence/litCells/ripple/renderMap（該 preview 已 headless 驗證過行為）。
   CDN→npm 差異：import mapbox-gl 模組 + 其 CSS（非 <script src> 全域 mapboxgl）；
   token 讀法：系統設定的 frontend.mapboxToken 優先，其次 (import.meta as any).env?.，
   規避 vite/client 未宣告自訂 env 鍵的型別問題；無 token（或非 pk. 開頭）→ 容器內顯示
   降級提示卡，ready 恆 false，其餘方法皆 no-op（不拋錯，維持頁面可用）。
   注意：不可對 marker 根元素（.cellwrap/pdot/ripple 的 wrapper）設 position——會蓋掉
   .mapboxgl-marker{position:absolute} 造成 marker 落回文件流、逐顆累積偏移（alert.css 已有
   同一條註解）；cell 的六邊形視覺放在 .cellwrap 內層 .cell，wrapper 本身不設 position。 */
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { AlertEvent, AlertCell } from '../../data/types';
import { getSetting, prefersReduced } from '../settings/storage';

export interface BroadcastMap {
  renderEvent(ev: AlertEvent | null): void;
  litCells(ids: string[], stagger: boolean): number;
  ripple(lngLat: [number, number]): void;
  resize(): void;
  stop(): void;
  readonly ready: boolean;
}

const FALLBACK_HTML =
  '<div class="mapfallback" style="display:flex">Mapbox 地圖需要 access token' +
  '<br>把公開 token（<code>pk.…</code>）填入系統設定的「地圖服務」或 <code>.env</code> 的 <code>VITE_MAPBOX_TOKEN</code></div>';

export function createBroadcastMap(
  container: HTMLElement,
  cells: AlertCell[],
  onReady: () => void,
): BroadcastMap {
  const token: string | undefined =
    getSetting('frontend.mapboxToken', '') || (import.meta as any).env?.VITE_MAPBOX_TOKEN;
  const hasToken = !!token && token.indexOf('pk.') === 0;

  if (!hasToken) {
    container.innerHTML = FALLBACK_HTML;
    return {
      renderEvent() {},
      litCells() {
        return 0;
      },
      ripple() {},
      resize() {},
      stop() {},
      ready: false,
    };
  }

  container.innerHTML = ''; // Mapbox 要求容器淨空（preview 已驗證的坑）
  mapboxgl.accessToken = token;
  const map = new mapboxgl.Map({
    container,
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [120.308, 22.585],
    zoom: 12.15,
    attributionControl: false,
  });

  let ready = false;
  const cellMk: Record<string, HTMLDivElement> = {};
  let dotMk: mapboxgl.Marker | null = null;
  let fenceBreath: ReturnType<typeof setInterval> | null = null;
  let litTimers: ReturnType<typeof setTimeout>[] = [];

  function clearLitTimers(): void {
    litTimers.forEach((t) => clearTimeout(t));
    litTimers = [];
  }

  map.on('load', () => {
    map.addSource('fence', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'fence-f', type: 'fill', source: 'fence',
      paint: { 'fill-color': '#FF7A59', 'fill-opacity': 0.1 },
    });
    map.addLayer({
      id: 'fence-l', type: 'line', source: 'fence',
      paint: { 'line-color': '#FF7A59', 'line-width': 1.6, 'line-opacity': 0.8, 'line-dasharray': [3, 2] },
    });
    cells.forEach((c) => {
      const w = document.createElement('div');
      w.className = 'cellwrap';
      w.innerHTML =
        '<div class="cell"></div>' +
        `<div class="tip"><b style="font-family:var(--mono)">${c.id}</b> · 送達 <b>${c.delivered}</b> 支</div>`;
      cellMk[c.id] = w;
      new mapboxgl.Marker({ element: w, anchor: 'center' }).setLngLat(c.lngLat).addTo(map);
    });
    const d = document.createElement('div');
    d.className = 'pdot';
    d.style.display = 'none';
    dotMk = new mapboxgl.Marker({ element: d, anchor: 'center' }).setLngLat([120.3, 22.59]).addTo(map);
    ready = true;
    if (import.meta.env.DEV) {
      (window as unknown as { __alertMap?: unknown }).__alertMap = map; // DEV-only 驗證鉤（import.meta.env.DEV 保證不進 production build），同 dispatch __dispatchForceUpdate 慣例
    }
    onReady();
  });

  function setFence(ev: AlertEvent | null): void {
    if (!ready) return;
    (map.getSource('fence') as mapboxgl.GeoJSONSource).setData(
      ev
        ? { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...ev.fence, ev.fence[0]]] }, properties: {} }
        : { type: 'FeatureCollection', features: [] },
    );
    if (fenceBreath) clearInterval(fenceBreath);
    fenceBreath = null;
    if (ev && !prefersReduced()) {
      let t = 0;
      fenceBreath = setInterval(() => {
        t += 0.14;
        map.setPaintProperty('fence-l', 'line-opacity', 0.55 + Math.sin(t) * 0.3);
      }, 120);
    }
  }

  function litCells(ids: string[], stagger: boolean): number {
    clearLitTimers();
    Object.values(cellMk).forEach((w) => w.classList.remove('lit'));
    if (!stagger || prefersReduced()) {
      ids.forEach((id) => cellMk[id]?.classList.add('lit'));
      return 0;
    }
    ids.forEach((id, i) => {
      litTimers.push(
        setTimeout(() => {
          cellMk[id]?.classList.add('lit');
        }, i * 110),
      );
    });
    return ids.length * 110;
  }

  function ripple(lngLat: [number, number]): void {
    if (!ready || prefersReduced()) return;
    for (let k = 0; k < 3; k++) {
      setTimeout(() => {
        const r = document.createElement('div');
        r.className = 'ripple act';
        const mk = new mapboxgl.Marker({ element: r, anchor: 'center' }).setLngLat(lngLat).addTo(map);
        setTimeout(() => mk.remove(), 1600);
      }, k * 380);
    }
  }

  function renderEvent(ev: AlertEvent | null): void {
    if (!ready) return;
    setFence(ev);
    litCells(ev ? ev.cellsLit : [], false); // 內部先清舊 stagger timer 再點亮（取消進行中的殘留）
    if (ev) {
      dotMk!.getElement().style.display = '';
      dotMk!.setLngLat(ev.lngLat);
      const b = new mapboxgl.LngLatBounds();
      ev.fence.forEach((p) => b.extend(p));
      cells.forEach((c) => {
        if (ev.cellsLit.includes(c.id)) b.extend(c.lngLat);
      });
      map.fitBounds(b, { padding: 90, duration: prefersReduced() ? 0 : 700, maxZoom: 13.6 });
    } else {
      dotMk!.getElement().style.display = 'none';
    }
  }

  return {
    get ready() {
      return ready;
    },
    renderEvent,
    litCells,
    ripple,
    resize() {
      // map 物件在 new mapboxgl.Map() 當下即同步建立（'load' 事件只影響 source/layer 是否就緒），
      // 容器由 display:none 變 active 後尺寸才確定，resize() 不必等 ready，否則首次 show() 會漏 resize。
      map.resize();
    },
    stop() {
      // 切頁隱藏時停掉圍欄呼吸 interval + 未觸發的 cell stagger timer（不清視覺，留給下次 select 重繪）。
      if (fenceBreath) clearInterval(fenceBreath);
      fenceBreath = null;
      clearLitTimers();
    },
  };
}
