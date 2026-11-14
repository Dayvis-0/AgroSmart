import { DEFAULT_PARCEL } from './config.js';

const state = {
  parcel: { ...DEFAULT_PARCEL },
  soil: {
    texture: 'franca',
    ph: 6.2,
    organicMatter: 'media',
    drainage: 'moderado',
    water: 'lluvia'
  },
  priorities: { agua: 4, suelo: 3, prod: 5, costo: 3, riesgo: 4 },
  crops: ['papa', 'maiz', 'quinua'],
  climate: {
    status: 'idle',
    source: null,
    series: null,
    summary: null,
    meta: null,
    waterDeficit: null,
    error: null
  },
  alerts: [],
  period: '1a'
};

const subscribers = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  const previous = {
    ...state,
    parcel: { ...state.parcel },
    soil: { ...state.soil },
    priorities: { ...state.priorities },
    crops: [...state.crops],
    climate: { ...state.climate },
    alerts: [...state.alerts]
  };
  Object.assign(state, patch);
  for (const subscriber of subscribers) subscriber(state, previous);
  return state;
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
