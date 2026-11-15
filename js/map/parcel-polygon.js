/**
 * Parcel polygon drawing and management module for AgroSmart.
 *
 * Implements native Leaflet polygon tracing:
 * 1. Default sample parcel polygon matching the reference image.
 * 2. Visual polygon across all layer views (Oscuro, Satélite, Topográfico).
 * 3. Interactive drawing mode without external plugin conflicts.
 * 4. Card popup with "Zoom to", surface area in hectares, centroid, and confirmation action.
 */

const POLYGON_STYLE = {
  color: '#00d4ff',
  weight: 2.8,
  opacity: 1,
  fillColor: '#00d4ff',
  fillOpacity: 0.22
};

const POLYGON_HOVER_STYLE = {
  color: '#38bdf8',
  weight: 3.8,
  fillOpacity: 0.35
};

// Visible sample parcel polygon in the Andahuaylas valley
const DEFAULT_SAMPLE_POLYGON = [
  [-13.6460, -73.3930],
  [-13.6440, -73.3810],
  [-13.6570, -73.3800],
  [-13.6610, -73.3880],
  [-13.6530, -73.3960]
];

export function normalizePoints(input) {
  if (!Array.isArray(input)) return [];
  let list = input;
  if (Array.isArray(list[0]) && list.length === 1) {
    list = list[0];
  } else if (Array.isArray(list[0]) && typeof list[0][0] === 'object') {
    list = list[0];
  }

  return list.map((item) => {
    if (item && typeof item.lat === 'number') return { lat: item.lat, lng: item.lng };
    if (Array.isArray(item) && item.length >= 2) return { lat: item[0], lng: item[1] };
    return item;
  });
}

const EARTH_RADIUS = 6371000;
const DEGENERATE_AREA_M2 = 1e-6;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

function averageVertices(flat) {
  return {
    lat: flat.reduce((sum, p) => sum + p.lat, 0) / flat.length,
    lng: flat.reduce((sum, p) => sum + p.lng, 0) / flat.length
  };
}

export function centroid(latlngs) {
  const flat = normalizePoints(latlngs);
  if (flat.length === 0) return { lat: 0, lng: 0 };

  const mean = averageVertices(flat);
  if (flat.length < 3) return mean;

  // Local equirectangular projection keeps the shoelace math in metres.
  const cosLat = Math.cos(toRadians(mean.lat));
  const points = flat.map((p) => ({
    x: toRadians(p.lng) * cosLat * EARTH_RADIUS,
    y: toRadians(p.lat) * EARTH_RADIUS
  }));

  let doubleArea = 0;
  let weightedX = 0;
  let weightedY = 0;

  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;

    doubleArea += cross;
    weightedX += (current.x + next.x) * cross;
    weightedY += (current.y + next.y) * cross;
  }

  const area = doubleArea / 2;
  if (Math.abs(area) < DEGENERATE_AREA_M2) return mean;

  const centerX = weightedX / (6 * area);
  const centerY = weightedY / (6 * area);

  return {
    lat: (centerY / EARTH_RADIUS) * (180 / Math.PI),
    lng: (centerX / (cosLat * EARTH_RADIUS)) * (180 / Math.PI)
  };
}

export function areaHa(latlngs) {
  const flat = normalizePoints(latlngs);
  if (flat.length < 3) return 0;

  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;

  const midLat = flat.reduce((s, p) => s + p.lat, 0) / flat.length;
  const cosLat = Math.cos(toRad(midLat));

  let area = 0;
  for (let i = 0, j = flat.length - 1; i < flat.length; j = i++) {
    const xi = toRad(flat[i].lng) * cosLat * R;
    const yi = toRad(flat[i].lat) * R;
    const xj = toRad(flat[j].lng) * cosLat * R;
    const yj = toRad(flat[j].lat) * R;
    area += xi * yj - xj * yi;
  }
  return Math.abs(area / 2) / 10000;
}

function formatArea(ha) {
  if (ha < 0.01) return `${Math.round(ha * 10000)} m²`;
  if (ha < 10) return `${ha.toFixed(2)} ha`;
  return `${ha.toFixed(1)} ha`;
}

