import { fetchClimate, fetchDemoClimate } from '../api/nasa-power.js';
import { PERIODS } from '../config.js';
import { getSelectedIds, toggleCrop } from '../agriculture/crop-catalog.js';
import { CRITERIA } from '../agriculture/rotation-engine.js';
import { saveSoil } from '../agriculture/soil-manager.js';
import { LOCATE_EVENT, locateUser, setMarker } from '../map/map-controller.js';
import { getState, setState } from '../state.js';
import { alertMessage, busyButton, hideOverlay, showOverlay } from './notifications.js';

const byId = (id) => document.getElementById(id);
const selectedDistrict = () => byId('sel-distrito').value;

function readCoordinates() {
  return { lat: parseFloat(byId('in-lat').value), lon: parseFloat(byId('in-lon').value) };
}

function coordinatesAreValid({ lat, lon }) {
  return !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function syncMarkerFromInputs() {
  const { lat, lon } = readCoordinates();
  if (isNaN(lat) || isNaN(lon)) return;
  setMarker(lat, lon, { district: selectedDistrict() });
}

async function handleLocate() {
  showOverlay('map-loading');
  try {
    const { lat, lon, accuracy } = await locateUser();
    hideOverlay('map-loading');
    byId('in-lat').value = lat.toFixed(4);
    byId('in-lon').value = lon.toFixed(4);
    setMarker(lat, lon, {
      zoom: 14,
      openPopup: true,
      popupHtml: `<b>🎯 Tu ubicación detectada</b><br>Lat: ${lat.toFixed(4)}<br>Lon: ${lon.toFixed(4)}<br><small>Precisión GPS: ~${Math.round(accuracy)} m</small>`
    });
  } catch (error) {
    hideOverlay('map-loading');
    alertMessage(error.message);
  }
}

async function handleClimateQuery() {
  const coordinates = readCoordinates();
  if (!coordinatesAreValid(coordinates)) {
    alertMessage('Por favor ingrese coordenadas válidas.\nLatitud: -90 a 90\nLongitud: -180 a 180');
    return;
  }

  setState({ climate: { ...getState().climate, status: 'loading', error: null } });
  showOverlay('map-loading');
  try {
    const result = await fetchClimate(coordinates);
    setMarker(coordinates.lat, coordinates.lon, { district: selectedDistrict() });
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

function handleSaveSoil(event) {
  saveSoil();
  const restore = busyButton(event.currentTarget, '✅ Guardado');
  setTimeout(restore, 2000);
}

function handleCompare(event, onCompare) {
  const restore = busyButton(event.currentTarget, '⏳ Calculando…');
  setTimeout(() => {
    onCompare();
    restore();
    byId('card-resultados').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 700);
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
  byId('in-lat').addEventListener('change', syncMarkerFromInputs);
  byId('in-lon').addEventListener('change', syncMarkerFromInputs);
  byId('btn-locate').addEventListener('click', handleLocate);
  document.addEventListener(LOCATE_EVENT, handleLocate);
  byId('btn-consultar').addEventListener('click', handleClimateQuery);
  byId('btn-guardar').addEventListener('click', handleSaveSoil);
  byId('btn-comparar').addEventListener('click', (event) => handleCompare(event, onCompare));
  setupCropTags();
  setupSliders();
  setupPeriodButtons(chart);
}
