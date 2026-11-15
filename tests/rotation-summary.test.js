import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRotationSummary } from '../js/agriculture/rotation-summary.js';

const crops = [
  { id: 'haba', name: 'Haba', family: 'Fabaceae', waterDemand: 'media', tempMinC: 6, tempMaxC: 22, waterNeedMmMonth: 70 },
  { id: 'papa', name: 'Papa', waterDemand: 'alta', tempMinC: 8, tempMaxC: 20, waterNeedMmMonth: 90 },
  { id: 'quinua', name: 'Quinua', waterDemand: 'baja', tempMinC: 5, tempMaxC: 22, waterNeedMmMonth: 45 }
];

const wetClimate = {
  summary: { temp: 14 },
  monthlyPrecMm: [110, 100, 90, 50, 20, 10, 8, 12, 35, 70, 95, 105],
  monthlyTempC: [13, 13, 13, 13, 12, 11, 11, 12, 13, 13, 14, 13]
};

const loamSoil = { texture: 'franca', ph: 6.5, organicMatter: 'media', drainage: 'moderado', water: 'lluvia' };

test('buildRotationSummary returns plain-language mejora, costo y riesgo', () => {
  const summary = buildRotationSummary({
    sequence: ['papa', 'quinua', 'haba'],
    scores: { agua: 72, suelo: 78, prod: 70, costo: 62, riesgo: 74 },
    climate: wetClimate,
    soil: loamSoil,
    crops,
    notas: [
      { type: 'ok', text: 'Balance hídrico favorable.' },
      { type: 'warn', text: 'Agua ajustada en meses críticos.' }
    ]
  });

  assert.equal(typeof summary, 'object');
  assert.equal(typeof summary.mejora, 'string');
  assert.equal(typeof summary.costo, 'string');
  assert.equal(typeof summary.riesgo, 'string');
  assert.match(summary.mejora.toLowerCase(), /mejora/);
  assert.match(summary.costo.toLowerCase(), /(cuesta|costo)/);
  assert.match(summary.riesgo.toLowerCase(), /riesgo/);
});

test('buildRotationSummary is deterministic and reflects low water score as risk', () => {
  const input = {
    sequence: ['papa'],
    scores: { agua: 30, suelo: 40, prod: 55, costo: 45, riesgo: 35 },
    climate: { summary: { temp: 16 }, monthlyPrecMm: [10, 8, 6, 5, 2, 2, 2, 3, 5, 8, 9, 10], monthlyTempC: [17,17,18,18,17,16,15,16,17,18,18,17] },
    soil: { texture: 'arenosa', ph: 5.2, organicMatter: 'baja', drainage: 'bueno', water: 'lluvia' },
    crops,
    notas: [{ type: 'bad', text: 'Riesgo de déficit hídrico.' }]
  };
  const a = buildRotationSummary(input);
  const b = buildRotationSummary(input);
  assert.deepEqual(a, b);
  assert.match(`${a.mejora} ${a.costo} ${a.riesgo}`.toLowerCase(), /agua|sequ|suelo|cosecha|clima/);
});
