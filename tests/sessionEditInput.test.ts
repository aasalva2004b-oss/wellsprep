import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionEditPatch, readSessionEditForm } from '../src/lib/sessionEditInput';

const source = { topicId: 'civil-1', date: '2026-10-01', type: 'repaso', durationMinutes: 23, notes: 'Synthetic observation.' };

test('editing a legacy session does not invent elapsed minutes, a grade or a completed vuelta', () => {
  const missing = readSessionEditForm({ topicId: source.topicId, type: 'repaso', date: source.date });
  assert.equal(missing.minutes, '');
  assert.equal(missing.completesVuelta, undefined);
  assert.equal(missing.cantoGrade, '');
  assert.throws(() => buildSessionEditPatch(missing));
  const patch = buildSessionEditPatch(readSessionEditForm(source));
  assert.equal(patch.durationMinutes, 23);
  assert.equal(Object.hasOwn(patch, 'completesVuelta'), false);
  for (const key of ['durationReal', 'effectiveHours', 'prediction', 'retentionPrediction']) assert.equal(Object.hasOwn(patch, key), false);
});

test('the canonical type wins over a contradictory legacy modality', () => {
  const form = readSessionEditForm({ ...source, type: 'repaso', modality: 'estudio' });
  assert.equal(form.activity, 'repaso');
  assert.equal(buildSessionEditPatch(form).type, 'repaso');
});

test('measured oral seconds and a zero grade remain valid independent observations', () => {
  const form = readSessionEditForm({ ...source, type: 'canto', durationMinutes: 0, cantoSeconds: 45, cantoGrade: 0 });
  const patch = buildSessionEditPatch(form);
  assert.equal(patch.durationMinutes, 0);
  assert.equal(patch.cantoSeconds, 45);
  assert.equal(patch.cantoGrade, 0);
  assert.equal(readSessionEditForm({ ...source, durationMinutes: .25 }).minutes, '0.25');
});

test('unknown dates and invalid observations reject before any edit is persisted', () => {
  const valid = readSessionEditForm(source);
  for (const patch of [{ minutes: '' }, { minutes: 'Infinity' }, { minutes: '-1' }, { date: '2026-02-30' }, { activity: '' }, { topicId: '1' }]) {
    assert.throws(() => buildSessionEditPatch({ ...valid, ...patch } as typeof valid));
  }
});

test('a completed vuelta is an explicit editable answer limited to review and oral activities', () => {
  const form = readSessionEditForm(source);
  assert.equal(buildSessionEditPatch({ ...form, completesVuelta: true }).completesVuelta, true);
  assert.equal(buildSessionEditPatch({ ...form, completesVuelta: false }).completesVuelta, false);
  assert.equal(buildSessionEditPatch({ ...form, activity: 'refresco', completesVuelta: true }).completesVuelta, false);
});
