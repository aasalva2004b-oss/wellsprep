import type { Session } from '../types';
import type { CanonicalTopic } from './canonicalTopicService';
import type { RetentionConfig } from './retentionModel';

interface RetentionContext {
  history: readonly Session[];
  topics: ReadonlyMap<string, CanonicalTopic>;
  config?: Partial<RetentionConfig>;
}

// This is ephemeral calculation context, not another stored topic model. Weak
// keys follow the snapshot's lifetime and cannot mix accounts or later maps.
const contexts = new WeakMap<CanonicalTopic, RetentionContext>();

export function registerRetentionContext(topic: CanonicalTopic, context: RetentionContext): void {
  contexts.set(topic, { ...context, config: context.config ? { ...context.config } : undefined });
}

export function getRetentionContext(topic: CanonicalTopic): RetentionContext | undefined {
  return contexts.get(topic);
}
