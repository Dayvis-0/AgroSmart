import { FILL_VALUE, MJ_TO_KWH, MONTHS_ES, POWER_API, POWER_PARAMS } from '../config.js';

const DEMO_DATA_URL = 'data/demo-scenarios.json';
const MONTHLY_LABELS_SHORT = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

let demoDataPromise = null;
const climateCache = new Map();

export function loadDemoData() {
  if (!demoDataPromise) {
    demoDataPromise = fetch(DEMO_DATA_URL).then((response) => {
      if (!response.ok) throw new Error(`No se pudo cargar ${DEMO_DATA_URL} (${response.status})`);
      return response.json();
    });
  }
  return demoDataPromise;
}

function cacheKey({ lat, lon }) {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function validNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value !== FILL_VALUE;
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function buildMonthlySeries(parameters, startYear, endYear) {
  const points = [];
  for (let year = startYear; year <= endYear; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const key = `${year}${String(month).padStart(2, '0')}`;
      const temp = parameters.T2M?.[key];
      const precDay = parameters.PRECTOTCORR?.[key];
      const wind = parameters.WS10M?.[key];
      const rad = parameters.ALLSKY_SFC_SW_DWN?.[key];
      if (![temp, precDay, wind, rad].every(validNumber)) continue;
      points.push({
        key,
        year,
        month,
        label: MONTHS_ES[month - 1],
        labelShort: MONTHLY_LABELS_SHORT[month - 1],
        temp,
        prec: precDay * daysInMonth(year, month),
        wind,
        rad: rad * MJ_TO_KWH
      });
    }
  }
  return points;
}

function sliceSeries(points, count, shortLabels = false) {
  const slice = points.slice(-count);
  return {
    temp: slice.map((point) => round(point.temp)),
    prec: slice.map((point) => Math.round(point.prec)),
    labels: slice.map((point) => (shortLabels ? point.labelShort : point.label))
  };
}

function buildSeries(points) {
  return {
    '6m': sliceSeries(points, 6),
    '1a': sliceSeries(points, 12),
    '2a': sliceSeries(points, 24, true)
  };
}

function buildSummary(points) {
  const recent = points.slice(-12);
  const annualPrec = recent.reduce((sum, point) => sum + point.prec, 0);
  const lastPoint = points[points.length - 1];
  return {
    temp: round(average(recent.map((point) => point.temp)) ?? 0),
    tempCurrent: lastPoint ? round(lastPoint.temp) : 18.5,
    prec: Math.round(annualPrec),
    viento: round(average(recent.map((point) => point.wind)) ?? 0),
    rad: round(average(recent.map((point) => point.rad)) ?? 0),
    months: recent.length
  };
}

function buildWaterDeficitAlert(points) {
  const recent = points.slice(-12);
  const dry = recent.filter((point) => point.month >= 4 && point.month <= 8 && point.prec < 20);
  if (dry.length < 3) return null;
  const names = dry.map((point) => point.label.toLowerCase());
  const first = names[0];
  const last = names[names.length - 1];
  const span = first === last ? first : `${first}–${last}`;
  return {
    type: 'amber',
    icon: '⚠️',
    title: 'Déficit hídrico estacional',
    text: `Precipitación ${span} por debajo de 20 mm/mes según NASA POWER (últimos 12 meses). Considerar riego suplementario o cultivos resistentes a sequía.`
  };
}

function normalizeResponse(payload) {
  const parameters = payload?.properties?.parameter;
  if (!parameters) throw new Error('Respuesta de NASA POWER sin parámetros climáticos.');

  const header = payload.header ?? {};
  const startYear = Number(String(header.start ?? '').slice(0, 4));
  const endYear = Number(String(header.end ?? '').slice(0, 4));
  const points = buildMonthlySeries(parameters, startYear, endYear);
  if (points.length < 6) throw new Error('NASA POWER devolvió datos insuficientes para la ubicación.');

  const year = endYear || points[points.length - 1].year;
  return {
    source: 'nasa-power',
    series: buildSeries(points),
    summary: buildSummary(points),
    waterDeficit: buildWaterDeficitAlert(points),
    meta: {
      provider: 'NASA POWER',
      parameters: ['T2M', 'PRECTOTCORR', 'WS10M', 'ALLSKY_SFC_SW_DWN'],
      units: { T2M: 'C', PRECTOTCORR: 'mm', WS10M: 'm/s', ALLSKY_SFC_SW_DWN: 'kWh/m²/day' },
      resolution: '~50 km',
      period: { start: header.start, end: header.end },
      year
    }
  };
}

function buildUrl({ lat, lon }) {
  const now = new Date();
  const endYear = now.getUTCFullYear();
  const startYear = endYear - 2;
  const params = new URLSearchParams({
    ...POWER_PARAMS,
    latitude: String(lat),
    longitude: String(lon),
    start: String(startYear),
    end: String(endYear)
  });
  return `${POWER_API}?${params.toString()}`;
}

async function fetchCurrentTemp(lat, lon) {
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m`);
    if (res.ok) {
      const data = await res.json();
      if (typeof data?.current?.temperature_2m === 'number') {
        return round(data.current.temperature_2m);
      }
    }
  } catch (err) {
    console.warn('No se pudo obtener temperatura actual en vivo:', err);
  }
  return null;
}

export async function fetchClimate({ lat, lon }) {
  const key = cacheKey({ lat, lon });
  if (climateCache.has(key)) return climateCache.get(key);

  const url = buildUrl({ lat, lon });
  const [response, liveTemp] = await Promise.all([
    fetch(url),
    fetchCurrentTemp(lat, lon)
  ]);

  if (!response.ok) {
    throw new Error(`NASA POWER respondió ${response.status}. Verifique la conexión e intente nuevamente.`);
  }

  const payload = await response.json();
  const normalized = normalizeResponse(payload);
  if (liveTemp !== null) {
    normalized.summary.tempCurrent = liveTemp;
  }
  climateCache.set(key, normalized);
  return normalized;
}

export async function fetchDemoClimate() {
  const demo = await loadDemoData();
  return {
    source: 'demo',
    series: demo.climate.series,
    summary: { ...demo.climate.summary, tempCurrent: 18.5 },
    waterDeficit: demo.alerts.find((alert) => alert.title === 'Déficit hídrico estacional') ?? null,
    meta: { provider: 'Datos de demostración', year: 2024 }
  };
}
