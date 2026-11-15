/**
 * Lightweight localStorage persistence for the farmer-entered fields.
 *
 * Climate series are intentionally excluded: they come from NASA POWER or the
 * demo fallback and can be large. The storage key is versioned so a future
 * schema change can bump it without reading stale payloads.
 */

export const STORAGE_KEY = 'agrosmart:state:v1';
export const STORAGE_VERSION = 1;

function storageAvailable() {
  try {
    if (typeof localStorage === 'undefined') return false;
    const probeKey = '__agrosmart_probe__';
    localStorage.setItem(probeKey, '1');
    localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Keeps only the fields that belong in local persistence. Pure and testable
 * without a browser storage implementation.
 */
export function serializePersistedState(state) {
  return JSON.stringify({
    version: STORAGE_VERSION,
    parcel: state?.parcel ?? null,
    soil: state?.soil ?? null,
    priorities: state?.priorities ?? null,
    crops: state?.crops ?? null,
    currentRotation: state?.currentRotation ?? null
  });
}

/**
 * Parses a persisted payload, ignoring invalid JSON, unknown versions and
 * fields with the wrong shape.
 */
export function deserializePersistedState(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return {};

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (!isPlainObject(parsed) || parsed.version !== STORAGE_VERSION) return {};

  const result = {};
  if (isPlainObject(parsed.parcel)) result.parcel = parsed.parcel;
  if (isPlainObject(parsed.soil)) result.soil = parsed.soil;
  if (isPlainObject(parsed.priorities)) result.priorities = parsed.priorities;
  if (isStringArray(parsed.crops)) result.crops = [...parsed.crops];
  if (isStringArray(parsed.currentRotation)) result.currentRotation = [...parsed.currentRotation];
  return result;
}

export function loadPersistedState() {
  if (!storageAvailable()) return {};
  try {
    return deserializePersistedState(localStorage.getItem(STORAGE_KEY));
  } catch (error) {
    console.warn('No se pudo leer el estado guardado:', error);
    return {};
  }
}

export function savePersistedState(state) {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(STORAGE_KEY, serializePersistedState(state));
  } catch (error) {
    console.warn('No se pudo guardar el estado local:', error);
  }
}

export function clearPersistedState() {
  if (!storageAvailable()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('No se pudo limpiar el estado local:', error);
  }
}
