export const CRITERIA = [
  { key: 'agua', icon: '💧', label: 'Ahorro de agua' },
  { key: 'suelo', icon: '🌱', label: 'Salud del suelo' },
  { key: 'prod', icon: '📈', label: 'Productividad' },
  { key: 'costo', icon: '💰', label: 'Costo-beneficio' },
  { key: 'riesgo', icon: '⛈️', label: 'Riesgo climático' }
];

export function normalizeWeights(values) {
  const total = values.reduce((acc, value) => acc + value, 0) || 1;
  return values.map((value) => value / total);
}

export function weightedScore(scores, weights) {
  if (!scores) return null;
  return Math.round(
    CRITERIA.reduce((acc, criterion, index) => acc + scores[criterion.key] * weights[index], 0)
  );
}

export function rankRotations(rotations, weights) {
  return rotations
    .map((rotation) => ({ ...rotation, wscore: weightedScore(rotation.scores, weights) }))
    .sort((a, b) => (b.wscore ?? -1) - (a.wscore ?? -1))
    .map((rotation, index) => ({ ...rotation, rank: index }));
}

export function tier(rank, total) {
  if (rank === 0) return 'best';
  if (rank >= total - 1) return 'low';
  return 'mid';
}

export function barColor(score) {
  if (score >= 70) return '#00d4ff';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}
