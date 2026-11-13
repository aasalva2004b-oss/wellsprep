import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { initialTopics } from '../src/data/initialData';
import type { Session, Topic } from '../src/types';
import { parseBackup } from '../src/lib/backup';
import { evaluateEstimatorTemporally, summarizeDurationErrors, summarizeTemporalEvaluation } from '../src/lib/estimationEvaluation';
import { estimatePersonalizedDuration } from '../src/lib/personalizedEstimator';
import { syntheticSessions, syntheticTopics } from '../tests/fixtures/syntheticStudyData';

const input = process.argv[2] || process.env.WELLSPREP_LOCAL_BACKUP;
let topics: Topic[] = syntheticTopics;
let history: Session[] = syntheticSessions;
let unchanged: boolean | null = null;
let file: string | undefined;
let initialHash: string | undefined;
if (input) {
  file = resolve(input);
  const bytes = readFileSync(file);
  initialHash = createHash('sha256').update(bytes).digest('hex');
  const validation = parseBackup(bytes.toString());
  if (!validation.valid || !validation.backup) throw new Error('The supplied backup did not pass structural validation. No records were evaluated.');
  history = validation.backup.sessions as unknown as Session[];
  topics = [...initialTopics];
  const known = new Set(topics.map(topic => topic.id));
  for (const record of validation.backup.progress) {
    if (known.has(record.topicId)) continue;
    // Stable identity only. Personal titles and all current numerical masters are
    // deliberately absent from both model inputs and generated output.
    topics.push({ id: record.topicId, subjectId: typeof record.subjectId === 'string' ? record.subjectId : '',
      number: typeof record.number === 'number' ? record.number : 0, title: 'Local evaluation topic',
      pages: 0, difficulty: 0, tiempoEstudioHoras: 0, fechaPrimerEstudio: '', fechasRepasos: [],
      mejorTiempoCantoMinutos: 0, mejorTiempoCantoSegundos: 0, notas: '' });
    known.add(record.topicId);
  }
}
const decisions: Array<{ activity: string; selection: string }> = [];
const evaluated = evaluateEstimatorTemporally({ topics, history, predict: request => {
  const estimate = estimatePersonalizedDuration(request);
  if (estimate.estimatedMinutes !== null && Number.isFinite(estimate.estimatedMinutes) && estimate.estimatedMinutes >= 0) {
    const selection = estimate.factors.some(factor => factor.startsWith('Modelo local seleccionado')) ? 'validated_local'
      : estimate.factors.some(factor => factor.startsWith('La referencia da la misma duración')) ? 'same_duration_as_reference'
      : estimate.factors.some(factor => factor.startsWith('El ordinal explícito') && factor.includes('mejora la referencia')) ? 'validated_ordinal_median'
      : estimate.featuresUsed.includes('activity') ? 'activity_median'
      : 'base_local';
    decisions.push({ activity: request.activity, selection });
  }
  return estimate;
} });
const report = summarizeTemporalEvaluation(evaluated);
if (decisions.length !== evaluated.observations.length) throw new Error('Aggregate decision diagnostics do not match evaluated pairs.');
const decisionGroups = new Map<string, typeof evaluated.observations>();
evaluated.observations.forEach((row, index) => {
  const key = `${decisions[index].activity}/${decisions[index].selection}`;
  decisionGroups.set(key, [...(decisionGroups.get(key) || []), row]);
});
// Group-level diagnostics only. Individual outcomes stay in process memory.
const selectionDiagnostics = Object.fromEntries([...decisionGroups].map(([group, rows]) => [group, {
  model: summarizeDurationErrors(rows),
  baseline: summarizeDurationErrors(rows.map(row => ({ actualMinutes: row.actualMinutes, predictedMinutes: row.baselineMinutes,
    absoluteErrorMinutes: row.baselineAbsoluteErrorMinutes, percentageError: row.baselinePercentageError }))),
}]));
if (file && initialHash) {
  unchanged = createHash('sha256').update(readFileSync(file)).digest('hex') === initialHash;
  if (!unchanged) throw new Error('The input backup changed during read-only evaluation.');
}
mkdirSync('.cache/evaluation', { recursive: true });
const result = { dataSource: input ? 'private local backup; no individual records exported' : 'synthetic fixture', inputUnchanged: unchanged, ...report, selectionDiagnostics };
writeFileSync('.cache/evaluation/estimator-report.json', JSON.stringify(result, null, 2));
writeFileSync(input ? '.cache/evaluation/estimator-report.private.json' : '.cache/evaluation/estimator-report.synthetic.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
