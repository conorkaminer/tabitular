declare module '*.mjs' {
  export const DRUMS: any;
  export const BANKS: any;
  export const defaultBank: (...args: any[]) => any;
  export const newTrack: (...args: any[]) => any;
  export const newDraft: (...args: any[]) => any;
  export const toSong: (...args: any[]) => any;
  export const parseFret: (...args: any[]) => any;
  export const SoundbankPlayer: any;
}

interface Navigator {
  requestMIDIAccess?: () => Promise<any>;
}
