import { CRITERIA } from './rotation-engine.js';

/**
 * NASA-driven, deterministic scoring engine (simplified agronomic model).
 *
 * Formula and assumptions (transparent):
 * - Inputs: rotation sequence (ordered crop ids), climate context (NASA POWER
 *   monthly series/summary), local soil, and crop catalog with agronomic attrs.
 * - Climate suitability per crop:
 *   - Water: compares crop `waterNeedMmMonth` against monthly precipitation
 *     `PRECTOTCORR` totals (mm/month). Balance = mean(monthlyPrec / need)
 *     clamped; water-stress risk = share of months where precip < need * 0.6.
 *   - Temperature: compares mean `T2M` and the monthly series against the
 *     crop window [`tempMinC`, `tempMaxC`]. Heat/frost risk derived from months
 *     outside that window (series extremes when available).
 * - Soil modifiers (applied to crop/rotation scores): texture, pH, organic
 *   matter, drainage, and water availability shift each criterion by bounded
 *   factors (e.g. sandy+rainfed penalizes agua/riesgo; good OM/drainage lifts
 *   suelo/prod). Soil pH fit is compared to a neutral range per crop context.
 * - Rotation-level signals: sequence diversity (unique/length) and consecutive
 *   repetition/monoculture penalize suelo and riesgo; legume presence gives a
 *   small suelo bonus when identifiable.
 * - Per-criteria crop scores are averaged over the rotation, adjusted by
 *   rotation/soil modifiers, then clamped to [0, 100] and rounded.
 * - Aggregation: the five farmer-priority weights are applied by the existing
 *   `normalizeWeights`/`weightedScore` (rotation-engine.js); this module only
 *   computes per-criteria scores {agua, suelo, prod, costo, riesgo}.
 *
 * Limitations: regional climate (~50 km), simplified rules, no phenology model.
 * Results are indicative decision support, not field truth.
 */

