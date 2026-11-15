import { DEFAULT_PARCEL } from './config.js';
import { clearPersistedState, loadPersistedState, savePersistedState } from './state-persistence.js';

export const DEFAULT_SOIL = {
  texture: 'franca',
  ph: 6.2,
  organicMatter: 'media',
  drainage: 'moderado',
  water: 'lluvia'
};

export const DEFAULT_PRIORITIES = { agua: 4, suelo: 3, prod: 5, costo: 3, riesgo: 4 };

export const DEFAULT_CROPS = ['papa', 'maiz', 'quinua'];

const persisted = loadPersistedState();

const state = {
  parcel: { ...DEFAULT_PARCEL, ...persisted.parcel },
  soil: { ...DEFAULT_SOIL, ...persisted.soil },
  priorities: { ...DEFAULT_PRIORITIES, ...persisted.priorities },
  crops: Array.isArray(persisted.crops) ? [...persisted.crops] : [...DEFAULT_CROPS],
  currentRotation: Array.isArray(persisted.currentRotation) ? [...persisted.currentRotation] : null,
  climate: {
    status: 'idle',
    source: null,
    series: null,
    summary: null,
    meta: null,
    waterDeficit: null,
    error: null
  },
  // Second NASA source (regional context, e.g. GPM/SMAP): labeled status only,
  // never faked. Not persisted.
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
  },
  alerts: [],
  period: '1a'
};

const subscribers = new Set();

export function getState() {
  return state;
}

export function setState(patch, options = {}) {
  const previous = {
    ...state,
    parcel: { ...state.parcel },
    soil: { ...state.soil },
    priorities: { ...state.priorities },
    crops: [...state.crops],
    currentRotation: state.currentRotation ? [...state.currentRotation] : null,
    climate: { ...state.climate },
    regionalContext: { ...state.regionalContext },
    alerts: [...state.alerts]
  };
  Object.assign(state, patch);
  for (const subscriber of subscribers) subscriber(state, previous, options);
  return state;
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/**
 * True when a previous session left usable persisted fields.
 */
export function hasPersistedState() {
  return Object.keys(persisted).length > 0;
}

/**
 * Clears local persistence and returns the farmer-entered fields to their
 * defaults. Climate data is intentionally not persisted and not touched here.
 */
export function resetState() {
  clearPersistedState();
  setState(
    {
      parcel: { ...DEFAULT_PARCEL },
      soil: { ...DEFAULT_SOIL },
      priorities: { ...DEFAULT_PRIORITIES },
      crops: [...DEFAULT_CROPS],
      currentRotation: null
    },
    { persist: false }
  );
}

subscribe((current, _previous, options) => {
  if (options.persist === false) return;
  savePersistedState(current);
});
