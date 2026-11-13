import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeKnownTopicId } from '../src/lib/topicResolver';

test('recognised historical aliases retain their recorded subject', () => {
  for (const [id, expected] of [
    ['const_17', 'constitucional-17'], ['CIV_T12', 'civil-12'],
    ['civil_12', 'civil-12'], ['pen_7', 'penal-7'],
    ['procesal_civil_5', 'procesal-civil-5'], ['PCIV-5', 'procesal-civil-5'],
    ['PPEN_T2', 'procesal-penal-2'], ['merc_3', 'mercantil-3'],
    ['admin_lab_4', 'administrativo-laboral-4'], ['jud-28', 'civil-1'],
  ]) assert.equal(normalizeKnownTopicId(id), expected, id);
});

test('numeric topics need an observed subject and custom IDs stay intact', () => {
  assert.equal(normalizeKnownTopicId('7', 'penal'), 'penal-7');
  assert.equal(normalizeKnownTopicId('tema 7', 'Procesal Civil'), 'procesal-civil-7');
  for (const id of ['7', '5', 'synthetic-civil-970', 'custom-1', 'unknown-2']) {
    assert.equal(normalizeKnownTopicId(id), id);
  }
  assert.equal(normalizeKnownTopicId('7', 'sin asignatura'), '7');
});