function buildPopupHtml({ place, center, ha, vertexCount, onUseParcel, onZoomTo }) {
  const useId = `use_parcel_${Math.random().toString(36).slice(2, 9)}`;
  const zoomId = `zoom_parcel_${Math.random().toString(36).slice(2, 9)}`;

  window[useId] = onUseParcel;
  window[zoomId] = onZoomTo;

  return `
    <div class="parcel-popup">
      <div class="pp-toolbar">
        <button type="button" class="pp-btn-zoom" onclick="window['${zoomId}']();">
          🔍 Zoom to
        </button>
      </div>

      <div class="pp-header">
        <span class="pp-icon">🌾</span>
        <div>
          <div class="pp-title">Parcela AgroSmart</div>
          <div class="pp-sub">Polígono delimitado para análisis</div>
        </div>
      </div>

      ${place ? `<div class="pp-place">📍 ${place}</div>` : ''}

      <div class="pp-grid">
        <div class="pp-row">
          <span class="pp-label">Superficie estimada</span>
          <span class="pp-value pp-area">${formatArea(ha)}</span>
        </div>
        <div class="pp-row">
          <span class="pp-label">Centroide Lat / Lon</span>
          <span class="pp-value">${center.lat.toFixed(4)}°, ${center.lng.toFixed(4)}°</span>
        </div>
        <div class="pp-row">
          <span class="pp-label">Vértices del polígono</span>
          <span class="pp-value">${vertexCount} puntos</span>
        </div>
        <div class="pp-row">
          <span class="pp-label">Resolución Satélite</span>
          <span class="pp-value">~50 km (NASA POWER)</span>
        </div>
      </div>

      <button type="button" class="pp-btn-use" onclick="window['${useId}']();">
        ✅ Usar esta parcela para clima y rotación
      </button>
      <div class="pp-hint">Calcula clima y rotaciones para las coordenadas del centroide.</div>
    </div>
  `;
}

