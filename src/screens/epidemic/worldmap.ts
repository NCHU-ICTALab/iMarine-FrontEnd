/* Mapbox 真實地圖 — 逐字轉錄 docs/preview/preview-epidemic-redesign.html 的
   PORTS/initMap/renderMap/updateShip/shipLonLatAt（該 preview 已 headless 驗證過行為）。
   CDN→npm 差異：import mapbox-gl 模組 + 其 CSS（非 <script src> 全域 mapboxgl）；
   token 讀法：系統設定的 frontend.mapboxToken 優先，其次 (import.meta as any).env?.，
   規避 vite/client 未宣告自訂 env 鍵的型別問題；無 token（或非 pk. 開頭）→ 容器內顯示
   降級提示卡，ready 恆 false，其餘方法皆 no-op（不拋錯，維持頁面可用）。 */
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { EpidemicVessel } from '../../data/types';
import type { Hit } from './correlate';
import { getSetting } from '../settings/storage';

export const PORT_COORDS: Record<string, [number, number]> = {
  高雄: [120.3, 22.61],
  香港: [114.17, 22.3],
  馬尼拉: [120.97, 14.58],
  釜山: [129.04, 35.1],
  新加坡: [103.85, 1.29],
  馬六甲: [102.25, 2.19],
  那霸: [127.68, 26.21],
  廈門: [118.08, 24.48],
  // epidemic live provider（MOTC×aisstream 串聯）會出現的其餘真實港
  基隆: [121.74, 25.13],
  台中: [120.52, 24.29],
  深圳: [114.06, 22.53],
  仁川: [126.6, 37.45],
  東京: [139.78, 35.62],
  橫濱: [139.66, 35.45],
  神戶: [135.2, 34.68],
  林查班: [100.88, 13.08],
  雅加達: [106.88, -6.1],
};

export function shipLonLatAt(v: EpidemicVessel, day: number): [number, number] {
  const wp = v.ports.map((p) => ({ d: (p.dayIn + p.dayOut) / 2, c: PORT_COORDS[p.name] }));
  if (day <= wp[0].d) return wp[0].c;
  if (day >= wp[wp.length - 1].d) return wp[wp.length - 1].c;
  for (let i = 0; i < wp.length - 1; i++) {
    if (day >= wp[i].d && day <= wp[i + 1].d) {
      const t = (day - wp[i].d) / ((wp[i + 1].d - wp[i].d) || 1);
      return [wp[i].c[0] + (wp[i + 1].c[0] - wp[i].c[0]) * t, wp[i].c[1] + (wp[i + 1].c[1] - wp[i].c[1]) * t];
    }
  }
  return wp[0].c;
}

export interface WorldMap {
  renderVessel(v: EpidemicVessel, hits: Hit[]): void;
  setShipAt(v: EpidemicVessel, day: number): void;
  resize(): void;
  readonly ready: boolean;
}

const FALLBACK_HTML =
  '<div class="mapfallback" style="display:flex">Mapbox 地圖需要 access token' +
  '<br>把公開 token（<code>pk.…</code>）填入系統設定的「地圖服務」或 <code>.env</code> 的 <code>VITE_MAPBOX_TOKEN</code></div>';

