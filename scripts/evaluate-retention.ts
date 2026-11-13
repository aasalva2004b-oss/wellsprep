import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { initialTopics } from '../src/data/initialData';
import type { Session, Topic } from '../src/types';
import { parseBackup } from '../src/lib/backup';
import { evaluateRetentionTemporally, summarizeRetentionEvaluation } from '../src/lib/retentionEvaluation';
import { estimateRetention, extractRetrievalOutcome } from '../src/lib/retentionModel';
import { calculateLegacyCanonicalRetention } from '../src/lib/ebbinghaus';
import { syntheticTopics } from '../tests/fixtures/syntheticStudyData';

const input = process.argv[2] || process.env.WELLSPREP_LOCAL_BACKUP;
let topics: Topic[] = syntheticTopics;
// Public, artificial observations exercise both targets. They are not derived
// from or anonymised copies of the uploaded learner's records.
let history: Session[] = Array.from({ length: 18 }, (_, index) => ({
  id: `retention-synthetic-${index}`, topicId: syntheticTopics[index % 2].id,
  date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
  type: index % 2 ? 'canto' : 'repaso', durationMinutes: 15,
  cantoGrade: index % 2 ? index % 3 ? 7 : 3 : undefined,
  ...(index % 2 === 0 ? { retrieval: { outcome: index % 3 ? 'success' : 'failure', coverage: 'whole_topic', assistance: 'none' } } : {}),
  difficultyAtStart: 4, totalPagesAtSession: 8, completesVuelta: index > 3, notes: 'Public synthetic retention fixture',
})) as Session[];
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
  for (const id of [...validation.backup.progress.map(row => row.topicId), ...history.map(row => row.topicId)]) {
    if (known.has(id)) continue;
    // The local join needs a stable identity; private titles, notes and current
    // master values are neither prediction inputs nor report output.
    topics.push({ id, subjectId: '', number: 0, title: 'Local evaluation topic', pages: 0, difficulty: 0,
      tiempoEstudioHoras: 0, fechaPrimerEstudio: '', fechasRepasos: [],
      mejorTiempoCantoMinutos: 0, mejorTiempoCantoSegundos: 0, notas: '' });
    known.add(id);
  }
}
const report = summarizeRetentionEvaluation(evaluateRetentionTemporally({ topics, history,
  predict: estimateRetention, legacyPredict: calculateLegacyCanonicalRetention, extractOutcome: extractRetrievalOutcome }));
let inputUnchanged: boolean | null = null;
if (file && initialHash) {
  inputUnchanged = createHash('sha256').update(readFileSync(file)).digest('hex') === initialHash;
  if (!inputUnchanged) throw new Error('The input backup changed during read-only evaluation.');
}
const result = { dataSource: input ? 'private local backup; aggregate report only' : 'public synthetic fixture', inputUnchanged, ...report };
mkdirSync('.cache/evaluation', { recursive: true });
writeFileSync('.cache/evaluation/retention-report.json', JSON.stringify(result, null, 2));
writeFileSync(input ? '.cache/evaluation/retention-report.private.json' : '.cache/evaluation/retention-report.synthetic.json', JSON.stringify(result, null, 2));
// Only compact aggregates reach the command log. The full aggregate calibration
// bins/subgroups remain available in the ignored local report.
const compact = ({ calibrationBins, ...scores }: typeof report.byTarget.recall.modelOnAllAvailable) => scores;
console.log(JSON.stringify({ dataSource: result.dataSource, inputUnchanged, evaluationVersion: report.evaluationVersion,
  modelVersions: report.modelVersions, counts: report.counts,
  byTarget: Object.fromEntries(Object.entries(report.byTarget).map(([target, value]) => [target, {
    availability: value.availability, modelOnAllAvailable: compact(value.modelOnAllAvailable),
    paired: { ...value.paired, model: compact(value.paired.model), legacy: compact(value.paired.legacy) },
    priorCount: value.priorPredictions.modelOnAllAvailable.count,
  }])) }, null, 2));
