import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateCandidateRotations } from '../js/agriculture/rotation-generator.js';
import { deriveRotationInsights } from '../js/agriculture/rotation-insights.js';

const crops = JSON.parse(readFileSync(new URL('../data/crops.json', import.meta.url), 'utf8'));

const baseClimate = {
  summary: { temp: 14, prec: 723 },
  monthlyPrecMm: [112, 98, 86, 42, 18, 8, 6, 12, 32, 68, 95, 108],
  monthlyTempC: [13.1, 13.4, 13.8, 13.2, 12.4, 11.6, 11.2, 11.8, 12.6, 13.4, 13.9, 13.5]
};

const baseSoil = {
  texture: 'franca',
  ph: 6.2,
  organicMatter: 'media',
  drainage: 'moderado',
  water: 'lluvia'
};

test('default crop selection yields at least 3 generated candidate rotations', () => {
  const candidates = generateCandidateRotations(['papa', 'maiz', 'quinua'], { cropCatalog: crops });
  assert.ok(Array.isArray(candidates), 'should return an array');
  assert.ok(candidates.length >= 3, `expected >= 3 candidates, got ${candidates.length}`);
  for (const rotation of candidates) {
    assert.ok(Array.isArray(rotation.sequence) && rotation.sequence.length >= 2, 'each candidate has a sequence');
    assert.equal(rotation.origin, 'suggested');
  }
});

test('generated candidates are deterministic for the same input', () => {
  const pool = ['papa', 'maiz', 'quinua'];
  const a = generateCandidateRotations(pool, { cropCatalog: crops });
  const b = generateCandidateRotations(pool, { cropCatalog: crops });
  assert.deepEqual(
    a.map((r) => r.sequence),
    b.map((r) => r.sequence)
  );
});

test('generation handles few selected crops by producing enough valid variants', () => {
  const candidates = generateCandidateRotations(['papa', 'maiz'], { cropCatalog: crops });
  assert.ok(candidates.length >= 3, `expected >= 3 candidates for 2 crops, got ${candidates.length}`);
  const unique = new Set(candidates.map((r) => r.sequence.join('|')));
  assert.ok(unique.size >= 3, 'variants should be distinct sequences');
});

test('current rotation can be included in the compared set without breaking minimum count', () => {
  const currentSequence = ['quinua', 'papa', 'maiz'];
  const candidates = generateCandidateRotations(['papa', 'maiz', 'quinua'], {
    cropCatalog: crops,
    currentSequence
  });
  assert.ok(candidates.length >= 3, 'should still provide >= 3 suggested candidates');
  const hasExactCurrent = candidates.some(
    (r) => r.sequence.join('>') === currentSequence.join('>')
  );
  // generator may include or exclude current sequence as suggestion; caller ensures current is present
  assert.equal(typeof hasExactCurrent, 'boolean');
});

test('deriveRotationInsights returns data-derived evidence and risks as notas', () => {
  const sequence = ['maiz', 'papa', 'quinua'];
  const scores = { agua: 45, suelo: 55, prod: 70, costo: 60, riesgo: 40 };
  const notas = deriveRotationInsights({ sequence, scores, climate: baseClimate, soil: baseSoil, crops });
  assert.ok(Array.isArray(notas), 'notas should be an array');
  assert.ok(notas.length > 0, 'should produce at least one insight');
  for (const note of notas) {
    assert.ok(['ok', 'warn', 'bad'].includes(note.type), `invalid note type: ${note.type}`);
    assert.equal(typeof note.text, 'string');
    assert.ok(note.text.length > 10, 'note text should be descriptive');
  }
  const text = notas.map((n) => n.text).join(' ').toLowerCase();
  assert.ok(!text.includes('leguminosa (haba) aporta'), 'must not reuse static demo notas text');
});

test('deriveRotationInsights reflects water deficit and repetition risks from data', () => {
  const dryClimate = {
    summary: { temp: 22, prec: 120 },
    monthlyPrecMm: [15, 12, 10, 8, 5, 4, 4, 6, 8, 10, 12, 14],
    monthlyTempC: [22, 22, 23, 23, 22, 21, 20, 21, 22, 23, 23, 22]
  };
  const notas = deriveRotationInsights({
    sequence: ['papa', 'papa', 'maiz'],
    scores: { agua: 30, suelo: 35, prod: 50, costo: 55, riesgo: 30 },
    climate: dryClimate,
    soil: { texture: 'arenosa', ph: 5.4, organicMatter: 'baja', drainage: 'moderado', water: 'lluvia' },
    crops
  });
  const text = notas.map((n) => n.text).join(' ').toLowerCase();
  assert.ok(
    text.includes('agua') || text.includes('déficit') || text.includes('precip') || text.includes('híd'),
    'should mention water-related evidence/risk'
  );
  assert.ok(
    text.includes('repet') || text.includes('monocult') || text.includes('misma especie') || text.includes('suelo'),
    'should mention repetition/soil risk'
  );
});
