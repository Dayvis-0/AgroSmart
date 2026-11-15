import { renderCrops } from './agriculture/crop-catalog.js';
import { CRITERIA, normalizeWeights, rankRotations } from './agriculture/rotation-engine.js';
import { writeSoilForm } from './agriculture/soil-manager.js';
import { renderAlerts } from './alerts/alert-manager.js';
import { createClimateChart } from './charts/climate-charts.js';
import { initMap, setMarker } from './map/map-controller.js';
import { buildComparisonPdf, downloadPdf } from './reports/pdf-report.js';
import { getState, setState, subscribe } from './state.js';
import { renderClimateCards, renderClimateStatus, renderRotations, startClock } from './ui/dashboard.js';
import { initForms } from './ui/forms.js';

const byId = (id) => document.getElementById(id);

let rotations = [];
let baseAlerts = [];
let defaultAlert = null;
let currentPdfDoc = null;
let requestClimate = null;
let climateChart = null;

function clearComparisonResults() {
  const cardResultados = byId('card-resultados');
  const cardAlertas = byId('card-alertas');
  const rotContainer = byId('rotaciones-container');
  const alertsContainer = byId('alerts-container');
  const btnDescargar = byId('btn-descargar-pdf');

  if (cardResultados) cardResultados.style.display = 'none';
  if (cardAlertas) cardAlertas.style.display = 'none';
  if (rotContainer) rotContainer.innerHTML = '';
  if (alertsContainer) alertsContainer.innerHTML = '';
  if (btnDescargar) btnDescargar.style.display = 'none';
  currentPdfDoc = null;
}

function invalidateClimate() {
  if (climateChart && typeof climateChart.clear === 'function') {
    climateChart.clear();
  }
  clearComparisonResults();
  setState({
    climate: {
      status: 'stale',
      source: null,
      series: null,
      summary: null,
      meta: null,
      waterDeficit: null,
      error: null
    }
  });
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`No se pudo cargar ${path} (${response.status})`);
  return response.json();
}

async function loadData() {
  const results = await Promise.allSettled([
    loadJson('data/crops.json'),
    loadJson('data/demo-scenarios.json'),
    loadJson('data/soil-examples.json')
  ]);

  const data = { crops: null, demo: null, soilExamples: null };
  ['crops', 'demo', 'soilExamples'].forEach((key, index) => {
    const result = results[index];
    if (result.status === 'fulfilled') data[key] = result.value;
    else console.error(result.reason);
  });
  return data;
}

const ROTATION_CROPS = {
  A: ['papa', 'quinua', 'haba'],
  B: ['maiz', 'papa', 'avena', 'haba'],
  C: ['papa', 'maiz']
};

function buildAlerts(waterDeficit) {
  const alerts = [...baseAlerts];
  const first = waterDeficit ?? defaultAlert;
  if (first) alerts.unshift(first);
  return alerts;
}

function getApplicableRotations() {
  const selected = new Set(getState().crops || []);
  return rotations.filter((rotation) => {
    const required = ROTATION_CROPS[rotation.id] || [];
    return required.every((cropId) => selected.has(cropId));
  });
}

function getRankedRotations() {
  const { priorities } = getState();
  const weights = normalizeWeights(CRITERIA.map((criterion) => priorities[criterion.key]));
  return rankRotations(getApplicableRotations(), weights);
}

function getRotationMessage(ranked, applicableCount) {
  if (applicableCount === 0) {
    return 'No hay rotaciones viables con los cultivos seleccionados. Seleccione los cultivos necesarios para al menos una rotación (p. ej. Papa, Quinua y Haba).';
  }
  if (applicableCount < rotations.length) {
    const excluded = rotations.length - applicableCount;
    return `Mostrando ${applicableCount} rotación(es) compatible(s) con los cultivos seleccionados. ${excluded} no aplica(n) por cultivos faltantes.`;
  }
  return '';
}

