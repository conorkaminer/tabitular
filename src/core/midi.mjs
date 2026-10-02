import { concat, number } from './binary.mjs';
// Match Python's round-to-even for existing export compatibility.
const round = n => n % 1 === .5 ? (Math.floor(n) % 2 ? Math.ceil(n) : Math.floor(n)) : Math.round(n);
function vlq(n){n=Math.max(0,round(n));const out=[n&127];while((n=Math.floor(n/128)))out.unshift((n&127)|128);return out;}
export function midi(song){
  const events=[],sequence=[];let repeatStart=0,offset=0;
  song.bars.forEach((bar,i)=>{
    if(bar.flags&2)repeatStart=i;sequence.push([bar,offset]);offset+=bar.length;
    if(bar.flags&4)for(let r=1;r<Math.min(255,bar.repeats);r++)for(const repeated of song.bars.slice(repeatStart,i+1)){sequence.push([repeated,offset]);offset+=repeated.length;}
  });
  if(!sequence.length)sequence.push([{start:0,length:song.length},0]);
  const tempo=value=>concat([255,81,3],number(round(60_000_000/value),3,false));
  events.push([0,tempo(song.tempo)]);
  const channels=Array.from({length:16},(_,i)=>i).filter(i=>i!==9);
  for(const t of song.tracks){
    const ch=t.drums?9:channels[t.index];
    events.push([0,[0xc0|ch,t.program]],[0,[0xb0|ch,7,Math.min(127,t.volume)]]);
    for(const [bar,at] of sequence){
      for(const note of t.notes){
        if(note.fret==='*'||note.start<bar.start||note.start>=bar.start+bar.length)continue;
        const start=at+note.start-bar.start,last=sequence.at(-1);
        let duration=Math.min(note.duration,last[1]+last[0].length-start);
        if(note.muted)duration=Math.min(duration,.14);
        const pitch=Math.max(0,Math.min(127,note.pitch));
        events.push([round(start*120),[0x90|ch,pitch,90]],[round((start+Math.max(.01,duration))*120),[0x80|ch,pitch,0]]);
      }
      for(const c of t.changes){
        if(c.start<bar.start||c.start>=bar.start+bar.length)continue;
        const tick=round((at+c.start-bar.start)*120),v=c.value;
        if(c.effect===3&&v)events.push([tick,tempo(v)]);
        else if(c.effect===4)events.push([tick,[0xc0|ch,v&127]]);
        else if([5,6,7,8].includes(c.effect))events.push([tick,[0xb0|ch,{5:7,6:10,7:93,8:91}[c.effect],Math.min(127,v)]]);
      }
    }
  }
  events.sort((a,b)=>a[0]-b[0]||((a[1][0]&240)===128?0:1)-((b[1][0]&240)===128?0:1));
  let previous=0;const chunks=[];
  for(const [tick,event] of events){chunks.push(concat(vlq(tick-previous),event));previous=tick;}
  chunks.push(concat(vlq(Math.max(previous,round(offset*120))-previous),[255,47,0]));
  // Avoid argument limits on scores containing many events.
  const length=chunks.reduce((n,p)=>n+p.length,0),raw=new Uint8Array(length);let cursor=0;
  for(const chunk of chunks){raw.set(chunk,cursor);cursor+=chunk.length;}
  return concat([77,84,104,100],number(6,4,false),[0,0,0,1,1,224,77,84,114,107],number(raw.length,4,false),raw);
}
