import { newDraft, toSong } from '../../static/editor.mjs';
export function exampleSong(){
  const draft=newDraft('First riff',120,4,true);
  for(let bar=0;bar<4;bar++)for(let beat=0;beat<4;beat++){
    const step=bar*16+beat*4;
    draft.tracks[0].grid[0][step]=[0,3,5,3][bar];
    draft.tracks[1].grid[0][step]=[0,3,5,3][bar];
    draft.tracks[2].grid[0][step]=beat%2?38:36;
    draft.tracks[2].grid[2][step]=42;
  }
  return toSong(draft);
}

// Static hosts use the bundled example; the optional Python host supplies a sample URL.
export async function loadExample(){
  const response=await fetch('config.json');
  if(!response.ok)throw Error('Unable to load app configuration');
  const config=await response.json();
  if(!config.sampleUrl)return exampleSong();
  const sample=await fetch(config.sampleUrl);
  if(!sample.ok)throw Error('Example unavailable. Use Open .tbt to choose your file.');
  return sample.json();
}
