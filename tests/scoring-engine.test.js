import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRotationScores } from '../js/agriculture/scoring-engine.js';
import { normalizeWeights, rankRotations, weightedScore } from '../js/agriculture/rotation-engine.js';

const crops = [
  {
    id: 'papa',
    name: 'Papa',
    tempMinC: 8,
    tempMaxC: 20,
    waterNeedMmMonth: 90
  },
  {
    id: 'quinua',
    name: 'Quinua',
    tempMinC: 5,
    tempMaxC: 22,
    waterNeedMmMonth: 45
  },
  {
    id: 'maiz',
    name: 'Maíz',
    tempMinC: 12,
    tempMaxC: 28,
    waterNeedMmMonth: 110
  },
  {
    id: 'haba',
    name: 'Haba',
    tempMinC: 6,
    tempMaxC: 22,
    waterNeedMmMonth: 70
  }
];

const wetClimate = {
  summary: { temp: 14 },
  // Monthly precipitation totals (mm/month) for a recent year-like series.
  monthlyPrecMm: [110, 100, 90, 50, 20, 10, 8, 12, 35, 70, 95, 105],
  monthlyTempC: [13, 13, 13, 13, 12, 11, 11, 12, 13, 13, 14, 13]
};

const dryClimate = {
  summary: { temp: 16 },
  monthlyPrecMm: [20, 18, 15, 10, 5, 2, 2, 4, 8, 12, 15, 18],
  monthlyTempC: [17, 17, 18, 18, 17, 16, 15, 16, 17, 18, 18, 17]
};

const loamSoil = {
  texture: 'franca',
  ph: 6.5,
  organicMatter: 'media',
  drainage: 'moderado',
  water: 'lluvia'
};

const sandySoil = {
  texture: 'arenosa',
  ph: 5.2,
  organicMatter: 'baja',
  drainage: 'bueno',
  water: 'lluvia'
};

test('computeRotationScores is deterministic and returns all criteria in 0-100', () => {
  const a = computeRotationScores({
    sequence: ['papa', 'quinua', 'haba'],
    climate: wetClimate,
    soil: loamSoil,
    crops
  });
  const b = computeRotationScores({
    sequence: ['papa', 'quinua', 'haba'],
    climate: wetClimate,
    soil: loamSoil,
    crops
  });

  assert.deepEqual(a, b);
  for (const key of ['agua', 'suelo', 'prod', 'costo', 'riesgo']) {
    assert.equal(typeof a[key], 'number', `${key} should be a number`);
    assert.ok(a[key] >= 0 && a[key] <= 100, `${key} should be within 0-100, got ${a[key]}`);
  }
});

test('changing climate data changes computed scores', () => {
  const wet = computeRotationScores({
    sequence: ['maiz', 'papa'],
    climate: wetClimate,
    soil: loamSoil,
    crops
  });
  const dry = computeRotationScores({
    sequence: ['maiz', 'papa'],
    climate: dryClimate,
    soil: loamSoil,
    crops
  });

  assert.notDeepEqual(wet, dry);
});

test('changing soil changes computed scores', () => {
  const loam = computeRotationScores({
    sequence: ['papa', 'quinua', 'haba'],
    climate: wetClimate,
    soil: loamSoil,
    crops
  });
  const sandy = computeRotationScores({
    sequence: ['papa', 'quinua', 'haba'],
    climate: wetClimate,
    soil: sandySoil,
    crops
  });

  assert.notDeepEqual(loam, sandy);
});

test('changing priorities changes ranking deterministically with computed scores', () => {
  // R1: low water need but poor temperature fit (strong on agua, weak on prod).
  // R2: high water need but excellent temperature fit (weak on agua, strong on prod).
  // Priorities deterministically flip the ranking when applied to computed scores.
  const climate = {
    summary: { temp: 21 },
    monthlyPrecMm: [60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60],
    monthlyTempC: [21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21]
  };
  const soil = { texture: 'franca', ph: 6.5, organicMatter: 'media', drainage: 'moderado', water: 'riego' };
  const contrastCrops = [
    { id: 'drycrop', tempMinC: 28, tempMaxC: 35, waterNeedMmMonth: 20, family: 'Amaranthaceae' },
    { id: 'thirsty', tempMinC: 18, tempMaxC: 24, waterNeedMmMonth: 200, family: 'Poaceae' }
  ];

  const rotations = [
    {
      id: 'R1',
      nombre: 'R1',
      sequence: ['drycrop'],
      scores: computeRotationScores({ sequence: ['drycrop'], climate, soil, crops: contrastCrops })
    },
    {
      id: 'R2',
      nombre: 'R2',
      sequence: ['thirsty'],
      scores: computeRotationScores({ sequence: ['thirsty'], climate, soil, crops: contrastCrops })
    }
  ];

  const waterFirst = rankRotations(rotations, normalizeWeights([5, 1, 1, 1, 1]));
  const prodFirst = rankRotations(rotations, normalizeWeights([1, 1, 5, 1, 1]));

  assert.deepEqual(
    waterFirst.map((r) => [r.id, r.wscore]),
    rankRotations(rotations, normalizeWeights([5, 1, 1, 1, 1])).map((r) => [r.id, r.wscore])
  );
  assert.deepEqual(
    waterFirst.map((r) => r.id),
    ['R1', 'R2']
  );
  assert.deepEqual(
    prodFirst.map((r) => r.id),
    ['R2', 'R1']
  );
  assert.equal(typeof weightedScore(rotations[0].scores, normalizeWeights([5, 1, 1, 1, 1])), 'number');
});
