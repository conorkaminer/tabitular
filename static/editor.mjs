export const DRUMS = [{pitch:36,label:'Kick'},{pitch:38,label:'Snare'},{pitch:42,label:'Closed hat'},{pitch:46,label:'Open hat'},{pitch:49,label:'Crash'},{pitch:51,label:'Ride'}];
export function newTrack(kind, measures) {
  const pitches=kind==='bass'?[28,33,38,43]:kind==='drums'?[0,0,0,0,0,0]:[40,45,50,55,59,64];
  return {kind,program:kind==='bass'?34:kind==='drums'?0:30,drums:kind==='drums',pitches,grid:pitches.map(()=>Array(measures*16).fill(null))};
}
export function newDraft(title, tempo, measures, band) {
  return {title:title.trim()||'Untitled',tempo,measures,tracks:(band?['guitar','bass','drums']:['guitar']).map(kind=>newTrack(kind,measures))};
}
export function toSong(draft) {
  const length=draft.measures*16;
  const tracks=draft.tracks.map((track,index)=>{
    const notes=[];
    track.grid.forEach((row,string)=>{
      let previous;
      row.forEach((fret,space)=>{
        if(fret===null)return;
        if(previous)previous.duration=space-previous.start;
        const note={space,start:space,duration:fret==='*'?0:length-space,string,fret,pitch:fret==='*'?0:track.drums?(typeof fret==='number'?fret:0):track.pitches[string]+(typeof fret==='number'?fret:0),effect:''};
        if(fret==='x')note.muted=true;
        notes.push(note);previous=fret==='*'?null:note;
      });
    });
    notes.sort((a,b)=>a.start-b.start||a.string-b.string);
    return {...track,index,strings:track.pitches.length,volume:96,pan:64,notes,changes:[],length};
  });
  return {title:draft.title,filename:draft.title+'.tbt',artist:'',album:'',transcriber:'',comment:'',tempo:draft.tempo,tracks,length,bars:Array.from({length:draft.measures},(_,i)=>({start:i*16,length:16,flags:0,repeats:0})),warnings:[]};
}
export function parseFret(text) {
  const value=text.trim().toLowerCase();
  if(!value)return null;
  if(value==='x'||value==='*')return value;
  if(!/^\d{1,2}$/.test(value))throw Error('Use a fret from 0–99, x to mute, * to stop, or leave blank.');
  return Number(value);
}
