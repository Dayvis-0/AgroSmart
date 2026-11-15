const STATUS_ORDER = { recommended: 0, possible: 1, not_recommended: 2 };

export const SUITABILITY_LABELS = {
  recommended: 'Recomendado',
  possible: 'Posible',
  not_recommended: 'No recomendado'
};

function normalizeDistrict(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function zoneMatches(crop, district) {
  const zones = Array.isArray(crop?.zones) ? crop.zones : [];
  if (!zones.length) return true;
  if (zones.includes('*')) return true;
  const target = normalizeDistrict(district);
  if (!target) return false;
  return zones.some((zone) => normalizeDistrict(zone) === target);
}

function hasAltitudeRange(crop) {
  return Number.isFinite(crop?.altitudeMinM) && Number.isFinite(crop?.altitudeMaxM);
}

/**
 * Classifies a crop for a parcel context.
 * @param {object} crop crop catalog entry
 * @param {{ elevation?: number|null, district?: string|null }} parcel
 * @returns {{ status: 'recommended'|'possible'|'not_recommended', reason: string }}
 */
export function classifyCropSuitability(crop, parcel = {}) {
  const elevation = parcel?.elevation;
  const district = parcel?.district ?? '';
  const elevationKnown = typeof elevation === 'number' && Number.isFinite(elevation);
  const inZone = zoneMatches(crop, district);

  if (!elevationKnown) {
    if (!inZone && district) {
      return {
        status: 'possible',
        reason: 'Zona distinta y sin dato de altitud; revisa antes de sembrar.'
      };
    }
    return {
      status: 'possible',
      reason: 'Sin dato de altitud de la parcela; aptitud orientativa.'
    };
  }

  if (!hasAltitudeRange(crop)) {
    return inZone
      ? { status: 'possible', reason: 'Sin rango de altitud definido para este cultivo.' }
      : { status: 'possible', reason: 'Sin rango de altitud definido y zona no especificada.' };
  }

  const { altitudeMinM, altitudeMaxM } = crop;
  const inRange = elevation >= altitudeMinM && elevation <= altitudeMaxM;

  if (inRange && inZone) {
    return {
      status: 'recommended',
      reason: `Apto para ${Math.round(elevation)} msnm y tu zona (${altitudeMinM}–${altitudeMaxM} msnm).`
    };
  }

  if (!inRange) {
    const relation = elevation < altitudeMinM ? 'por debajo' : 'por encima';
    return {
      status: 'not_recommended',
      reason: `Fuera de rango de altitud (${altitudeMinM}–${altitudeMaxM} msnm); tu parcela está ${relation} (${Math.round(elevation)} msnm).`
    };
  }

  return {
    status: 'possible',
    reason: `Altitud adecuada (${altitudeMinM}–${altitudeMaxM} msnm), pero la zona indicada es distinta.`
  };
}

export function evaluateCropSuitability(crops = [], parcel = {}) {
  return crops.map((crop) => ({
    crop,
    ...classifyCropSuitability(crop, parcel)
  }));
}

export function sortSuitabilityResults(results = []) {
  return [...results].sort((a, b) => {
    const diff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (diff !== 0) return diff;
    return String(a.crop?.name ?? '').localeCompare(String(b.crop?.name ?? ''), 'es');
  });
}

export function getSuitabilitySummary(parcel = {}) {
  const elevation = parcel?.elevation;
  const district = typeof parcel?.district === 'string' ? parcel.district.trim() : '';
  const elevationKnown = typeof elevation === 'number' && Number.isFinite(elevation);

  if (elevationKnown && district) {
    return `Altitud de la parcela: ${Math.round(elevation)} msnm · Zona: ${district}`;
  }
  if (elevationKnown) {
    return `Altitud de la parcela: ${Math.round(elevation)} msnm · Zona: no indicada`;
  }
  if (district) {
    return `Zona: ${district} · Altitud de la parcela: consultando o no disponible`;
  }
  return 'Altitud y zona de la parcela: no disponibles aún. Puedes elegir cultivos igualmente.';
}
