import { renderCrops } from './agriculture/crop-catalog.js';
import { CRITERIA, normalizeWeights, rankRotations } from './agriculture/rotation-engine.js';
import { buildCurrentRotation, normalizeRotation } from './agriculture/rotation-model.js';
import { computeRotationScores } from './agriculture/scoring-engine.js';
import { writeSoilForm } from './agriculture/soil-manager.js';
import { renderAlerts } from './alerts/alert-manager.js';
import { createClimateChart } from './charts/climate-charts.js';
import { initMap, setMarker } from './map/map-controller.js';
import { buildComparisonPdf, downloadPdf } from './reports/pdf-report.js';
import { fetchRegionalContext } from './api/regional-context.js';
import { getState, setState, subscribe, resetState, hasPersistedState } from './state.js';
import { renderClimateCards, renderClimateStatus, renderRegionalContext, renderRotations, startClock } from './ui/dashboard.js';
import { initForms, syncControlsFromState } from './ui/forms.js';

const byId = (id) => document.getElementById(id);

let rotations = [];
let cropCatalog = [];
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
    },
    regionalContext: {
      status: 'idle',
      source: null,
      product: null,
      resolution: null,
      label: null,
      coverage: null,
      reason: null,
      point: null,
      checkedAt: null
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

function buildAlerts(waterDeficit) {
  const alerts = [...baseAlerts];
  const first = waterDeficit ?? defaultAlert;
  if (first) alerts.unshift(first);
  return alerts;
}

function isClimateComputable(climate) {
  if (!climate || (climate.status !== 'ready' && climate.status !== 'error')) return false;
  if (!climate.series && !Array.isArray(climate.monthlyPrecMm)) return false;
  const period = climate.series?.['1a'] || climate.series?.['6m'] || climate.series?.['2a'];
  return Boolean(period?.prec?.length || period?.temp?.length || climate.summary);
}

function shouldUseComputedScores(climate) {
  // Live/computed path: compute from climate + soil + crops + priorities when
  // usable climate context exists. Demo data is only a labeled fallback when
  // no computable climate is available.
  return isClimateComputable(climate);
}

function withComputedScores(rotation, context) {
  if (!rotation || rotation.scores || !context) return rotation;
  const scores = computeRotationScores({
    sequence: rotation.sequence || [],
    climate: context.climate,
    soil: context.soil,
    crops: context.crops
  });
  return { ...rotation, scores };
}

function getCurrentRotation(context) {
  const ids = getState().currentRotation;
  if (!Array.isArray(ids) || ids.length < 2) return null;
  const rotation = buildCurrentRotation(ids, { cropCatalog });
  return context?.compute ? withComputedScores(rotation, context) : rotation;
}

function getApplicableRotations(context) {
  const selected = new Set(getState().crops || []);
  const base = rotations.filter(
    (rotation) =>
      rotation.sequence.length > 0 &&
      rotation.sequence.every((cropId) => selected.has(cropId))
  );

  const applicable = context?.compute
    ? base.map((rotation) => ({ ...rotation, scores: computeRotationScores({
        sequence: rotation.sequence || [],
        climate: context.climate,
        soil: context.soil,
        crops: context.crops
      }) }))
    : base;

  const currentRotation = getCurrentRotation(context);
  if (currentRotation && currentRotation.sequence.every((cropId) => selected.has(cropId))) {
    applicable.push(currentRotation);
  }
  return applicable;
}

function getRankedRotations() {
  const state = getState();
  const weights = normalizeWeights(CRITERIA.map((criterion) => state.priorities[criterion.key]));
  const compute = shouldUseComputedScores(state.climate);
  const context = {
    compute,
    climate: state.climate,
    soil: state.soil,
    crops: cropCatalog
  };
  return rankRotations(getApplicableRotations(context), weights);
}

function getRotationMessage(ranked, applicableCount) {
  if (applicableCount === 0) {
    return 'Con los cultivos que elegiste no se arma ninguna rotación de ejemplo. Prueba a seleccionar los cultivos que pide una rotación (por ejemplo: papa, quinua y haba).';
  }
  if (applicableCount < rotations.length) {
    const excluded = rotations.length - applicableCount;
    return `Te mostramos ${applicableCount} opción(es) que sí coinciden con tus cultivos. ${excluded} no aparece(n) porque les falta algún cultivo.`;
  }
  return 'Estas opciones son orientativas: compáralas con tu experiencia, tu agua disponible y tu suelo.';
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

function syncParcelInputs() {
  const parcel = getState().parcel;
  const latInput = byId('in-lat');
  const lonInput = byId('in-lon');
  const districtInput = byId('sel-distrito');
  const communityInput = byId('in-comunidad');

  if (latInput && typeof parcel.lat === 'number') latInput.value = String(parcel.lat);
  if (lonInput && typeof parcel.lon === 'number') lonInput.value = String(parcel.lon);
  if (districtInput && parcel.district) districtInput.value = parcel.district;
  if (communityInput) communityInput.value = parcel.community ?? '';

  if (typeof parcel.lat === 'number' && typeof parcel.lon === 'number') {
    setMarker(parcel.lat, parcel.lon, {
      district: parcel.district,
      community: parcel.community
    });
  }
}

function handleReset() {
  resetState();
  clearComparisonResults();
  writeSoilForm(getState().soil);
  syncControlsFromState();
  syncParcelInputs();
}

function setupResetButton() {
  const btnReset = byId('btn-reset');
  if (btnReset) btnReset.addEventListener('click', handleReset);
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
  cropCatalog = Array.isArray(crops) ? crops : [];

  // Persisted farmer inputs win over the demo defaults from soil-examples.json.
  const persisted = hasPersistedState();
  const demoParcel = soilExamples?.demoParcel;
  const parcel = !persisted && demoParcel
    ? { lat: demoParcel.lat, lon: demoParcel.lon, district: demoParcel.district, community: demoParcel.community }
    : getState().parcel;
  const soil = !persisted
    ? (demoParcel?.soil ?? soilExamples?.defaultSoil ?? getState().soil)
    : getState().soil;

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
      },
      regionalContext: {
        status: 'unavailable',
        source: 'NASA GPM IMERG (GES DISC)',
        product: 'GPM IMERG V07 Monthly (precipitation, regional)',
        resolution: '~10 km (producto); agregado al punto de la parcela',
        label: 'Contexto regional NASA GPM no consultado (modo demostración)',
        coverage: 'sin verificación',
        reason: 'demo-fallback',
        point: { lat: parcel.lat, lon: parcel.lon },
        checkedAt: new Date().toISOString()
      }
    });
  } else {
    setState({ parcel, soil });
  }

  // Demo rotations are an offline/labeled fallback only. In the live/computed
  // path scores are computed from NASA climate + soil + crops + priorities;
  // stored demo scores are kept only for fallback rendering when no computable
  // climate context is available.
  rotations = (demo?.rotations ?? []).map((raw) => normalizeRotation(raw, cropCatalog));
  const alerts = demo?.alerts ?? [];
  defaultAlert = alerts.find((alert) => alert.title === 'Déficit hídrico estacional') ?? null;
  baseAlerts = alerts.filter((alert) => alert.title !== 'Déficit hídrico estacional');

  startClock();
  writeSoilForm(getState().soil);

  climateChart = createClimateChart('clima-chart');
  const { period, climate, regionalContext } = getState();
  if (climate.series?.[period]) climateChart.update(climate.series[period]);
  if (climate.summary) renderClimateCards(climate.summary, climate.meta);
  renderClimateStatus(climate.status || 'idle', climate);
  renderRegionalContext(regionalContext);

  if (crops) renderCrops(byId('crop-grid'), crops, getState().crops);

  initMap({ onPick: handleMapPick, onPolygonComplete: handlePolygonComplete });

  subscribe((state, previous) => {
    if (state.climate !== previous.climate) {
      const { climate: next } = state;
      if (next.status === 'loading') {
        renderClimateStatus('loading', next);
      } else if (next.status === 'stale') {
        if (climateChart) climateChart.clear();
        renderClimateCards(null);
        renderClimateStatus('stale', next);
      } else if (next.status === 'ready' || next.status === 'error') {
        if (next.summary) renderClimateCards(next.summary, next.meta);
        else renderClimateCards(null);
        if (next.series?.[state.period] && climateChart) climateChart.update(next.series[state.period]);
        renderClimateStatus(next.status, next);

        // Second NASA source (regional context): fetch as labeled context/check.
        // For live NASA POWER requests fetch GPM context at the farm point; for
        // demo/fallback keep an explicit unavailable/labeled fallback state.
        if (previous.climate?.status !== next.status || previous.climate?.source !== next.source) {
          if (next.status === 'ready' && next.source === 'nasa-power') {
            const point = { lat: state.parcel.lat, lon: state.parcel.lon };
            setState({ regionalContext: { status: 'loading', source: 'NASA GPM IMERG (GES DISC)', product: 'GPM IMERG V07 Monthly', resolution: '~10 km', label: 'Consultando contexto regional NASA…', coverage: null, reason: null, point, checkedAt: null } });
            fetchRegionalContext(point).then((regionalContext) => {
              setState({ regionalContext });
            });
          } else if (next.source === 'demo') {
            setState({
              regionalContext: {
                status: 'unavailable',
                source: 'NASA GPM IMERG (GES DISC)',
                product: 'GPM IMERG V07 Monthly (precipitation, regional)',
                resolution: '~10 km (producto); agregado al punto de la parcela',
                label: 'Contexto regional NASA GPM no consultado (modo demostración)',
                coverage: 'sin verificación',
                reason: 'demo-fallback',
                point: { lat: state.parcel.lat, lon: state.parcel.lon },
                checkedAt: new Date().toISOString()
              }
            });
          } else if (next.status === 'error') {
            setState({
              regionalContext: {
                status: 'unavailable',
                source: 'NASA GPM IMERG (GES DISC)',
                product: 'GPM IMERG V07 Monthly (precipitation, regional)',
                resolution: '~10 km (producto); agregado al punto de la parcela',
                label: 'Contexto regional NASA GPM no disponible (sin consulta en vivo)',
                coverage: 'sin verificación',
                reason: 'climate-error-fallback',
                point: { lat: state.parcel.lat, lon: state.parcel.lon },
                checkedAt: new Date().toISOString()
              }
            });
          }
        }
      }
    }

    if (state.regionalContext !== previous.regionalContext) {
      renderRegionalContext(state.regionalContext);
    }
  });

  setupDownloadButtons();
  setupResetButton();
  const forms = initForms({
    chart: climateChart,
    crops: cropCatalog,
    onCompare: handleCompareRotations,
    onLocationChange: invalidateClimate,
    onCropsChange: refreshComparisonIfVisible,
    onPrioritiesChange: refreshComparisonIfVisible,
    onCurrentRotationChange: refreshComparisonIfVisible
  });
  requestClimate = forms?.requestClimate ?? null;
  syncParcelInputs();
}

bootstrap();
