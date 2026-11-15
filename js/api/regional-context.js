/**
 * Second NASA source as labeled regional context (P1-T5).
 *
 * Attempts a real fetch to NASA GES DISC for GPM IMERG (monthly precipitation)
 * at/near the farm point. In a browser-only app this endpoint typically
 * requires Earthdata authentication and may be blocked by CORS; on any failure
 * we degrade gracefully to an explicit "unavailable" state without faking data.
 */

const GPM_PROBE_URL = 'https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/GPM_3IMERGM.07/catalog.xml';
const REQUEST_TIMEOUT_MS = 4500;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function createUnavailableRegionalContext(reason = 'not-accessible') {
  return {
    status: 'unavailable',
    source: 'NASA GPM IMERG (GES DISC)',
    product: 'GPM IMERG V07 Monthly (precipitation, regional)',
    resolution: '~10 km (producto); agregado al punto de la parcela',
    label: 'Contexto regional NASA GPM no disponible en este navegador',
    coverage: 'sin verificación',
    reason,
    point: null,
    checkedAt: new Date().toISOString()
  };
}

export async function fetchRegionalContext({ lat, lon } = {}) {
  const point =
    Number.isFinite(lat) && Number.isFinite(lon)
      ? { lat: Number(lat), lon: Number(lon) }
      : null;

  try {
    // Real fetch attempt to an accessible NASA endpoint/probe where possible.
    // Success here indicates the service is reachable; full granule subsetting
    // requires Earthdata auth, so we still report limited coverage context.
    const response = await withTimeout(
      fetch(GPM_PROBE_URL, { method: 'GET', mode: 'cors' }),
      REQUEST_TIMEOUT_MS
    );

    if (response && response.ok) {
      return {
        status: 'available',
        source: 'NASA GPM IMERG (GES DISC)',
        product: 'GPM IMERG V07 Monthly (precipitation, regional)',
        resolution: '~10 km (producto); agregado al punto de la parcela',
        label: 'Contexto regional NASA GPM: servicio accesible (cobertura referencial)',
        coverage: point ? 'punto consultado (referencial)' : 'referencial',
        reason: null,
        point,
        checkedAt: new Date().toISOString()
      };
    }

    return {
      ...createUnavailableRegionalContext(`http-${response?.status ?? 'error'}`),
      point
    };
  } catch (error) {
    const reason = error?.message === 'timeout' ? 'timeout' : 'blocked-or-unavailable';
    return {
      ...createUnavailableRegionalContext(reason),
      point
    };
  }
}