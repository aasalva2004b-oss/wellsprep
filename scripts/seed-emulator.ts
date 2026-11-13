import { deleteApp } from 'firebase/app';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, terminate, writeBatch } from 'firebase/firestore';
import { assertEmulatorEnvironment, createEmulatorClient, requireLocalEmulators } from '../tests/helpers/emulatorClient';
import { syntheticProgress, syntheticSessions, syntheticTopics, syntheticUser } from '../tests/fixtures/syntheticStudyData';
import { getLocalDateString } from '../src/lib/utils';

assertEmulatorEnvironment();
await requireLocalEmulators();
const client = createEmulatorClient('seed');
try {
  let credential;
  try {
    credential = await createUserWithEmailAndPassword(client.auth, syntheticUser.email, syntheticUser.password);
  } catch (error: any) {
    if (error.code !== 'auth/email-already-in-use') throw error;
    credential = await signInWithEmailAndPassword(client.auth, syntheticUser.email, syntheticUser.password);
  }
  const uid = credential.user.uid;
  const batch = writeBatch(client.db);
  for (const topic of syntheticTopics) {
    batch.set(doc(client.db, `users/${uid}/progress/${topic.id}`), {
      ...syntheticProgress[topic.id], userId: uid, topicId: topic.id,
      isCustom: true, isSynthetic: true, number: topic.number,
      subjectId: topic.subjectId, customTitle: topic.title,
    });
  }
  for (const session of syntheticSessions) {
    batch.set(doc(client.db, `users/${uid}/sessions/${session.id}`), { ...session, userId: uid, isSynthetic: true });
  }
  batch.set(doc(client.db, `users/${uid}/settings/general`), {
    userId: uid, activeSubjects: ['constitucional', 'civil'], defaultSubject: 'constitucional',
    scheduleStr: '', isSynthetic: true,
  });
  batch.set(doc(client.db, `users/${uid}/settings/preparador`), {
    userId: uid, lunes: [syntheticTopics[0].id], jueves: [syntheticTopics[1].id], isSynthetic: true,
  });
  batch.set(doc(client.db, `users/${uid}/settings/weeklyCantePlan`), {
    userId: uid, isSynthetic: true,
    customTopicPages: Object.fromEntries(syntheticTopics.map(topic => [topic.id, topic.pages])),
    progressOverrides: Object.fromEntries(syntheticTopics.map(topic => [topic.id, {
      completedPages: syntheticProgress[topic.id].completedPages.length,
    }])),
    manualDayCompletions: {},
  });
  const date = getLocalDateString();
  batch.set(doc(client.db, `users/${uid}/settings/weeklyPlannerState`), {
    userId: uid, isSynthetic: true,
    tasks: syntheticTopics.map((topic, i) => ({
      id: `synthetic-task-${i}`, topicId: topic.id, topicNumber: topic.number,
      topicTitle: topic.title, subjectId: topic.subjectId,
      activityType: i === 0 ? 'estudio_nuevo' : 'repaso', date,
      status: 'pending', estimatedMinutes: 45, pagesCount: 3,
      fromPage: i === 0 ? 7 : 1, toPage: i === 0 ? 9 : 3,
      notes: 'FICTICIO: escenario de desarrollo', createdAt: new Date().toISOString(),
    })),
  });
  await batch.commit();
  const stored = await getDoc(doc(client.db, `users/${uid}/sessions/${syntheticSessions[0].id}`));
  if (!stored.exists() || stored.data().isSynthetic !== true) throw new Error('Synthetic seed round-trip failed');
  console.log(`Local demo seeded: ${syntheticTopics.length} topics, ${syntheticSessions.length} sessions. No real project or administrator credentials.`);
} finally {
  await signOut(client.auth);
  await terminate(client.db);
  await deleteApp(client.app);
}
