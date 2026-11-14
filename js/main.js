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

function buildAlerts(waterDeficit) {
  const alerts = [...baseAlerts];
  const first = waterDeficit ?? defaultAlert;
  if (first) alerts.unshift(first);
  return alerts;
}

function getRankedRotations() {
  const { priorities } = getState();
  const weights = normalizeWeights(CRITERIA.map((criterion) => priorities[criterion.key]));
  return rankRotations(rotations, weights);
}

function handleCompareRotations() {
  const ranked = getRankedRotations();
  const alerts = buildAlerts(getState().climate?.waterDeficit);
  const state = getState();

  // 1. Mostrar resultados y alertas en la interfaz
  const rotContainer = byId('rotaciones-container');
  const alertsContainer = byId('alerts-container');
  const cardResultados = byId('card-resultados');
  const cardAlertas = byId('card-alertas');

  if (rotContainer && cardResultados) {
    cardResultados.style.display = 'block';
    renderRotations(rotContainer, ranked);
  }

  if (alertsContainer && cardAlertas) {
    cardAlertas.style.display = alerts.length ? 'block' : 'none';
    renderAlerts(alertsContainer, alerts);
  }

  // 2. Generar el PDF con diseño profesional en memoria
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

  // 3. Hacer visible el botón de descarga de PDF
  const btnDescargar = byId('btn-descargar-pdf');
  const btnDescargarCard = byId('btn-descargar-pdf-card');
  if (btnDescargar) {
    btnDescargar.style.display = 'inline-flex';
  }
  if (btnDescargarCard) {
    btnDescargarCard.style.display = 'inline-flex';
  }

  // 4. Desplazamiento suave hacia la sección de resultados
  if (cardResultados) {
    cardResultados.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
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
  const btnDescargarCard = byId('btn-descargar-pdf-card');
  if (btnDescargar) btnDescargar.addEventListener('click', onDownload);
  if (btnDescargarCard) btnDescargarCard.addEventListener('click', onDownload);
}

function handleMapPick(lat, lon) {
  const latInput = byId('in-lat');
  const lonInput = byId('in-lon');
  const districtInput = byId('sel-distrito');
  const communityInput = byId('in-comunidad');

  if (latInput) latInput.value = lat.toFixed(4);
  if (lonInput) lonInput.value = lon.toFixed(4);
  if (districtInput) districtInput.value = '';

  const district = '';
  const community = (communityInput?.value || '').trim();

  setMarker(lat, lon, { district, community, openPopup: true });
  setState({ parcel: { ...getState().parcel, lat, lon, district, community } });
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

  const chart = createClimateChart('clima-chart');
  const { period, climate } = getState();
  if (climate.series?.[period]) chart.update(climate.series[period]);
  if (climate.summary) renderClimateCards(climate.summary, climate.meta);
  renderClimateStatus(climate.status || 'idle', climate);

  if (crops) renderCrops(byId('crop-grid'), crops, getState().crops);

  initMap({ onPick: handleMapPick });

  subscribe((state, previous) => {
    if (state.climate === previous.climate) return;
    const { climate: next } = state;
    if (next.status === 'loading') {
      renderClimateStatus('loading', next);
      return;
    }
    if (next.status === 'ready' || next.status === 'error') {
      if (next.summary) renderClimateCards(next.summary, next.meta);
      if (next.series?.[state.period]) chart.update(next.series[state.period]);
      renderClimateStatus(next.status, next);
    }
  });

  setupDownloadButtons();
  initForms({ chart, onCompare: handleCompareRotations });
}

bootstrap();
