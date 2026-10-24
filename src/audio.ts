// Small Web Audio synth: soft paws, breathy smoke sounds, warm notes. Starts on the first user gesture.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];

export class Sound {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  muted = false;

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.ctx = ctx;
      this.master = ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(ctx.destination);
      const len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = b;
      this.startWind();
    } catch { this.ctx = null; }
  }

  private startWind() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const g = ctx.createGain(); g.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(g.gain);
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.11; const lg2 = ctx.createGain(); lg2.gain.value = 220;
    lfo2.connect(lg2); lg2.connect(lp.frequency);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(); lfo.start(); lfo2.start();

  }

  private noiseBurst(dur: number, f0: number, f1: number, gain: number, q = 0.8, type: BiquadFilterType = 'bandpass') {
    const ctx = this.ctx; if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', delay = 0, vibrato = 0) {
    const ctx = this.ctx; if (!ctx || this.muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    if (vibrato) { const l = ctx.createOscillator(); l.frequency.value = 5.2; const lg = ctx.createGain(); lg.gain.value = vibrato; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur); }
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq * 4;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  private note(step: number, base = 392) { return base * Math.pow(2, PENTA[((step % 8) + 8) % 8] / 12); }

  step(surface: 'grass' | 'stone' | 'wood') {
    if (surface === 'grass') this.noiseBurst(0.07, 1600, 700, 0.05, 0.6);
    else if (surface === 'stone') this.noiseBurst(0.05, 3200, 2000, 0.05, 1.2);
    else this.noiseBurst(0.06, 900, 500, 0.07, 1.5);
  }
  jump() { this.noiseBurst(0.22, 500, 1400, 0.09, 0.7); }
  doubleJump() { this.noiseBurst(0.35, 1800, 400, 0.12, 0.5, 'lowpass'); this.tone(this.note(4, 523), 0.5, 0.06, 'triangle', 0.02, 3); }
  land(strength: number) { this.noiseBurst(0.12, 700, 250, 0.05 + 0.08 * strength, 0.6, 'lowpass'); }
  bap(hit: boolean) { this.noiseBurst(0.08, 1200, 500, 0.12, 1.2); if (hit) this.tone(180, 0.12, 0.08, 'sine'); }
  breakPot() { for (let i = 0; i < 4; i++) this.tone(this.note(i + 3, 523), 0.6, 0.05, 'sine', i * 0.05); this.noiseBurst(0.25, 3000, 900, 0.06, 0.8); }
  thin(on: boolean) { this.noiseBurst(on ? 0.6 : 0.3, on ? 2400 : 600, on ? 500 : 1800, 0.08, 0.4, 'lowpass'); }
  pickup() { this.tone(this.note(2, 784), 0.7, 0.06, 'sine'); this.tone(this.note(4, 784), 0.9, 0.05, 'sine', 0.08); }
  deliver(level: number) {
    const roots = [0, 3, 5];
    const r = roots[Math.min(level, 2)];
    [0, 2, 4].forEach((s, i) => this.tone(this.note(r + s, 262), 2.4, 0.07, 'triangle', i * 0.06, 1.5));
  }
  wake() { [0, 1, 2, 3, 4, 5, 6, 7].forEach((s, i) => this.tone(this.note(s, 392), 1.6, 0.05, 'triangle', i * 0.11, 2)); }
  floatBack() { this.noiseBurst(1.0, 300, 1200, 0.07, 0.4, 'lowpass'); }
  keepsake() { [7, 4, 2, 4, 7].forEach((s, i) => this.tone(this.note(s, 784), 0.5, 0.04, 'sine', i * 0.07)); }
}
