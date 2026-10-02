import test from 'node:test';
import assert from 'node:assert/strict';
import { newDraft, newTrack, toSong, parseFret, enableTriplets, gridColumns } from './static/editor.mjs';

test('new band contains correctly pitched guitar, bass and GM drums',()=>{
 const draft=newDraft('My riff',140,2,true);
 assert.equal(draft.tracks.length,3);
 assert.deepEqual(draft.tracks.map(t=>t.program),[30,34,0]);
 draft.tracks[0].grid[0][0]=0;draft.tracks[0].grid[0][4]=12;draft.tracks[0].grid[0][8]='*';
 draft.tracks[1].grid[0][0]=3;draft.tracks[2].grid[0][0]=36;
 const song=toSong(draft);
 assert.deepEqual(song.tracks[0].notes.map(n=>[n.pitch,n.start,n.duration]),[[40,0,4],[52,4,4],[0,8,0]]);
 assert.equal(song.tracks[1].notes[0].pitch,31);
 assert.equal(song.tracks[2].notes[0].pitch,36);
 assert.equal(song.bars.length,2);
});
test('frets preserve empty spaces, mute and stop; invalid entries are rejected',()=>{
 assert.equal(parseFret(''),null);assert.equal(parseFret('0'),0);assert.equal(parseFret('12'),12);
 assert.equal(parseFret('X'),'x');assert.equal(parseFret('*'),'*');
 for(const invalid of ['-1','100','1.2','a'])assert.throws(()=>parseFret(invalid));
});
test('blank tracks and measures are independent',()=>{
 const draft=newDraft('Blank',120,4,true);draft.tracks[0].grid[0][0]=5;
 assert.equal(draft.tracks[0].grid[1][0],null);
 assert.equal(draft.tracks[1].grid[0][0],null);
 assert.equal(newTrack('bass',4).grid[0].length,64);
});

test('notes ring across blank bars until a stop on the same string',()=>{
 const draft=newDraft('Let ring',120,4,false);
 draft.tracks[0].grid[0][12]=0;
 draft.tracks[0].grid[1][16]=3;
 draft.tracks[0].grid[0][40]='*';
 const notes=toSong(draft).tracks[0].notes;
 assert.equal(notes[0].duration,28);
 assert.equal(notes[1].duration,48);
 assert.equal(notes[2].duration,0);
});

test('triplet grids preserve straight notes, support mixed rhythms and remain idempotent',()=>{
 const draft=newDraft('Triplets',120,2,true);draft.tracks[0].grid[0][4]=7;
 enableTriplets(draft);enableTriplets(draft);
 assert.equal(draft.tracks[0].grid[0].length,96);
 assert.equal(draft.tracks[0].grid[0][12],7);
 assert.equal(draft.tracks[0].times.at(-1),32);
 const columns=gridColumns(draft,0,draft.tracks[0],4/3);
 assert.deepEqual(columns.map(c=>c.step),[0,4,8,12,16,20,24,28,32,36,40,44]);
 draft.tracks[0].grid[0][4]=3;draft.tracks[0].grid[0][8]=5;
 const notes=toSong(draft).tracks[0].notes;
 assert.deepEqual(notes.map(n=>n.start),[4/3,8/3,4]);
 assert.ok(gridColumns(draft,0,draft.tracks[0],4).some(c=>c.step===4));
 assert.equal(gridColumns(draft,1,draft.tracks[0],2/3).length,24);
});
