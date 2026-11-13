import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deleteApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  runTransaction,
  terminate,
  type DocumentReference,
} from 'firebase/firestore';
import {
  otherSyntheticUser,
  syntheticProgress,
  syntheticSessions,
  syntheticTopics,
  syntheticUser,
} from './fixtures/syntheticStudyData';
import {
  assertEmulatorEnvironment,
  createEmulatorClient,
  EMULATOR_PROJECT_ID,
  requireLocalEmulators,
} from './helpers/emulatorClient';
import { buildCanonicalTopicMap } from '../src/lib/canonicalTopicService';
import { estimateRetention, captureRetentionPrediction } from '../src/lib/retentionModel';
import { generateCantePlanProposal } from '../src/lib/cantePlanningEngine';
import { DEFAULT_PLANNER_SETTINGS } from '../src/lib/plannerEngine';

async function signInSynthetic(auth: Auth, fixture: { email: string; password: string }) {
  try {
    return await createUserWithEmailAndPassword(auth, fixture.email, fixture.password);
  } catch (error: any) {
    // The demo emulator can persist between runs; reuse only this synthetic account.
    if (error?.code !== 'auth/email-already-in-use') throw error;
    return signInWithEmailAndPassword(auth, fixture.email, fixture.password);
  }
}

const permissionDenied = (error: any) => error?.code === 'permission-denied';

function testAccount(fixture: { email: string; password: string }) {
  const [name, domain] = fixture.email.split('@');
  return { email: `${name}+firestore-test@${domain}`, password: fixture.password };
}

