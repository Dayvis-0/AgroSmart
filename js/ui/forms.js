import { fetchClimate, fetchDemoClimate } from '../api/nasa-power.js';
import { PERIODS } from '../config.js';
import { getSelectedIds, toggleCrop } from '../agriculture/crop-catalog.js';
import { CRITERIA } from '../agriculture/rotation-engine.js';
import { saveSoil } from '../agriculture/soil-manager.js';
import { LOCATE_EVENT, locateUser, setMarker, startParcelDrawing } from '../map/map-controller.js';
import { getState, setState } from '../state.js';
import { alertMessage, busyButton, hideOverlay, showOverlay } from './notifications.js';

const byId = (id) => document.getElementById(id);
const selectedDistrict = () => byId('sel-distrito').value;
const selectedCommunity = () => {
  const node = byId('in-comunidad');
  return node ? node.value.trim() : '';
};

const DISTRICT_COORDS = {
  Andahuaylas: { lat: -13.6556, lon: -73.3872 },
  Talavera: { lat: -13.6533, lon: -73.4291 },
  'San Jerónimo': { lat: -13.651, lon: -73.3647 },
  Pacucha: { lat: -13.608, lon: -73.3439 },
  Kishuará: { lat: -13.6914, lon: -73.1578 },
  Turpo: { lat: -13.7869, lon: -73.4722 },
  Kaquiabamba: { lat: -13.6331, lon: -73.4981 },
  Andarapa: { lat: -13.5278, lon: -73.3653 }
};

function readCoordinates() {
  return { lat: parseFloat(byId('in-lat').value), lon: parseFloat(byId('in-lon').value) };
}

function coordinatesAreValid({ lat, lon }) {
  return !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function syncParcelState() {
  const { lat, lon } = readCoordinates();
  const district = selectedDistrict();
  const community = selectedCommunity();
  const parcel = { ...getState().parcel, district, community };
  if (!isNaN(lat)) parcel.lat = lat;
  if (!isNaN(lon)) parcel.lon = lon;
  setState({ parcel });
  return parcel;
}

function syncMarkerFromInputs() {
  const { lat, lon } = readCoordinates();
  if (isNaN(lat) || isNaN(lon)) return;
  const district = selectedDistrict();
  const community = selectedCommunity();
  syncParcelState();
  setMarker(lat, lon, { district, community });
}

function isInlineParcelPanel(panel) {
  return panel && panel.classList.contains('parcel-filter-panel-inline');
}

function setParcelPanelOpen(open) {
  const panel = byId('parcel-filter-panel');
  const toggle = byId('btn-toggle-filter');
  if (!panel) return;

  if (isInlineParcelPanel(panel)) {
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    panel.setAttribute('aria-hidden', 'false');
    if (open) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const first = byId('sel-distrito');
      if (first) first.focus({ preventScroll: true });
    }
    return;
  }

  if (!toggle) return;
  panel.classList.toggle('is-open', open);
  panel.setAttribute('aria-hidden', String(!open));
  toggle.setAttribute('aria-expanded', String(open));
  if (open) {
    const first = byId('sel-distrito');
    if (first) first.focus({ preventScroll: true });
  }
}

function toggleParcelPanel() {
  const panel = byId('parcel-filter-panel');
  if (!panel) return;
  if (isInlineParcelPanel(panel)) {
    setParcelPanelOpen(true);
    return;
  }
  setParcelPanelOpen(!panel.classList.contains('is-open'));
}

function applyDistrictPreset() {
  const district = selectedDistrict();
  const preset = DISTRICT_COORDS[district];
  if (!preset) {
    syncParcelState();
    return;
  }
  const community = selectedCommunity();
  byId('in-lat').value = preset.lat.toFixed(4);
  byId('in-lon').value = preset.lon.toFixed(4);
  syncParcelState();
  setMarker(preset.lat, preset.lon, { district, community, zoom: 12 });
}

