const CRITERIA_LABELS = {
  agua: 'el cuidado del agua',
  suelo: 'el cuidado del suelo',
  prod: 'la cosecha',
  costo: 'el gasto y la ganancia',
  riesgo: 'evitar riesgos del clima'
};

const LEGUME_IDS = new Set(['haba', 'arveja', 'frijol', 'alfalfa', 'tarwi']);

function average(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

function normalizeClimate(climate) {
  if (!climate || typeof climate !== 'object') return { monthlyPrecMm: [], meanTemp: null };
  let monthlyPrecMm = Array.isArray(climate.monthlyPrecMm) ? [...climate.monthlyPrecMm] : null;
  const series = climate.series && typeof climate.series === 'object' ? climate.series : null;
  if (!monthlyPrecMm && series) {
    const period = series['1a'] || series['12m'] || series['6m'] || series['2a'] || Object.values(series)[0];
    if (period && Array.isArray(period.prec)) monthlyPrecMm = period.prec.map(Number);
  }
  monthlyPrecMm = (monthlyPrecMm || []).filter((v) => Number.isFinite(v));
  const summary = climate.summary || {};
  const meanTemp = Number.isFinite(summary.temp) ? summary.temp : null;
  return { monthlyPrecMm, meanTemp };
}

function cropName(cropId, catalog) {
  const crop = Array.isArray(catalog) ? catalog.find((c) => c && c.id === cropId) : null;
  return crop?.name || cropId;
}

function hasLegume(sequence, catalog) {
  const seq = Array.isArray(sequence) ? sequence : [];
  return seq.some((id) => {
    const crop = Array.isArray(catalog) ? catalog.find((c) => c && c.id === id) : null;
    const family = String(crop?.family || '').toLowerCase();
    return LEGUME_IDS.has(id) || family.includes('fabaceae') || family.includes('legum');
  });
}

function diversityLabel(sequence) {
  const seq = Array.isArray(sequence) ? sequence : [];
  const unique = new Set(seq).size;
  if (!seq.length) return 'la secuencia';
  if (unique >= 3 && unique === seq.length) return 'variar los cultivos';
  if (unique >= 2) return 'alternar cultivos';
  return 'la secuencia elegida';
}

function pickTopCriteria(scores) {
  const entries = Object.entries(scores || {}).filter(([, v]) => typeof v === 'number');
  if (!entries.length) return [];
  entries.sort((a, b) => b[1] - a[1]);
  return entries.filter(([, v]) => v >= 65).slice(0, 2).map(([k]) => k);
}

function pickLowCriteria(scores) {
  const entries = Object.entries(scores || {}).filter(([, v]) => typeof v === 'number');
  if (!entries.length) return [];
  entries.sort((a, b) => a[1] - b[1]);
  return entries.filter(([, v]) => v < 60).slice(0, 2).map(([k]) => k);
}

function noteByType(notas, type) {
  if (!Array.isArray(notas)) return null;
  return notas.find((n) => n && n.type === type) || null;
}

/**
 * Builds a plain-language (neutral Spanish, no jargon) summary for a rotation.
 * Data-driven from computed scores, sequence, climate, soil and derived notes.
 */
export function buildRotationSummary({ sequence, scores, climate, soil, crops, notas } = {}) {
  const sc = scores && typeof scores === 'object' ? scores : {};
  const seq = Array.isArray(sequence) ? sequence : [];
  const catalog = Array.isArray(crops) ? crops : [];
  const clim = normalizeClimate(climate);
  const soilData = soil && typeof soil === 'object' ? soil : {};
  const water = String(soilData.water || soilData.agua || '').toLowerCase();

  const top = pickTopCriteria(sc);
  const low = pickLowCriteria(sc);

  // Mejora
  let mejora = 'Mejora: ayuda a organizar la siembra según lo que priorizas.';
  if (top.length) {
    const labels = top.map((k) => CRITERIA_LABELS[k]).filter(Boolean);
    mejora = `Mejora: favorece ${labels.join(' y ')}.`;
  } else if (hasLegume(seq, catalog)) {
    mejora = 'Mejora: puede ayudar al suelo al incluir cultivos que lo mejoran.';
  } else if (new Set(seq).size >= 3) {
    mejora = 'Mejora: permite variar los cultivos y equilibrar el trabajo en la parcela.';
  }

  // Costo / esfuerzo / tradeoff
  const parts = [];
  if (typeof sc.costo === 'number' && sc.costo < 55) {
    parts.push('puede requerir más gasto o trabajo');
  } else if (typeof sc.agua === 'number' && sc.agua < 55) {
    parts.push('puede requerir más cuidado del agua o riego');
  }
  if (water === 'lluvia' && average(clim.monthlyPrecMm) !== null && average(clim.monthlyPrecMm) < 40) {
    parts.push('depende mucho de la lluvia');
  }
  if (typeof sc.prod === 'number' && sc.prod < 55 && parts.length === 0) {
    parts.push('la cosecha puede ser más baja si las condiciones no acompañan');
  }
  if (!parts.length) {
    parts.push(diversityLabel(seq) + ' puede pedir algo de planificación y seguimiento');
  }
  const costo = `Cuesta: ${parts[0]}.`;

  // Riesgo principal
  let riesgo = 'Riesgo principal: conviene observar el clima y el suelo de tu parcela antes de decidir.';
  const bad = noteByType(notas, 'bad');
  const warn = noteByType(notas, 'warn');
  if (typeof sc.agua === 'number' && sc.agua <= 45) {
    riesgo = 'Riesgo principal: puede faltar agua en épocas secas para esta secuencia.';
  } else if (typeof sc.riesgo === 'number' && sc.riesgo <= 45) {
    riesgo = 'Riesgo principal: el clima puede afectar más a estos cultivos en algunos meses.';
  } else if (typeof sc.suelo === 'number' && sc.suelo <= 45) {
    riesgo = 'Riesgo principal: el suelo puede desgastarse o rendir menos si se repiten cultivos.';
  } else if (bad && /agua|déficit|hídr|seco/i.test(bad.text)) {
    riesgo = 'Riesgo principal: puede faltar agua en los meses más secos.';
  } else if (bad && /divers|repet|monocult|plaga|suelo/i.test(bad.text)) {
    riesgo = 'Riesgo principal: repetir cultivos puede traer plagas o cansar el suelo.';
  } else if (bad && /térm|calor|helad/i.test(bad.text)) {
    riesgo = 'Riesgo principal: el frío o el calor pueden afectar algunos cultivos.';
  } else if (warn && /agua|ajustada|riego/i.test(warn.text)) {
    riesgo = 'Riesgo principal: el agua puede quedar justa en meses críticos.';
  } else if (low.includes('riesgo')) {
    riesgo = 'Riesgo principal: hay meses en que el clima puede complicar esta rotación.';
  } else if (low.includes('agua')) {
    riesgo = 'Riesgo principal: puede faltar agua en algunos momentos del año.';
  } else if (low.includes('suelo')) {
    riesgo = 'Riesgo principal: conviene cuidar el suelo para mantener el rendimiento.';
  }

  return { mejora, costo, riesgo };
}
