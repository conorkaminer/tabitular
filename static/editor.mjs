export const DRUMS = [{pitch:36,label:'Kick'},{pitch:38,label:'Snare'},{pitch:42,label:'Closed hat'},{pitch:46,label:'Open hat'},{pitch:49,label:'Crash'},{pitch:51,label:'Ride'}];
export function newTrack(kind, measures) {
  const pitches=kind==='bass'?[28,33,38,43]:kind==='drums'?[0,0,0,0,0,0]:[40,45,50,55,59,64];
  return {kind,program:kind==='bass'?34:kind==='drums'?0:30,drums:kind==='drums',pitches,grid:pitches.map(()=>Array(measures*16).fill(null))};
}
export function newDraft(title, tempo, measures, band) {
  return {title:title.trim()||'Untitled',tempo,measures,tracks:(band?['guitar','bass','drums']:['guitar']).map(kind=>newTrack(kind,measures))};
}
export function fromSong(song) {
  const {encoding,...source}=song;
  return {
    title:song.title||song.filename.replace(/\.tbt$/i,''),tempo:song.tempo,measures:song.bars.length,
    ...(encoding?{encoding}:{}),source,
    tracks:song.tracks.map(track=>{
      const spaces=track.times?track.times.length-1:Math.ceil(track.length);
      const grid=track.pitches.map(()=>Array(spaces).fill(null));
      for(const note of track.notes)grid[note.string][note.space??note.start]=note.fret;
      return {...track,kind:track.drums?'drums':track.program>=32&&track.program<=39?'bass':'guitar',grid};
    })
  };
}
export function measureGrid(draft,index) {
  const bar=draft.source?.bars[index];
  return bar?{start:bar.start,length:bar.length}:{start:index*16,length:16};
}
export function toSong(draft) {
  const length=draft.source?.length??draft.measures*16;
  const tracks=draft.tracks.map((track,index)=>{
    const notes=[],times=track.times??Array.from({length:track.grid[0].length+1},(_,i)=>i);
    const effects=new Map((track.notes??[]).map(n=>[n.space+':'+n.string,n.effect]));
    track.grid.forEach((row,string)=>{
      let previous;
      row.forEach((fret,space)=>{
        if(fret===null)return;
        if(previous)previous.duration=times[space]-previous.start;
        const note={space,start:times[space],duration:fret==='*'?0:times.at(-1)-times[space],string,fret,pitch:fret==='*'?0:track.drums?(typeof fret==='number'?fret:0):track.pitches[string]+(typeof fret==='number'?fret:0),effect:fret==='*'?'':effects.get(space+':'+string)??''};
        if(fret==='x')note.muted=true;
        notes.push(note);previous=fret==='*'?null:note;
      });
    });
    notes.sort((a,b)=>a.start-b.start||a.string-b.string);
    if(track.cutAll){
      let next=times.at(-1),onset=next;
      for(let i=notes.length-1;i>=0;i--){const note=notes[i];if(note.start<onset){next=onset;onset=note.start;}note.duration=Math.min(note.duration,next-note.start);}
    }
    return {...track,index,strings:track.pitches.length,volume:track.volume??96,pan:track.pan??64,notes,changes:track.changes??[],length:times.at(-1)};
  });
  return {artist:'',album:'',transcriber:'',comment:'',...draft.source,title:draft.title,filename:draft.source?.filename??draft.title+'.tbt',tempo:draft.tempo,tracks,length,bars:draft.source?.bars??Array.from({length:draft.measures},(_,i)=>({start:i*16,length:16,flags:0,repeats:0})),warnings:draft.source?.warnings??[]};
}
export function parseFret(text,maximum=99) {
  const value=text.trim().toLowerCase();
  if(!value)return null;
  if(value==='x'||value==='*')return value;
  if(!/^\d{1,3}$/.test(value)||Number(value)>maximum)throw Error(`Use a note from 0–${maximum}, x to mute, * to stop, or leave blank.`);
  return Number(value);
}

// Three substeps per original space keep straight notes and triplets on one grid.
export function enableTriplets(draft) {
  if(draft.gridScale===3)return;
  if(draft.tracks.some(track=>track.grid[0].length*3>32000))throw Error('This track is too long to subdivide into triplets.');
  for(const track of draft.tracks){
    const times=track.times??Array.from({length:track.grid[0].length+1},(_,i)=>i);
    const refined=[];
    for(let i=0;i<times.length-1;i++)for(let j=0;j<3;j++)refined.push(times[i]+(times[i+1]-times[i])*j/3);
    refined.push(times.at(-1));
    track.times=refined;
    track.grid=track.grid.map(row=>row.flatMap(fret=>[fret,null,null]));
    if(track.notes)track.notes=track.notes.map(note=>({...note,space:note.space*3}));
    if(track.changes)track.changes=track.changes.map(change=>({...change,space:change.space*3}));
  }
  draft.gridScale=3;
}
export function gridColumns(draft,index,track,spacing) {
  const bar=measureGrid(draft,index),times=track.times??Array.from({length:track.grid[0].length+1},(_,i)=>i);
  return times.slice(0,-1).map((time,step)=>({time,step})).filter(({time,step})=>{
    const offset=time-bar.start,beat=offset/spacing;
    return offset>=-1e-8&&offset<bar.length-1e-8&&(Math.abs(beat-Math.round(beat))<1e-8||track.grid.some(row=>row[step]!=null));
  });
}
