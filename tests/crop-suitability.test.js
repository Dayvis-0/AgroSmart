import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyCropSuitability,
  evaluateCropSuitability,
  getSuitabilitySummary,
  sortSuitabilityResults
} from '../js/agriculture/crop-suitability.js';

const potato = {
  id: 'papa',
  name: 'Papa',
  altitudeMinM: 2800,
  altitudeMaxM: 4200,
  zones: ['Andahuaylas', 'Talavera']
};

const corn = {
  id: 'maiz',
  name: 'Maíz',
  altitudeMinM: 2200,
  altitudeMaxM: 3500,
  zones: ['Andahuaylas', 'Talavera']
};

test('classifies as recommended when elevation is in range and zone matches', () => {
  const result = classifyCropSuitability(potato, { elevation: 3000, district: 'Andahuaylas' });
  assert.equal(result.status, 'recommended');
  assert.match(result.reason, /3000/);
});

test('classifies as not recommended when elevation is out of range', () => {
  const result = classifyCropSuitability(corn, { elevation: 3800, district: 'Andahuaylas' });
  assert.equal(result.status, 'not_recommended');
  assert.match(result.reason, /Fuera de rango de altitud/);
  assert.match(result.reason, /2200–3500/);
});

test('classifies as possible with reason when elevation is unknown', () => {
  const result = classifyCropSuitability(potato, { elevation: null, district: 'Andahuaylas' });
  assert.equal(result.status, 'possible');
  assert.match(result.reason.toLowerCase(), /sin dato de altitud/);
});

test('treats province-wide zones as matching and sorts recommended before not recommended', () => {
  const provincePotato = { ...potato, zones: ['Andahuaylas', 'Talavera', 'San Jerónimo', 'Pacucha', 'Kishuará', 'Turpo', 'Kaquiabamba', 'Andarapa'] };
  const inProvince = classifyCropSuitability(provincePotato, { elevation: 3000, district: 'Kishuará' });
  assert.equal(inProvince.status, 'recommended');

  const sorted = sortSuitabilityResults(
    evaluateCropSuitability([corn, provincePotato], { elevation: 3800, district: 'Kishuará' })
  );
  assert.deepEqual(sorted.map((item) => item.crop.id), ['papa', 'maiz']);
  assert.equal(sorted[0].status, 'recommended');
  assert.equal(sorted[1].status, 'not_recommended');
});

test('builds a suitability summary for known and unknown elevation', () => {
  assert.match(getSuitabilitySummary({ elevation: 2920, district: 'Andahuaylas' }), /2920 msnm/);
  assert.match(getSuitabilitySummary({ district: 'Andahuaylas' }), /consultando o no disponible/i);
});
