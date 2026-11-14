import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeWeights, rankRotations } from '../js/agriculture/rotation-engine.js';

const demo = JSON.parse(readFileSync(new URL('../data/demo-scenarios.json', import.meta.url), 'utf8'));

test('weights [4,3,5,3,4] score rotations A, B and C as 82, 74 and 56', () => {
  const ranked = rankRotations(demo.rotations, normalizeWeights([4, 3, 5, 3, 4]));

  assert.deepEqual(
    ranked.map((rotation) => [rotation.id, rotation.wscore]),
    [
      ['A', 82],
      ['B', 74],
      ['C', 56]
    ]
  );
  assert.deepEqual(
    ranked.map((rotation) => rotation.id),
    ['A', 'B', 'C']
  );
});

test('rankRotations ranks a copy and leaves the source rotations untouched', () => {
  const ranked = rankRotations(demo.rotations, normalizeWeights([4, 3, 5, 3, 4]));

  assert.deepEqual(
    ranked.map((rotation) => rotation.rank),
    [0, 1, 2]
  );
  assert.equal(demo.rotations[0].wscore, undefined);
  assert.equal(demo.rotations[0].rank, undefined);
});