export function initParcelPolygon(map, { onPolygonComplete, initialPlace = 'Andahuaylas' } = {}) {
  const drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);

  let currentPolygonLayer = null;
  let previousPolygonLatlngs = null;
  let isDrawing = false;
  let drawPoints = [];
  let tempPolyline = null;
  let tempVertexMarkers = [];

  const getCurrentPolygonLatlngs = () => {
    if (!currentPolygonLayer) return null;
    const flat = normalizePoints(currentPolygonLayer.getLatLngs());
    if (flat.length < 3) return null;
    return flat.map((p) => [p.lat, p.lng]);
  };

  const bindLayerPopup = (layer) => {
    const latlngs = layer.getLatLngs();
    const flat = normalizePoints(latlngs);
    const center = centroid(flat);
    const ha = areaHa(latlngs);

    const popupHtml = buildPopupHtml({
      place: initialPlace,
      center,
      ha,
      vertexCount: flat.length,
      onZoomTo: () => {
        map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 16 });
      },
      onUseParcel: () => {
        layer.closePopup();
        if (typeof onPolygonComplete === 'function') {
          onPolygonComplete({
            lat: center.lat,
            lng: center.lng,
            latlngs: flat.map((p) => [p.lat, p.lng]),
            ha
          });
        }
      }
    });

    layer.bindPopup(popupHtml, {
      maxWidth: 280,
      className: 'parcel-popup-wrapper'
    });
  };

  const setPolygon = (latlngs, shouldOpenPopup = false) => {
    drawnItems.clearLayers();

    currentPolygonLayer = L.polygon(latlngs, POLYGON_STYLE);
    currentPolygonLayer.on('mouseover', () => currentPolygonLayer.setStyle(POLYGON_HOVER_STYLE));
    currentPolygonLayer.on('mouseout', () => currentPolygonLayer.setStyle(POLYGON_STYLE));

    drawnItems.addLayer(currentPolygonLayer);
    bindLayerPopup(currentPolygonLayer);

    const center = centroid(latlngs);
    if (shouldOpenPopup) {
      currentPolygonLayer.openPopup(center);
    }
    return currentPolygonLayer;
  };

  // 1. Pre-delimit initial sample parcel matching reference
  setPolygon(DEFAULT_SAMPLE_POLYGON, true);

  // 2. Interactive native drawing system
  const hintBanner = document.getElementById('map-draw-hint');

  const updateHint = (text, showFinish = false) => {
    if (!hintBanner) return;
    hintBanner.classList.add('visible');
    hintBanner.innerHTML = `
      <span>${text}</span>
      <div style="display:inline-flex; flex-wrap:wrap; justify-content:center; gap:6px;">
        ${showFinish ? '<button type="button" id="btn-draw-finish" class="btn btn-primary" style="margin:0; padding:4px 10px; font-size:10px; width:auto;">✅ Finalizar</button>' : ''}
        <button type="button" id="btn-draw-cancel" class="btn btn-secondary" style="margin:0; padding:4px 10px; font-size:10px; width:auto; border-color:#ef4444; color:#ef4444;">✕ Cancelar</button>
      </div>
    `;

    document.getElementById('btn-draw-finish')?.addEventListener('click', (e) => {
      e.stopPropagation();
      finishDrawing();
    });
    document.getElementById('btn-draw-cancel')?.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelDrawing();
    });
  };

  const finishDrawing = () => {
    if (drawPoints.length < 3) {
      alert('Debes marcar al menos 3 puntos en el mapa para formar una parcela.');
      return;
    }

    const finalPoints = [...drawPoints];
    cleanupTempDraw();
    previousPolygonLatlngs = null;

    const layer = setPolygon(finalPoints, true);
    map.fitBounds(layer.getBounds(), { padding: [40, 40] });

    const center = centroid(finalPoints);
    const ha = areaHa(finalPoints);

    if (typeof onPolygonComplete === 'function') {
      onPolygonComplete({
        lat: center.lat,
        lng: center.lng,
        latlngs: finalPoints,
        ha
      });
    }
  };

  const cancelDrawing = () => {
    cleanupTempDraw();
    if (previousPolygonLatlngs && previousPolygonLatlngs.length >= 3) {
      setPolygon(previousPolygonLatlngs, false);
    }
    previousPolygonLatlngs = null;
  };

  const cleanupTempDraw = () => {
    isDrawing = false;
    map.getContainer().style.cursor = '';
    hintBanner?.classList.remove('visible');

    if (tempPolyline) {
      map.removeLayer(tempPolyline);
      tempPolyline = null;
    }
    tempVertexMarkers.forEach((m) => map.removeLayer(m));
    tempVertexMarkers = [];
    drawPoints = [];
  };

  const startDrawing = () => {
    cleanupTempDraw();
    previousPolygonLatlngs = getCurrentPolygonLatlngs();
    const hadPrevious = Boolean(previousPolygonLatlngs);

    if (hadPrevious) {
      drawnItems.clearLayers();
      currentPolygonLayer = null;
    }

    isDrawing = true;
    map.getContainer().style.cursor = 'crosshair';
    updateHint(
      hadPrevious
        ? '🖊️ Se quitó la parcela anterior. Tocá el mapa para marcar la nueva. Si no querés cambiarla, tocá “Cancelar”.'
        : '🖊️ Tocá el mapa para marcar los bordes de tu parcela.',
      false
    );
  };

  // Map click listener specifically when in drawing mode
  map.on('click', (event) => {
    if (!isDrawing) return;

    const { lat, lng } = event.latlng;
    drawPoints.push([lat, lng]);

    // Add visual vertex marker
    const vertexMarker = L.circleMarker([lat, lng], {
      radius: 4.5,
      color: '#00d4ff',
      fillColor: '#ffffff',
      fillOpacity: 1,
      weight: 2
    }).addTo(map);
    tempVertexMarkers.push(vertexMarker);

    // Update connecting polyline
    if (tempPolyline) {
      tempPolyline.setLatLngs(drawPoints);
    } else {
      tempPolyline = L.polyline(drawPoints, {
        color: '#00d4ff',
        weight: 2.5,
        dashArray: '5, 8'
      }).addTo(map);
    }

    const n = drawPoints.length;
    if (n >= 3) {
      updateHint(`📍 ${n} puntos marcados · Cuando termines, tocá “Finalizar” para cerrar la parcela.`, true);
    } else {
      const faltan = 3 - n;
      updateHint(`📍 ${n} punto${n > 1 ? 's' : ''} marcado${n > 1 ? 's' : ''} · Marcá ${faltan} más para poder cerrarla.`, false);
    }
  });

  // Double click closes drawing
  map.on('dblclick', (event) => {
    if (isDrawing && drawPoints.length >= 3) {
      L.DomEvent.preventDefault(event);
      finishDrawing();
    }
  });

  return {
    isDrawingActive: () => isDrawing,
    triggerDraw: startDrawing,
    setPolygon,
    clearPolygon: () => drawnItems.clearLayers(),
    destroy: () => {
      cleanupTempDraw();
      map.removeLayer(drawnItems);
    }
  };
}
