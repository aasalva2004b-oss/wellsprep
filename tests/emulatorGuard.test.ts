import test from 'node:test';
import assert from 'node:assert/strict';
import { assertEmulatorEnvironment, EMULATOR_PROJECT_ID } from './helpers/emulatorClient';

const validEnvironment = (): NodeJS.ProcessEnv => ({
  GCLOUD_PROJECT: EMULATOR_PROJECT_ID,
  GOOGLE_CLOUD_PROJECT: EMULATOR_PROJECT_ID,
  FIREBASE_PROJECT_ID: EMULATOR_PROJECT_ID,
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
});

test('emulator I/O guard accepts the explicit synthetic project and both local SDK endpoints', () => {
  assert.doesNotThrow(() => assertEmulatorEnvironment(validEnvironment()));
});

test('emulator I/O guard fails closed when either SDK endpoint or the required project is missing', () => {
  for (const name of ['GCLOUD_PROJECT', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
    const env = validEnvironment();
    delete env[name];
    assert.throws(() => assertEmulatorEnvironment(env), new RegExp(`Refusing Firebase I/O: ${name}`));
  }
  assert.throws(() => assertEmulatorEnvironment({}), /Refusing Firebase I\/O/);
});

test('emulator I/O guard rejects remote destinations, URLs, and unexpected local ports', () => {
  for (const [name, values] of Object.entries({
    FIRESTORE_EMULATOR_HOST: ['firestore.googleapis.com:8080', '192.168.1.10:8080', 'http://127.0.0.1:8080', '127.0.0.1:443'],
    FIREBASE_AUTH_EMULATOR_HOST: ['identitytoolkit.googleapis.com:9099', '192.168.1.10:9099', 'http://127.0.0.1:9099', '127.0.0.1:443'],
  })) {
    for (const value of values) {
      assert.throws(() => assertEmulatorEnvironment({ ...validEnvironment(), [name]: value }), /Refusing Firebase I\/O/);
    }
  }
});

test('emulator I/O guard rejects a non-demo project in every supported project selector', () => {
  for (const name of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'FIREBASE_PROJECT_ID']) {
    assert.throws(() => assertEmulatorEnvironment({ ...validEnvironment(), [name]: 'non-demo-project' }), /Refusing Firebase I\/O/);
  }
});
