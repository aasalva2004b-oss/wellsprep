import test from 'node:test';
import assert from 'node:assert/strict';
import type { Topic, Session } from '../src/types';
import { buildCanonicalTopicMap } from '../src/lib/canonicalTopicService';
import { estimatePersonalizedDuration } from '../src/lib/personalizedEstimator';
import { DEFAULT_PLANNER_SETTINGS, estimateTaskAdaptiveDetails } from '../src/lib/plannerEngine';

const topic = { id: 'synthetic-civil-981', subjectId: 'civil', number: 981, title: 'Synthetic short duration', pages: 12, difficulty: 5 } as Topic;
const history = [{ id: 'synthetic-fast', topicId: topic.id, date: '2026-01-01', type: 'primer_estudio', durationMinutes: .3, pagesCount: 12, notes: '' }] as Session[];

test('planning resolution never converts positive measured work to a free task', () => {
  const map = buildCanonicalTopicMap([topic], {}, history);
  const estimate = estimatePersonalizedDuration({ topic: map.get(topic.id)!, history, topics: map, activity: 'estudio_nuevo', work: { pages: 1 }, asOf: new Date('2026-02-01') });
  assert.equal(estimate.estimatedMinutesPerPage, .3 / 12, 'learned pace is not floored or rounded');
  assert.equal(estimate.estimatedMinutes, 1, 'the visible plan uses one-minute resolution');
});
test('explicit oral and refresh durations are preferences, never learned evidence or default predictions', () => {
  const context = { allTopics: [topic] };
  const oral = estimateTaskAdaptiveDetails(topic, 'cante', [], { ...DEFAULT_PLANNER_SETTINGS, duracionEstimadaCantePorTemaMinutos: 19 }, undefined, {}, undefined, context);
  assert.equal(oral.estimatedMinutes, 19);
  assert.equal(oral.method, 'manual_duration');
  assert.equal(oral.evidenceCount, 0);
  assert.equal(oral.interval, null);
  const refresh = estimateTaskAdaptiveDetails(topic, 'refresco', [], { ...DEFAULT_PLANNER_SETTINGS, refresco2DuracionMinutos: 22 }, 2, {}, undefined, context);
  assert.equal(refresh.estimatedMinutes, 22);
  assert.equal(refresh.method, 'manual_duration');
  assert.equal(estimateTaskAdaptiveDetails(topic, 'cante', [], DEFAULT_PLANNER_SETTINGS, undefined, {}, undefined, context).estimatedMinutes, null);
});
