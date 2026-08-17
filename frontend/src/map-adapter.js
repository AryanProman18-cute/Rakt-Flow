function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function position(center, point) {
  const latitudeDelta = Math.max(-.8, Math.min(.8, Number(point.latitude) - Number(center.latitude)));
  const longitudeDelta = Math.max(-.8, Math.min(.8, Number(point.longitude) - Number(center.longitude)));
  return {
    x: Math.max(7, Math.min(93, 50 + longitudeDelta * 52)),
    y: Math.max(8, Math.min(92, 50 - latitudeDelta * 52))
  };
}

/**
 * A network-free map surface for the PWA and file preview. Its data attributes
 * are also consumed by hydrateMapplsMaps when a deployment loads the official
 * Mappls browser SDK using its own client-side map key.
 */
export function miniMapMarkup({ id, center, pins = [], title, subtitle, emptyLabel, legend = {} }) {
  if (!Number.isFinite(center?.latitude) || !Number.isFinite(center?.longitude)) return '';
  const validPins = pins.filter(pin => Number.isFinite(pin.latitude) && Number.isFinite(pin.longitude)).slice(0, 40);
  return `<section class="card nearby-map-card"><div class="card-header"><div><h2 class="card-title">${escapeHtml(title)}</h2><p class="card-subtitle">${escapeHtml(subtitle)}</p></div><span class="badge badge-green">${validPins.length}</span></div><div id="${escapeHtml(id)}" class="embedded-map" data-mappls-center="${center.latitude},${center.longitude}"><div class="embedded-map-grid"></div><span class="embedded-user-pin" style="--x:50%;--y:50%" title="${escapeHtml(center.label || '')}"></span>${validPins.map(pin => {
    const point = position(center, pin);
    return `<button type="button" class="embedded-place-pin pin-${escapeHtml(pin.kind || 'place')}" style="--x:${point.x}%;--y:${point.y}%" title="${escapeHtml(pin.label)}" aria-label="${escapeHtml(pin.label)}"><span></span></button>`;
  }).join('')}${validPins.length ? '' : `<p class="embedded-map-empty">${escapeHtml(emptyLabel)}</p>`}<div class="embedded-map-legend"><span><i class="legend-drive"></i>${escapeHtml(legend.drive || '')}</span><span><i class="legend-centre"></i>${escapeHtml(legend.centre || '')}</span><span><i class="legend-need"></i>${escapeHtml(legend.need || '')}</span></div></div></section>`;
}

/**
 * Optional Mappls adapter. RaktFlow does not ship or expose a map key. A
 * deployment may load the official SDK and this progressively upgrades each
 * embedded fallback without changing operational API payloads.
 */
export function hydrateMapplsMaps() {
  const sdk = window.mappls;
  if (!sdk?.Map) return;
  for (const element of document.querySelectorAll('[data-mappls-center]:not([data-mappls-mounted])')) {
    const [latitude, longitude] = element.dataset.mapplsCenter.split(',').map(Number);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    try {
      element.dataset.mapplsMounted = 'true';
      element.replaceChildren();
      new sdk.Map(element.id, { center: [latitude, longitude], zoom: 11, zoomControl: true });
    } catch (error) {
      console.warn('Mappls progressive enhancement was unavailable.', error);
      delete element.dataset.mapplsMounted;
    }
  }
}
