import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function encodePayload(payload) {
  return encodeURIComponent(JSON.stringify(payload));
}

/**
 * Render a real embedded map surface. Operational coordinates remain supplied
 * by the API; no donor address or phone number is embedded in map markup.
 * Mappls can progressively replace this surface when its official SDK/key is
 * configured. The no-key production fallback uses OpenStreetMap tiles inside
 * the application rather than redirecting the user away from RaktFlow.
 */
export function miniMapMarkup({ id, center, pins = [], title, subtitle, emptyLabel, legend = {} }) {
  if (!Number.isFinite(center?.latitude) || !Number.isFinite(center?.longitude)) return '';
  const validPins = pins
    .filter(pin => Number.isFinite(pin.latitude) && Number.isFinite(pin.longitude))
    .slice(0, 240)
    .map(pin => ({
      kind: String(pin.kind || 'place'), latitude: Number(pin.latitude), longitude: Number(pin.longitude),
      label: String(pin.label || '')
    }));
  const payload = {
    center: { latitude:Number(center.latitude), longitude:Number(center.longitude), label:String(center.label || '') },
    pins: validPins
  };
  return `<section class="card nearby-map-card"><div class="card-header"><div><h2 class="card-title">${escapeHtml(title)}</h2><p class="card-subtitle">${escapeHtml(subtitle)}</p></div><span class="badge badge-green">${validPins.length}</span></div><div id="${escapeHtml(id)}" class="embedded-map real-map" data-map-payload="${escapeHtml(encodePayload(payload))}" data-mappls-center="${payload.center.latitude},${payload.center.longitude}"><div class="map-loading"><span></span>${escapeHtml(emptyLabel)}</div></div><div class="embedded-map-summary"><span><i class="legend-user"></i>${escapeHtml(center.label || 'Your location')}</span><span><i class="legend-drive"></i>${escapeHtml(legend.drive || '')}</span><span><i class="legend-centre"></i>${escapeHtml(legend.centre || '')}</span><span><i class="legend-bank"></i>${escapeHtml(legend.bank || '')}</span><span><i class="legend-need"></i>${escapeHtml(legend.need || '')}</span></div></section>`;
}

function markerColor(kind) {
  if (kind === 'centre') return '#0f172a';
  if (kind === 'need') return '#f59e0b';
  if (kind === 'bank') return '#0b7285';
  return '#e11d48';
}

function mountLeaflet(element, payload) {
  const map = L.map(element, { zoomControl:true, attributionControl:true, preferCanvas:true })
    .setView([payload.center.latitude, payload.center.longitude], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom:18,
    attribution:'&copy; OpenStreetMap contributors'
  }).addTo(map);
  const bounds = L.latLngBounds([[payload.center.latitude, payload.center.longitude]]);
  L.circleMarker([payload.center.latitude, payload.center.longitude], {
    radius:8, color:'#ffffff', weight:3, fillColor:'#2563eb', fillOpacity:1
  }).addTo(map).bindPopup(escapeHtml(payload.center.label || 'Your location'));
  for (const pin of payload.pins) {
    bounds.extend([pin.latitude, pin.longitude]);
    L.circleMarker([pin.latitude, pin.longitude], {
      radius:8, color:'#ffffff', weight:3, fillColor:markerColor(pin.kind), fillOpacity:1
    }).addTo(map).bindPopup(escapeHtml(pin.label));
  }
  if (payload.pins.length) map.fitBounds(bounds.pad(.18), { maxZoom:13, animate:false });
  setTimeout(() => map.invalidateSize(false), 0);
}

function mountMappls(element, payload) {
  const sdk = window.mappls;
  if (!sdk?.Map) return false;
  const map = new sdk.Map(element.id, {
    center:[payload.center.latitude, payload.center.longitude], zoom:11, zoomControl:true
  });
  if (sdk.Marker) {
    new sdk.Marker({ map, position:{ lat:payload.center.latitude, lng:payload.center.longitude }, title:payload.center.label || 'Your location' });
    for (const pin of payload.pins) {
      new sdk.Marker({ map, position:{ lat:pin.latitude, lng:pin.longitude }, title:pin.label });
    }
  }
  return true;
}

/** Mount each map once after the surrounding application view is rendered. */
export function hydrateMapplsMaps() {
  for (const element of document.querySelectorAll('[data-map-payload]:not([data-map-mounted])')) {
    try {
      const payload = JSON.parse(decodeURIComponent(element.dataset.mapPayload));
      element.dataset.mapMounted = 'true';
      element.replaceChildren();
      if (!mountMappls(element, payload)) mountLeaflet(element, payload);
    } catch (error) {
      console.warn('The embedded map could not be mounted.', error);
      element.innerHTML = '<p class="embedded-map-error">Map tiles are temporarily unavailable. Nearby results remain listed below.</p>';
    }
  }
}
