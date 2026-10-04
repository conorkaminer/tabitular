import test from 'node:test';
import assert from 'node:assert/strict';
import {tempoTimeline} from './src/core/tempo.mjs';
import {createTbt,parse} from './src/core/tabit.mjs';
import {newDraft,fromSong,enableTriplets} from './static/editor.mjs';

test('tempo timeline integrates sustained notes, seeks and repeated changes across tracks',()=>{
 const song={tempo:120,tracks:[{changes:[{start:8,effect:3,value:60}]},{changes:[{start:12,effect:3,value:240}]}]};
 const timeline=tempoTimeline(song,[{start:0,bar:{start:0,length:16}},{start:16,bar:{start:0,length:16}}]);
 assert.equal(timeline.seconds(8),1);
 assert.equal(timeline.seconds(12),2);
 assert.equal(timeline.seconds(16),2.25);
 assert.equal(timeline.seconds(24),2.75);
 assert.equal(timeline.seconds(32),4);
 for(const p of [0,4,8,10,12,16,23,24,28,32])assert.equal(timeline.position(timeline.seconds(p)),p);
});

test('tempo changes add, edit and remove through legacy saves and triplet conversion',async()=>{
 let draft=newDraft('Tempo',120,2,true);
 draft.tracks[1].changes=[{space:4,start:4,effect:3,value:500},{space:16,start:16,effect:3,value:60}];
 let song=await parse(await createTbt(draft),'tempo.tbt',true);
 assert.deepEqual(song.tracks[1].changes,draft.tracks[1].changes);
 draft=fromSong(song);draft.tracks[1].changes[0].value=200;draft.tracks[1].changes.splice(1,1);
 enableTriplets(draft);
 song=await parse(await createTbt(draft),'tempo.tbt',true);
 assert.deepEqual(song.tracks[1].changes,[{space:12,start:4,effect:3,value:200}]);
 draft=fromSong(song);draft.tracks[1].changes=[];
 assert.deepEqual((await parse(await createTbt(draft))).tracks[1].changes,[]);
});
