// The green-phosphor terminal on the right CRT: shift quota, the clock on the current tape,
// ARBITER's suggestion, and the analysis readout that scores a submitted tape item by item.
import * as THREE from 'three';

const W = 320, H = 240;
const G = '#7dff9a', GD = '#2f7a45', GB = '#c8ffd6', RED = '#ff6b6b', AMB = '#ffd23f';
// 9x9 pixel football
const BALL = ['..XXXXX..', '.XX...XX.', 'XX.XXX.XX', 'X.XXXXX.X', 'X..XXX..X', 'X.......X', 'XX.X.X.XX', '.XXX.XXX.', '..XXXXX..'];

export class Terminal {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.x = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.rows = H;
    this.t = 0;
    this.state = { kind: 'text', lines: ['REVIEW DESK OS 2.1', '', 'BOOTING...'] };
    this.seq = null;
    this.flying = [];
  }

  text(lines, opts = {}) { this.seq = null; this.state = { kind: 'text', lines, ...opts }; }
  idle(info) { this.seq = null; this.state = { kind: 'idle', ...info }; }
  review(info) { if (this.state.kind !== 'review' || this.seq) this.seq = null; this.state = { kind: 'review', ...info }; }

  // items: [{ head: 'FOUND'|'MISSED'|'WRONG'|'BONUS', text, balls (can be negative), color }]
  analyze(items, total, grade, onBall, onDone) {
    this.state = { kind: 'analyze' };
    this.seq = { items, total, grade, i: -1, t: 0, phase: 'analyzing', count: 0, shown: 0, onBall, onDone };
    this.flying = [];
  }

  _ball(cx, cy, s = 1, col = G) {
    const x = this.x;
    x.fillStyle = col;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (BALL[r][c] === 'X') x.fillRect(Math.round(cx - 4.5 * s + c * s), Math.round(cy - 4.5 * s + r * s), Math.ceil(s), Math.ceil(s));
  }
  _txt(s, x, y, size = 16, col = G, align = 'left') {
    const c = this.x;
    c.font = `${size}px Silkscreen`; c.fillStyle = col; c.textAlign = align; c.textBaseline = 'top';
    c.fillText(s, x, y);
  }
  _wrap(s, max, size) {
    this.x.font = `${size}px Silkscreen`;
    const out = []; let line = '';
    for (const w of s.split(' ')) { const t = line ? line + ' ' + w : w; if (this.x.measureText(t).width > max && line) { out.push(line); line = w; } else line = t; }
    if (line) out.push(line);
    return out;
  }

  update(dt) {
    this.t += dt;
    const x = this.x, S = this.state;
    x.fillStyle = '#050a07'; x.fillRect(0, 0, W, H);
    x.imageSmoothingEnabled = false;
    const blink = Math.floor(this.t * 2) % 2 === 0;
    if (S.kind === 'text') {
      const ls = S.lines;
      const y0 = H / 2 - (ls.length * 22) / 2;
      ls.forEach((l, i) => this._txt(l + (i === ls.length - 1 && S.cursor && blink ? '_' : ''), W / 2, y0 + i * 22, i === 0 && S.big ? 24 : 16, i === 0 ? GB : G, 'center'));
    }
    if (S.kind === 'idle') {
      this._txt(S.title || 'SHIFT QUOTA', W / 2, 26, 16, GB, 'center');
      x.fillStyle = GD; x.fillRect(30, 60, W - 60, 12);
      x.fillStyle = G; x.fillRect(30, 60, (W - 60) * Math.min(1, S.done / Math.max(1, S.quota)), 12);
      this._txt(`${S.done} / ${S.quota}`, W / 2, 84, 16, G, 'center');
      this._ball(W / 2 + x.measureText(`${S.done} / ${S.quota}`).width / 2 + 16, 92, 1.2);
      if (S.sub) this._wrap(S.sub, W - 40, 16).forEach((l, i) => this._txt(l, W / 2, 140 + i * 22, 16, blink || !S.blinkSub ? G : GD, 'center'));
    }
    if (S.kind === 'review') {
      this._txt(`TAPE ${S.caseNo}/${S.caseCount}`, 20, 18, 16, GB);
      const s = Math.floor(S.seconds);
      this._txt(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, W - 20, 18, 16, S.pressure > 0.8 && blink ? RED : G, 'right');
      this._txt('CROWD', 20, 50, 16, GD);
      x.fillStyle = GD; x.fillRect(100, 54, W - 120, 12);
      x.fillStyle = S.pressure > 0.8 ? RED : S.pressure > 0.5 ? AMB : G; x.fillRect(100, 54, (W - 120) * S.pressure, 12);
      if (S.arbiter) {
        const y = 92;
        x.fillStyle = S.flagged ? '#3a1414' : '#0f2a18'; x.fillRect(12, y - 6, W - 24, 140);
        this._txt('ARBITER', 22, y, 16, GD);
        this._txt(`${S.arbiter.conf}%`, W - 22, y, 16, GD, 'right');
        this._wrap(S.arbiter.restart.toUpperCase(), W - 44, 24).slice(0, 1).forEach((l) => this._txt(l, 22, y + 26, 24, S.flagged ? RED : GB));
        const e = S.arbiter.entries.map((q) => `${q.type.toUpperCase()} #${q.num}`).join(', ') || 'NO OFFENCE';
        this._wrap(e, W - 44, 16).slice(0, 2).forEach((l, i) => this._txt(l, 22, y + 62 + i * 20, 16, G));
        this._txt(S.flagged ? 'FLAGGED' : 'SUGGESTION', 22, y + 106, 16, S.flagged ? (blink ? RED : '#7a2a2a') : GD);
      } else {
        this._txt('ON-FIELD CALL', 20, 100, 16, GD);
        this._wrap((S.onField || '').toUpperCase(), W - 40, 24).slice(0, 2).forEach((l, i) => this._txt(l, 20, 128 + i * 30, 24, GB));
        this._txt(S.pressure > 0.6 ? (blink ? 'HURRY UP' : '') : 'REVIEWING', 20, 204, 16, S.pressure > 0.6 ? AMB : GD);
      }
    }
    if (S.kind === 'analyze') this._drawAnalyze(dt);
    this.tex.needsUpdate = true;
  }

  _drawAnalyze(dt) {
    const q = this.seq, x = this.x;
    if (!q) return;
    q.t += dt;
    const blink = Math.floor(this.t * 3) % 2 === 0;
    // running total, top right
    this._txt(String(q.count), W - 30, 14, 16, GB, 'right');
    this._ball(W - 16, 21, 1.3, GB);
    if (q.phase === 'analyzing') {
      this._txt('ANALYZING' + '.'.repeat(1 + Math.floor(q.t * 3) % 3), W / 2, H / 2 - 8, 16, G, 'center');
      if (q.t > 0.9) { q.phase = 'item'; q.i = 0; q.t = 0; q.shown = 0; }
      return;
    }
    if (q.phase === 'item') {
      const it = q.items[q.i];
      const col = it.color || (it.head === 'FOUND' || it.head === 'BONUS' ? G : it.head === 'WRONG' ? RED : AMB);
      this._txt(it.head + ':', 16, 14, 16, col);
      // headline types in
      const chars = Math.min(it.text.length, Math.floor(q.t * 70));
      const big = it.text.length <= 26 ? 24 : 16;
      const lines = this._wrap(it.text.slice(0, chars), W - 32, big);
      lines.slice(0, 3).forEach((l, i) => this._txt(l, W / 2, (big > 16 ? 62 : 70) + i * (big + 8), big, col, 'center'));
      const n = Math.abs(it.balls);
      const tBalls = it.text.length / 70 + 0.1;
      const want = Math.min(n, Math.max(0, Math.floor((q.t - tBalls) / 0.09) + 1));
      while (q.shown < want) { q.shown++; if (q.onBall) q.onBall(it.balls > 0 ? 1 : -1); }
      const bw = 22, y = 160, x0 = W / 2 - ((n - 1) * bw) / 2;
      for (let k = 0; k < q.shown; k++) {
        // balls fly up to the counter after a beat
        const fly = Math.max(0, Math.min(1, (q.t - tBalls - n * 0.09 - 0.25 - k * 0.05) / 0.3));
        const bx = x0 + k * bw + (W - 16 - (x0 + k * bw)) * fly * fly, by = y + (21 - y) * fly * (2 - fly);
        if (fly < 1) this._ball(bx, by, 2 - fly, it.balls > 0 ? G : RED);
        else if (!it._counted?.[k]) { (it._counted = it._counted || {})[k] = true; q.count += it.balls > 0 ? 1 : -1; }
        if (it.balls < 0 && fly === 0) { x.strokeStyle = RED; x.lineWidth = 2; x.beginPath(); x.moveTo(bx - 9, by - 9); x.lineTo(bx + 9, by + 9); x.stroke(); }
      }
      if (n === 0 && it.note) this._txt(it.note, W / 2, y - 4, 8, GD, 'center');
      const done = q.t > tBalls + n * 0.09 + 0.25 + n * 0.05 + 0.45 + (n === 0 ? 0.7 : 0);
      if (done) { q.i++; q.t = 0; q.shown = 0; if (q.i >= q.items.length) { q.phase = 'total'; } }
      return;
    }
    if (q.phase === 'total') {
      this._txt('TAPE SCORE', W / 2, 40, 16, GD, 'center');
      const shown = Math.min(q.total, Math.floor(q.t * 120));
      this._txt(String(shown), W / 2, 68, 40, GB, 'center');
      x.font = '40px Silkscreen';
      this._txt('/100', W / 2 + x.measureText(String(shown)).width / 2 + 6, 90, 16, GD);
      if (q.t > 0.9) this._txt(q.grade, W / 2, 150, 24, q.total >= 85 ? G : q.total >= 55 ? AMB : RED, 'center');
      if (q.t > 1.4) this._txt(blink ? 'SEE REPORT' : '', W / 2, 200, 16, GD, 'center');
      if (q.t > 1.2 && !q.fired) { q.fired = true; if (q.onDone) q.onDone(); }
    }
  }
}
