import { Reader, concat, number, stringBytes, compress, crc32 } from './binary.mjs';
const standard = [40,45,50,55,59,64,69,74];
const signed = x => x > 127 ? x - 256 : x;
export async function parse(input, filename = 'Untitled.tbt', editable = false) {
  const data = new Uint8Array(input);
  if (data.length > 5_000_000) throw Error('Choose a .tbt file smaller than 5 MB');
  if (data.length < 64 || String.fromCharCode(...data.subarray(0,3)) !== 'TBT') throw Error('This is not a .tbt file');
  const v = data[3], n = data[5], header = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (![0x6f,0x70,0x71,0x72].includes(v)) throw Error('Supported .tbt file versions: 1.6–2.0 (0x6f–0x72). Please use a file saved in a supported version.');
  if (n < 1 || n > 15) throw Error('Invalid track count');
  const size = header.getUint32(48,true);
  const m = new Reader(await compress(data.subarray(64,64+size),true));
  const b = new Reader(await compress(data.subarray(64+size),true));
  const spaces = Array.from({length:n}, () => v >= 0x70 ? m.num(4) : header.getUint16(42,true));
  if (spaces.some(s => s < 1 || s > 32000)) throw Error('Invalid track length');
  const names = ['strings','program','mutedProgram','volume',...(v>=0x71?['modulation','pitchBend']:[]),'transpose','bank','reverb','chorus','pan','highest','midiNumbers','channel','top','bottom'];
  const fieldOffset=m.pos;
  const fields = Object.fromEntries(names.map(name => [name, spaces.map(() => m.num(name==='pitchBend'?2:1))]));
  const tuningOffset=m.pos;
  const tuning = spaces.map(() => Array.from({length:8}, () => signed(m.num())));
  const drums = spaces.map(() => m.num());
  const info = Object.fromEntries(['title','artist','album','transcriber','comment'].map(key => [key,m.string()]));
  const bars = [];
  if (v >= 0x70) {
    let start = 0;
    for (let i=0; i<header.getUint16(40,true); i++) {
      const length=b.num(4), flags=b.num(), repeats=b.num();
      bars.push({start,length,flags,repeats}); start+=length;
    }
  } else {
    const raw=b.runs(spaces[0]); let start=0, flags=0;
    raw.forEach((x,i) => {
      const kind=x&15;
      if (kind===3) { if(i>start)bars.push({start,length:i-start,flags,repeats:0}); start=i; flags=2; }
      else if ([1,2,4].includes(kind)) { bars.push({start,length:i+1-start,flags:flags|(kind===2?4:0),repeats:x>>4}); start=i+1; flags=0; }
    });
    if(start<raw.length)bars.push({start,length:raw.length-start,flags,repeats:0});
  }
  if(!bars.length)bars.push({start:0,length:spaces[0],flags:0,repeats:0});
  const notesOffset=b.pos;
  const rawnotes=spaces.map(s=>b.runs(s*20));
  const notesEnd=b.pos;
  const timing=spaces.map(s=>data[11]&16?b.runs(s*2):new Uint8Array(s*2).fill(1));
  const changes=spaces.map(()=>[]);
  if(v>=0x71)for(const set of changes){
    const c=new Reader(b.read(b.num(4))); let p=0;
    while(c.pos<c.data.length){p+=c.num(2);const effect=c.num(2);c.num(2);set.push({space:p,effect,value:c.num(2)});}
  }
  const warnings=new Set();
  const tracks=spaces.map((s,i)=>{
    const count=fields.strings[i]; if(count<1||count>8)throw Error('Invalid string count');
    const pitches=standard.map((p,j)=>p+tuning[i][j]+signed(fields.transpose[i]));
    const times=[0];let elapsed=0,correction=0;
    for(let p=0;p<s;p++){
      const [a,c]=timing[i].subarray(p*2,p*2+2),increment=(a&&c?a/c:1)-correction,next=elapsed+increment;
      correction=(next-elapsed)-increment;elapsed=next;
      times.push(Math.abs(elapsed-Math.round(elapsed))<1e-8?Math.round(elapsed):elapsed);
    }
    const notes=[];const active=new Map();
    for(let p=0;p<s;p++){
      const row=rawnotes[i].subarray(p*20,p*20+20);
      if(fields.program[i]&128&&row.subarray(0,count).some(Boolean)){for(const note of active.values())note.duration=times[p]-note.start;active.clear();}
      for(let j=0;j<count;j++){
        const x=row[j];if(!x)continue;
        if(active.has(j)){const prev=active.get(j);prev.duration=times[p]-prev.start;active.delete(j);}
        if(x>=128||x===17){
          const fret=x>=128?x-128:0;
          const note={space:p,start:times[p],duration:times.at(-1)-times[p],string:j,fret:x>=128?fret:'x',pitch:drums[i]?fret:pitches[j]+fret,effect:row[8+j]?String.fromCharCode(row[8+j]):''};
          if(x===17)note.muted=true;notes.push(note);active.set(j,note);
        }else if(x===18)notes.push({space:p,start:times[p],duration:0,string:j,fret:'*',pitch:0,effect:''});
      }
      if(row[16]&&v<=0x70){const effect={84:3,116:3,73:4,86:5,80:6,67:7,82:8}[row[16]];if(effect)changes[i].push({space:p,effect,value:row[19]+(row[16]===116?250:0)});}
    }
    for(const c of changes[i])c.start=times[Math.min(c.space,s)];
    if(notes.some(x=>x.effect))warnings.add('String articulations are shown; playback uses the underlying fretted notes.');
    if(changes[i].some(c=>[1,2,9,10].includes(c.effect)))warnings.add('Stroke, modulation and pitch-bend changes are not yet synthesized.');
    return {...(editable?{times,cutAll:Boolean(fields.program[i]&128)}:{}),index:i,name:(drums[i]?'Drums':'Guitar')+' '+(i+1),strings:count,pitches:pitches.slice(0,count),program:fields.program[i]&127,volume:fields.volume[i],pan:fields.pan[i],drums:Boolean(drums[i]),notes,changes:changes[i],length:times.at(-1)};
  });
  return {...(editable?{encoding:{header:Array.from(data.subarray(0,64)),metadata:Array.from(m.data),prefix:Array.from(b.data.subarray(0,notesOffset)),suffix:Array.from(b.data.subarray(notesEnd)),rawnotes:rawnotes.map(r=>Array.from(r)),fieldOffset,tuningOffset,programOffset:fieldOffset+n,transposeOffset:fieldOffset+n*(v>=0x71?7:4)}}:{}),...info,filename,tempo:header.getUint16(46,true)||data[4],tracks,bars,length:Math.max(...tracks.map(t=>t.length)),warnings:[...warnings].sort()};
}
function integer(value,low,high,name){if(!Number.isInteger(value)||value<low||value>high)throw Error(`${name} must be an integer from ${low} to ${high}`);return value;}
function runs(raw){
  const chunks=[];let pairs=[];
  for(let i=0;i<raw.length;){let j=i+1;while(j<raw.length&&raw[j]===raw[i]&&j-i<255)j++;pairs.push(j-i,raw[i]);i=j;if(pairs.length===65534){chunks.push(concat(number(pairs.length/2,2),pairs));pairs=[];}}
  if(pairs.length)chunks.push(concat(number(pairs.length/2,2),pairs));return concat(...chunks);
}
function timingBytes(track) {
  const raw=new Uint8Array((track.times.length-1)*2);
  for(let i=0;i<track.times.length-1;i++){
    const duration=track.times[i+1]-track.times[i];let denominator=1;
    while(denominator<=255&&Math.abs(duration*denominator-Math.round(duration*denominator))>1e-7)denominator++;
    const numerator=Math.round(duration*denominator);
    if(denominator>255||numerator<1||numerator>255)throw Error('This file’s timing cannot be subdivided into triplets.');
    raw.set([numerator,denominator],i*2);
  }
  return runs(raw);
}
async function createImportedTbt(draft){
  const {encoding,tracks}=draft;
  const header=Uint8Array.from(encoding.header);let meta=Uint8Array.from(encoding.metadata);
  let prefix=encoding.prefix,suffix=encoding.suffix,shift=0;
  if(draft.gridScale===3){
    const reader=new Reader(Uint8Array.from(suffix));
    if(header[11]&16)for(const rows of encoding.rawnotes)reader.runs(rows.length/10);
    const changes=[];
    if(header[3]>=0x71)for(const track of tracks){
      const block=new Reader(reader.read(reader.num(4))),records=[];
      while(block.pos<block.data.length){const delta=block.num(2);records.push(number(delta*3,2),block.read(6));}
      const bytes=concat(...records);changes.push(number(bytes.length,4),bytes);
    }
    suffix=concat(...tracks.map(timingBytes),...changes,reader.read(reader.data.length-reader.pos));
    if(header[3]===0x6f){
      shift=tracks.length*4;meta=concat(...tracks.map(t=>number(t.grid[0].length,4)),meta);
      header[3]=0x70;
      prefix=concat(...draft.source.bars.map(bar=>concat(number(bar.length,4),[bar.flags,bar.repeats])));
      header.set(number(draft.source.bars.length,2),40);
    }else tracks.forEach((track,i)=>meta.set(number(track.grid[0].length,4),i*4));
    header[11]|=16;
  }
  const tempo=integer(draft.tempo,30,500,'Tempo');
  if(tracks.length!==header[5])throw Error('Imported track count changed');
  const raw=tracks.map((track,i)=>{
    const original=Uint8Array.from(encoding.rawnotes[i]),factor=draft.gridScale===3?3:1;
    const rows=new Uint8Array(original.length*factor),spaces=rows.length/20;
    for(let step=0;step<original.length/20;step++)rows.set(original.subarray(step*20,step*20+20),step*factor*20);
    if(track.grid.length!==track.pitches.length)throw Error('Invalid note grid');
    track.grid.forEach((row,string)=>{
      if(row.length!==spaces)throw Error('Invalid imported track length');
      row.forEach((fret,step)=>{
        const offset=step*20+string;
        rows[offset]=fret===null?0:fret==='x'?17:fret==='*'?18:128+integer(fret,0,127,'Fret / drum note');
        if(fret===null||fret==='*')rows[step*20+8+string]=0;
      });
    });
    meta[encoding.programOffset+shift+i]=(meta[encoding.programOffset+shift+i]&128)|integer(track.program,0,127,'Instrument');
    // Store the effective tuning, folding the original transpose into each string.
    meta[encoding.transposeOffset+shift+i]=0;
    track.pitches.forEach((pitch,j)=>{meta[encoding.tuningOffset+shift+i*8+j]=(integer(pitch,0,127,'Open string pitch')-standard[j])&255;});
    return runs(rows);
  });
  const metadata=await compress(meta),body=concat(prefix,...raw,suffix);
  const payload=concat(metadata,await compress(body));
  header[4]=Math.min(255,tempo);header.set(number(tempo,2),46);
  header.set(number(metadata.length,4),48);header.set(number(crc32(payload),4),52);
  header.set(number(64+payload.length,4),56);header.set(number(crc32(header.subarray(0,60)),4),60);
  return concat(header,payload);
}
export async function createTbt(draft){
  if(draft?.encoding)return createImportedTbt(draft);
  if(!draft||typeof draft!=='object'||Array.isArray(draft))throw Error('Expected a score object');
  const tempo=integer(draft.tempo,30,500,'Tempo'), measures=integer(draft.measures,1,256,'Measure count'), spaces=measures*16*(draft.gridScale===3?3:1);
  if(!Array.isArray(draft.tracks)||draft.tracks.length<1||draft.tracks.length>15)throw Error('A score needs 1–15 tracks');
  const tracks=draft.tracks.map(t=>{
    if(!t||!Array.isArray(t.pitches)||t.pitches.length<1||t.pitches.length>8)throw Error('A track needs 1–8 strings');
    t.pitches.forEach(p=>integer(p,0,127,'Open string pitch'));integer(t.program,0,127,'Instrument');
    if(!Array.isArray(t.grid)||t.grid.length!==t.pitches.length)throw Error('Invalid note grid');
    const raw=new Uint8Array(spaces*20);
    t.grid.forEach((row,string)=>{
      if(!Array.isArray(row)||row.length!==spaces)throw Error('Invalid measure length');
      row.forEach((fret,step)=>{if(fret!==null)raw[step*20+string]=fret==='x'?17:fret==='*'?18:128+integer(fret,0,99,'Fret / drum note');});
    });return {...t,raw};
  });
  const n=tracks.length, repeat=value=>Array(n).fill(value);
  const fields=[tracks.map(t=>t.pitches.length),tracks.map(t=>t.program),repeat(28),repeat(96),repeat(0),repeat(0),repeat(0),repeat(0),repeat(64),repeat(99),tracks.map(t=>+Boolean(t.drums)),tracks.map(t=>t.drums?9:255),repeat(0),repeat(0)];
  const meta=concat(...tracks.map(()=>number(spaces,4)),...fields,...tracks.map(t=>standard.map((p,j)=>((t.pitches[j]??p)-p)&255)),tracks.map(t=>+Boolean(t.drums)),...['title','artist','album','transcriber','comment'].map(k=>stringBytes(draft[k]??'')));
  const body=concat(...Array.from({length:measures},()=>Uint8Array.of(16,0,0,0,0,0)),...tracks.map(t=>runs(t.raw)),...(draft.gridScale===3?tracks.map(timingBytes):[]));
  const metadata=await compress(meta), payload=concat(metadata,await compress(body)),header=new Uint8Array(64);
  header.set([84,66,84,112,Math.min(255,tempo),n,3,50,46,48]);header[11]=11|(draft.gridScale===3?16:0);
  header.set(number(measures,2),40);header.set(number(tempo,2),46);
  header.set(number(metadata.length,4),48);header.set(number(crc32(payload),4),52);header.set(number(64+payload.length,4),56);header.set(number(crc32(header.subarray(0,60)),4),60);
  return concat(header,payload);
}
