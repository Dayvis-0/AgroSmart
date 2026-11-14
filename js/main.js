import { renderCrops } from './agriculture/crop-catalog.js';
import { CRITERIA, normalizeWeights, rankRotations } from './agriculture/rotation-engine.js';
import { writeSoilForm } from './agriculture/soil-manager.js';
import { renderAlerts } from './alerts/alert-manager.js';
import { createClimateChart } from './charts/climate-charts.js';
import { initMap } from './map/map-controller.js';
import { getState, setState, subscribe } from './state.js';
import { renderClimateCards, renderClimateStatus, renderRotations, startClock } from './ui/dashboard.js';
import { initForms } from './ui/forms.js';

const byId = (id) => document.getElementById(id);

let rotations = [];
let baseAlerts = [];
let defaultAlert = null;

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

function renderRotationResults() {
  const { priorities } = getState();
  const weights = normalizeWeights(CRITERIA.map((criterion) => priorities[criterion.key]));
  renderRotations(byId('rotaciones-container'), rankRotations(rotations, weights));
}

function buildAlerts(waterDeficit) {
  const alerts = [...baseAlerts];
  const first = waterDeficit ?? defaultAlert;
  if (first) alerts.unshift(first);
  return alerts;
}

function renderAlertCenter(waterDeficit) {
  renderAlerts(byId('alerts-container'), buildAlerts(waterDeficit));
}

function handleMapPick(lat, lon) {
  byId('in-lat').value = lat.toFixed(4);
  byId('in-lon').value = lon.toFixed(4);
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
  renderAlertCenter(climate.waterDeficit);
  if (rotations.length) renderRotationResults();

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
      renderAlertCenter(next.waterDeficit ?? (next.source === 'demo' ? defaultAlert : null));
    }
  });

  initForms({ chart, onCompare: renderRotationResults });
}

bootstrap();
