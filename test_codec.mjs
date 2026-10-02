import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parse, createTbt } from './src/core/tabit.mjs';
import { midi } from './src/core/midi.mjs';
import { newDraft } from './static/editor.mjs';
import { crc32 } from './src/core/binary.mjs';
function python(code,input){
  const result=spawnSync('python3',['-c',code],{input, maxBuffer:20_000_000});
  assert.equal(result.status,0,result.stderr.toString());return result.stdout;
}
test('browser writer is readable by Python, with matching parsed data and MIDI',async()=>{
  const d=newDraft('Café riff',140,4,true);
  d.tracks[0].grid[0][12]=3;d.tracks[0].grid[0][40]='*';d.tracks[0].grid[1][4]='x';
  d.tracks[1].grid[0][0]=5;d.tracks[2].grid[0][0]=36;
  const bytes=await createTbt(d),song=await parse(bytes,'test.tbt');
  const expected=JSON.parse(python("import sys,json;from tbt import parse;print(json.dumps(parse(sys.stdin.buffer.read(),'test.tbt')))",bytes));
  assert.deepEqual(song,expected);
  assert.deepEqual(Buffer.from(midi(song)),python('import sys,json;from tbt import midi;sys.stdout.buffer.write(midi(json.load(sys.stdin)))',JSON.stringify(song)));
  const view=new DataView(bytes.buffer);assert.equal(view.getUint32(52,true),crc32(bytes.subarray(64)));assert.equal(view.getUint32(60,true),crc32(bytes.subarray(0,60)));
  const fromPython=python('import sys,json;from tbt import create_tbt;sys.stdout.buffer.write(create_tbt(json.load(sys.stdin)))',JSON.stringify(d));
  assert.deepEqual(await parse(fromPython,'test.tbt'),song);
});
test('legacy 1.6 fixture and invalid/truncated files',async()=>{
  const bytes=python('import sys;from test_tbt import fixture;sys.stdout.buffer.write(fixture())');
  const expected=JSON.parse(python('import json;from test_tbt import fixture;from tbt import parse;print(json.dumps(parse(fixture())))'));
  assert.deepEqual(await parse(bytes),expected);
  for(const input of [new Uint8Array(),bytes.subarray(0,bytes.length-4)])await assert.rejects(parse(input));
});
test('repeat and effect MIDI matches Python',async()=>{
  const song=await parse(await createTbt(newDraft('Repeat',120,2,false)));
  song.bars[0].flags=2;song.bars[1].flags=4;song.bars[1].repeats=3;
  song.tracks[0].notes=[{start:12,duration:20,fret:3,pitch:43},{start:20,duration:1,fret:'x',pitch:40,muted:true}];
  song.tracks[0].changes=[{start:4,effect:3,value:137},{start:8,effect:5,value:90}];
  assert.deepEqual(Buffer.from(midi(song)),python('import sys,json;from tbt import midi;sys.stdout.buffer.write(midi(json.load(sys.stdin)))',JSON.stringify(song)));
});
test('invalid drafts rejected and largest editor grid round trips',async()=>{
  for(const [key,value] of [['tempo',0],['measures',257],['tracks',[]],['title','🎸']]){
    const d=newDraft('Test',120,1,false);d[key]=value;await assert.rejects(createTbt(d));
  }
  const d=newDraft('Large',120,256,false);d.tracks[0].grid=d.tracks[0].grid.map(row=>row.map((_,i)=>i%25));
  assert.equal((await parse(await createTbt(d))).tracks[0].notes.length,24576);
});

test('opened legacy files can be edited and saved without losing their metadata or bar layout',async()=>{
  const {fromSong,toSong}=await import('./static/editor.mjs');
  const bytes=python('import sys;from test_tbt import fixture;sys.stdout.buffer.write(fixture())');
  const original=await parse(bytes,'legacy.tbt');
  const draft=fromSong(await parse(bytes,'legacy.tbt',true));
  assert.deepEqual(await parse(await createTbt(draft),'legacy.tbt'),original);
  draft.tracks[0].grid[0][0]=7;draft.tempo=135;
  const saved=await parse(await createTbt(draft),'legacy.tbt');
  assert.equal(saved.tracks[0].notes.find(n=>n.space===0&&n.string===0).fret,7);
  assert.equal(saved.tempo,135);
  assert.deepEqual(saved.bars,original.bars);
  assert.equal(saved.comment,original.comment);
  assert.equal(toSong(draft).tracks[0].notes.find(n=>n.space===0&&n.string===0).fret,7);
});

