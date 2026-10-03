// Synthesized booth + stadium sound: crowd bed that follows pressure, whistle, roars, UI ticks.
export class Sound {
  constructor() { this.ctx = null; this.vol = 0.8; this.last = {}; this.musicOn = true; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const c = (this.ctx = new C());
    this.master = c.createGain();
    this.master.gain.value = this.vol;
    this.master.connect(c.destination);
    const n = c.sampleRate * 2;
    this.noise = c.createBuffer(1, n, c.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < n; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 4 + (Math.random() * 2 - 1) * 0.15; }
    // crowd bed: two band-passed noise layers with slow swells
    this.crowd = c.createGain();
    this.crowd.gain.value = 0;
    this.crowd.connect(this.master);
    for (const [f, q] of [[450, 0.7], [1300, 1.2]]) {
      const s = c.createBufferSource();
      s.buffer = this.noise; s.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      s.connect(bp).connect(this.crowd);
      s.start();
    }
    // booth hum
    const hum = c.createOscillator(), hg = c.createGain();
    hum.frequency.value = 60; hg.gain.value = 0.004;
    hum.connect(hg).connect(this.master);
    hum.start();
    this.musicGain = c.createGain();
    this.musicGain.gain.value = this.musicOn ? 1 : 0;
    this.musicGain.connect(this.master);
    this._startMusic();
  }

