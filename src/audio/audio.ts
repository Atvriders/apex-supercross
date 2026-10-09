/** Fully synthesized audio: engines (2T/4T/ATV), crowd, wind, impacts,
 * announcements, and an original menu soundtrack. No samples. */

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private engineNodes: EngineVoice | null = null;
  private crowdNoise: AudioBufferSourceNode | null = null;
  private windNode: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private musicNext = 0;
  muted = false;

  start() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.35;
    this.musicGain.connect(this.master);
    this.buildCrowd();
    this.buildWind();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  // -- engine --------------------------------------------------------------
  setEngine(kind: '2t_small' | '2t_large' | '4t_small' | '4t_large' | 'atv_small' | 'atv_large') {
    if (!this.ctx) return;
    if (this.engineNodes) this.engineNodes.stop();
    this.engineNodes = new EngineVoice(this.ctx, kind);
    this.engineNodes.connect(this.master);
    this.engineNodes.start();
  }

  updateEngine(rpm: number, throttle: number, load: number, slip: number, cameraDist: number) {
    if (!this.engineNodes) return;
    this.engineNodes.update(rpm, throttle, load, slip);
    const distAtten = Math.max(0.05, 1 - cameraDist / 60);
    this.engineNodes.gain.gain.value = (0.05 + throttle * 0.16) * distAtten;
  }

  // -- crowd ---------------------------------------------------------------
  private buildCrowd() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.0;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    // crowd swells
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.15;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(lp).connect(g).connect(this.master);
    src.start();
    lfo.start();
    this.crowdNoise = src;
  }

  /** Crowd reaction burst. */
  crowdReact(intensity = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 180;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.05 * intensity, ctx.currentTime + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.4);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    osc.connect(bp).connect(g).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 1.5);
  }

  // -- wind ----------------------------------------------------------------
  private buildWind() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 800;
    bp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(bp).connect(g).connect(this.master);
    src.start();
    this.windNode = src;
    this.windGain = g;
  }

  updateWind(speed: number) {
    if (this.windGain && this.ctx) {
      this.windGain.gain.value = Math.min(0.12, speed * speed * 0.0004);
    }
  }

  // -- SFX ------------------------------------------------------------------
  impact(strength: number) {
    this.noiseBurst(0.06 + strength * 0.1, 300, 60 + strength * 30);
  }

  gateDrop() {
    this.noiseBurst(0.5, 2500, 200);
    this.tone(220, 0.15, 'square', 0.12);
  }

  announce() {
    if (!this.ctx) return;
    for (const [i, f] of [523, 659, 784].entries()) {
      this.toneAt(f, 0.12, 'triangle', 0.1, i * 0.16);
    }
  }

  shift() {
    this.tone(1800, 0.03, 'square', 0.04);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number) {
    this.toneAt(freq, dur, type, vol, 0);
  }

  private toneAt(freq: number, dur: number, type: OscillatorType, vol: number, delay: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noiseBurst(dur: number, filterFreq: number, vol: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const len = ctx.sampleRate * dur;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  // -- original menu music ---------------------------------------------------
  private chordProg = [
    [110, 130.81, 164.81, 196],      // Am-ish
    [87.31, 110, 130.81, 164.81],    // F-ish
    [98, 123.47, 146.83, 196],       // G-ish
    [110, 130.81, 164.81, 220],      // Am
  ];
  private bassProg = [55, 43.65, 49, 55];
  private hatPattern = [1, 0, 1, 0, 1, 0, 1, 1];

  startMusic() {
    if (!this.ctx || this.musicTimer !== null) return;
    this.musicStep = 0;
    this.musicNext = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 200);
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private scheduleMusic() {
    if (!this.ctx) return;
    const stepDur = 0.137; // ~146 BPM 16ths
    while (this.musicNext < this.ctx.currentTime + 0.4) {
      const step = this.musicStep % 64;
      const bar = Math.floor(this.musicStep / 16) % 4;
      const t = this.musicNext;
      const inBar = step % 16;
      // kick
      if (inBar % 4 === 0) this.drum(t, 90, 0.5, 0.5);
      // snare
      if (inBar === 4 || inBar === 12) this.drum(t, 220, 0.18, 0.35, 'noise');
      // hats
      if (this.hatPattern[inBar % 8]) this.drum(t, 6000, 0.03, 0.06, 'noise');
      // bass
      if (inBar % 2 === 0) this.note(t, this.bassProg[bar], stepDur * 1.8, 'sawtooth', 0.16, 300);
      // arpeggio
      const chord = this.chordProg[bar];
      const arpNote = chord[(Math.floor(inBar / 2)) % 4] * 2;
      this.note(t, arpNote, stepDur * 1.4, 'square', 0.05, 1800);
      this.musicNext += stepDur;
      this.musicStep++;
    }
  }

  private note(t: number, freq: number, dur: number, type: OscillatorType, vol: number, lp: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    osc.connect(f).connect(g).connect(this.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private drum(t: number, freq: number, dur: number, vol: number, kind: 'osc' | 'noise' = 'osc') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.musicGain);
    if (kind === 'osc') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * 1.6, t);
      osc.frequency.exponentialRampToValueAtTime(freq, t + dur * 0.5);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } else {
      const len = ctx.sampleRate * dur;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      src.connect(f).connect(g);
      src.start(t);
    }
  }
}

class EngineVoice {
  gain: GainNode;
  private osc1: OscillatorNode;
  private osc2: OscillatorNode;
  private filter: BiquadFilterNode;
  private lfo: OscillatorNode;
  private lfoGain: GainNode;
  private kind: string;

  constructor(private ctx: AudioContext, kind: string) {
    this.kind = kind;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 600;
    this.filter.Q.value = 2;
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'square';
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0.4;
    this.lfo.connect(this.lfoGain).connect(this.gain.gain);
    this.osc1.connect(this.filter);
    this.osc2.connect(this.filter);
    this.filter.connect(this.gain);
  }

  connect(node: AudioNode) {
    this.gain.connect(node);
  }

  start() {
    this.osc1.start();
    this.osc2.start();
    this.lfo.start();
  }

  stop() {
    try {
      this.osc1.stop();
      this.osc2.stop();
      this.lfo.stop();
      this.gain.disconnect();
    } catch { /* already stopped */ }
  }

  update(rpm: number, throttle: number, load: number, slip: number) {
    const t = this.ctx.currentTime;
    const base = 55 + (rpm / 10000) * 90;
    const is2t = this.kind.startsWith('2t');
    const isAtv = this.kind.startsWith('atv');
    this.osc1.frequency.setTargetAtTime(base * (isAtv ? 0.8 : 1), t, 0.03);
    this.osc2.frequency.setTargetAtTime(base * 1.5, t, 0.03);
    this.filter.frequency.setTargetAtTime(280 + (rpm / 10000) * 1600 + throttle * 400, t, 0.04);
    // firing chug: 4T fires every other rev, 2T every rev
    const fireRate = is2t ? rpm / 60 : rpm / 120;
    this.lfo.frequency.setTargetAtTime(Math.max(8, fireRate), t, 0.05);
    this.lfoGain.gain.setTargetAtTime(slip > 0.3 ? 0.1 : 0.35 + throttle * 0.2, t, 0.1);
  }
}
