const LEGUME_IDS = new Set(['haba', 'arveja', 'frijol', 'alfalfa', 'tarwi']);

function average(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

function getCrop(cropId, catalog) {
  if (!Array.isArray(catalog)) return null;
  return catalog.find((c) => c && c.id === cropId) || null;
}

function cropName(cropId, catalog) {
  const crop = getCrop(cropId, catalog);
  return crop?.name || cropId;
}

function waterNeedMm(crop) {
  if (!crop) return 70;
  if (Number.isFinite(crop.waterNeedMmMonth)) return crop.waterNeedMmMonth;
  const label = String(crop.waterDemand || '').toLowerCase();
  if (label === 'alta') return 110;
  if (label === 'baja') return 45;
  return 75;
}

function normalizeClimate(climate) {
  if (!climate || typeof climate !== 'object') {
    return { monthlyPrecMm: [], monthlyTempC: [], meanTemp: null, annualPrec: null };
  }
  let monthlyPrecMm = Array.isArray(climate.monthlyPrecMm) ? [...climate.monthlyPrecMm] : null;
  let monthlyTempC = Array.isArray(climate.monthlyTempC) ? [...climate.monthlyTempC] : null;
  const series = climate.series && typeof climate.series === 'object' ? climate.series : null;
  if ((!monthlyPrecMm || !monthlyTempC) && series) {
    const period = series['1a'] || series['12m'] || series['6m'] || series['2a'] || Object.values(series)[0];
    if (period) {
      if (!monthlyPrecMm && Array.isArray(period.prec)) monthlyPrecMm = period.prec.map(Number);
      if (!monthlyTempC && Array.isArray(period.temp)) monthlyTempC = period.temp.map(Number);
    }
  }
  monthlyPrecMm = (monthlyPrecMm || []).filter((v) => Number.isFinite(v));
  monthlyTempC = (monthlyTempC || []).filter((v) => Number.isFinite(v));
  const summary = climate.summary || {};
  const meanTemp = Number.isFinite(summary.temp) ? summary.temp : average(monthlyTempC);
  const annualPrec = Number.isFinite(summary.prec)
    ? summary.prec
    : monthlyPrecMm.length
      ? monthlyPrecMm.reduce((s, v) => s + v, 0)
      : null;
  return { monthlyPrecMm, monthlyTempC, meanTemp, annualPrec };
}

function sequenceStats(sequence, catalog) {
  const seq = Array.isArray(sequence) ? sequence : [];
  const unique = new Set(seq);
  let repeats = 0;
  for (let i = 1; i < seq.length; i += 1) {
    if (seq[i] && seq[i] === seq[i - 1]) repeats += 1;
  }
  const legumes = seq.filter((id) => {
    const crop = getCrop(id, catalog);
    const family = String(crop?.family || '').toLowerCase();
    return LEGUME_IDS.has(id) || family.includes('fabaceae') || family.includes('legum');
  });
  return {
    length: seq.length,
    uniqueCount: unique.size,
    diversity: seq.length ? unique.size / seq.length : 0,
    repeats,
    hasRepeatCrop: unique.size < seq.length,
    legumes
  };
}

/**
 * Derives plain-language evidence and risks (notas) from climate, soil,
 * sequence and computed scores. Pure and deterministic.
 */
export function deriveRotationInsights({ sequence, scores, climate, soil, crops } = {}) {
  const seq = Array.isArray(sequence) ? sequence : [];
  const catalog = Array.isArray(crops) ? crops : [];
  const sc = scores && typeof scores === 'object' ? scores : {};
  const s = soil && typeof soil === 'object' ? soil : {};
  const clim = normalizeClimate(climate);
  const stats = sequenceStats(seq, catalog);
  const notas = [];

  // --- Water / climate evidence ---
  const avgNeed = average(seq.map((id) => waterNeedMm(getCrop(id, catalog))));
  const meanMonthlyPrec = average(clim.monthlyPrecMm);
  const dryMonths = clim.monthlyPrecMm.filter((p) => p < 20).length;
  if (Number.isFinite(avgNeed) && Number.isFinite(meanMonthlyPrec)) {
    const ratio = meanMonthlyPrec / avgNeed;
    if (ratio < 0.6 || dryMonths >= 3) {
      notas.push({
        type: 'bad',
        text: `Riesgo de déficit hídrico: la precipitación media mensual (~${Math.round(meanMonthlyPrec)} mm) es baja frente a la demanda promedio de la rotación (~${Math.round(avgNeed)} mm/mes) y hay ${dryMonths} mes(es) muy secos (<20 mm).`
      });
    } else if (ratio < 0.9) {
      notas.push({
        type: 'warn',
        text: `Agua ajustada: la precipitación media (~${Math.round(meanMonthlyPrec)} mm/mes) cubre de forma justa la demanda promedio (~${Math.round(avgNeed)} mm/mes); conviene planificar el riego en meses críticos.`
      });
    } else {
      notas.push({
        type: 'ok',
        text: `Balance hídrico favorable: la precipitación media (~${Math.round(meanMonthlyPrec)} mm/mes) se ajusta o supera la demanda promedio de la rotación (~${Math.round(avgNeed)} mm/mes).`
      });
    }
  } else if (Number.isFinite(sc.agua)) {
    notas.push({
      type: sc.agua >= 65 ? 'ok' : sc.agua >= 45 ? 'warn' : 'bad',
      text: `Comportamiento hídrico estimado según el clima disponible (puntaje agua: ${sc.agua}/100).`
    });
  }

  // --- Temperature / heat-frost risk ---
  if (clim.monthlyTempC.length && seq.length) {
    let stressMonths = 0;
    let example = null;
    for (const id of seq) {
      const crop = getCrop(id, catalog);
      if (!crop) continue;
      const min = Number.isFinite(crop.tempMinC) ? crop.tempMinC : 8;
      const max = Number.isFinite(crop.tempMaxC) ? crop.tempMaxC : 24;
      const out = clim.monthlyTempC.filter((t) => t < min - 1 || t > max + 1).length;
      if (out > stressMonths) {
        stressMonths = out;
        example = cropName(id, catalog);
      }
    }
    if (stressMonths >= 4) {
      notas.push({
        type: 'bad',
        text: `Estrés térmico probable: en varios meses la temperatura sale del rango cómodo de cultivos como ${example || 'la secuencia'} (riesgo de calor o heladas según la época).`
      });
    } else if (stressMonths >= 2) {
      notas.push({
        type: 'warn',
        text: `Variación térmica a vigilar: algunos meses pueden quedar fuera del rango óptimo de ${example || 'la rotación'}; conviene ajustar fechas de siembra.`
      });
    } else if (Number.isFinite(clim.meanTemp)) {
      notas.push({
        type: 'ok',
        text: `Temperatura compatible: el promedio climático (~${clim.meanTemp.toFixed(1)} °C) se mantiene mayormente dentro de los rangos de la rotación.`
      });
    }
  }

  // --- Soil modifiers evidence ---
  const soilParts = [];
  const texture = String(s.texture || '').toLowerCase();
  const om = String(s.organicMatter || s.materiaOrganica || '').toLowerCase();
  const drainage = String(s.drainage || s.drenaje || '').toLowerCase();
  const water = String(s.water || s.agua || '').toLowerCase();
  if (texture) soilParts.push(`textura ${texture}`);
  if (om) soilParts.push(`materia orgánica ${om}`);
  if (drainage) soilParts.push(`drenaje ${drainage}`);
  if (water) soilParts.push(`agua ${water === 'lluvia' ? 'de lluvia' : water}`);
  if (soilParts.length) {
    const soilScore = Number.isFinite(sc.suelo) ? sc.suelo : null;
    let type = 'ok';
    if (soilScore !== null && soilScore < 45) type = 'bad';
    else if (soilScore !== null && soilScore < 65) type = 'warn';
    else if (om === 'baja' || texture === 'arenosa' || drainage.includes('lento') || drainage === 'poor') type = 'warn';
    notas.push({
      type,
      text: `Condición del suelo considerada (${soilParts.join(', ')}, pH ${Number.isFinite(s.ph) ? s.ph : '—'}): ${
        type === 'ok'
          ? 'favorece el desempeño de la rotación.'
          : 'puede limitar nutrientes o manejo del agua; conviene mejorar materia orgánica y drenaje.'
      }`
    });
  }

  // --- Diversity / repetition / monoculture risks ---
  if (stats.repeats > 0 || stats.diversity < 0.5) {
    notas.push({
      type: 'bad',
      text: `Riesgo por baja diversidad: hay repetición o monocultivo en la secuencia (${stats.uniqueCount} cultivo(s) distinto(s) en ${stats.length} pasos), lo que puede aumentar plagas y desgaste del suelo.`
    });
  } else if (stats.hasRepeatCrop) {
    notas.push({
      type: 'warn',
      text: `Diversidad moderada: la secuencia repite algún cultivo; alternar familias ayuda a reducir presión de plagas y enfermedades.`
    });
  } else if (stats.length >= 3) {
    notas.push({
      type: 'ok',
      text: `Buena diversidad: la rotación alterna ${stats.uniqueCount} cultivos distintos, lo que ayuda a cortar ciclos de plagas y equilibrar el suelo.`
    });
  }

  // --- Legume / soil health bonus ---
  if (stats.legumes.length) {
    const names = [...new Set(stats.legumes.map((id) => cropName(id, catalog)))].join(', ');
    notas.push({
      type: 'ok',
      text: `Aporte al suelo: la presencia de leguminosas (${names}) puede mejorar nitrógeno y la salud del suelo dentro de la rotación.`
    });
  }

  // --- Overall score-driven summary if few notas ---
  if (notas.length < 2 && Number.isFinite(sc.riesgo)) {
    notas.push({
      type: sc.riesgo >= 65 ? 'ok' : sc.riesgo >= 45 ? 'warn' : 'bad',
      text: `Riesgo climático global estimado en ${sc.riesgo}/100 según los datos de clima, suelo y la secuencia evaluada.`
    });
  }

  // Keep a compact, readable set
  return notas.slice(0, 6);
}