test('real Firestore rules: isolated synthetic users and study telemetry', { timeout: 45_000 }, async (t) => {
  // This executes before creating an SDK app or making any network request.
  assertEmulatorEnvironment();
  await requireLocalEmulators();
  const owner = createEmulatorClient('owner');
  const other = createEmulatorClient('other');
  const anonymous = createEmulatorClient('anonymous');
  const ownedDocuments: DocumentReference[] = [];
  try {
    const ownerFixture = testAccount(syntheticUser);
    const otherFixture = testAccount(otherSyntheticUser);
    const accountA = await signInSynthetic(owner.auth, ownerFixture);
    const accountB = await signInSynthetic(other.auth, otherFixture);
    const uidA = accountA.user.uid;
    const uidB = accountB.user.uid;
    assert.notEqual(uidA, uidB);
    assert.equal(accountA.user.email, ownerFixture.email);
    assert.equal(accountB.user.email, otherFixture.email);
    for (const client of [owner, other, anonymous]) {
      assert.equal(client.app.options.projectId, EMULATOR_PROJECT_ID);
    }
    assert.equal(anonymous.auth.currentUser, null);

    await t.test('authenticated owner round-trips synthetic topics, partial progress and PLSEMA sessions', async () => {
      const userRef = doc(owner.db, `users/${uidA}`);
      ownedDocuments.push(userRef);
      await setDoc(userRef, { userId: uidA, email: ownerFixture.email, synthetic: true });
      assert.equal((await getDoc(userRef)).data()?.userId, uidA);

      for (const topic of syntheticTopics) {
        const ref = doc(owner.db, `users/${uidA}/audit_topics/${topic.id}`);
        ownedDocuments.push(ref);
        await setDoc(ref, { ...topic, userId: uidA, synthetic: true });
        assert.deepEqual((await getDoc(ref)).data(), { ...topic, userId: uidA, synthetic: true });
      }
      for (const [topicId, progress] of Object.entries(syntheticProgress)) {
        const ref = doc(owner.db, `users/${uidA}/progress/${topicId}`);
        ownedDocuments.push(ref);
        const expected = { ...progress, userId: uidA, synthetic: true };
        await setDoc(ref, expected);
        assert.deepEqual((await getDoc(ref)).data(), expected);
      }
      for (const session of syntheticSessions) {
        const ref = doc(owner.db, `users/${uidA}/sessions/${session.id}`);
        ownedDocuments.push(ref);
        const expected = { ...session, userId: uidA, synthetic: true };
        await setDoc(ref, expected);
        const actual = (await getDoc(ref)).data();
        assert.deepEqual(actual, expected);
        assert.ok(actual?.plsema, 'fixture must exercise session PLSEMA');
        assert.ok(actual?.pageBreakdown.length > 0, 'fixture must exercise page telemetry');
      }
    });

    await t.test('replaying the same synthetic session ID does not create another document', async () => {
      const session = syntheticSessions[0];
      assert.ok(session, 'at least one synthetic session is required');
      const expected = { ...session, userId: uidA, synthetic: true };
      const ref = doc(owner.db, `users/${uidA}/sessions/${session.id}`);
      const before = await getDocs(collection(owner.db, `users/${uidA}/sessions`));
      await setDoc(ref, expected);
      await setDoc(ref, expected);
      const after = await getDocs(collection(owner.db, `users/${uidA}/sessions`));
      assert.equal(after.size, before.size);
      assert.deepEqual((await getDoc(ref)).data(), expected);
    });

    await t.test('retention outcome, prediction and a confirmed proposal survive real SDK round-trips', async () => {
      const map = buildCanonicalTopicMap(syntheticTopics, syntheticProgress, syntheticSessions);
      const target = map.get(syntheticTopics[0].id)!;
      const forecast = captureRetentionPrediction(estimateRetention({ topic: target, history: syntheticSessions, topics: map, asOf: new Date('2026-10-08T08:00:00Z') }));
      const sessionRef = doc(owner.db, `users/${uidA}/sessions/synthetic-retention-roundtrip`);
      ownedDocuments.push(sessionRef);
      const observation = { userId: uidA, synthetic: true, topicId: target.id, type: 'repaso', durationMinutes: 23,
        date: '2026-10-08', retentionPrediction: forecast, retrieval: { assistance: 'none', coverage: 'whole_topic', outcome: 'failure' } };
      await setDoc(sessionRef, observation);
      assert.deepEqual((await getDoc(sessionRef)).data(), observation);
      const proposal = generateCantePlanProposal({ canonicalMap: map, sessions: syntheticSessions, existingTasks: [],
        settings: DEFAULT_PLANNER_SETTINGS, canteGoals: [{ id: 'synthetic-oral-goal', date: '2026-10-12', topicIds: [target.id] }],
        asOf: '2026-10-08', horizonStart: '2026-10-08', horizonEnd: '2026-10-15' });
      const stateRef = doc(owner.db, `users/${uidA}/settings/weeklyPlannerState`);
      ownedDocuments.push(stateRef);
      const state = JSON.parse(JSON.stringify({ userId: uidA, tasks: proposal.mergedTasks.map(task => ({ ...task, confirmed: true })),
        cantePlanning: { signature: proposal.signature, viability: proposal.viability } }));
      const sessionCount = (await getDocs(collection(owner.db, `users/${uidA}/sessions`))).size;
      await setDoc(stateRef, state);
      await setDoc(stateRef, state);
      assert.deepEqual((await getDoc(stateRef)).data(), state);
      assert.equal((await getDocs(collection(owner.db, `users/${uidA}/sessions`))).size, sessionCount);
      assert.equal(new Set(state.tasks.map(task => task.id)).size, state.tasks.length);
    });

    await t.test('concurrent deliveries create the same stable session only once transactionally', async () => {
      const ref = doc(owner.db, `users/${uidA}/sessions/synthetic-concurrent-planner-session`);
      ownedDocuments.push(ref);
      const insert = () => runTransaction(owner.db, async transaction => {
        const previous = await transaction.get(ref);
        if (previous.exists()) return false;
        transaction.set(ref, { userId: uidA, synthetic: true, durationMinutes: 17, plannerTaskId: 'synthetic-concurrent-task' });
        return true;
      });
      const outcomes = await Promise.all([insert(), insert()]);
      assert.equal(outcomes.filter(Boolean).length, 1);
      assert.equal((await getDoc(ref)).data()?.durationMinutes, 17);
    });

    await t.test('another authenticated user cannot read, list, write or delete owner documents', async () => {
      const otherRef = doc(other.db, `users/${uidA}/sessions/${syntheticSessions[0].id}`);
      await assert.rejects(getDoc(otherRef), permissionDenied);
      await assert.rejects(getDocs(collection(other.db, `users/${uidA}/sessions`)), permissionDenied);
      await assert.rejects(setDoc(otherRef, { userId: uidB, synthetic: true }), permissionDenied);
      await assert.rejects(deleteDoc(otherRef), permissionDenied);
      await assert.rejects(getDoc(doc(other.db, `users/${uidA}`)), permissionDenied);
    });

    await t.test('an unauthenticated client cannot read or write owner documents', async () => {
      const ref = doc(anonymous.db, `users/${uidA}/sessions/${syntheticSessions[0].id}`);
      await assert.rejects(getDoc(ref), permissionDenied);
      await assert.rejects(setDoc(ref, { synthetic: true }), permissionDenied);
    });

    await t.test('the owner can delete its own synthetic document', async () => {
      const ref = doc(owner.db, `users/${uidA}/audit_checks/delete-own`);
      ownedDocuments.push(ref);
      await setDoc(ref, { userId: uidA, synthetic: true });
      assert.equal((await getDoc(ref)).exists(), true);
      await deleteDoc(ref);
      assert.equal((await getDoc(ref)).exists(), false);
    });
  } finally {
    // Clean only documents written by this test, through the owner's real rules.
    // Never use Admin SDK or the emulator's global clear endpoint.
    try {
      for (const ref of ownedDocuments.reverse()) await deleteDoc(ref);
    } finally {
      await Promise.all([owner, other, anonymous].map(async (client) => {
        await signOut(client.auth);
        await terminate(client.db);
        await deleteApp(client.app);
      }));
    }
  }
});
