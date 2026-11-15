import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CURRENT_ROTATION_ID,
  buildCurrentRotation,
  createRotation,
  normalizeRotation,
  sequenceToText
} from '../js/agriculture/rotation-model.js';
import { normalizeWeights, rankRotations, weightedScore } from '../js/agriculture/rotation-engine.js';
import {
  STORAGE_KEY,
  deserializePersistedState,
  serializePersistedState
} from '../js/state-persistence.js';

const demo = JSON.parse(readFileSync(new URL('../data/demo-scenarios.json', import.meta.url), 'utf8'));
const crops = JSON.parse(readFileSync(new URL('../data/crops.json', import.meta.url), 'utf8'));

test('createRotation builds the shared shape with sequenceText derived from crop names', () => {
  const rotation = createRotation({
    id: 'sug-1',
    nombre: 'Rotación sugerida',
    sequence: ['papa', 'quinua', 'haba'],
    origin: 'suggested',
    scores: { agua: 80, suelo: 70, prod: 60, costo: 50, riesgo: 40 },
    cropCatalog: crops
  });

  assert.equal(rotation.id, 'sug-1');
  assert.equal(rotation.nombre, 'Rotación sugerida');
  assert.deepEqual(rotation.sequence, ['papa', 'quinua', 'haba']);
  assert.equal(rotation.sequenceText, 'Papa → Quinua → Haba');
  assert.equal(rotation.origin, 'suggested');
  assert.equal(rotation.scores.agua, 80);
});

test('createRotation defaults scores to null and does not share sequence references', () => {
  const sequence = ['papa', 'maiz'];
  const rotation = createRotation({ id: 'sug-2', nombre: 'Sin puntaje', sequence, origin: 'suggested' });

  assert.equal(rotation.scores, null);
  assert.deepEqual(rotation.sequence, ['papa', 'maiz']);
  assert.equal(rotation.sequenceText, 'papa → maiz');

  sequence.push('quinua');
  assert.deepEqual(rotation.sequence, ['papa', 'maiz']);
});

test('buildCurrentRotation uses the shared model and preserves repeated crops', () => {
  const rotation = buildCurrentRotation(['papa', 'maiz', 'papa'], { cropCatalog: crops });

  assert.equal(rotation.id, CURRENT_ROTATION_ID);
  assert.equal(rotation.nombre, 'Tu rotación actual');
  assert.equal(rotation.origin, 'current');
  assert.equal(rotation.scores, null);
  assert.deepEqual(rotation.sequence, ['papa', 'maiz', 'papa']);
  assert.equal(rotation.sequenceText, 'Papa → Maíz → Papa');
});

test('sequenceToText falls back to crop ids when the catalog has no name', () => {
  assert.equal(sequenceToText(['papa', 'milo'], []), 'papa → milo');
  assert.equal(sequenceToText([], crops), '');
});

test('normalizeRotation coerces demo JSON rotations into the shared shape', () => {
  const first = normalizeRotation(demo.rotations[0], crops);

  assert.equal(first.id, 'A');
  assert.equal(first.nombre, 'Rotación A');
  assert.equal(first.origin, 'demo');
  assert.deepEqual(first.sequence, ['papa', 'quinua', 'haba']);
  assert.equal(first.sequenceText, 'Papa → Quinua → Haba → Descanso');
  assert.deepEqual(first.scores, { agua: 85, suelo: 90, prod: 78, costo: 70, riesgo: 85 });
  assert.equal(first.notas.length, 3);
});

test('normalizeRotation parses annotated demo sequences such as rotation C', () => {
  const third = normalizeRotation(demo.rotations[2], crops);

  assert.deepEqual(third.sequence, ['papa', 'maiz', 'papa']);
  assert.equal(third.sequenceText, 'Papa → Maíz → Papa (riesgo monocultivo)');
});

test('normalized demo rotations keep ranking 82, 74 and 56 with default weights', () => {
  const normalized = demo.rotations.map((raw) => normalizeRotation(raw, crops));
  const ranked = rankRotations(normalized, normalizeWeights([4, 3, 5, 3, 4]));

  assert.deepEqual(
    ranked.map((rotation) => [rotation.id, rotation.wscore]),
    [
      ['A', 82],
      ['B', 74],
      ['C', 56]
    ]
  );
});

test('weightedScore returns null for rotations without scores', () => {
  assert.equal(weightedScore(null, normalizeWeights([4, 3, 5, 3, 4])), null);
});

test('rankRotations keeps unscored rotations last and assigns null wscore', () => {
  const scored = normalizeRotation(demo.rotations[0], crops);
  const current = buildCurrentRotation(['papa', 'maiz'], { cropCatalog: crops });
  const ranked = rankRotations([current, scored], normalizeWeights([4, 3, 5, 3, 4]));

  assert.equal(ranked[0].id, 'A');
  assert.equal(ranked[0].wscore, 82);
  assert.equal(ranked[1].id, CURRENT_ROTATION_ID);
  assert.equal(ranked[1].wscore, null);
  assert.deepEqual(
    ranked.map((rotation) => rotation.rank),
    [0, 1]
  );
});

test('persistence round-trip keeps only the supported fields', () => {
  const serialized = serializePersistedState({
    parcel: { lat: -13.6, lon: -73.3, district: 'Andahuaylas', community: 'Argama' },
    soil: { texture: 'arenosa', ph: 6.8, organicMatter: 'baja', drainage: 'bueno', water: 'riego' },
    priorities: { agua: 2, suelo: 3, prod: 5, costo: 3, riesgo: 4 },
    crops: ['papa', 'maiz'],
    currentRotation: ['papa', 'maiz', 'papa'],
    climate: { series: [1, 2, 3], summary: { temp: 14 } },
    alerts: [{ title: 'no debe persistirse' }]
  });

  const restored = deserializePersistedState(serialized);

  assert.deepEqual(restored.parcel, { lat: -13.6, lon: -73.3, district: 'Andahuaylas', community: 'Argama' });
  assert.deepEqual(restored.soil, { texture: 'arenosa', ph: 6.8, organicMatter: 'baja', drainage: 'bueno', water: 'riego' });
  assert.deepEqual(restored.priorities, { agua: 2, suelo: 3, prod: 5, costo: 3, riesgo: 4 });
  assert.deepEqual(restored.crops, ['papa', 'maiz']);
  assert.deepEqual(restored.currentRotation, ['papa', 'maiz', 'papa']);
  assert.equal(restored.climate, undefined);
  assert.equal(restored.alerts, undefined);
});

test('persistence rejects invalid JSON, malformed fields and a different payload version', () => {
  assert.deepEqual(deserializePersistedState('not json'), {});
  assert.deepEqual(deserializePersistedState(JSON.stringify({ version: 999, crops: ['papa'] })), {});
  assert.deepEqual(deserializePersistedState(JSON.stringify({ version: 1, crops: 'papa' })), {});
  assert.deepEqual(deserializePersistedState(JSON.stringify({ version: 1, currentRotation: [1, 2] })), {});
});

test('persistence uses a versioned storage key', () => {
  assert.match(STORAGE_KEY, /:v\d+$/);
});