async function handleLocate() {
  showOverlay('map-loading');
  try {
    const { lat, lon, accuracy } = await locateUser();
    hideOverlay('map-loading');
    byId('in-lat').value = lat.toFixed(4);
    byId('in-lon').value = lon.toFixed(4);
    syncParcelState();
    const district = selectedDistrict();
    const community = selectedCommunity();
    const place = [community, district].filter((value) => value && String(value).trim()).join(', ');
    setMarker(lat, lon, {
      zoom: 14,
      openPopup: true,
      popupHtml: `<b>🎯 Tu ubicación detectada</b><br>Lat: ${lat.toFixed(4)}<br>Lon: ${lon.toFixed(4)}<br><small>${place ? `${place} · ` : ''}Precisión GPS: ~${Math.round(accuracy)} m</small>`
    });
  } catch (error) {
    hideOverlay('map-loading');
    alertMessage(error.message);
  }
}

async function handleSearchLocation() {
  const district = selectedDistrict();
  const community = selectedCommunity();
  const preset = DISTRICT_COORDS[district];
  const query = community ? `${community}, ${district}, Andahuaylas, Apurímac, Perú` : '';

  showOverlay('map-loading');
  try {
    let lat = preset?.lat;
    let lon = preset?.lon;
    let zoom = 12;
    let foundByGeocode = false;

    if (query) {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (response.ok) {
        const results = await response.json();
        if (Array.isArray(results) && results[0]) {
          lat = parseFloat(results[0].lat);
          lon = parseFloat(results[0].lon);
          zoom = 14;
          foundByGeocode = true;
        }
      }
    }

    if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
      throw new Error('No se encontró una ubicación para el distrito seleccionado.');
    }

    byId('in-lat').value = Number(lat).toFixed(4);
    byId('in-lon').value = Number(lon).toFixed(4);
    syncParcelState();
    const place = [community, district].filter((value) => value && String(value).trim()).join(', ');
    setMarker(lat, lon, {
      district,
      community,
      zoom,
      openPopup: true,
      popupHtml: `<b>📍 Ubicación seleccionada</b><br>Lat: ${Number(lat).toFixed(4)}<br>Lon: ${Number(lon).toFixed(4)}<br><small>${place || district || 'Andahuaylas, Apurímac'}${foundByGeocode ? '' : ' · aproximada por distrito'}</small>`
    });
  } catch (error) {
    if (preset) {
      byId('in-lat').value = preset.lat.toFixed(4);
      byId('in-lon').value = preset.lon.toFixed(4);
      syncParcelState();
      setMarker(preset.lat, preset.lon, { district, community, zoom: 12, openPopup: true });
      alertMessage('No se pudo ubicar la comunidad con precisión. Se usó la ubicación aproximada del distrito.');
    } else {
      alertMessage(error.message || 'No se pudo buscar la ubicación.');
    }
  } finally {
    hideOverlay('map-loading');
  }
}

async function requestClimate(coords = readCoordinates()) {
  const coordinates = { lat: Number(coords.lat), lon: Number(coords.lon) };
  if (!coordinatesAreValid(coordinates)) {
    alertMessage('Por favor ingrese coordenadas válidas.\nLatitud: -90 a 90\nLongitud: -180 a 180');
    return;
  }

  setState({ climate: { ...getState().climate, status: 'loading', error: null } });
  showOverlay('map-loading');
  try {
    const result = await fetchClimate(coordinates);
    setMarker(coordinates.lat, coordinates.lon, {
      district: selectedDistrict(),
      community: selectedCommunity()
    });
    setState({ climate: { status: 'ready', error: null, ...result } });
  } catch (error) {
    console.error(error);
    try {
      const demo = await fetchDemoClimate();
      setState({ climate: { status: 'error', error, ...demo } });
    } catch (fallbackError) {
      console.error(fallbackError);
      setState({ climate: { ...getState().climate, status: 'error', error } });
    }
  } finally {
    hideOverlay('map-loading');
  }
}