export function createWorldMap(container: HTMLElement, onReady: () => void): WorldMap {
  const token: string | undefined =
    getSetting('frontend.mapboxToken', '') || (import.meta as any).env?.VITE_MAPBOX_TOKEN;
  const hasToken = !!token && token.indexOf('pk.') === 0;

  if (!hasToken) {
    container.innerHTML = FALLBACK_HTML;
    return {
      renderVessel() {},
      setShipAt() {},
      resize() {},
      ready: false,
    };
  }

  container.innerHTML = ''; // Mapbox 要求容器淨空（preview 已驗證的坑）
  mapboxgl.accessToken = token;
  const map = new mapboxgl.Map({
    container,
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [118, 20],
    zoom: 3.1,
    attributionControl: false,
  });

  let ready = false;
  let portMarkers: mapboxgl.Marker[] = [];
  let shipMarker: mapboxgl.Marker | null = null;

  map.on('load', () => {
    map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'route-l', type: 'line', source: 'route',
      paint: { 'line-color': '#7FB4FF', 'line-width': 2, 'line-dasharray': [2, 1.5], 'line-opacity': 0.85 },
    });
    map.addSource('hotspots', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'hot-glow', type: 'circle', source: 'hotspots',
      paint: { 'circle-radius': ['get', 'r'], 'circle-color': ['get', 'c'], 'circle-blur': 1, 'circle-opacity': 0.5 },
    });
    map.addSource('trail', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'trail-l', type: 'circle', source: 'trail',
      paint: { 'circle-radius': 3, 'circle-color': '#38BDF8', 'circle-opacity': ['get', 'o'] },
    });
    const shipEl = document.createElement('div');
    shipEl.className = 'mk-ship';
    shipMarker = new mapboxgl.Marker({ element: shipEl, anchor: 'center' }).setLngLat([120.3, 22.6]).addTo(map);
    ready = true;
    onReady();
  });

  function clearPortMarkers(): void {
    portMarkers.forEach((m) => m.remove());
    portMarkers = [];
  }

  function updateShip(v: EpidemicVessel, day: number): void {
    if (!ready || !shipMarker) return;
    shipMarker.setLngLat(shipLonLatAt(v, day));
    (map.getSource('trail') as mapboxgl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: [1, 2, 3, 4].map((k) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: shipLonLatAt(v, day - k * 0.6) },
        properties: { o: 0.3 - k * 0.06 },
      })),
    });
  }

  return {
    get ready() {
      return ready;
    },
    renderVessel(v, hits) {
      if (!ready) return;
      const hitPorts: Record<string, 'rose' | 'amber'> = {};
      hits.forEach((h) => {
        hitPorts[h.port] = h.type;
      });

      (map.getSource('route') as mapboxgl.GeoJSONSource).setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: v.ports.map((p) => PORT_COORDS[p.name]) },
      });

      (map.getSource('hotspots') as mapboxgl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: v.events.map((e) => {
          const rose = hits.find((x) => x.eventId === e.id && x.type === 'rose');
          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: PORT_COORDS[e.port] },
            properties: { r: rose ? 26 : 16, c: rose ? '#F0648C' : '#F5A54A' },
          };
        }),
      });

      clearPortMarkers();
      v.ports.forEach((p) => {
        const type = hitPorts[p.name];
        const isKhh = p.name === '高雄';
        const col = type === 'rose' ? '#F0648C' : type === 'amber' ? '#F5A54A' : isKhh ? '#35E0A6' : '#9fb0c3';
        const el = document.createElement('div');
        el.className = 'mk-port';
        el.style.background = col;
        if (type || isKhh) el.style.boxShadow = '0 0 10px ' + col;
        const lab = document.createElement('span');
        lab.className = 'l';
        lab.style.color = type ? col : isKhh ? '#35E0A6' : '#c3d0de';
        lab.textContent = p.name + (type === 'rose' ? ' ⚠' : '') + (isKhh ? '（目的港）' : '');
        el.appendChild(lab);
        portMarkers.push(new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat(PORT_COORDS[p.name]).addTo(map));
      });

      // 末站（高雄）dayOut = 這批資料的「現在」（timeRange.now，本頁所有船皆於同一天抵達）；
      // renderVessel 介面不帶 day 參數，故由末站日期反推，行為對齊 preview 的 cursorDay=TR.now。
      updateShip(v, v.ports[v.ports.length - 1].dayOut);

      const b = new mapboxgl.LngLatBounds();
      v.ports.forEach((p) => b.extend(PORT_COORDS[p.name]));
      map.fitBounds(b, { padding: { top: 60, bottom: 60, left: 70, right: 70 }, duration: 700, maxZoom: 6.5 });
    },
    setShipAt(v, day) {
      updateShip(v, day);
    },
    resize() {
      // map 物件在 new mapboxgl.Map() 當下即同步建立（'load' 事件只影響 source/layer 是否就緒），
      // 容器由 display:none 變 active 後尺寸才確定，resize() 不必等 ready，否則首次 show() 會漏 resize。
      map.resize();
    },
  };
}
