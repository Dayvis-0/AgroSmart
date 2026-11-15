import { fetchClimate, fetchDemoClimate } from '../api/nasa-power.js';
import { PERIODS } from '../config.js';
import { getSelectedIds, toggleCrop } from '../agriculture/crop-catalog.js';
import { CRITERIA } from '../agriculture/rotation-engine.js';
import { saveSoil } from '../agriculture/soil-manager.js';
import { LOCATE_EVENT, locateUser, setMarker, startParcelDrawing } from '../map/map-controller.js';
import { getState, setState } from '../state.js';
import { alertMessage, busyButton, hideOverlay, showOverlay } from './notifications.js';

const CURRENT_ROTATION_SLOTS = 4;

let cropsCatalog = [];

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

function syncMarkerFromInputs({ invalidate = false, onLocationChange = null } = {}) {
  const { lat, lon } = readCoordinates();
  if (isNaN(lat) || isNaN(lon)) return;
  const district = selectedDistrict();
  const community = selectedCommunity();
  syncParcelState();
  setMarker(lat, lon, { district, community });
  if (invalidate && typeof onLocationChange === 'function') onLocationChange();
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

function applyDistrictPreset(onLocationChange) {
  const district = selectedDistrict();
  const preset = DISTRICT_COORDS[district];
  if (!preset) {
    syncParcelState();
    if (typeof onLocationChange === 'function') onLocationChange();
    return;
  }
  const community = selectedCommunity();
  byId('in-lat').value = preset.lat.toFixed(4);
  byId('in-lon').value = preset.lon.toFixed(4);
  syncParcelState();
  setMarker(preset.lat, preset.lon, { district, community, zoom: 12 });
  if (typeof onLocationChange === 'function') onLocationChange();
}

async function handleLocate(onLocationChange) {
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
      popupHtml: `<b>🎯 Ubicación encontrada</b><br>Lat: ${lat.toFixed(4)}<br>Lon: ${lon.toFixed(4)}<br><small>${place ? `${place} · ` : ''}Aproximada (±${Math.round(accuracy)} m)</small>`
    });
    if (typeof onLocationChange === 'function') onLocationChange();
  } catch (error) {
    hideOverlay('map-loading');
    alertMessage(error.message);
  }
}

async function handleSearchLocation(onLocationChange) {
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
      throw new Error('No se pudo ubicar ese lugar. Probá elegir solo el distrito.');
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
      popupHtml: `<b>📍 Ubicación en el mapa</b><br>Lat: ${Number(lat).toFixed(4)}<br>Lon: ${Number(lon).toFixed(4)}<br><small>${place || district || 'Andahuaylas, Apurímac'}${foundByGeocode ? '' : ' · aproximada según el distrito'}</small>`
    });
    if (typeof onLocationChange === 'function') onLocationChange();
  } catch (error) {
    if (preset) {
      byId('in-lat').value = preset.lat.toFixed(4);
      byId('in-lon').value = preset.lon.toFixed(4);
      syncParcelState();
      setMarker(preset.lat, preset.lon, { district, community, zoom: 12, openPopup: true });
      if (typeof onLocationChange === 'function') onLocationChange();
      alertMessage('No pudimos ubicar la comunidad con exactitud. Te mostramos una ubicación aproximada del distrito para que puedas seguir.');
    } else {
      alertMessage(error.message || 'No se pudo buscar la ubicación. Probá elegir un distrito de la lista.');
    }
  } finally {
    hideOverlay('map-loading');
  }
}

