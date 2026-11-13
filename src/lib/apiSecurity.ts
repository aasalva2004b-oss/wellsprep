export interface ApiIdentity { uid: string; getIdToken: () => Promise<string> }
export interface ApiDependencies {
  origin: () => string;
  identity: () => ApiIdentity | null;
  fetch: typeof fetch;
}

/** A browser ID token may only be sent to this app's own API. */
export function createAuthenticatedFetch(dependencies: ApiDependencies): typeof fetch {
  return async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const origin = dependencies.origin();
    const address = input instanceof Request ? input.url : String(input);
    const url = new URL(address, origin);
    if (url.origin !== new URL(origin).origin || !['http:', 'https:'].includes(url.protocol)
      || !url.pathname.startsWith('/api/') || url.username || url.password) {
      throw new Error('La autenticación solo puede enviarse a la API de Wells Prep.');
    }
    const user = dependencies.identity();
    if (!user) throw new Error('Inicia sesión para utilizar esta integración.');
    const token = await user.getIdToken();
    if (!token || dependencies.identity()?.uid !== user.uid) throw new Error('La sesión ha cambiado. Repite la operación.');
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    headers.set('Authorization', `Bearer ${token}`);
    return dependencies.fetch(input instanceof Request ? input : url, {
      ...init, headers, credentials: 'same-origin', redirect: 'error',
    });
  };
}

/** Incremental SSE decoder. Neither stream fragments nor malformed JSON are events. */
export class JsonEventDecoder {
  private pending = '';
  push(chunk: string): unknown[] {
    this.pending += chunk.replace(/\r\n/g, '\n');
    if (this.pending.length > 262144) throw new Error('El evento recibido supera el tamaño permitido.');
    const packets = this.pending.split('\n\n');
    this.pending = packets.pop() || '';
    const events: unknown[] = [];
    for (const packet of packets) {
      const data = packet.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (!data) continue;
      try { events.push(JSON.parse(data)); } catch { /* A malformed message cannot become a study observation. */ }
    }
    return events;
  }
}
