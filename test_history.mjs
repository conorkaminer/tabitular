import test from 'node:test';
import assert from 'node:assert/strict';
import {EditHistory} from './static/history.mjs';
import {newDraft,addTrack,removeTrack,changeMeasure,enableTriplets} from './static/editor.mjs';
import {createTbt,parse} from './src/core/tabit.mjs';
const state=draft=>({draft,bankChoices:[],selected:0,editMeasure:0,resolution:'4',muted:[],solo:[],gains:[]});

test('undo/redo restores independent notes and discards redo only on real edits',()=>{
 const draft=newDraft('History',120,2,false),h=new EditHistory();h.record(state(draft));
 draft.tracks[0].grid[0][0]=12;h.record(state(draft));h.record(state(draft));
 assert.equal(h.past.length,1);
 const old=h.undo();assert.equal(old.draft.tracks[0].grid[0][0],null);
 h.record(old);assert.equal(h.canRedo,true);
 assert.equal(h.redo().draft.tracks[0].grid[0][0],12);
 const branch=h.undo();branch.draft.tempo=150;h.record(branch);
 assert.equal(h.canRedo,false);assert.equal(h.undo().draft.tempo,120);
});

test('structural history restores exportable tracks, measures, timing and instruments',async()=>{
 const draft=newDraft('Structure',120,2,true),h=new EditHistory();
 draft.tracks[0].grid[0][20]=7;h.record(state(draft));
 enableTriplets(draft);changeMeasure(draft,1);removeTrack(draft,1);addTrack(draft,'bass');
 draft.tracks[0].program=25;draft.tracks[0].pitches[0]=38;h.record(state(draft));
 const restored=await parse(await createTbt(h.undo().draft));
 assert.equal(restored.bars.length,2);assert.equal(restored.tracks[0].program,30);
 assert.equal(restored.tracks[0].notes[0].start,20);assert.equal(restored.tracks[1].program,34);
 const redone=await parse(await createTbt(h.redo().draft));
 assert.equal(redone.bars.length,3);assert.equal(redone.tracks[0].program,25);
 assert.equal(redone.tracks[0].notes[0].start,36);
});

test('history is bounded and resets between compositions',()=>{
 const h=new EditHistory(2),s=state(newDraft('Limit',120,1,false));h.record(s);
 for(const tempo of [130,140,150]){s.draft.tempo=tempo;h.record(s);}
 assert.equal(h.undo().draft.tempo,140);assert.equal(h.undo().draft.tempo,130);assert.equal(h.undo(),null);
 h.reset(state(newDraft('New',100,1,false)));assert.equal(h.canRedo,false);assert.equal(h.canUndo,false);
});
