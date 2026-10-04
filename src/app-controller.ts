// @ts-nocheck
// DOM interaction controller retained during the React UI migration.
import { EditHistory } from '../static/history.mjs';
import { DRUMS, newTrack, newDraft, fromSong, measureGrid, toSong, parseFret, enableTriplets, gridColumns, addTrack, changeMeasure, removeTrack } from '../static/editor.mjs';
import { BANKS, defaultBank, SoundbankPlayer } from '../static/soundbanks.mjs';
import { parse, createTbt } from './core/tabit.mjs';
import { tempoTimeline, tempoChanges } from './core/tempo.mjs';
import { midi } from './core/midi.mjs';
import { loadExample } from './core/sample.mjs';
export function initializeApp() {
const $=id=>document.getElementById(id);let song,unified=false,selected=0,playing=false,position=0,ctx,master,origin=0,scheduled=0,voices=[],muted=[],solo=[],gains=[],sequence=[],end=0,midiOut=null,outputs=[],bankChoices=[],soundbankPlayer,loading=false,playRequest=0,draft=null,editMeasure=0;
let timeline;
const history=new EditHistory();
let restoringHistory=false;
const noteName=n=>['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'][((n%12)+12)%12];
const instrument=t=>BANKS[bankChoices[t.index]||defaultBank(t)]?.label||'MIDI instrument '+(t.program+1);
const time=s=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
function error(e){$('error').textContent=e.message||e;$('error').hidden=false;}
async function load(data,name){try{const s=await parse(data,name,true);draft=fromSong(s);$('edit-resolution').value='4';editMeasure=0;setup(toSong(draft));history.reset();persistDraft();$('export').disabled=false;}catch(e){error(e);}}
function setup(s){stop();song=s;bankChoices=s.tracks.map(()=>null);selected=0;muted=s.tracks.map(()=>false);solo=s.tracks.map(()=>false);gains=s.tracks.map(t=>t.volume/127);$('error').hidden=true;$('empty').hidden=true;$('workspace').hidden=false;document.body.classList.add('workspace-open');$('title').textContent=s.title||s.filename.replace(/\.tbt$/i,'');$('subtitle').textContent=[s.artist||(draft?.source?'Editing your .tbt file':draft?'Your new composition':'From your .tbt collection'),s.bars.length+' measures',s.tracks.length+' tracks'].join('  ·  ');$('tempo').value=s.tempo;$('track-count').textContent=String(s.tracks.length).padStart(2,'0');$('notice').textContent=[draft?'Local FluidR3 samples · Your notes, tuning, tempo and instrument choices are included in .tbt and MIDI downloads. ':'Local FluidR3 samples · Sound choices affect playback; MIDI export keeps the file’s original instruments. ',...s.warnings].join(' ');sequence=[];let begin=0;end=0;s.bars.forEach((bar,i)=>{if(bar.flags&2)begin=i;sequence.push({bar,i,start:end});end+=bar.length;if(bar.flags&4)for(let r=1;r<bar.repeats;r++)for(let j=begin;j<=i;j++){sequence.push({bar:s.bars[j],i:j,start:end});end+=s.bars[j].length;}});timeline=tempoTimeline(song,sequence);$('seek').max=end;renderTracks();renderScore();update();}
function renderTracks(){$('tracks').replaceChildren();song.tracks.forEach((t,i)=>{const el=document.createElement('div');el.className='track'+(i===selected?' selected':'');el.tabIndex=0;el.title=instrument(t)+' '+(i+1);el.setAttribute('aria-pressed',String(i===selected));el.setAttribute('role','button');el.setAttribute('aria-label','Show '+instrument(t)+' '+(i+1));el.innerHTML=`<div class="track-top"><span class="track-num">0${i+1}</span><strong>${instrument(t)} ${i+1}</strong></div><small>${t.strings} strings · ${t.drums?'Percussion':t.pitches.map(noteName).join(' ')}</small><button class="${muted[i]?'on':''}" aria-label="Mute track ${i+1}">M</button><button class="${solo[i]?'on':''}" aria-label="Solo track ${i+1}">S</button><input aria-label="Volume track ${i+1}" type="range" min="0" max="1" step="0.01" value="${gains[i]}">`;const select=()=>{selected=i;renderTracks();renderScore();update();};el.onclick=select;el.onkeydown=e=>{if(e.target===el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();select();}};el.querySelectorAll('button').forEach((b,j)=>b.onclick=e=>{e.stopPropagation();(j?solo:muted)[i]=!(j?solo:muted)[i];silence();scheduled=position;renderTracks();});const remove=document.createElement('button');remove.className='remove-track';remove.setAttribute('aria-label','Remove track '+(i+1));remove.title=draft?.tracks.length<=1?'Keep at least one track':'Remove '+instrument(t)+' '+(i+1);remove.disabled=!draft||draft.tracks.length<=1;remove.innerHTML='<img class="control-icon" src="icons/remix/delete-bin-line.svg" alt="" aria-hidden="true">';remove.onclick=e=>{e.stopPropagation();editStructure(()=>{removeTrack(draft,i);muted.splice(i,1);solo.splice(i,1);gains.splice(i,1);bankChoices.splice(i,1);if(selected>i)selected--;else if(selected===i)selected=Math.min(i,draft.tracks.length-1);});};el.querySelector('.track-top').append(remove);const label=document.createElement('label');label.className='sound-label';label.textContent='SOUND';const selectBank=document.createElement('select');selectBank.className='sound-select';selectBank.setAttribute('aria-label','Sound for track '+(i+1));const original=document.createElement('option');original.value='';original.textContent='From file · '+(BANKS[defaultBank(t)]?.label||'Basic synth');selectBank.append(original);for(const [name,bank] of Object.entries(BANKS)){if(Boolean(bank.drums)!==t.drums)continue;const option=document.createElement('option');option.value=name;option.textContent=bank.label;selectBank.append(option);}selectBank.value=bankChoices[i]||'';selectBank.onclick=e=>e.stopPropagation();selectBank.onkeydown=e=>e.stopPropagation();selectBank.onchange=()=>{const resume=playing;position=current();playing=false;playRequest++;loading=false;silence();bankChoices[i]=selectBank.value||null;if(draft){draft.tracks[i].program=BANKS[bankChoices[i]]?.program??draft.tracks[i].program;song.tracks[i].program=draft.tracks[i].program;persistDraft();}renderTracks();renderScore();$('play').textContent='▶ Play';$('play').setAttribute('aria-label','Play');if(resume)start();};label.append(selectBank);el.append(label);el.querySelector('input').onclick=e=>e.stopPropagation();el.querySelector('input').oninput=e=>gains[i]=+e.target.value;$('tracks').append(el);});}
function renderScore(refreshEditor=true){
  const grid=$('note-grid'),score=$('score');
  grid.hidden=!draft;$('editor').hidden=!draft;$('save-tbt').hidden=!draft;
  if(draft&&refreshEditor)renderEditor();
  grid.remove();if(!draft)score.after(grid);
  const selectedTrack=song.tracks[selected],zoom=+$('zoom').value/100;
  $('part').textContent=unified?'All tracks':instrument(selectedTrack)+' '+(selected+1);
  $('tuning').textContent=unified?song.tracks.length+' tracks · bars aligned':selectedTrack.drums?'PERCUSSION':selectedTrack.pitches.map(noteName).join(' · ');
  $('view-single').setAttribute('aria-pressed',String(!unified));
  $('view-all').setAttribute('aria-pressed',String(unified));
  score.classList.toggle('unified',unified);score.replaceChildren();
  const visibleTracks=unified?song.tracks:[selectedTrack];
  const widths=song.bars.map(bar=>Math.max(200,...visibleTracks.map(t=>{
    const slots=new Set([0,...t.notes.filter(n=>n.start>=bar.start&&n.start<bar.start+bar.length).map(n=>n.start-bar.start)]);
    return slots.size*32+40;
  })));
  if(unified&&draft)widths[editMeasure]=Math.max(widths[editMeasure],220,grid.querySelectorAll('tr:first-of-type th').length*32);
  visibleTracks.forEach(t=>{
    const trackIndex=song.tracks.indexOf(t),system=document.createElement('div');system.className='system';
    if(unified){
      const row=document.createElement('section');row.className='score-track'+(trackIndex===selected?' selected':'');
      row.setAttribute('aria-label',instrument(t)+' '+(trackIndex+1));
      const label=document.createElement('button');label.className='score-track-label';
      label.textContent=instrument(t)+' '+(trackIndex+1);label.setAttribute('aria-pressed',String(trackIndex===selected));
      label.onclick=()=>{selected=trackIndex;renderTracks();renderScore();update();};
      row.append(label,system);score.append(row);
    }else score.append(system);
    song.bars.forEach((bar,i)=>{
      const m=document.createElement('div');m.className='measure';m.dataset.bar=i;m.dataset.track=trackIndex;
      const w=widths[i],height=t.strings*21+42;m.style.width=w*zoom+'px';
      let svg=`<svg viewBox="0 0 ${w} ${height}" role="img" aria-label="Measure ${i+1}"><text x="0" y="14" class="num">${String(i+1).padStart(2,'0')}${bar.flags&2?'  𝄆':''}${bar.flags&4?'  repeat ×'+bar.repeats:''}</text>`;for(let j=0;j<t.strings;j++){let y=36+(t.strings-1-j)*21;svg+=`<line x1="20" x2="${w}" y1="${y}" y2="${y}" stroke="#cbd0c5"/><text x="0" y="${y+4}" font-size="10">${t.drums?'':noteName(t.pitches[j])}</text>`;}for(const n of t.notes.filter(n=>n.start>=bar.start&&n.start<bar.start+bar.length)){const x=30+(n.start-bar.start)/bar.length*(w-40),y=36+(t.strings-1-n.string)*21;svg+=`<text class="fret" x="${x}" y="${y+4}" text-anchor="middle">${n.fret}</text>`;if(n.effect)svg+=`<text x="${x+6}" y="${y-6}" font-size="8">${n.effect.replaceAll('&','&amp;').replaceAll('<','&lt;')}</text>`;}svg+=`<line class="cursor" x1="30" x2="30" y1="24" y2="${height-12}" visibility="hidden"/></svg>`;
      const labels=tempoChanges(song).filter(c=>c.start>=bar.start&&c.start<bar.start+bar.length);
      for(const c of labels)svg=svg.replace('</svg>',`<text x="${30+(c.start-bar.start)/bar.length*(w-40)}" y="25" font-size="9">♩=${c.value}</text></svg>`);
      m.innerHTML=svg;
      m.querySelector('svg').setAttribute('aria-label',instrument(t)+' '+(trackIndex+1)+', measure '+(i+1));
      m.onclick=e=>{
        if(e.target.closest('input,button,select'))return;
        if(draft&&(editMeasure!==i||selected!==trackIndex)){selected=trackIndex;editMeasure=i;renderTracks();renderScore();}
        seek(sequence.find(x=>x.i===i).start);
      };
      system.append(m);
      if(draft&&trackIndex===selected&&i===editMeasure){
        m.classList.add('editing');
        if(!unified)m.style.width=Math.max(220,grid.querySelectorAll('tr:first-of-type th').length*32)*zoom+'px';
        m.querySelector('svg').classList.add('editing-score');m.append(grid);
      }
    });
  });
}
function setView(all){unified=all;renderScore();update();}
$('view-single').onclick=()=>setView(false);
$('view-all').onclick=()=>setView(true);
function current(){return playing?Math.min(end,timeline.position(timeline.seconds(origin)+ctx.currentTime-scheduledAt)):position;}let scheduledAt=0;
function silence(){soundbankPlayer?.stop();for(const v of voices){try{v.stop();}catch{}}voices=[];if(midiOut){midiOut.clear();for(let ch=0;ch<16;ch++)midiOut.send([0xb0|ch,123,0]);}}
function stop(){playRequest++;loading=false;playing=false;position=0;silence();$('play').textContent='▶ Play';$('play').setAttribute('aria-label','Play');if(song)update();}
function seek(p){const was=playing;playRequest++;loading=false;playing=false;silence();position=+p;scheduled=position;if(was)start();update();}
async function start(){
  if(!song||loading)return;
  const request=++playRequest;
  try{
    ctx ||= new AudioContext();await ctx.resume();
    if(request!==playRequest)return;
    if($('output').value==='soundbank'){
      loading=true;$('play').textContent='Loading…';
      $('bank-status').textContent='Loading instrument samples…';
      soundbankPlayer ||= new SoundbankPlayer(ctx);
      await soundbankPlayer.prepare(song.tracks,bankChoices);
      if(request!==playRequest)return;
      $('bank-status').textContent='FluidR3 · samples ready';
    }
    loading=false;$('error').hidden=true;
    if(position>=end)position=0;
    origin=position;scheduled=position;scheduledAt=ctx.currentTime;playing=true;
    $('play').textContent='Ⅱ Pause';$('play').setAttribute('aria-label','Pause');
    if(midiOut)song.tracks.forEach(t=>{const ch=t.drums?9:t.index+(t.index>=9?1:0);midiOut.send([0xc0|ch,BANKS[bankChoices[t.index]]?.program??t.program]);});
  }catch(e){if(request!==playRequest)return;loading=false;playing=false;$('play').textContent='▶ Play';$('play').setAttribute('aria-label','Play');$('bank-status').textContent='Samples unavailable';error(e);}
}
function toggle(){if(loading){playRequest++;loading=false;$('play').textContent='▶ Play';$('play').setAttribute('aria-label','Play');$('bank-status').textContent='Loading cancelled';return;}if(playing){position=current();playing=false;silence();$('play').textContent='▶ Play';$('play').setAttribute('aria-label','Play');}else start();}
function playNote(n,t,when,duration){const i=t.index;if(muted[i]||(solo.some(Boolean)&&!solo[i])||n.fret==='*')return;const gain=gains[i]*.14;if(midiOut){let ch=t.drums?9:i+(i>=9?1:0),stamp=performance.now()+Math.max(0,when-ctx.currentTime)*1000;let pitch=Math.max(0,Math.min(127,n.pitch));midiOut.send([0x90|ch,pitch,Math.round(gains[i]*100)],stamp);midiOut.send([0x80|ch,pitch,0],stamp+duration*1000);return;}if($('output').value==='soundbank'&&soundbankPlayer?.play(bankChoices[i]||defaultBank(t),n.pitch,when,duration,gains[i],(t.pan-64)/64,Boolean(n.muted),i))return;const amp=ctx.createGain();amp.connect(ctx.destination);let source;if(t.drums){const length=Math.min(duration,.16),buf=ctx.createBuffer(1,Math.max(1,Math.ceil(ctx.sampleRate*length)),ctx.sampleRate),a=buf.getChannelData(0);for(let k=0;k<a.length;k++)a[k]=(Math.random()*2-1)*Math.exp(-k/a.length*6);source=ctx.createBufferSource();source.buffer=buf;const filter=ctx.createBiquadFilter();filter.type=n.pitch<42?'lowpass':'highpass';filter.frequency.value=n.pitch<42?180:6000;source.connect(filter);filter.connect(amp);duration=length;}else{source=ctx.createOscillator();source.type=t.program>=32&&t.program<=39?'triangle':'triangle';source.frequency.value=440*2**((n.pitch-69)/12);source.connect(amp);}duration=Math.max(.02,duration);amp.gain.setValueAtTime(0,when);amp.gain.linearRampToValueAtTime(gain,when+.004);amp.gain.exponentialRampToValueAtTime(Math.max(.0001,gain*.15),when+duration*.8);amp.gain.linearRampToValueAtTime(0,when+duration);source.start(when);source.stop(when+duration+.01);voices.push(source);source.onended=()=>{source.disconnect();amp.disconnect();voices=voices.filter(v=>v!==source);};}
function tick(){if(!playing)return;position=current();if(position>=end){if($('loop').getAttribute('aria-pressed')==='true'){seek(0);}else{playing=false;silence();$('play').textContent='▶ Play';$('play').setAttribute('aria-label','Play');}update();return;}const until=Math.min(end,timeline.position(timeline.seconds(position)+.12));for(const part of sequence){if(part.start+part.bar.length<scheduled||part.start>until)continue;for(const t of song.tracks)for(const n of t.notes){if(n.start<part.bar.start||n.start>=part.bar.start+part.bar.length)continue;const p=part.start+n.start-part.bar.start;if(p>=scheduled&&p<until){const when=Math.max(ctx.currentTime,scheduledAt+timeline.seconds(p)-timeline.seconds(origin));playNote(n,t,when,n.muted?.015625:timeline.seconds(Math.min(end,p+n.duration))-timeline.seconds(p));}}}scheduled=until;update();}
let lastBar=-1;function update(){if(!song)return;$('seek').value=position;$('clock').textContent=time(timeline.seconds(position));$('duration').textContent=time(timeline.seconds(end));const part=sequence.find(x=>position>=x.start&&position<x.start+x.bar.length)||sequence.at(-1);document.querySelectorAll('.measure').forEach(el=>{const active=+el.dataset.bar===part.i;el.classList.toggle('active',active);const line=el.querySelector('.cursor');line.setAttribute('visibility',active?'visible':'hidden');if(active){let w=el.querySelector('svg').viewBox.baseVal.width,x=30+(position-part.start)/part.bar.length*(w-40);line.setAttribute('x1',x);line.setAttribute('x2',x);if(playing&&lastBar!==part.i){if(unified){if(+el.dataset.track===0){const score=$('score'),left=el.offsetLeft;if(left<score.scrollLeft||left+el.offsetWidth>score.scrollLeft+score.clientWidth)score.scrollTo({left,behavior:'smooth'});}}else el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});}}});lastBar=part.i;}
$('file').onchange=async e=>{const f=e.target.files[0];if(f)await load(await f.arrayBuffer(),f.name);e.target.value='';};$('sample').onclick=async()=>{try{const s=await loadExample();draft=fromSong(s);$('edit-resolution').value='4';editMeasure=0;setup(toSong(draft));history.reset();persistDraft();$('export').disabled=false;}catch(e){error(e);}};$('play').onclick=toggle;$('stop').onclick=stop;$('seek').oninput=e=>seek(+e.target.value);$('tempo').onchange=()=>{let v=+$('tempo').value;$('tempo').value=Math.max(30,Math.min(500,v||song.tempo));if(draft){draft.tempo=+$('tempo').value;song.tempo=draft.tempo;persistDraft();}timeline=tempoTimeline(song,sequence);seek(position);};$('loop').onclick=()=>{const b=$('loop');b.setAttribute('aria-pressed',b.getAttribute('aria-pressed')!=='true');};$('export').onclick=async()=>{try{const bytes=midi(draft?await parse(await draftBytes(),song.filename):song);const url=URL.createObjectURL(new Blob([bytes],{type:'audio/midi'})),a=document.createElement('a');a.href=url;a.download=song.filename.replace(/\.tbt$/i,'')+'.mid';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){error(e);}};
$('output').onchange=async e=>{const resume=playing;position=current();playing=false;playRequest++;loading=false;silence();$('play').textContent='▶ Play';$('play').setAttribute('aria-label','Play');if(e.target.value==='connect'){try{if(!navigator.requestMIDIAccess)throw Error('Web MIDI requires a compatible browser such as Chrome. Built-in playback is available.');const access=await navigator.requestMIDIAccess();outputs=[...access.outputs.values()];for(const output of outputs){const o=document.createElement('option');o.value=output.id;o.textContent=output.name;$('output').append(o);}if(!outputs.length)throw Error('No MIDI output devices found.');$('output').value=outputs[0].id;midiOut=outputs[0];}catch(e){midiOut=null;$('output').value='synth';error(e);}}else midiOut=outputs.find(o=>o.id===e.target.value)||null;if(resume)start();};
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['INPUT','SELECT','BUTTON'].includes(e.target.tagName)){e.preventDefault();toggle();}});document.addEventListener('dragover',e=>{e.preventDefault();document.body.classList.add('drag');});document.addEventListener('dragleave',()=>document.body.classList.remove('drag'));document.addEventListener('drop',async e=>{e.preventDefault();document.body.classList.remove('drag');const f=e.dataTransfer.files[0];if(f){$('export').disabled=false;await load(await f.arrayBuffer(),f.name);}});setInterval(tick,25);

