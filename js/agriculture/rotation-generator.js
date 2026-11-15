import { createRotation } from './rotation-model.js';

function uniqueSequences(sequences) {
  const seen = new Set();
  const result = [];
  for (const seq of sequences) {
    if (!Array.isArray(seq) || seq.length < 2) continue;
    const key = seq.join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push([...seq]);
  }
  return result;
}

function isSameSequence(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function permutations(items) {
  if (items.length <= 1) return [items.slice()];
  const result = [];
  for (let i = 0; i < items.length; i += 1) {
    const current = items[i];
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const perm of permutations(rest)) {
      result.push([current, ...perm]);
    }
  }
  return result;
}

function combinations(items, size) {
  const result = [];
  function walk(start, combo) {
    if (combo.length === size) {
      result.push(combo.slice());
      return;
    }
    for (let i = start; i < items.length; i += 1) {
      combo.push(items[i]);
      walk(i + 1, combo);
      combo.pop();
    }
  }
  if (size >= 1 && items.length >= size) walk(0, []);
  return result;
}

function hasImmediateRepeat(seq) {
  for (let i = 1; i < seq.length; i += 1) {
    if (seq[i] === seq[i - 1]) return true;
  }
  return false;
}

function rotateSequence(seq, offset) {
  if (!seq.length) return [];
  const n = ((offset % seq.length) + seq.length) % seq.length;
  return seq.slice(n).concat(seq.slice(0, n));
}

function buildVariantsForTwo(pool) {
  const [a, b] = pool;
  return [
    [a, b, a],
    [b, a, b],
    [a, b, a, b],
    [b, a, b, a],
    [a, b, b, a].filter((_, idx, arr) => !hasImmediateRepeat(arr) || arr.length === 4) // fallback handled below
  ].filter((seq) => Array.isArray(seq) && seq.length >= 3);
}

function buildVariantsForSingle(pool) {
  const [a] = pool;
  return [[a, a], [a, a, a]];
}

function expandToMinimum(sequences, pool, minCount) {
  const result = uniqueSequences(sequences);
  if (result.length >= minCount || pool.length === 0) return result;

  // Add controlled variants (including repeats) to reach minimum when pool is small.
  if (pool.length === 1) {
    return uniqueSequences(result.concat(buildVariantsForSingle(pool)));
  }

  if (pool.length === 2) {
    const [a, b] = pool;
    const extras = [
      [a, b, a],
      [b, a, b],
      [a, b, a, b],
      [b, a, b, a],
      [a, a, b],
      [b, b, a],
      [a, b],
      [b, a]
    ].filter((seq) => seq.length >= 2);
    return uniqueSequences(result.concat(extras)).slice(0, Math.max(minCount, result.length));
  }

  // For larger pools, generate rotations and combinations-derived orders.
  const extras = [];
  const base = pool.slice();
  for (let i = 0; i < base.length; i += 1) extras.push(rotateSequence(base, i));
  if (base.length >= 4) {
    for (const combo of combinations(base, 3)) {
      extras.push(combo, combo.slice().reverse());
    }
  }
  const expanded = uniqueSequences(result.concat(extras));
  return expanded.length >= minCount ? expanded : expanded;
}

/**
 * Generates deterministic candidate sequences from a selected crop-id pool.
 * Returns at least `minCount` sequences when the pool allows valid variants.
 */
export function generateCandidateSequences(pool, { currentSequence = null, minCount = 3 } = {}) {
  const ids = Array.isArray(pool)
    ? pool.filter((id) => typeof id === 'string' && id.length > 0)
    : [];
  const uniquePool = [...new Set(ids)];

  let candidates = [];
  if (uniquePool.length === 0) {
    candidates = [];
  } else if (uniquePool.length === 1) {
    candidates = buildVariantsForSingle(uniquePool);
  } else if (uniquePool.length === 2) {
    const [a, b] = uniquePool;
    candidates = [
      [a, b],
      [b, a],
      [a, b, a],
      [b, a, b],
      [a, b, a, b],
      [b, a, b, a]
    ];
  } else if (uniquePool.length === 3) {
    candidates = permutations(uniquePool).map((seq) => seq.slice());
    // add a couple of 4-step variants for diversity
    candidates.push(
      [uniquePool[0], uniquePool[1], uniquePool[2], uniquePool[0]],
      [uniquePool[1], uniquePool[2], uniquePool[0], uniquePool[1]]
    );
  } else {
    // More than 3: use combinations of 3 in stable order and their rotations/permutations (limited)
    const baseCombos = combinations(uniquePool, 3);
    for (const combo of baseCombos) {
      candidates.push(combo, rotateSequence(combo, 1), rotateSequence(combo, 2));
    }
    // include full pool order and a rotation
    candidates.push(uniquePool.slice(0, 4), rotateSequence(uniquePool, 1).slice(0, 4));
  }

  let sequences = uniqueSequences(candidates).filter((seq) => seq.length >= 2);

  // Prefer sequences without immediate repetition when enough alternatives exist.
  const noImmediate = sequences.filter((seq) => !hasImmediateRepeat(seq));
  if (noImmediate.length >= minCount) {
    sequences = noImmediate.concat(sequences.filter((seq) => hasImmediateRepeat(seq)));
  }

  sequences = uniqueSequences(sequences);

  if (sequences.length < minCount) {
    sequences = expandToMinimum(sequences, uniquePool, minCount);
  }

  // Avoid suggesting the exact same sequence as current rotation when alternatives exist.
  if (currentSequence && sequences.length > minCount) {
    const filtered = sequences.filter((seq) => !isSameSequence(seq, currentSequence));
    if (filtered.length >= minCount) sequences = filtered;
  }

  // Deterministic stable ordering: shorter first, then lexicographic by key.
  sequences.sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    return a.join('|').localeCompare(b.join('|'));
  });

  // Return at least minCount when available.
  if (sequences.length > minCount && !currentSequence) {
    // keep a sensible set (enough variety) but deterministic
    return sequences.slice(0, Math.max(minCount, 6));
  }
  return sequences;
}

/**
 * Generates candidate rotation objects from selected crops.
 */
export function generateCandidateRotations(
  pool,
  { cropCatalog = [], currentSequence = null, minCount = 3 } = {}
) {
  const sequences = generateCandidateSequences(pool, { currentSequence, minCount });
  return sequences.map((sequence, index) =>
    createRotation({
      id: `gen-${index + 1}`,
      nombre: `Rotación sugerida ${index + 1}`,
      sequence,
      origin: 'suggested',
      scores: null,
      notas: [],
      cropCatalog
    })
  );
}

export const __test__ = { uniqueSequences, isSameSequence, hasImmediateRepeat, permutations };
