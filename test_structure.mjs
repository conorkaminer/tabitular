import test from 'node:test';
import assert from 'node:assert/strict';
import {newDraft,fromSong,toSong,addTrack,changeMeasure,enableTriplets,removeTrack} from './static/editor.mjs';
import {createTbt,parse} from './src/core/tabit.mjs';

test('opened files accept new tracks and retain existing notes on save',async()=>{
 const initial=newDraft('Imported',120,2,false);initial.tracks[0].grid[0][20]=7;
 const draft=fromSong(await parse(await createTbt(initial),'Imported.tbt',true));
 addTrack(draft,'bass');draft.tracks[1].grid[0][4]=3;
 const saved=await parse(await createTbt(draft));
 assert.equal(saved.tracks.length,2);assert.equal(saved.tracks[1].program,34);
 assert.equal(saved.tracks[0].notes[0].start,20);assert.equal(saved.tracks[1].notes[0].pitch,31);
 assert.equal(saved.bars.length,2);
});
test('insert, remove and append move notes and tempo changes across every track',async()=>{
 const draft=newDraft('Structure',120,3,true);
 draft.tracks.forEach(t=>{t.grid[0][20]=5;t.changes=[{space:24,start:24,effect:3,value:150}];});
 changeMeasure(draft,1);
 assert.equal(draft.measures,4);
 for(const t of toSong(draft).tracks){assert.equal(t.notes[0].start,36);assert.equal(t.changes[0].start,40);}
 changeMeasure(draft,1,true);
 for(const t of toSong(draft).tracks){assert.equal(t.notes[0].start,20);assert.equal(t.changes[0].start,24);}
 changeMeasure(draft,draft.measures);
 const saved=await parse(await createTbt(draft));assert.equal(saved.bars.length,4);
 assert.equal(saved.tracks[0].notes[0].start,20);assert.equal(saved.tracks[0].changes[0].start,24);
 changeMeasure(draft,1,true);assert.equal(toSong(draft).tracks[0].notes.length,0);assert.equal(draft.tracks[0].changes.length,0);
 while(draft.measures>1)changeMeasure(draft,0,true);
 assert.throws(()=>changeMeasure(draft,0,true),/at least one/);
});
test('structural edits preserve variable bars, repeats, fractional timing and metadata',async()=>{
 const draft=fromSong(await parse(await createTbt(newDraft('Source',120,2,false)),'Source.tbt',true));
 draft.source.artist='Artist';draft.source.comment='Keep me';
 draft.source.bars=[{start:0,length:12,flags:2,repeats:0},{start:12,length:20,flags:4,repeats:3}];
 draft.tracks[0].grid[0][16]=7;draft.tracks[0].notes=[{space:16,string:0,effect:'h'}];
 draft.encoding.rawnotes[0][16*20+8]=104;
 enableTriplets(draft);draft.tracks[0].grid[0][49]=8;
 changeMeasure(draft,1);addTrack(draft,'drums');
 const song=await parse(await createTbt(draft),'Roundtrip',true);
 assert.equal(song.artist,'Artist');assert.equal(song.comment,'Keep me');
 assert.deepEqual(song.bars.map(b=>[b.length,b.flags,b.repeats]),[[12,2,0],[12,0,0],[20,4,3]]);
 assert.equal(song.tracks[0].notes[0].effect,'h');assert.equal(song.tracks[0].notes[0].start,28);
 assert.ok(Math.abs(song.tracks[0].notes[1].start-(28+1/3))<1e-8);
 assert.equal(song.tracks[1].length,44);
 changeMeasure(draft,1,true);
 assert.equal((await parse(await createTbt(draft))).tracks[0].notes[0].start,16);
});

test('removing an imported track preserves remaining tracks through save and reopen',async()=>{
 const initial=newDraft('Remove track',120,2,true);
 initial.tracks[0].grid[0][0]=7;initial.tracks[1].grid[0][4]=3;initial.tracks[2].grid[0][8]=36;
 const draft=fromSong(await parse(await createTbt(initial),'Remove.tbt',true));
 removeTrack(draft,0);
 let saved=await parse(await createTbt(draft));
 assert.equal(saved.tracks.length,2);assert.equal(saved.tracks[0].program,34);
 assert.equal(saved.tracks[0].notes[0].pitch,31);assert.equal(saved.tracks[1].notes[0].pitch,36);
 addTrack(draft,'guitar');removeTrack(draft,1);
 saved=await parse(await createTbt(draft));assert.deepEqual(saved.tracks.map(t=>t.program),[34,30]);
 removeTrack(draft,1);assert.throws(()=>removeTrack(draft,0),/at least one track/);
 assert.throws(()=>removeTrack({...draft,tracks:[...draft.tracks,...draft.tracks]},9),/Invalid track/);
});