const LEGUME_IDS = new Set(['haba', 'arveja', 'frijol', 'alfalfa', 'tarwi']);

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function average(values) {
  const nums = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function normalizeClimate(climate) {
  if (!climate || typeof climate !== 'object') {
    return { monthlyPrecMm: [], monthlyTempC: [], meanTemp: null, meanPrec: null };
  }

  // Accept explicit arrays (tests) or NASA POWER/demo normalized shape.
  let monthlyPrecMm = Array.isArray(climate.monthlyPrecMm) ? [...climate.monthlyPrecMm] : null;
  let monthlyTempC = Array.isArray(climate.monthlyTempC) ? [...climate.monthlyTempC] : null;

  const series = climate.series && typeof climate.series === 'object' ? climate.series : null;
  if ((!monthlyPrecMm || !monthlyTempC) && series) {
    const period = series['1a'] || series['12m'] || series['6m'] || series['2a'] || Object.values(series)[0];
    if (period && typeof period === 'object') {
      if (!monthlyPrecMm && Array.isArray(period.prec)) monthlyPrecMm = period.prec.map(Number);
      if (!monthlyTempC && Array.isArray(period.temp)) monthlyTempC = period.temp.map(Number);
    }
  }

  monthlyPrecMm = (monthlyPrecMm || []).filter((v) => Number.isFinite(v));
  monthlyTempC = (monthlyTempC || []).filter((v) => Number.isFinite(v));

  const summary = climate.summary && typeof climate.summary === 'object' ? climate.summary : {};
  const meanTemp = Number.isFinite(summary.temp) ? summary.temp : average(monthlyTempC);
  const meanPrec = Number.isFinite(summary.prec) && monthlyPrecMm.length
    ? average(monthlyPrecMm)
    : average(monthlyPrecMm);

  return { monthlyPrecMm, monthlyTempC, meanTemp, meanPrec };
}

function getCrop(cropId, catalog) {
  if (!Array.isArray(catalog)) return null;
  return catalog.find((crop) => crop && crop.id === cropId) || null;
}

function waterDemandMm(crop) {
  if (!crop) return 70;
  if (Number.isFinite(crop.waterNeedMmMonth)) return crop.waterNeedMmMonth;
  const label = String(crop.waterDemand || '').toLowerCase();
  if (label === 'alta') return 110;
  if (label === 'baja') return 45;
  return 75; // media / unknown
}

function tempWindow(crop) {
  const min = Number.isFinite(crop?.tempMinC) ? crop.tempMinC : 8;
  const max = Number.isFinite(crop?.tempMaxC) ? crop.tempMaxC : 24;
  return { min, max };
}

function soilModifiers(soil) {
  const s = soil && typeof soil === 'object' ? soil : {};
  const texture = String(s.texture || 'franca').toLowerCase();
  const om = String(s.organicMatter || s.materiaOrganica || 'media').toLowerCase();
  const drainage = String(s.drainage || s.drenaje || 'moderado').toLowerCase();
  const water = String(s.water || s.agua || 'lluvia').toLowerCase();
  const ph = Number.isFinite(s.ph) ? s.ph : 6.5;

  let agua = 0;
  let suelo = 0;
  let prod = 0;
  let costo = 0;
  let riesgo = 0;

  // Texture & water retention
  if (texture === 'arenosa' || texture === 'sandy') {
    agua -= 10; riesgo += 6; prod -= 4;
  } else if (texture === 'arcillosa' || texture === 'clayey' || texture === 'franco-arcillosa') {
    agua += 6; suelo += 2; riesgo -= 2;
  } else if (texture === 'franca' || texture === 'loam') {
    agua += 4; suelo += 4; prod += 4;
  } else if (texture === 'limosa') {
    agua += 2; suelo += 2;
  }

  // Organic matter
  if (om === 'alta' || om === 'high') {
    suelo += 10; agua += 4; prod += 4; riesgo -= 3;
  } else if (om === 'media' || om === 'medium') {
    suelo += 4; prod += 2;
  } else if (om === 'baja' || om === 'low') {
    suelo -= 8; prod -= 4; costo += 4; riesgo += 3;
  }

  // Drainage
  if (drainage === 'bueno' || drainage === 'good') {
    suelo += 4; riesgo -= 2;
  } else if (drainage === 'lento' || drainage === 'poor' || drainage === 'muy-lento' || drainage === 'muy lento') {
    suelo -= 6; riesgo += 6; prod -= 3;
  } else if (drainage === 'moderado' || drainage === 'moderate') {
    suelo += 2;
  }

  // Water availability
  if (water === 'riego' || water === 'irrigated') {
    agua += 12; riesgo -= 6; prod += 4; costo += 3;
  } else if (water === 'mixto' || water === 'mixed') {
    agua += 6; riesgo -= 3; prod += 2; costo += 2;
  } else {
    // lluvia / rainfed
    costo -= 2;
  }

  // pH (general suitability around 5.5-7.5)
  const phDelta = ph < 5.5 ? 5.5 - ph : ph > 7.5 ? ph - 7.5 : 0;
  const phPenalty = Math.min(12, phDelta * 6);
  suelo -= phPenalty;
  prod -= phPenalty * 0.7;
  riesgo += phPenalty * 0.4;

  return { agua, suelo, prod, costo, riesgo };
}

function cropClimateScores(crop, climate) {
  const need = waterDemandMm(crop);
  const { min, max } = tempWindow(crop);
  const { monthlyPrecMm, monthlyTempC, meanTemp } = climate;

  // Water suitability vs monthly precipitation
  let waterBalance = 70;
  let waterStressShare = 0.3;
  if (monthlyPrecMm.length) {
    const ratios = monthlyPrecMm.map((p) => p / need);
    const meanRatio = average(ratios) ?? 0;
    waterBalance = clamp(meanRatio * 80, 10, 100);
    const stressMonths = ratios.filter((r) => r < 0.6).length;
    waterStressShare = stressMonths / ratios.length;
  } else if (Number.isFinite(climate.meanPrec)) {
    const meanRatio = climate.meanPrec / need;
    waterBalance = clamp(meanRatio * 80, 10, 100);
    waterStressShare = meanRatio < 0.6 ? 0.7 : meanRatio < 0.9 ? 0.35 : 0.15;
  }

  // Temperature suitability
  const refTemp = Number.isFinite(meanTemp) ? meanTemp : average(monthlyTempC);
  let tempFit = 65;
  let heatFrostRisk = 0.25;
  if (Number.isFinite(refTemp)) {
    if (refTemp >= min && refTemp <= max) {
      const span = Math.max(1, max - min);
      const center = (min + max) / 2;
      tempFit = 100 - (Math.abs(refTemp - center) / (span / 2)) * 20;
    } else {
      const dist = refTemp < min ? min - refTemp : refTemp - max;
      tempFit = clamp(70 - dist * 8, 5, 70);
    }
  }
  if (monthlyTempC.length) {
    const outMonths = monthlyTempC.filter((t) => t < min - 1 || t > max + 1).length;
    heatFrostRisk = outMonths / monthlyTempC.length;
  } else if (Number.isFinite(refTemp)) {
    heatFrostRisk = refTemp < min - 1 || refTemp > max + 1 ? 0.7 : 0.2;
  }

  const agua = clamp(waterBalance * 0.85 + (1 - waterStressShare) * 25);
  const prod = clamp(tempFit * 0.65 + waterBalance * 0.35);
  const riesgo = clamp(100 - heatFrostRisk * 55 - waterStressShare * 45);
  const costo = clamp(agua * 0.45 + riesgo * 0.35 + prod * 0.2);
  const sueloBase = 60; // refined at rotation/soil level

  return { agua, suelo: sueloBase, prod, costo, riesgo };
}

function rotationSignals(sequence, cropsCatalog) {
  const seq = Array.isArray(sequence) ? sequence : [];
  const n = seq.length || 1;
  const unique = new Set(seq.filter(Boolean));
  const diversity = unique.size / n;

  let repeats = 0;
  for (let i = 1; i < seq.length; i += 1) {
    if (seq[i] && seq[i] === seq[i - 1]) repeats += 1;
  }

  const hasLegume = seq.some((id) => {
    const crop = getCrop(id, cropsCatalog);
    const family = String(crop?.family || '').toLowerCase();
    return LEGUME_IDS.has(id) || family.includes('fabaceae') || family.includes('legum');
  });

  const monoculturePenalty = diversity < 0.5 ? 18 : diversity < 0.75 ? 8 : 0;
  const repeatPenalty = repeats * 12;
  const legumeBonus = hasLegume ? 8 : 0;

  return { diversity, monoculturePenalty, repeatPenalty, legumeBonus };
}

/**
 * Computes per-criteria scores for a rotation.
 * Pure and deterministic: same inputs always produce the same output.
 */
export function computeRotationScores({ sequence, climate, soil, crops } = {}) {
  const seq = Array.isArray(sequence) ? sequence : [];
  const catalog = Array.isArray(crops) ? crops : [];
  const normClimate = normalizeClimate(climate);
  const soilMod = soilModifiers(soil);
  const signals = rotationSignals(seq, catalog);

  const perCrop = seq.map((cropId) => cropClimateScores(getCrop(cropId, catalog) || { id: cropId }, normClimate));
  const base = perCrop.length
    ? {
        agua: average(perCrop.map((s) => s.agua)) ?? 50,
        suelo: average(perCrop.map((s) => s.suelo)) ?? 50,
        prod: average(perCrop.map((s) => s.prod)) ?? 50,
        costo: average(perCrop.map((s) => s.costo)) ?? 50,
        riesgo: average(perCrop.map((s) => s.riesgo)) ?? 50
      }
    : { agua: 50, suelo: 50, prod: 50, costo: 50, riesgo: 50 };

  // Apply rotation diversity / soil modifiers
  base.agua += soilMod.agua;
  base.suelo += soilMod.suelo + signals.legumeBonus + (signals.diversity - 0.5) * 20 - signals.monoculturePenalty - signals.repeatPenalty * 0.5;
  base.prod += soilMod.prod - signals.monoculturePenalty * 0.3;
  base.costo += soilMod.costo - signals.monoculturePenalty * 0.4 - signals.repeatPenalty * 0.4;
  base.riesgo += soilMod.riesgo - signals.monoculturePenalty - signals.repeatPenalty * 0.8;

  const result = {};
  for (const criterion of CRITERIA) {
    result[criterion.key] = Math.round(clamp(base[criterion.key]));
  }
  return result;
}

export const __test__ = { normalizeClimate, soilModifiers, waterDemandMm };