  // A quiet booth radio: 4-bar chiptune loop (Am F C G), square arpeggio over a triangle bass and hats.
  _startMusic() {
    if (this._musicTimer) return;
    const c = this.ctx, bpm = 92, step = 60 / bpm / 2;
    const chords = [[220, 261.63, 329.63, 440], [174.61, 220, 261.63, 349.23], [261.63, 329.63, 392, 523.25], [196, 246.94, 293.66, 392]];
    const bass = [110, 87.31, 130.81, 98];
    const lead = [[5, null, 7, null, 6, null, 4, null], [3, null, 4, null, 5, null, null, null], [7, null, 6, null, 7, null, 9, null], [8, null, 7, null, 5, null, null, null]];
    const scale = [440, 493.88, 523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5];
    let n = 0, next = c.currentTime + 0.2;
    const osc = (f, t, d, type, v) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(this.musicGain);
      o.start(t); o.stop(t + d + 0.05);
    };
    const hat = (t, v) => {
      const s = c.createBufferSource(), hp = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noise; hp.type = 'highpass'; hp.frequency.value = 7000;
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      s.connect(hp).connect(g).connect(this.musicGain);
      s.start(t, Math.random()); s.stop(t + 0.08);
    };
    this._musicTimer = setInterval(() => {
      if (!this.musicOn) { next = Math.max(next, c.currentTime + 0.1); return; }
      while (next < c.currentTime + 0.35) {
        const bar = Math.floor(n / 8) % 4, i = n % 8, ch = chords[bar];
        if (i === 0 || i === 4) osc(bass[bar], next, step * 3.6, 'triangle', 0.1);
        osc(ch[[0, 1, 2, 3, 2, 1, 2, 1][i]], next, step * 0.9, 'square', 0.018);
        const l = lead[bar][i];
        if (l != null && Math.floor(n / 32) % 2 === 1) osc(scale[l], next, step * 1.6, 'square', 0.024);
        if (i % 2 === 1) hat(next, 0.035);
        n++; next += step;
      }
    }, 120);
  }
  setMusic(on) { this.musicOn = on; if (this.musicGain) this.musicGain.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.2); }

  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }

  // 0..1 — crowd loudness while a replay is on screen
  crowdLevel(v) { if (this.crowd) this.crowd.gain.setTargetAtTime(0.015 + v * 0.07, this.ctx.currentTime, 0.5); }

  _ok(k, gap) { if (!this.ctx) return false; const t = this.ctx.currentTime; if (this.last[k] && t - this.last[k] < gap) return false; this.last[k] = t; return true; }

  tone(f0, f1, dur, vol, type = 'sine', delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  burst(dur, vol, f, q = 1, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay, s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp).connect(g).connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.1);
  }

  whistle() {
    if (!this._ok('wh', 0.6)) return;
    for (const [d, l] of [[0, 0.22], [0.3, 0.5]]) {
      const c = this.ctx, t = c.currentTime + d, o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
      o.frequency.value = 2900; lfo.frequency.value = 38; lg.gain.value = 120;
      lfo.connect(lg).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.02); g.gain.setValueAtTime(0.09, t + l - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + l);
      o.connect(g).connect(this.master);
      o.start(t); lfo.start(t); o.stop(t + l + 0.05); lfo.stop(t + l + 0.05);
    }
  }
  roar() { if (this._ok('roar', 1)) { this.burst(2.6, 0.5, 600, 0.5); this.burst(2.2, 0.3, 1500, 0.8, 0.1); } }
  groan() { if (this._ok('groan', 1)) { this.burst(1.4, 0.3, 300, 0.8); } }
  kick() { if (this._ok('kick', 0.08)) { this.tone(140, 60, 0.08, 0.18); } }
  click() { if (this._ok('click', 0.03)) this.tone(1200, 900, 0.04, 0.05, 'triangle'); }
  ping() { if (this._ok('ping', 0.2)) { this.tone(880, 880, 0.18, 0.08); this.tone(1320, 1320, 0.25, 0.06, 'sine', 0.09); } }
  good() { this.tone(660, 660, 0.12, 0.1); this.tone(990, 990, 0.25, 0.1, 'sine', 0.1); }
  bad() { this.tone(300, 200, 0.3, 0.12, 'triangle'); }
  stamp() { this.burst(0.12, 0.4, 200, 0.6); this.tone(90, 50, 0.12, 0.25); }
  key() { if (this._ok('key', 0.03)) { this.burst(0.03, 0.25, 3200, 2); this.tone(420, 300, 0.035, 0.06, 'square'); } }
  blip() { if (this._ok('blip', 0.04)) this.tone(1500, 1500, 0.05, 0.035, 'square'); }
  whoosh() { if (this._ok('whoosh', 0.3)) this.burst(0.35, 0.12, 900, 0.6); }
  paper() { if (this._ok('paper', 0.08)) { this.burst(0.12, 0.18, 4200, 1.5); this.burst(0.08, 0.1, 2400, 1, 0.05); } }
  peel() { if (this._ok('peel', 0.08)) this.burst(0.16, 0.16, 5200, 3); }
  stick() { if (this._ok('stick', 0.05)) { this.burst(0.05, 0.3, 1800, 1); this.tone(220, 140, 0.06, 0.12, 'triangle'); } }
  coin() { this.tone(988, 988, 0.06, 0.06, 'square'); this.tone(1319, 1319, 0.12, 0.06, 'square', 0.06); }
  tapeIn() { if (this._ok('tape', 0.3)) { this.burst(0.08, 0.35, 700, 1); this.tone(110, 70, 0.1, 0.2, 'square', 0.05); this.burst(0.25, 0.1, 300, 0.8, 0.12); } }
  slowIn() { if (this._ok('slowin', 0.8)) { this.tone(520, 80, 0.55, 0.09, 'sawtooth'); this.burst(0.45, 0.07, 380, 0.6); } }
  slowOut() { if (this._ok('slowout', 0.8)) this.tone(90, 520, 0.35, 0.06, 'sawtooth'); }
  thump() { if (this._ok('thump', 0.3)) { this.tone(75, 38, 0.16, 0.22); this.tone(70, 36, 0.14, 0.14, 'sine', 0.17); } }
  sting() { if (this._ok('sting', 1)) { this.tone(196, 196, 0.7, 0.05, 'sawtooth'); this.tone(208, 208, 0.7, 0.05, 'sawtooth'); this.tone(311, 311, 0.4, 0.04, 'square', 0.35); } }
  streak(n) { const f = 523 * Math.pow(1.0595, Math.min(n, 8) * 2); this.tone(f, f, 0.1, 0.07, 'square'); this.tone(f * 1.5, f * 1.5, 0.12, 0.07, 'square', 0.09); this.tone(f * 2, f * 2, 0.3, 0.07, 'square', 0.18); }
  boo() { if (this._ok('boo', 1)) { this.burst(1.8, 0.35, 220, 1.4); this.burst(1.6, 0.2, 340, 2, 0.15); } }
}
