import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BANKS, defaultBank, nearestPitch, SoundbankPlayer } from './static/soundbanks.mjs';

function context() {
  const param = () => ({value:0,setValueAtTime(){},linearRampToValueAtTime(){}});
  const node = () => ({connect(){},disconnect(){}});
  let decodes=0;
  return {
    destination:{}, get decodes(){return decodes;},
    createDynamicsCompressor:()=>({...node(),threshold:param(),knee:param(),ratio:param()}),
    createGain:()=>({...node(),gain:param()}),
    createStereoPanner:()=>({...node(),pan:param()}),
    createBufferSource:()=>({...node(),playbackRate:param(),start(t){this.started=t;},stop(t){this.stopped=t;}}),
    async decodeAudioData(bytes){assert.ok(bytes.byteLength>500);decodes++;return {duration:2};},
  };
}
const localFetch = async url => ({ok:true,json:async()=>JSON.parse(await readFile(new URL('./public/'+url.replace(/^\//,''),import.meta.url),'utf8'))});

test('.tbt file programs map to distinct guitar, bass, and drum banks',()=>{
  assert.equal(defaultBank({program:30}),'distortion_guitar');
  assert.equal(defaultBank({program:34}),'electric_bass_pick');
  assert.equal(defaultBank({program:33}),'electric_bass_finger');
  assert.equal(defaultBank({program:16,drums:true}),'percussion');
  assert.equal(defaultBank({program:0}),null);
  assert.equal(nearestPitch(19,[21,22]),21);
  assert.equal(nearestPitch(26,[27,28],true),null);
});

test('all six local banks contain valid MP3 frames and GM drum coverage',async()=>{
  for(const name of Object.keys(BANKS)){
    const data=await (await localFetch('/soundbanks/'+name+'.json')).json();
    assert.ok(Object.keys(data).length>=61);
    for(const encoded of Object.values(data)){
      const bytes=Buffer.from(encoded.split(',')[1],'base64');
      assert.equal(bytes[0],255);assert.equal(bytes[1]&224,224);
    }
    if(name==='percussion')for(const pitch of [35,36,38,42,44,46,49,51])assert.ok(data[pitch]);
  }
});

test('preloads deduplicate notes, honor overrides, and play full drum tails',async()=>{
  const ctx=context(),player=new SoundbankPlayer(ctx,localFetch);
  const tracks=[{program:30,notes:[{pitch:40,fret:0},{pitch:40,fret:0}]},{drums:true,notes:[{pitch:46,fret:46},{pitch:42,fret:42}]}];
  await player.prepare(tracks,['overdriven_guitar',null]);
  assert.equal(ctx.decodes,3);
  await player.prepare(tracks,['overdriven_guitar',null]);assert.equal(ctx.decodes,3);
  assert.equal(player.play('overdriven_guitar',40,0,.5,.8),true);
  assert.equal(player.play('percussion',46,0,.05,.8,0,false,1),true);
  let hat=[...player.voices].find(v=>v.pitch===46);
  assert.ok(hat.source.stopped>2,'drum tail should not be truncated to note duration');
  player.play('percussion',42,1,.05,.8,0,false,1);
  assert.equal(hat.source.stopped,1.01,'closed hi-hat should choke open hat');
  player.stop();assert.equal(player.voices.size,0);
});

test('failed loads can be retried',async()=>{
  let fails=true;const player=new SoundbankPlayer(context(),async url=>fails?{ok:false}:localFetch(url));
  await assert.rejects(player.decode('distortion_guitar',40));fails=false;
  assert.ok((await player.decode('distortion_guitar',40)).buffer);
});