test('editing preserves variable bars, fractional timing, repeats, effects and track settings',async()=>{
  const {Reader,compress,concat,number}=await import('./src/core/binary.mjs');
  const {fromSong,toSong,measureGrid}=await import('./static/editor.mjs');
  const draft=newDraft('Imported',120,2,true);
  draft.tracks[0].grid[0][2]=5;draft.tracks[0].grid[1][8]=7;draft.tracks[0].grid[0][20]='*';
  draft.tracks[1].grid[0][4]=3;draft.tracks[2].grid[0][0]=36;
  const bytes=await createTbt(draft),header=bytes.slice(0,64),size=new DataView(header.buffer).getUint32(48,true);
  const meta=await compress(bytes.subarray(64,64+size),true),body=await compress(bytes.subarray(64+size),true);
  // Upgrade to 2.0, with modulation and pitch-bend fields and per-track changes.
  const n=3,insert=4*n+4*n;
  const metadata=concat(meta.subarray(0,insert),new Uint8Array(3*n),meta.subarray(insert));
  metadata[4*n+3*n]=78; // guitar volume
  metadata[4*n+7*n]=2; // transpose
  metadata[4*n+11*n]=22; // pan
  header[3]=0x72;header[11]|=16;
  const r=new Reader(body);r.read(12);
  function encode(raw){return concat(number(raw.length,2),...Array.from(raw,x=>Uint8Array.of(1,x)));}
  const rows=Array.from({length:n},()=>r.runs(32*20));
  rows[0][2*20+8]=104; // hammer-on
  const bars=concat(number(12,4),[2,0],number(20,4),[4,3]);
  const timing=Array.from({length:n},()=>encode(Array.from({length:64},(_,i)=>i%2?2:1)));
  const changes=Array.from({length:n},(_,i)=>i===0?concat(number(8,4),number(4,2),number(3,2),number(0,2),number(155,2)):number(0,4));
  const packedMeta=await compress(metadata),payload=concat(packedMeta,await compress(concat(bars,...rows.map(encode),...timing,...changes)));
  header.set(number(packedMeta.length,4),48);
  const fixture=concat(header,payload),original=await parse(fixture,'imported.tbt');
  const editing=fromSong(await parse(fixture,'imported.tbt',true));
  assert.deepEqual(measureGrid(editing,1),{start:12,length:20});
  assert.deepEqual(await parse(await createTbt(editing),'imported.tbt'),original);
  editing.tracks[0].grid[0][2]=9;editing.tracks[2].grid[0][0]=127;
  editing.tracks[1].pitches[0]=26;editing.tracks[1].program=33;
  const saved=await parse(await createTbt(editing),'imported.tbt');
  assert.deepEqual(saved.bars,original.bars);
  assert.deepEqual(saved.tracks[0].changes,original.tracks[0].changes);
  assert.equal(saved.tracks[0].notes[0].start,1);
  assert.equal(saved.tracks[0].notes[0].effect,'h');
  assert.equal(saved.tracks[0].notes[0].fret,9);
  assert.equal(saved.tracks[0].volume,78);
  assert.equal(saved.tracks[0].pan,22);
  assert.equal(saved.tracks[1].pitches[0],26);
  assert.equal(saved.tracks[1].program,33);
  assert.equal(saved.tracks[2].notes[0].pitch,127);
  for(const [i,track] of saved.tracks.entries())assert.deepEqual(toSong(editing).tracks[i].notes,track.notes);
  const {enableTriplets}=await import('./static/editor.mjs');
  enableTriplets(editing);
  const triplets=await parse(await createTbt(editing),'imported.tbt');
  assert.deepEqual(triplets.tracks[0].changes,saved.tracks[0].changes.map(c=>({...c,space:c.space*3})));
  assert.equal(triplets.tracks[0].notes[0].effect,'h');
  assert.deepEqual(midi(triplets),midi(saved));
  const restored=JSON.parse(JSON.stringify(editing));
  assert.deepEqual(await parse(await createTbt(restored),'imported.tbt'),triplets);
});

test('triplet timing round trips through TBT, browser restore and MIDI',async()=>{
 const {enableTriplets,toSong,fromSong}=await import('./static/editor.mjs');
 const draft=newDraft('Triplets',120,2,true);draft.tracks[0].grid[0][16]=7;
 enableTriplets(draft);
 for(const step of [0,4,8])draft.tracks[0].grid[0][step]=step;
 draft.tracks[2].grid[0][2]=36;
 const saved=await parse(await createTbt(draft),'triplets.tbt',true);
 assert.deepEqual(saved.bars.map(b=>b.start),[0,16]);
 assert.equal(saved.tracks[0].notes.at(-1).start,16);
 saved.tracks[0].notes.forEach((note,i)=>assert.ok(Math.abs(note.start-toSong(draft).tracks[0].notes[i].start)<1e-8));
 assert.deepEqual(midi(saved),midi(toSong(draft)));
 const restored=JSON.parse(JSON.stringify(draft));
 assert.deepEqual(await createTbt(restored),await createTbt(draft));
 const imported=fromSong(saved);enableTriplets(imported);
 const resaved=await parse(await createTbt(imported),'triplets.tbt');
 assert.deepEqual(midi(resaved),midi(saved));
});
test('triplets can be added to legacy imports while retaining bars and credits',async()=>{
 const {enableTriplets,fromSong,toSong}=await import('./static/editor.mjs');
 const bytes=python('import sys;from test_tbt import fixture;sys.stdout.buffer.write(fixture())');
 const draft=fromSong(await parse(bytes,'legacy.tbt',true));enableTriplets(draft);
 draft.tracks[0].grid[0][4]=9;
 const saved=await parse(await createTbt(draft),'legacy.tbt');
 assert.deepEqual(saved.bars,draft.source.bars);
 assert.equal(saved.comment,draft.source.comment);
 assert.ok(Math.abs(saved.tracks[0].notes.find(n=>n.fret===9).start-4/3)<1e-8);
 assert.deepEqual(midi(saved),midi(toSong(draft)));
});
