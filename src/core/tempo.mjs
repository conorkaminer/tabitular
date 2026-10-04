// Tempo is global, even though TabIt stores changes on individual tracks.
export function tempoChanges(song) {
  return song.tracks.flatMap((track,trackIndex)=>(track.changes??[])
    .filter(c=>c.effect===3&&c.value>0)
    .map(c=>({...c,trackIndex}))).sort((a,b)=>a.start-b.start||a.trackIndex-b.trackIndex);
}
export function tempoTimeline(song,sequence) {
  const events=[{start:0,value:song.tempo}];
  const changes=tempoChanges(song);
  for(const part of sequence)for(const change of changes)
    if(change.start>=part.bar.start&&change.start<part.bar.start+part.bar.length)
      events.push({start:part.start+change.start-part.bar.start,value:change.value});
  events.sort((a,b)=>a.start-b.start);
  const segments=[];let seconds=0,previous=0,bpm=song.tempo;
  for(const event of events){seconds+=(event.start-previous)*15/bpm;segments.push({...event,seconds});previous=event.start;bpm=event.value;}
  const at=(value,key)=>{let result=segments[0];for(const segment of segments){if(segment[key]>value)break;result=segment;}return result;};
  return {
    seconds(position){const s=at(position,'start');return s.seconds+(position-s.start)*15/s.value;},
    position(seconds){const s=at(seconds,'seconds');return s.start+(seconds-s.seconds)*s.value/15;},
    bpm(position){return at(position,'start').value;}
  };
}