function renderComparison({ scroll = false } = {}) {
  const applicable = getApplicableRotations();
  const ranked = getRankedRotations();
  const alerts = buildAlerts(getState().climate?.waterDeficit);
  const state = getState();
  const message = getRotationMessage(ranked, applicable.length);

  const rotContainer = byId('rotaciones-container');
  const alertsContainer = byId('alerts-container');
  const cardResultados = byId('card-resultados');
  const cardAlertas = byId('card-alertas');

  if (rotContainer && cardResultados) {
    cardResultados.style.display = 'block';
    renderRotations(rotContainer, ranked, { message });
  }

  if (alertsContainer && cardAlertas) {
    cardAlertas.style.display = alerts.length ? 'block' : 'none';
    renderAlerts(alertsContainer, alerts);
  }

  try {
    currentPdfDoc = buildComparisonPdf({
      rankedRotations: ranked,
      alerts,
      parcel: state.parcel,
      soil: state.soil,
      climate: state.climate,
      priorities: state.priorities
    });
  } catch (error) {
    console.error('Error al generar el PDF de rotaciones:', error);
  }

  const btnDescargar = byId('btn-descargar-pdf');
  if (btnDescargar) btnDescargar.style.display = 'inline-flex';

  if (scroll && cardResultados) {
    cardResultados.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function handleCompareRotations() {
  renderComparison({ scroll: true });
}

function isComparisonVisible() {
  const cardResultados = byId('card-resultados');
  return Boolean(cardResultados && cardResultados.style.display !== 'none');
}

function refreshComparisonIfVisible() {
  if (isComparisonVisible()) renderComparison({ scroll: false });
}

function setupDownloadButtons() {
  const onDownload = (event) => {
    event.preventDefault();
    if (!currentPdfDoc) {
      handleCompareRotations();
    }
    if (currentPdfDoc) {
      const todayStr = new Date().toISOString().slice(0, 10);
      downloadPdf(currentPdfDoc, `AgroSmart-Reporte-Rotaciones-${todayStr}.pdf`);
    }
  };

  const btnDescargar = byId('btn-descargar-pdf');
  if (btnDescargar) btnDescargar.addEventListener('click', onDownload);
}

function handlePolygonComplete({ lat, lng, latlngs, ha }) {
  const latInput = byId('in-lat');
  const lonInput = byId('in-lon');
  if (latInput) latInput.value = lat.toFixed(4);
  if (lonInput) lonInput.value = lng.toFixed(4);

  const community = (byId('in-comunidad')?.value || '').trim();
  const district = byId('sel-distrito')?.value || '';

  const confPlace = byId('conf-place');
  const confCoords = byId('conf-coords');
  if (confPlace) {
    const placeName = [community, district].filter(Boolean).join(', ') || 'Polígono delimitado';
    confPlace.textContent = `${placeName} (${ha.toFixed(2)} ha)`;
  }
  if (confCoords) {
    confCoords.textContent = `Lat: ${lat.toFixed(4)}° · Lon: ${lng.toFixed(4)}°`;
  }

  setState({
    parcel: {
      ...getState().parcel,
      lat,
      lon: lng,
      district,
      community,
      polygon: latlngs,
      areaHa: ha
    }
  });

  invalidateClimate();
}

function handleMapPick(lat, lon) {
  const latInput = byId('in-lat');
  const lonInput = byId('in-lon');
  const districtInput = byId('sel-distrito');
  const communityInput = byId('in-comunidad');

  if (latInput) latInput.value = lat.toFixed(4);
  if (lonInput) lonInput.value = lon.toFixed(4);

  const district = districtInput?.value || '';
  const community = (communityInput?.value || '').trim();

  const confPlace = byId('conf-place');
  const confCoords = byId('conf-coords');
  if (confPlace) {
    confPlace.textContent = [community, district].filter(Boolean).join(', ') || 'Ubicación seleccionada';
  }
  if (confCoords) {
    confCoords.textContent = `Lat: ${lat.toFixed(4)}° · Lon: ${lon.toFixed(4)}°`;
  }

  setMarker(lat, lon, { district, community, openPopup: true });
  setState({ parcel: { ...getState().parcel, lat, lon, district, community } });
  invalidateClimate();
}

async function bootstrap() {
  const { crops, demo, soilExamples } = await loadData();

  const demoParcel = soilExamples?.demoParcel;
  const parcel = demoParcel
    ? { lat: demoParcel.lat, lon: demoParcel.lon, district: demoParcel.district, community: demoParcel.community }
    : getState().parcel;
  const soil = demoParcel?.soil ?? soilExamples?.defaultSoil ?? getState().soil;

  if (demo?.climate) {
    setState({
      parcel,
      soil,
      climate: {
        status: 'idle',
        source: demo.climate.source,
        series: demo.climate.series,
        summary: demo.climate.summary,
        meta: { provider: 'Datos de demostración', year: 2024 },
        waterDeficit: demo.alerts?.find((alert) => alert.title === 'Déficit hídrico estacional') ?? null,
        error: null
      }
    });
  } else {
    setState({ parcel, soil });
  }

  rotations = demo?.rotations ?? [];
  const alerts = demo?.alerts ?? [];
  defaultAlert = alerts.find((alert) => alert.title === 'Déficit hídrico estacional') ?? null;
  baseAlerts = alerts.filter((alert) => alert.title !== 'Déficit hídrico estacional');

  startClock();
  writeSoilForm(getState().soil);

  climateChart = createClimateChart('clima-chart');
  const { period, climate } = getState();
  if (climate.series?.[period]) climateChart.update(climate.series[period]);
  if (climate.summary) renderClimateCards(climate.summary, climate.meta);
  renderClimateStatus(climate.status || 'idle', climate);

  if (crops) renderCrops(byId('crop-grid'), crops, getState().crops);

  initMap({ onPick: handleMapPick, onPolygonComplete: handlePolygonComplete });

  subscribe((state, previous) => {
    if (state.climate === previous.climate) return;
    const { climate: next } = state;
    if (next.status === 'loading') {
      renderClimateStatus('loading', next);
      return;
    }
    if (next.status === 'stale') {
      if (climateChart) climateChart.clear();
      renderClimateCards(null);
      renderClimateStatus('stale', next);
      return;
    }
    if (next.status === 'ready' || next.status === 'error') {
      if (next.summary) renderClimateCards(next.summary, next.meta);
      else renderClimateCards(null);
      if (next.series?.[state.period] && climateChart) climateChart.update(next.series[state.period]);
      renderClimateStatus(next.status, next);
    }
  });

  setupDownloadButtons();
  const forms = initForms({
    chart: climateChart,
    onCompare: handleCompareRotations,
    onLocationChange: invalidateClimate,
    onCropsChange: refreshComparisonIfVisible,
    onPrioritiesChange: refreshComparisonIfVisible
  });
  requestClimate = forms?.requestClimate ?? null;
}

bootstrap();