async function requestClimate(coords = readCoordinates()) {
  const coordinates = { lat: Number(coords.lat), lon: Number(coords.lon) };
  if (!coordinatesAreValid(coordinates)) {
    alertMessage('Revisá la ubicación: la latitud debe estar entre -90 y 90, y la longitud entre -180 y 180.');
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

function cropLabel(cropId) {
  const crop = cropsCatalog.find((item) => item.id === cropId);
  return crop ? `${crop.icon} ${crop.name}` : cropId;
}

function renderCurrentRotationSlots() {
  const container = byId('current-rotation-slots');
  if (!container) return;

  const { crops: selectedIds, currentRotation } = getState();
  const allowed = new Set(selectedIds);
  const options = selectedIds
    .map((cropId) => `<option value="${cropId}">${cropLabel(cropId)}</option>`)
    .join('');
  const slots = [];

  for (let index = 0; index < CURRENT_ROTATION_SLOTS; index += 1) {
    const value =
      currentRotation && allowed.has(currentRotation[index]) ? currentRotation[index] : '';
    slots.push(
      `<select id="cr-slot-${index}" aria-label="Cultivo ${index + 1} de tu rotación actual">
        <option value="">— Vacío —</option>${options}
      </select>`
    );
  }

  container.innerHTML = slots.join('');
}

function renderCurrentRotationSummary() {
  const node = byId('current-rotation-summary');
  if (!node) return;

  const values = getState().currentRotation;
  node.textContent =
    Array.isArray(values) && values.length >= 2
      ? `Tu rotación actual: ${values.map(cropLabel).join(' → ')}`
      : 'Todavía no definiste tu rotación actual.';
}

function readCurrentRotationValues() {
  return [...document.querySelectorAll('#current-rotation-slots select')]
    .map((select) => select.value)
    .filter(Boolean);
}

function setupCropTags(onCropsChange) {
  byId('crop-grid').addEventListener('click', (event) => {
    const tag = event.target.closest('.crop-tag');
    if (!tag) return;
    toggleCrop(tag.dataset.cropId);

    const nextCrops = getSelectedIds();
    const allowed = new Set(nextCrops);
    const pruned = (getState().currentRotation || []).filter((cropId) => allowed.has(cropId));
    setState({
      crops: nextCrops,
      currentRotation: pruned.length >= 2 ? pruned : null
    });

    renderCurrentRotationSlots();
    renderCurrentRotationSummary();
    if (typeof onCropsChange === 'function') onCropsChange();
  });
}

function setupCurrentRotationInput(onCurrentRotationChange) {
  const container = byId('current-rotation-slots');
  const fillButton = byId('btn-fill-current-rotation');

  if (container) {
    container.addEventListener('change', () => {
      const values = readCurrentRotationValues();
      setState({ currentRotation: values.length >= 2 ? values : null });
      renderCurrentRotationSummary();
      if (typeof onCurrentRotationChange === 'function') onCurrentRotationChange();
    });
  }

  if (fillButton) {
    fillButton.addEventListener('click', () => {
      const values = getState().crops.slice(0, CURRENT_ROTATION_SLOTS);
      setState({ currentRotation: values.length >= 2 ? values : null });
      renderCurrentRotationSlots();
      renderCurrentRotationSummary();
    });
  }
}

/**
 * Syncs every control driven by persisted state with the current state.
 */
export function syncControlsFromState() {
  const { crops: selectedIds, priorities } = getState();

  document.querySelectorAll('#crop-grid .crop-tag').forEach((tag) => {
    tag.classList.toggle('selected', selectedIds.includes(tag.dataset.cropId));
  });

  for (const criterion of CRITERIA) {
    const slider = byId(`pr-${criterion.key}`);
    const value = byId(`sv-${criterion.key}`);
    if (slider) slider.value = priorities[criterion.key];
    if (value) value.textContent = priorities[criterion.key];
  }

  renderCurrentRotationSlots();
  renderCurrentRotationSummary();
}

function setupSliders(onPrioritiesChange) {
  for (const criterion of CRITERIA) {
    const slider = byId(`pr-${criterion.key}`);
    const value = byId(`sv-${criterion.key}`);
    slider.addEventListener('input', () => {
      value.textContent = slider.value;
      setState({ priorities: { ...getState().priorities, [criterion.key]: Number(slider.value) } });
      if (typeof onPrioritiesChange === 'function') onPrioritiesChange();
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

export function initForms({
  chart,
  crops = [],
  onCompare,
  onLocationChange,
  onCropsChange,
  onPrioritiesChange,
  onCurrentRotationChange
}) {
  cropsCatalog = Array.isArray(crops) ? crops : [];

  // Drop any persisted current rotation that no longer matches the selected crops.
  const allowedCrops = new Set(getState().crops);
  const storedRotation = getState().currentRotation;
  if (Array.isArray(storedRotation)) {
    const pruned = storedRotation.filter((cropId) => allowedCrops.has(cropId));
    if (pruned.length !== storedRotation.length) {
      setState({ currentRotation: pruned.length >= 2 ? pruned : null });
    }
  }

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

  if (inLat) inLat.addEventListener('change', () => syncMarkerFromInputs({ invalidate: true, onLocationChange }));
  if (inLon) inLon.addEventListener('change', () => syncMarkerFromInputs({ invalidate: true, onLocationChange }));
  if (inComunidad) {
    inComunidad.addEventListener('change', () => syncMarkerFromInputs({ invalidate: true, onLocationChange }));
  }
  if (selDistrito) selDistrito.addEventListener('change', () => applyDistrictPreset(onLocationChange));

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

  if (btnBuscarUbicacion) btnBuscarUbicacion.addEventListener('click', () => handleSearchLocation(onLocationChange));
  document.addEventListener(LOCATE_EVENT, () => handleLocate(onLocationChange));
  const btnDelimitar = byId('btn-delimitar-parcela');
  if (btnDelimitar) btnDelimitar.addEventListener('click', () => startParcelDrawing());
  if (btnConsultar) btnConsultar.addEventListener('click', handleClimateQuery);
  if (btnGuardar) btnGuardar.addEventListener('click', handleSaveSoil);
  if (btnComparar) btnComparar.addEventListener('click', (event) => handleCompare(event, onCompare));

  setupCropTags(onCropsChange);
  setupCurrentRotationInput(onCurrentRotationChange);
  setupSliders(onPrioritiesChange);
  setupPeriodButtons(chart);
  syncControlsFromState();

  return { requestClimate };
}
