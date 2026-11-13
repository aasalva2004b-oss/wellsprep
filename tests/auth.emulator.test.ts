import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp } from 'firebase/app';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, deleteUser } from 'firebase/auth';
import { terminate } from 'firebase/firestore';
import { assertEmulatorEnvironment, createEmulatorClient } from './helpers/emulatorClient';

test('Auth Emulator creates, signs in and removes a fictitious account without Google credentials', { timeout: 15_000 }, async () => {
  assertEmulatorEnvironment();
  const client = createEmulatorClient('auth-only-test');
  const email = `synthetic-auth-${Date.now()}@example.test`;
  const password = 'public-synthetic-auth-only';
  try {
    const created = await createUserWithEmailAndPassword(client.auth, email, password);
    const uid = created.user.uid;
    assert.equal(created.user.email, email);
    assert.equal(client.app.options.projectId, 'demo-wellsprep');
    await signOut(client.auth);
    assert.equal(client.auth.currentUser, null);
    const restored = await signInWithEmailAndPassword(client.auth, email, password);
    assert.equal(restored.user.uid, uid);
    const token = await restored.user.getIdToken();
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    assert.equal(claims.aud, 'demo-wellsprep');
    assert.equal(claims.email, email);
    await deleteUser(restored.user);
    await assert.rejects(signInWithEmailAndPassword(client.auth, email, password));
  } finally {
    await signOut(client.auth);
    await terminate(client.db);
    await deleteApp(client.app);
  }
});
