/**
 * Shared internal rotation model.
 *
 * Every rotation consumed by the scoring engine, the dashboard and the report
 * uses this normalized shape:
 *
 *   {
 *     id: string,
 *     nombre: string,
 *     sequence: string[],        // ordered crop ids (repetitions allowed)
 *     sequenceText: string,      // human-readable sequence from crop names
 *     origin: 'current' | 'suggested' | 'demo',
 *     scores: object | null,     // per-criteria scores, null until computed
 *     notas: Array<{ type, text }>
 *   }
 */

export const CURRENT_ROTATION_ID = 'current';

export const ROTATION_ORIGINS = ['current', 'suggested', 'demo'];

function normalizeKey(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function buildCatalog(crops) {
  const list = Array.isArray(crops) ? crops : [];
  const nameById = new Map();
  const idByName = new Map();

  for (const crop of list) {
    if (!crop || typeof crop.id !== 'string') continue;
    const name = typeof crop.name === 'string' ? crop.name : crop.id;
    nameById.set(crop.id, name);
    idByName.set(normalizeKey(name), crop.id);
  }

  return { nameById, idByName };
}

function findCropId(token, idByName) {
  const key = normalizeKey(token);
  if (idByName.has(key)) return idByName.get(key);

  // Tolerate annotations such as "Papa (riesgo monocultivo)" in legacy text.
  const words = key.split(/\s+/);
  for (let length = words.length; length > 0; length -= 1) {
    const candidate = words.slice(0, length).join(' ');
    if (idByName.has(candidate)) return idByName.get(candidate);
  }
  return null;
}

/**
 * Builds a human-readable sequence from the crop catalog names.
 */
export function sequenceToText(sequence, cropCatalog = []) {
  const { nameById } = buildCatalog(cropCatalog);
  return (Array.isArray(sequence) ? sequence : [])
    .map((cropId) => nameById.get(cropId) ?? cropId)
    .join(' → ');
}

function parseSecuencia(text, catalog) {
  const { nameById, idByName } = catalog;
  if (!text || typeof text !== 'string') return { sequence: [], text: '' };

  const tokens = text
    .split(/\s*(?:→|->|,)\s*/)
    .map((token) => token.trim())
    .filter(Boolean);

  const sequence = [];
  const readable = tokens.map((token) => {
    const cropId = findCropId(token, idByName);
    if (!cropId) return token;
    sequence.push(cropId);
    // Keep annotations such as "Papa (riesgo monocultivo)" verbatim.
    const exactName = normalizeKey(nameById.get(cropId)) === normalizeKey(token);
    return exactName ? nameById.get(cropId) : token;
  });

  return { sequence, text: readable.join(' → ') };
}

/**
 * Creates a normalized rotation. Scores default to null until the scoring
 * engine computes them.
 */
export function createRotation({
  id,
  nombre,
  sequence = [],
  origin = 'suggested',
  scores = null,
  notas = [],
  cropCatalog = []
} = {}) {
  const safeSequence = (Array.isArray(sequence) ? sequence : []).filter(
    (cropId) => typeof cropId === 'string' && cropId.length > 0
  );

  return {
    id,
    nombre,
    sequence: [...safeSequence],
    sequenceText: sequenceToText(safeSequence, cropCatalog),
    origin,
    scores: scores ?? null,
    notas: Array.isArray(notas) ? [...notas] : []
  };
}

/**
 * Coerces an existing demo JSON rotation (or any legacy raw rotation) into the
 * shared normalized shape. Raw `secuencia` text is parsed into crop ids and
 * rebuilt from the catalog names so old display text keeps working.
 */
export function normalizeRotation(raw, cropCatalog = []) {
  if (!raw || typeof raw !== 'object') {
    throw new TypeError('normalizeRotation requires a rotation object');
  }

  const catalog = buildCatalog(cropCatalog);
  const hasExplicitSequence = Array.isArray(raw.sequence);
  const legacy = hasExplicitSequence ? { sequence: [], text: '' } : parseSecuencia(raw.secuencia, catalog);
  const sequence = hasExplicitSequence
    ? raw.sequence.filter((cropId) => typeof cropId === 'string' && cropId.length > 0)
    : legacy.sequence;

  const rotation = {
    id: String(raw.id),
    nombre: raw.nombre ?? String(raw.id),
    sequence: [...sequence],
    sequenceText: hasExplicitSequence
      ? sequenceToText(sequence, cropCatalog)
      : legacy.text || sequenceToText(sequence, cropCatalog),
    origin: ROTATION_ORIGINS.includes(raw.origin) ? raw.origin : 'demo',
    scores: raw.scores ?? null,
    notas: Array.isArray(raw.notas) ? [...raw.notas] : []
  };

  if (typeof raw.class === 'string') rotation.class = raw.class;
  if (typeof raw.best === 'boolean') rotation.best = raw.best;

  return rotation;
}

/**
 * Builds the farmer's current rotation from an ordered crop-id array.
 */
export function buildCurrentRotation(cropIds, { cropCatalog = [], scores = null } = {}) {
  const sequence = Array.isArray(cropIds) ? [...cropIds] : [];

  return createRotation({
    id: CURRENT_ROTATION_ID,
    nombre: 'Tu rotación actual',
    sequence,
    origin: 'current',
    scores,
    cropCatalog
  });
}