const DRAFT_KEY='tabit-draft-v1';
function historyState(){return {draft,selected,editMeasure,resolution:$('edit-resolution').value,muted,solo,gains,bankChoices};}
function updateHistory(){ $('undo').disabled=!history.canUndo;$('redo').disabled=!history.canRedo; }
function restoreHistory(direction){
  if(!draft)return;
  history.context(historyState());
  const state=history[direction]();if(!state)return;
  stop();
  ({draft,selected,editMeasure,muted,solo,gains,bankChoices}=state);
  $('edit-resolution').value=state.resolution;
  restoringHistory=true;
  try{rebuildDraft();update();}finally{restoringHistory=false;updateHistory();}
}
$('undo').onclick=()=>restoreHistory('undo');
$('redo').onclick=()=>restoreHistory('redo');
// Capture navigation and mixer settings before an edit changes the document.
for(const event of ['beforeinput','change','click'])document.addEventListener(event,()=>{
  if(draft)history.context(historyState());
},true);
document.addEventListener('keydown',e=>{
  if(!draft||e.isComposing||e.altKey||!(e.metaKey||e.ctrlKey)||$('new-dialog').open)return;
  const key=e.key.toLowerCase();
  const direction=key==='z'?(e.shiftKey?'redo':'undo'):key==='y'&&!e.shiftKey?'redo':null;
  if(!direction)return;
  const target=e.target;
  if(target.isContentEditable||target.closest('textarea')||
    (target.matches('input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit])')&&!target.closest('#note-grid')&&target.id!=='tempo'))return;
  e.preventDefault();restoreHistory(direction);
},true); // Run before controls that stop keyboard events from bubbling.
function persistDraft(){
  if(!draft)return;
  if(!restoringHistory)history.record(historyState());
  updateHistory();
  try{localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));$('draft-status').textContent='Draft saved in this browser · download .tbt to keep a file.';}
  catch{$('draft-status').textContent='Browser storage unavailable. Download .tbt to keep your work.';}
}
function rebuildDraft(){
  const chosen=selected,oldMuted=muted,oldSolo=solo,oldGains=gains,oldBanks=bankChoices;
  setup(toSong(draft));selected=Math.min(chosen,draft.tracks.length-1);
  muted=muted.map((v,i)=>oldMuted[i]??v);solo=solo.map((v,i)=>oldSolo[i]??v);gains=gains.map((v,i)=>oldGains[i]??v);
  bankChoices=bankChoices.map((v,i)=>oldBanks[i]??v);
  renderTracks();renderScore();persistDraft();
}
function renderEditor(){
  const track=draft.tracks[selected];
  editMeasure=Math.min(editMeasure,draft.measures-1);
  $('edit-measure').replaceChildren(...Array.from({length:draft.measures},(_,i)=>{const o=document.createElement('option');o.value=i;o.textContent=i+1;return o;}));
  $('edit-measure').value=editMeasure;
  $('edit-tuning').disabled=track.drums;
  const base=track.kind==='bass'?[28,33,38,43]:[40,45,50,55,59,64];
  const standard=track.pitches.every((pitch,i)=>pitch===base[i]);
  const dropD=track.pitches.every((pitch,i)=>pitch===base[i]-(i===0?2:0));
  $('edit-tuning').value=standard?'standard':dropD?'drop-d':'custom';
  $('add-track').disabled=draft.tracks.length>=15;
  $('add-measure').disabled=$('insert-measure').disabled=draft.measures>=256;
  $('remove-measure').disabled=draft.measures<=1;
  $('edit-help').textContent=track.drums&&!draft.source?'Click a string line to add or remove a drum hit in the selected measure.':track.drums?'Enter MIDI drum notes 0–127 · * = stop · blank = let ring.':'Enter frets 0–99 · x = muted · * = stop · blank = let ring. Edit the selected measure directly; use Grid for finer notes.';
  const bar=measureGrid(draft,editMeasure);
  const resolution=$('edit-resolution').value.split('/').map(Number),spacing=resolution[0]/(resolution[1]||1);const columns=gridColumns(draft,editMeasure,track,spacing);
  const table=document.createElement('table');const caption=document.createElement('caption');caption.textContent='Measure '+(editMeasure+1);table.append(caption);const head=document.createElement('tr');head.append(document.createElement('th'));
  for(const {time} of columns){const col=time-bar.start,th=document.createElement('th');th.textContent=Math.abs(col/4-Math.round(col/4))<1e-8?Math.round(col/4)+1:resolution.length>1?'³':Number.isInteger(col)?['','e','&','a'][col%4]:'·';head.append(th);}table.append(head);
  const tempoRow=document.createElement('tr'),tempoLabel=document.createElement('th');tempoLabel.textContent='BPM';tempoRow.append(tempoLabel);
  for(const {step,time} of columns){
    const td=document.createElement('td'),input=document.createElement('input');
    const changes=tempoChanges(song).filter(c=>Math.abs(c.start-time)<1e-8);
    input.type='number';input.min='30';input.max='500';input.step='1';input.value=changes.at(-1)?.value??'';
    input.placeholder='·';input.setAttribute('aria-label',`Tempo at measure ${editMeasure+1}, beat ${1+(time-bar.start)/4}`);
    input.title='Song tempo change (30–500 BPM). Clear to remove.';
    input.onchange=()=>{try{
      const value=input.value===''?null:Number(input.value);
      if(value!==null&&(!Number.isInteger(value)||value<30||value>500))throw Error('Tempo change must be an integer from 30 to 500.');
      stop();
      for(const t of draft.tracks)t.changes=(t.changes??[]).filter(c=>c.effect!==3||Math.abs(c.start-time)>1e-8);
      if(value!==null)(track.changes??=[]).push({space:step,start:time,effect:3,value});
      song=toSong(draft);timeline=tempoTimeline(song,sequence);renderScore();update();persistDraft();$('error').hidden=true;
    }catch(e){error(e);}};
    td.append(input);tempoRow.append(td);
  }
  table.append(tempoRow);
  const order=track.drums?track.pitches.map((_,i)=>i):track.pitches.map((_,i)=>i).reverse();
  for(const string of order){
    const tr=document.createElement('tr'),label=document.createElement('th');label.textContent=track.drums?(draft.source?'Drum row '+(string+1):DRUMS[string].label):noteName(track.pitches[string]);tr.append(label);
    for(const [columnIndex,{step,time}] of columns.entries()){
      const col=time-bar.start,td=document.createElement('td');if(col%4===0)td.className='beat-start';
      const drumButtons=track.drums&&!draft.source;
      const control=document.createElement(drumButtons?'button':'input');
      control.disabled=step>=track.grid[string].length;
      const name=(track.drums?(draft.source?'Drum row '+(string+1):DRUMS[string].label):'String '+(string+1))+' column '+(columnIndex+1);
      control.setAttribute('aria-label',name);
      if(drumButtons){control.type='button';control.textContent=track.grid[string][step]===null?'·':'●';control.setAttribute('aria-pressed',track.grid[string][step]!==null);control.onclick=()=>{stop();track.grid[string][step]=track.grid[string][step]===null?DRUMS[string].pitch:null;song=toSong(draft);renderScore();persistDraft();};}
      else{
        control.placeholder=' ';control.value=track.grid[string][step]??'';control.maxLength=track.drums?3:2;control.autocomplete='off';control.spellcheck=false;
        control.onchange=()=>{try{const value=parseFret(control.value,track.drums?127:99);stop();track.grid[string][step]=value;control.value=value??'';song=toSong(draft);persistDraft();$('error').hidden=true;}catch(e){error(e);control.value=track.grid[string][step]??'';}};
        control.oninput=control.onchange;
        control.onkeydown=e=>{const delta={ArrowRight:1,ArrowLeft:-1,ArrowDown:columns.length,ArrowUp:-columns.length,Enter:1}[e.key];if(delta){e.preventDefault();control.blur();const inputs=[...table.querySelectorAll('input:not([type=number])')],next=inputs.indexOf(control)+delta;inputs[next]?.focus();inputs[next]?.select();}};
      }
      td.append(control);tr.append(td);
    }
    table.append(tr);
  }
  $('note-grid').replaceChildren(table);
}
$('new-tab').onclick=()=>{try{$('restore-draft').hidden=!localStorage.getItem(DRAFT_KEY);}catch{$('restore-draft').hidden=true;}$('new-dialog').showModal();};
$('cancel-new').onclick=()=>$('new-dialog').close();
$('new-form').onsubmit=e=>{e.preventDefault();$('edit-resolution').value='4';draft=newDraft($('new-title').value,+$('new-tempo').value,+$('new-measures').value,$('new-template').value==='band');editMeasure=0;selected=0;setup(toSong(draft));history.reset();persistDraft();$('new-dialog').close();};
$('restore-draft').onclick=async()=>{try{const restored=JSON.parse(localStorage.getItem(DRAFT_KEY));await createTbt(restored);draft=restored;$('edit-resolution').value='4';editMeasure=0;selected=0;setup(toSong(draft));history.reset();$('new-dialog').close();persistDraft();}catch(e){error(e);$('new-dialog').close();}};
$('edit-measure').onchange=()=>{editMeasure=+$('edit-measure').value;renderScore();update();};
$('edit-resolution').onchange=()=>{try{if($('edit-resolution').value.includes('/')){enableTriplets(draft);song=toSong(draft);persistDraft();}renderScore();update();}catch(e){error(e);$('edit-resolution').value='4';}};
function editStructure(action){try{action();rebuildDraft();}catch(e){error(e);}}
$('add-measure').onclick=()=>editStructure(()=>{changeMeasure(draft,draft.measures);editMeasure=draft.measures-1;});
$('insert-measure').onclick=()=>editStructure(()=>{changeMeasure(draft,editMeasure+1);editMeasure++;});
$('remove-measure').onclick=()=>editStructure(()=>{changeMeasure(draft,editMeasure,true);editMeasure=Math.min(editMeasure,draft.measures-1);});
$('add-track').onclick=()=>editStructure(()=>{addTrack(draft,$('add-kind').value);selected=draft.tracks.length-1;});
$('edit-tuning').onchange=()=>{const t=draft.tracks[selected],base=t.kind==='bass'?28:40;t.pitches[0]=base-($('edit-tuning').value==='drop-d'?2:0);rebuildDraft();};
async function draftBytes(){return createTbt(draft);}
$('save-tbt').onclick=async()=>{try{const bytes=await draftBytes(),url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download=(draft.title.replace(/[\\/:*?"<>|]/g,'_')||'Untitled')+'.tbt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('draft-status').textContent='Downloaded .tbt · your draft is also kept in this browser.';}catch(e){error(e);}};

function setZoom(value){
  const zoom=Math.max(40,Math.min(200,Math.round(value/5)*5));
  $('zoom').value=zoom;
  $('zoom-value').value=zoom+'%';
  $('score').style.setProperty('--measure-width',360*zoom/100+'px');
  $('score').style.setProperty('--system-gap',26*zoom/100+'px');
  $('zoom-out').disabled=zoom===40;
  $('zoom-in').disabled=zoom===200;if(song){renderScore();update();}
}
$('toggle-band').onclick=()=>{
  const minimized=$('workspace').classList.toggle('band-minimized');
  $('toggle-band').setAttribute('aria-expanded',String(!minimized));
  $('toggle-band').setAttribute('aria-label',minimized?'Expand band':'Minimize band');
  $('toggle-band').title=minimized?'Expand band':'Minimize band';
};
$('focus-score').onclick=()=>{
  const focused=document.body.classList.toggle('score-focused');
  $('focus-score').setAttribute('aria-pressed',String(focused));
  $('focus-score').setAttribute('aria-label',focused?'Expand top controls':'Minimize top controls');
  $('focus-score').title=focused?'Expand top controls':'Minimize top controls';
};
$('zoom').oninput=e=>setZoom(+e.target.value);
$('zoom-out').onclick=()=>setZoom(+$('zoom').value-10);
$('zoom-in').onclick=()=>setZoom(+$('zoom').value+10);
$('zoom-reset').onclick=()=>setZoom(100);
$('score').addEventListener('wheel',e=>{
  if(!e.ctrlKey&&!e.metaKey)return;
  e.preventDefault();
  setZoom(+$('zoom').value+(e.deltaY<0?5:-5));
},{passive:false});
document.querySelectorAll('.icon-select select').forEach(select=>{
  const updateTitle=()=>{select.parentElement.title=select.getAttribute('aria-label')+': '+(select.selectedOptions[0]?.textContent||'');};
  select.addEventListener('change',updateTitle);
  new MutationObserver(updateTitle).observe(select,{childList:true});
  updateTitle();
});
setZoom(75);

}
