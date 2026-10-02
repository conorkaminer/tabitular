// Sample data is local and declarative JSON; no downloaded JavaScript is executed.
export const BANKS = {
  distortion_guitar: { label: 'Distortion guitar', program: 30 },
  overdriven_guitar: { label: 'Overdriven guitar', program: 29 },
  electric_guitar_clean: { label: 'Clean electric guitar', program: 27 },
  electric_bass_pick: { label: 'Electric bass · pick', program: 34 },
  electric_bass_finger: { label: 'Electric bass · finger', program: 33 },
  percussion: { label: 'Standard drum kit', drums: true },
};

export function defaultBank(track) {
  if (track.drums) return 'percussion';
  if (track.program === 30) return 'distortion_guitar';
  if (track.program === 29) return 'overdriven_guitar';
  if (track.program >= 24 && track.program <= 31) return 'electric_guitar_clean';
  if (track.program === 34) return 'electric_bass_pick';
  if (track.program >= 32 && track.program <= 39) return 'electric_bass_finger';
  return null;
}

export function nearestPitch(pitch, available, drums = false) {
  if (available.includes(pitch)) return pitch;
  if (drums) return null; // Never substitute a different drum for an unknown drum number.
  return available.reduce((best, p) => Math.abs(p - pitch) < Math.abs(best - pitch) ? p : best, available[0]);
}

export class SoundbankPlayer {
  constructor(context, fetcher = (...args) => fetch(...args)) {
    this.context = context;
    this.fetcher = fetcher;
    this.banks = new Map();
    this.buffers = new Map();
    this.voices = new Set();
    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -12;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 4;
    this.compressor.connect(context.destination);
  }

  async bank(name) {
    if (!BANKS[name]) throw Error('Unknown soundbank: ' + name);
    if (!this.banks.has(name)) {
      const pending = this.fetcher('soundbanks/' + name + '.json').then(async response => {
        if (!response.ok) throw Error('Could not load ' + BANKS[name].label + '. Try again or select the basic synthesizer.');
        const samples = await response.json();
        return { samples, pitches: Object.keys(samples).map(Number) };
      }).catch(error => { this.banks.delete(name); throw error; });
      this.banks.set(name, pending);
    }
    return this.banks.get(name);
  }

  async decode(name, pitch) {
    const bank = await this.bank(name);
    const root = nearestPitch(pitch, bank.pitches, BANKS[name].drums);
    if (root == null) return;
    const key = name + ':' + root;
    if (!this.buffers.has(key)) {
      const pending = (async () => {
        const encoded = bank.samples[root].split(',')[1];
        const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
        const buffer = await this.context.decodeAudioData(bytes.buffer);
        const result = { buffer, root };
        this.buffers.set(key, result);
        return result;
      })().catch(error => { this.buffers.delete(key); throw error; });
      this.buffers.set(key, pending);
    }
    return this.buffers.get(key);
  }

  async prepare(tracks, choices) {
    const jobs = new Map();
    tracks.forEach((track, i) => {
      const name = choices[i] || defaultBank(track);
      if (!name) return;
      for (const note of track.notes) {
        if (note.fret !== '*') jobs.set(name + ':' + note.pitch, [name, note.pitch]);
      }
    });
    // Limit concurrent decoder jobs to keep large songs responsive.
    const queue = [...jobs.values()];
    await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
      while (queue.length) await this.decode(...queue.shift());
    }));
  }

  play(name, pitch, when, duration, volume, pan = 0, muted = false, track = 0) {
    if (!name) return false;
    const cached = this.buffers.get(name + ':' + pitch);
    const candidates = cached ? [cached] : [...this.buffers.entries()]
      .filter(([key, value]) => key.startsWith(name + ':') && value.buffer)
      .map(([, value]) => value);
    const root = nearestPitch(pitch, candidates.filter(x => x.buffer).map(x => x.root), BANKS[name].drums);
    const sample = candidates.find(x => x.root === root && x.buffer);
    if (!sample) return false;
    const ctx = this.context;
    const source = ctx.createBufferSource();
    source.buffer = sample.buffer;
    source.playbackRate.value = 2 ** ((pitch - root) / 12);
    const amp = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(amp); amp.connect(panner); panner.connect(this.compressor);
    const drums = BANKS[name].drums;
    const length = sample.buffer.duration / source.playbackRate.value;
    const hold = muted ? Math.min(length, .016) : drums ? length : Math.min(length, Math.max(.02, duration));
    const release = muted ? .015 : drums ? .005 : .065;
    const level = Math.max(.0001, volume * (drums ? .7 : .48));
    amp.gain.setValueAtTime(0, when);
    amp.gain.linearRampToValueAtTime(level, when + Math.min(.003, hold / 2));
    amp.gain.setValueAtTime(level, when + hold);
    amp.gain.linearRampToValueAtTime(0, when + hold + release);
    // A closed/pedal hi-hat chokes the open hi-hat only on this drum track.
    if (drums && (pitch === 42 || pitch === 44)) {
      for (const voice of this.voices) {
        if (voice.track === track && voice.pitch === 46 && voice.when <= when) voice.source.stop(when + .01);
      }
    }
    const voice = { source, amp, panner, pitch, track, when };
    this.voices.add(voice);
    source.onended = () => { source.disconnect(); amp.disconnect(); panner.disconnect(); this.voices.delete(voice); };
    source.start(when);
    source.stop(when + hold + release + .01);
    return true;
  }

  stop() {
    for (const voice of this.voices) {
      try { voice.source.stop(); } catch {}
    }
    this.voices.clear();
  }
}
