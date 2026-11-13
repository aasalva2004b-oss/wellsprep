import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthenticatedFetch, JsonEventDecoder } from '../src/lib/apiSecurity';

test('API authentication is restricted to the same origin and is not forwarded on redirects', async () => {
  const calls: Array<{ address: string; options: RequestInit }> = [];
  const user = { uid: 'synthetic-a', getIdToken: async () => 'synthetic-id-token' };
  const request = createAuthenticatedFetch({ origin: () => 'https://wellsprep.example.test', identity: () => user,
    fetch: async (input, options) => { calls.push({ address: String(input), options: options! }); return new Response('{}'); } });
  for (const target of ['https://evil.example/api/events', '//evil.example/api/events', '/server.cjs', 'https://someone@wellsprep.example.test/api/events']) {
    await assert.rejects(request(target));
  }
  assert.equal(calls.length, 0);
  await request('/api/webhook/events', { headers: { Authorization: 'Bearer forged', 'Content-Type': 'application/json' } });
  assert.equal(new Headers(calls[0].options.headers).get('Authorization'), 'Bearer synthetic-id-token');
  assert.equal(calls[0].options.redirect, 'error');
});

test('a missing login or a UID change while obtaining a token rejects without a request', async () => {
  let identity: any = null, count = 0;
  const request = createAuthenticatedFetch({ origin: () => 'http://localhost', identity: () => identity,
    fetch: async () => { count++; return new Response('{}'); } });
  await assert.rejects(request('/api/webhook/events'));
  identity = { uid: 'synthetic-a', getIdToken: async () => { identity = { uid: 'synthetic-b' }; return 'old-token'; } };
  await assert.rejects(request('/api/webhook/events'));
  assert.equal(count, 0);
});

test('SSE events survive split chunks and malformed input never becomes an observation', () => {
  const decoder = new JsonEventDecoder();
  assert.deepEqual(decoder.push('data: {"id":"synthetic'), []);
  assert.deepEqual(decoder.push('-event"}\n\ndata: broken\n\n: heartbeat\n\n'), [{ id: 'synthetic-event' }]);
  assert.throws(() => decoder.push('x'.repeat(262145)));
});
