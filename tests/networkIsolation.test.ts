import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';

test('the test runner blocks external fetches before any request is sent', async () => {
  await assert.rejects(async () => fetch('https://firestore.googleapis.com/'), /Network isolation/);
  await assert.rejects(async () => fetch('https://identitytoolkit.googleapis.com/'), /Network isolation/);
});

test('the test runner blocks raw sockets to a non-local host', () => {
  const socket = new net.Socket();
  try {
    assert.throws(() => socket.connect({ host: 'example.test', port: 443 }), /Network isolation/);
  } finally { socket.destroy(); }
});

test('the test runner cannot use a proxy listening on another local port', () => {
  const socket = new net.Socket();
  try {
    assert.throws(() => socket.connect({ host: '127.0.0.1', port: 8088 }), /Network isolation/);
  } finally { socket.destroy(); }
});
