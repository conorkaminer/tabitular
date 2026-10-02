import test from 'node:test';
import assert from 'node:assert/strict';
import { newDraft, newTrack, toSong, parseFret } from './static/editor.mjs';

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
