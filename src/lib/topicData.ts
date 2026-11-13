import type { Topic, Session } from '../types';
import type { TopicProgressData } from './prediction';
import { buildCanonicalTopicMap, type CanonicalTopic, sessionDurationMinutes } from './canonicalTopicService';
import { getCanonicalReviewDate } from './ebbinghaus';
import { buildRetentionEvidence, estimateRetention, type RetentionConfig } from './retentionModel';
import { registerRetentionContext } from './retentionContext';

/** Stored progress documents are legacy-compatible topic metadata, never a second live history. */
export type TopicMetadata = Record<string, TopicProgressData & Record<string, any>>;

export function buildTopicData(catalogue: Topic[], metadata: TopicMetadata, history: Session[], retentionConfig?: Partial<RetentionConfig>) {
  const activeMetadata = Object.fromEntries(Object.entries(metadata).filter(([, value]) => !value.isDeleted));
  const definitions = catalogue.filter(topic => !metadata[topic.id]?.isDeleted).map(topic => ({ ...topic }));
  const ids = new Set(definitions.map(topic => topic.id));
  for (const id of new Set([...Object.keys(activeMetadata), ...history.map(session => session.topicId)])) {
    if (!id || ids.has(id) || metadata[id]?.isDeleted) continue;
    const master = activeMetadata[id];
    definitions.push({
      id, subjectId: master?.subjectId || 'unknown', number: Number(master?.number) || 0,
      title: master?.customTitle || 'Tema sin definición oficial',
      pages: 0, difficulty: 0, tiempoEstudioHoras: 0, fechaPrimerEstudio: '',
      fechasRepasos: [], mejorTiempoCantoMinutos: 0, mejorTiempoCantoSegundos: 0, notas: '',
    });
    ids.add(id);
  }
  const topicState = buildCanonicalTopicMap(definitions, activeMetadata, history);
  const now = new Date();
  const retentionEvidence = buildRetentionEvidence(history, topicState, now);
  for (const state of topicState.values()) {
    state.retentionEstimate = estimateRetention({ topic: state, history, topics: topicState, asOf: now, evidence: retentionEvidence, config: retentionConfig });
    registerRetentionContext(state, { history, topics: topicState, config: state.retentionEstimate.policy });
  }
  const topics = definitions.map(topic => {
    const state = topicState.get(topic.id)!;
    return {
      ...topic, title: state.title, officialTitle: state.officialTitle,
      pages: state.pages, numeroPalabras: state.numeroPalabras,
      difficulty: state.difficulty as Topic['difficulty'], epigrafes: state.epigrafes,
    };
  });
  const progressView: Record<string, TopicProgressData & Record<string, any>> = {};
  for (const [id, state] of topicState) {
    const stored = activeMetadata[id];
    if (!stored && state.sessions.length === 0) continue;
    const lastCanto = state.cantoSessions.at(-1);
        progressView[id] = {
      ...stored, topicId: id, pages: state.pages, numeroPalabras: state.numeroPalabras,
      difficulty: state.difficulty, epigrafes: state.epigrafes,
      customTitle: state.customTitle, subjectId: state.subjectId,
      studyTimeHours: state.totalStudyMinutes / 60,
      estudioHours: state.totalInitialStudyMinutes / 60,
      repasoHours: state.totalReviewMinutes / 60, refrescoHours: state.totalRefreshMinutes / 60, cantoHours: state.totalCantoMinutes / 60,
      vueltas: state.vueltas, reviewCount: state.reviewCount,
      firstStudyDate: state.firstStudyDate || '', lastReviewDate: state.lastReviewDate,
      lastContactDate: state.lastContactDate, nextReviewDate: getCanonicalReviewDate(state) || undefined,
      mejorTiempoCantoMinutos: Math.floor((state.mejorTiempoCantoSegundos || 0) / 60),
      mejorTiempoCantoSegundos: (state.mejorTiempoCantoSegundos || 0) % 60,
      ultimoCantoFecha: state.lastCantoDate, ultimoCantoNota: state.lastCantoGrade,
      ultimoCantoMinutos: lastCanto ? Math.floor(sessionDurationMinutes(lastCanto)) : undefined,
      ultimoCantoSegundos: lastCanto ? Math.round(sessionDurationMinutes(lastCanto) * 60) % 60 : undefined,
      initialStudyCoverage: state.initialStudyCoverage,
      derivedFromSessions: state.sessions.length > 0 || state.historyIsAuthoritative,
      historyVersion: state.historyIsAuthoritative ? 3 : stored?.historyVersion,
      provenance: state.provenance, conflicts: state.conflicts,
    };
  }
  return { topics, topicState, progressView };
}

export type TopicDataSnapshot = ReturnType<typeof buildTopicData>;
export type { CanonicalTopic };
