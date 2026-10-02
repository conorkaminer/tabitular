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
