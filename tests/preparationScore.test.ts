import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCantoTimeScore, evaluateTopicPreparation } from '../src/lib/preparationScore';
import { getCanonicalTopic } from '../src/lib/canonicalTopicService';
import type { Session, Topic } from '../src/types';

const params = { topicNumber: 1, topicTitle: 'Synthetic observed feedback' };
const topic: Topic = {
  id: 'civil-1', subjectId: 'civil', number: 1, title: params.topicTitle,
  pages: 10, difficulty: 5, tiempoEstudioHoras: 0, fechaPrimerEstudio: '',
  fechasRepasos: [], mejorTiempoCantoMinutos: 0, mejorTiempoCantoSegundos: 0, notas: '',
};
const cante = (extra: Record<string, unknown> = {}): Session => ({
  id: 'synthetic-cante', topicId: topic.id, type: 'canto', date: '2025-01-01',
  durationMinutes: 12, cantoSeconds: 30, cantoGrade: 7.5, notes: '', ...extra,
} as Session);

test('without an observed grade no count, duration or subjective difficulty creates one', () => {
  for (const input of [params,
    { ...params, vueltas: 20, reviewsCount: 100, difficulty: 1 },
    { ...params, totalCantoSecs: 750, vueltas: 20, reviewsCount: 100, difficulty: 10 },
  ]) {
    const result = evaluateTopicPreparation(input);
    assert.equal(result.scoreAvailable, false);
    assert.equal(result.officialGrade, null);
    assert.equal(result.gradeLabel, 'Sin nota');
    assert.equal(result.projectedScore, 0, 'zero is an unavailable-value sentinel, not a grade');
    assert.equal(result.masteryScore, 0);
    assert.equal(result.isReadyForTribunal, false);
  }
});

test('the observed grade, including zero, is preserved without grade projection or invented decay', () => {
  for (const grade of [0, 4.25, 7.5, 10]) {
    const result = evaluateTopicPreparation({ ...params, lastGrade: grade, daysSinceCanto: 5000 });
    assert.equal(result.scoreAvailable, true);
    assert.equal(result.officialGrade, grade);
    assert.equal(result.projectedScore, grade);
    assert.equal(result.overallScore, grade);
    assert.equal(result.peakScore, grade);
    assert.equal(result.scoreDecay, 0);
    assert.equal(result.isDecayed, false);
    assert.equal(result.gradeLabel, 'Última nota observada');
  }
});

test('a stopwatch rubric remains separate from both the grade and current readiness', () => {
  const fast = evaluateTopicPreparation({ ...params, lastGrade: 7.5, totalCantoSecs: 600 });
  const inWindow = evaluateTopicPreparation({ ...params, lastGrade: 7.5, totalCantoSecs: 750 });
  const slow = evaluateTopicPreparation({ ...params, lastGrade: 7.5, totalCantoSecs: 920 });
  assert.ok(inWindow.timeScore > fast.timeScore);
  assert.ok(inWindow.timeScore > slow.timeScore);
  assert.equal(inWindow.timeScore, calculateCantoTimeScore(750).score);
  for (const result of [fast, inWindow, slow]) {
    assert.equal(result.overallScore, 7.5);
    assert.equal(result.isReadyForTribunal, false, 'an old grade plus a duration does not assess present readiness');
    assert.ok(!result.actionPlan.includes('restaurará'));
    assert.ok(!result.actionPlan.includes('devolverá'));
  }
});

test('canonical observed feedback overrides conflicting UI aliases', () => {
  const canonical = getCanonicalTopic(topic, [topic], {}, [cante({ cantoGrade: 4.25 })]);
  const result = evaluateTopicPreparation({ ...params, canonicalTopic: canonical, lastGrade: 10, totalCantoSecs: 750, vueltas: 99 });
  assert.equal(result.officialGrade, 4.25);
  assert.equal(result.overallScore, 4.25);
  assert.equal(result.scoreDecay, 0);
  const withoutGrade = getCanonicalTopic(topic, [topic], {}, [cante({ cantoGrade: undefined })]);
  assert.equal(evaluateTopicPreparation({ ...params, canonicalTopic: withoutGrade, lastGrade: 10 }).scoreAvailable, false);
});

test('invalid or absent grade values cannot become observed feedback', () => {
  for (const lastGrade of [undefined, null, -1, 11, Number.NaN, Number.POSITIVE_INFINITY, '8', true]) {
    const result = evaluateTopicPreparation({ ...params, lastGrade: lastGrade as any });
    assert.equal(result.scoreAvailable, false);
    assert.equal(result.officialGrade, null);
    assert.equal(result.gradeScore, 0);
  }
});

test('recording more unassessed practice does not change an already observed grade', () => {
  const original = getCanonicalTopic(topic, [topic], {}, [cante()]);
  const withPractice = getCanonicalTopic(topic, [topic], {}, [cante(), {
    id: 'synthetic-unassessed-review', topicId: topic.id, type: 'repaso', date: '2025-05-31',
    durationMinutes: 120, notes: '', completesVuelta: true,
  }]);
  const before = evaluateTopicPreparation({ ...params, canonicalTopic: original });
  const after = evaluateTopicPreparation({ ...params, canonicalTopic: withPractice });
  assert.equal(before.officialGrade, 7.5);
  assert.equal(after.officialGrade, 7.5);
  assert.equal(after.projectedScore, before.projectedScore);
  assert.equal(after.masteryScore, 0);
  assert.equal(after.scoreDecay, 0);
  assert.ok(after.retentionEstimate, 'the uncertain retention estimate is exposed independently');
});
