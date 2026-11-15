import { renderCrops } from './agriculture/crop-catalog.js';
import { CRITERIA, normalizeWeights, rankRotations } from './agriculture/rotation-engine.js';
import { buildCurrentRotation, normalizeRotation } from './agriculture/rotation-model.js';
import { generateCandidateRotations } from './agriculture/rotation-generator.js';
import { deriveRotationInsights } from './agriculture/rotation-insights.js';
import { computeRotationScores } from './agriculture/scoring-engine.js';
import { buildRotationSummary } from './agriculture/rotation-summary.js';
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

// Demo rotations kept only as labeled offline fallback data; normal comparison
// uses generated candidates with computed scores and derived evidence/risks.
let demoFallbackRotations = [];
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

function hasUsableClimateData(climate) {
  if (!climate) return false;
  if (Array.isArray(climate.monthlyPrecMm) && climate.monthlyPrecMm.length) return true;
  const period = climate.series?.['1a'] || climate.series?.['6m'] || climate.series?.['2a'];
  return Boolean(
    (period && (period.prec?.length || period.temp?.length)) || climate.summary
  );
}

function shouldUseGeneratedComparison(climate) {
  // Normal flow: generate candidates and compute/derive from available climate
  // context (NASA or labeled demo fallback data). Static demo rotations are not
  // used as candidates/scores/evidence in this path.
  return hasUsableClimateData(climate);
}

function withComputedData(rotation, context) {
  if (!rotation) return rotation;
  const scores = computeRotationScores({
    sequence: rotation.sequence || [],
    climate: context.climate,
    soil: context.soil,
    crops: context.crops
  });
  const notas = deriveRotationInsights({
    sequence: rotation.sequence || [],
    scores,
    climate: context.climate,
    soil: context.soil,
    crops: context.crops
  });
  const resumen = buildRotationSummary({
    sequence: rotation.sequence || [],
    scores,
    climate: context.climate,
    soil: context.soil,
    crops: context.crops,
    notas
  });
  return { ...rotation, scores, notas, resumen };
}

function getCurrentRotation(context) {
  const ids = getState().currentRotation;
  if (!Array.isArray(ids) || ids.length < 2) return null;
  const rotation = buildCurrentRotation(ids, { cropCatalog });
  return context ? withComputedData(rotation, context) : rotation;
}

function getGeneratedRotations(context) {
  const selectedIds = Array.isArray(getState().crops) ? getState().crops : [];
  const selected = new Set(selectedIds);
  if (selectedIds.length === 0) return [];

  const currentIds = Array.isArray(getState().currentRotation) ? getState().currentRotation : null;
  const currentValid = currentIds && currentIds.length >= 2 && currentIds.every((id) => selected.has(id));
  const minSuggested = currentValid ? 3 : 3;

  const candidates = generateCandidateRotations(selectedIds, {
    cropCatalog,
    currentSequence: currentValid ? currentIds : null,
    minCount: minSuggested
  });

  let suggested = candidates.map((rotation) => withComputedData(rotation, context));

  // Ensure at least 3 suggested rotations besides current when current is defined.
  if (currentValid) {
    const withoutCurrentDup = suggested.filter(
      (r) => (r.sequence || []).join('|') !== currentIds.join('|')
    );
    if (withoutCurrentDup.length >= 3) suggested = withoutCurrentDup;
    // if removing duplicate left <3, keep as-is (still >=3 generated) and allow duplicate? better keep >=3
    if (suggested.length < 3) {
      suggested = candidates.map((rotation) => withComputedData(rotation, context));
    }
  }

  if (suggested.length < 3) {
    // Safety: pad by regenerating allowing duplicates/variants (generator already tries)
    suggested = candidates.map((rotation) => withComputedData(rotation, context));
  }

  const applicable = [...suggested];

  if (currentValid) {
    const currentRotation = getCurrentRotation(context);
    if (currentRotation) {
      // avoid duplicating identical sequence object id issues; keep current explicitly
      const filtered = applicable.filter(
        (r) => (r.sequence || []).join('|') !== currentRotation.sequence.join('|')
      );
      // total compared set must include current and >=3 others/suggestions
      while (filtered.length < 3 && candidates[filtered.length]) {
        filtered.push(withComputedData(candidates[filtered.length], context));
      }
      applicable.length = 0;
      applicable.push(...filtered.slice(0, Math.max(3, filtered.length)), currentRotation);
    }
  }

  return applicable;
}

function getApplicableRotations() {
  const state = getState();
  const climate = state.climate;

  if (shouldUseGeneratedComparison(climate)) {
    const context = {
      climate,
      soil: state.soil,
      crops: cropCatalog
    };
    return getGeneratedRotations(context);
  }

  // Fallback when no usable climate data at all: show labeled demo fallback
  // rotations (static) only as offline fallback, not as normal computed flow.
  const selected = new Set(state.crops || []);
  return demoFallbackRotations.filter(
    (rotation) =>
      rotation.sequence.length > 0 &&
      rotation.sequence.every((cropId) => selected.has(cropId))
  );
}

function getRankedRotations() {
  const state = getState();
  const weights = normalizeWeights(CRITERIA.map((criterion) => state.priorities[criterion.key]));
  return rankRotations(getApplicableRotations(), weights);
}

function getRotationMessage(ranked, applicableCount) {
  const selectedCount = (getState().crops || []).length;
  if (applicableCount === 0) {
    if (selectedCount === 0) {
      return 'Selecciona al menos un cultivo para generar rotaciones comparables.';
    }
    return 'No se pudieron generar rotaciones con los cultivos seleccionados. Prueba a elegir cultivos distintos.';
  }

  const generated = shouldUseGeneratedComparison(getState().climate);
  if (!generated) {
    return 'Mostramos rotaciones de demostración (respaldo sin datos de clima utilizables). Consulta el clima para comparar rotaciones generadas con evidencia derivada.';
  }

  const hasCurrent = ranked.some((rotation) => rotation.origin === 'current');
  if (hasCurrent) {
    return 'Comparamos rotaciones generadas a partir de tus cultivos, incluyendo tu rotación actual. La evidencia y los riesgos se derivan del clima, el suelo y la secuencia evaluada.';
  }
  return 'Comparamos rotaciones generadas a partir de tus cultivos seleccionados. La evidencia y los riesgos se derivan del clima, el suelo y la secuencia evaluada.';
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

  // Demo rotations are an offline/labeled fallback only. In the normal flow
  // candidates, scores and evidence/risks are generated from selected crops and
  // derived from climate/soil/sequence data (not from this static content).
  demoFallbackRotations = (demo?.rotations ?? []).map((raw) => normalizeRotation(raw, cropCatalog));
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
