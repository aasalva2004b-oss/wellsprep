import assert from 'node:assert/strict';
import test from 'node:test';
import { parseQuarantineTopicObservation } from '../src/lib/quarantineTopicInput';

const observation = { minutes: '23.5', difficulty: '', completesVuelta: false, modality: 'repaso' };

test('quarantine forms retain observed minutes and unknown difficulty without inventing a vuelta', () => {
  const actual = parseQuarantineTopicObservation(observation);
  assert.equal(actual.effectiveMinutes, 23.5);
  assert.equal(actual.effectiveHours, 23.5 / 60);
  assert.equal(actual.difficulty, undefined);
  assert.equal(actual.dificultadReal, undefined);
  assert.equal(actual.completesVuelta, false);
});

test('empty, zero, negative, nonfinite and impossible elapsed minutes reject before persistence', () => {
  for (const minutes of ['', ' ', '0', '-1', 'Infinity', 'NaN', '1441']) {
    assert.throws(() => parseQuarantineTopicObservation({ ...observation, minutes }));
  }
});

test('a vuelta requires an explicit choice and a review or oral activity', () => {
  assert.equal(parseQuarantineTopicObservation({ ...observation, completesVuelta: true }).completesVuelta, true);
  assert.equal(parseQuarantineTopicObservation({ ...observation, modality: 'canto', completesVuelta: true }).completesVuelta, true);
  for (const modality of ['primer_estudio', 'estudio_inicial', 'refresco']) {
    assert.equal(parseQuarantineTopicObservation({ ...observation, modality, completesVuelta: true }).completesVuelta, false);
  }
});

test('recorded difficulty keeps its measurement and invalid values reject', () => {
  assert.equal(parseQuarantineTopicObservation({ ...observation, difficulty: '7.5' }).difficulty, 7.5);
  for (const difficulty of ['0', '11', 'Infinity', 'NaN']) {
    assert.throws(() => parseQuarantineTopicObservation({ ...observation, difficulty }));
  }
});
