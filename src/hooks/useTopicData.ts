import { useFirebase } from '../lib/FirebaseProvider';

/** All React consumers share the provider's memoized domain snapshot. */
export function useTopicData() {
  const { topics, topicState } = useFirebase();
  return { topics, topicState, getTopic: (id: string) => topicState.get(id) };
}
