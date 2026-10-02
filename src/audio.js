// Synthesized booth + stadium sound: crowd bed that follows pressure, whistle, roars, UI ticks.
export class Sound {
  constructor() { this.ctx = null; this.vol = 0.8; this.last = {}; }

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
  }

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
}