function handleClimateQuery() {
  return requestClimate();
}

function handleSaveSoil(event) {
  saveSoil();
  const restore = busyButton(event.currentTarget, '✅ Guardado');
  setTimeout(restore, 2000);
}

function handleCompare(event, onCompare) {
  const restore = busyButton(event.currentTarget, '⏳ Procesando…');
  setTimeout(() => {
    try {
      onCompare();
    } finally {
      restore();
    }
  }, 400);
}

function setupCropTags() {
  byId('crop-grid').addEventListener('click', (event) => {
    const tag = event.target.closest('.crop-tag');
    if (!tag) return;
    toggleCrop(tag.dataset.cropId);
    setState({ crops: getSelectedIds() });
  });
}

function setupSliders() {
  for (const criterion of CRITERIA) {
    const slider = byId(`pr-${criterion.key}`);
    const value = byId(`sv-${criterion.key}`);
    slider.addEventListener('input', () => {
      value.textContent = slider.value;
      setState({ priorities: { ...getState().priorities, [criterion.key]: Number(slider.value) } });
    });
  }
}

function setupPeriodButtons(chart) {
  document.querySelectorAll('.period-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const period = button.dataset.period;
      const series = getState().climate.series;
      if (!(period in PERIODS) || !series || !series[period]) return;
      document.querySelectorAll('.period-btn').forEach((other) => other.classList.remove('active'));
      button.classList.add('active');
      setState({ period });
      chart.update(series[period]);
    });
  });
}

export function initForms({ chart, onCompare }) {
  const inLat = byId('in-lat');
  const inLon = byId('in-lon');
  const inComunidad = byId('in-comunidad');
  const selDistrito = byId('sel-distrito');
  const toggleBtn = byId('btn-toggle-filter');
  const closeBtn = byId('btn-close-filter');
  const panel = byId('parcel-filter-panel');
  const btnBuscarUbicacion = byId('btn-buscar-ubicacion');
  const btnConsultar = byId('btn-consultar');
  const btnGuardar = byId('btn-guardar');
  const btnComparar = byId('btn-comparar');

  if (inLat) inLat.addEventListener('change', syncMarkerFromInputs);
  if (inLon) inLon.addEventListener('change', syncMarkerFromInputs);
  if (inComunidad) {
    inComunidad.addEventListener('input', syncMarkerFromInputs);
    inComunidad.addEventListener('change', syncMarkerFromInputs);
  }
  if (selDistrito) selDistrito.addEventListener('change', applyDistrictPreset);

  if (toggleBtn) {
    toggleBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleParcelPanel();
    });
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setParcelPanelOpen(false);
    });
  }

  document.addEventListener('click', (event) => {
    if (!panel || isInlineParcelPanel(panel) || !panel.classList.contains('is-open')) return;
    if (panel.contains(event.target)) return;
    if (toggleBtn && (event.target === toggleBtn || toggleBtn.contains(event.target))) return;
    setParcelPanelOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel && !isInlineParcelPanel(panel) && panel.classList.contains('is-open')) {
      setParcelPanelOpen(false);
      if (toggleBtn) toggleBtn.focus();
    }
  });

  if (btnBuscarUbicacion) btnBuscarUbicacion.addEventListener('click', handleSearchLocation);
  document.addEventListener(LOCATE_EVENT, handleLocate);
  const btnDelimitar = byId('btn-delimitar-parcela');
  if (btnDelimitar) btnDelimitar.addEventListener('click', () => startParcelDrawing());
  if (btnConsultar) btnConsultar.addEventListener('click', handleClimateQuery);
  if (btnGuardar) btnGuardar.addEventListener('click', handleSaveSoil);
  if (btnComparar) btnComparar.addEventListener('click', (event) => handleCompare(event, onCompare));

  setupCropTags();
  setupSliders();
  setupPeriodButtons(chart);

  return { requestClimate };
}
