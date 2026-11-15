const ELEVATION_API = 'https://api.open-meteo.com/v1/elevation';

const elevationCache = new Map();

function cacheKey(lat, lon) {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  return `${la.toFixed(4)},${lo.toFixed(4)}`;
}

/**
 * Fetches terrain elevation (meters above sea level) for a coordinate.
 * Uses Open-Meteo Elevation API (no key, CORS-friendly). Returns a number or
 * null when unavailable. Results are cached by rounded lat/lon.
 */
export async function fetchElevation({ lat, lon }) {
  const key = cacheKey(lat, lon);
  if (!key) return null;
  if (elevationCache.has(key)) return elevationCache.get(key);

  const url = `${ELEVATION_API}?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}`;

  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      elevationCache.set(key, null);
      return null;
    }
    const data = await response.json();
    const raw = Array.isArray(data?.elevation) ? data.elevation[0] : data?.elevation;
    const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    elevationCache.set(key, value);
    return value;
  } catch {
    return null;
  }
}

export function clearElevationCache() {
  elevationCache.clear();
}
