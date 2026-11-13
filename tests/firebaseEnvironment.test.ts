import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFirebaseEnvironment, SYNTHETIC_PROJECT_ID } from '../src/lib/firebaseEnvironment';

test('empty environment and ordinary production builds select only the local demo project', () => {
  for (const env of [{}, { MODE: 'production', PROD: true }]) {
    const result = resolveFirebaseEnvironment(env);
    assert.equal(result.mode, 'emulator');
    assert.equal(result.projectId, SYNTHETIC_PROJECT_ID);
    assert.deepEqual(result.firestore, { host: '127.0.0.1', port: 8080 });
    assert.deepEqual(result.auth, { host: '127.0.0.1', port: 9099 });
  }
});

test('production needs explicit opt-in', () => {
  assert.equal(resolveFirebaseEnvironment({ VITE_FIREBASE_MODE: 'production' }).mode, 'production');
  assert.throws(() => resolveFirebaseEnvironment({ VITE_FIREBASE_MODE: 'staging' }));
});

test('node and browser test modes reject explicit production', () => {
  assert.throws(() => resolveFirebaseEnvironment({ VITE_FIREBASE_MODE: 'production' }, 'test'), /forbidden during tests/);
  assert.throws(() => resolveFirebaseEnvironment({ VITE_FIREBASE_MODE: 'production', MODE: 'test' }), /forbidden during tests/);
  assert.throws(() => resolveFirebaseEnvironment({ VITE_FIREBASE_MODE: 'production', NODE_ENV: 'test' }), /forbidden during tests/);
});

test('emulator project cannot be replaced with a real project', () => {
  assert.throws(() => resolveFirebaseEnvironment({ VITE_FIREBASE_PROJECT_ID: 'real-project' }), /requires project/);
  assert.equal(resolveFirebaseEnvironment({ VITE_FIREBASE_PROJECT_ID: SYNTHETIC_PROJECT_ID }).projectId, SYNTHETIC_PROJECT_ID);
});

test('only loopback addresses on the designated ports are accepted', () => {
  assert.equal(resolveFirebaseEnvironment({ VITE_FIRESTORE_EMULATOR_HOST: 'localhost:8080' }).firestore.host, '127.0.0.1');
  for (const host of ['firestore.googleapis.com:8080', '192.168.1.2:8080', '127.0.0.1:443', 'https://127.0.0.1:8080', 'localhost:8080@evil.example']) {
    assert.throws(() => resolveFirebaseEnvironment({ VITE_FIRESTORE_EMULATOR_HOST: host }), /loopback/);
  }
  for (const host of ['identitytoolkit.googleapis.com:9099', 'localhost:8080']) {
    assert.throws(() => resolveFirebaseEnvironment({ VITE_FIREBASE_AUTH_EMULATOR_HOST: host }), /loopback/);
  }
});
