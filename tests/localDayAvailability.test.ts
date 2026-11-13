import test from 'node:test';
import assert from 'node:assert/strict';
import { isSessionAvailableAt } from '../src/lib/sessionAvailability';
import { buildCanonicalTopicMap } from '../src/lib/canonicalTopicService';
import { estimatePersonalizedDuration } from '../src/lib/personalizedEstimator';
import { syntheticTopics } from './fixtures/syntheticStudyData';

test('a real session just after Paris midnight is available before UTC midnight in both models',()=>{
 const previous=process.env.TZ;
 try{
  process.env.TZ='Europe/Paris';
  const topic={...syntheticTopics[0],pages:6};
  const session={id:'synthetic-midnight-created',topicId:topic.id,date:'2026-11-14',type:'estudio_inicial' as const,durationMinutes:30,pagesCount:3,notes:'',createdAt:'2026-11-13T23:05:00Z'};
  const cutoff=new Date('2026-11-13T23:30:00Z');
  assert.equal(isSessionAvailableAt(session,cutoff),true);
  assert.equal(isSessionAvailableAt({...session,createdAt:'2026-11-13T23:45:00Z'},cutoff),false);
  const map=buildCanonicalTopicMap([topic],{},[]);
  const result=estimatePersonalizedDuration({topic:map.get(topic.id)!,topics:map,history:[session],activity:'estudio_nuevo',work:{pages:3},asOf:cutoff});
  assert.equal(result.estimatedMinutes,30);
 }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
