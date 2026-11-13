import { auth } from './firebase';
import { createAuthenticatedFetch, JsonEventDecoder } from './apiSecurity';

export const authenticatedFetch = createAuthenticatedFetch({
  origin: () => window.location.origin,
  identity: () => auth.currentUser,
  fetch: (input, init) => fetch(input, init),
});

/** EventSource cannot set an Authorization header; use an authenticated stream. */
export function subscribeAuthenticatedEvents(onMessage: (data: any) => void, onError?: () => void): () => void {
  let stopped = false;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const owner = auth.currentUser?.uid;
  let retryMilliseconds = 1500;
  const connect = async () => {
    if (stopped || !owner || auth.currentUser?.uid !== owner) return;
    controller = new AbortController();
    try {
      const response = await authenticatedFetch('/api/webhook/stream', {
        signal: controller.signal, headers: { Accept: 'text/event-stream' },
      });
      if (!response.ok || !response.body) throw new Error('No se puede abrir el canal autenticado.');
      retryMilliseconds = 1500;
      const reader = response.body.getReader(), text = new TextDecoder(), events = new JsonEventDecoder();
      try {
        while (!stopped && auth.currentUser?.uid === owner) {
          const chunk = await reader.read();
          if (chunk.done) break;
          for (const event of events.push(text.decode(chunk.value, { stream: true }))) {
            if (!stopped && auth.currentUser?.uid === owner) onMessage(event);
          }
        }
      } finally { await reader.cancel().catch(() => {}); }
    } catch {
      if (!stopped && auth.currentUser?.uid === owner) onError?.();
    }
    if (!stopped && auth.currentUser?.uid === owner) {
      timer = setTimeout(connect, retryMilliseconds);
      retryMilliseconds = Math.min(30000, retryMilliseconds * 2);
    }
  };
  void connect();
  return () => { stopped = true; controller?.abort(); if (timer) clearTimeout(timer); };
}
