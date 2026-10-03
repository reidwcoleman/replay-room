// The review desk: drives the booth for one case. The replay plays on the main CRT (controlled
// from the deck in front of it), the call is made by sticking stickers on the VHS tape, and the
// tape goes into the terminal, which scores it while the stadium feed shows the outcome.
import { CAMS } from '../render/view.js';
import { FPS } from '../sim/clip.js';
import { rulebookFor } from '../sim/rules.js';
import { judge } from '../sim/judge.js';
import { TYPES_BY_DAY, RESTARTS_BY_DAY } from '../cases.js';
import { h, hex } from './dom.js';
import { drawTape, tapeHit, drawShirt, drawCardHand, drawOffenceIcon, drawRestartIcon } from './stickers.js';

const SPEEDS = [0.1, 0.25, 0.5, 1];
const OSD_W = 480, OSD_H = 360;
const QUESTION = { tackle: 'POSSIBLE FOUL', dive: 'POSSIBLE PENALTY', handball: 'POSSIBLE HANDBALL', offside: 'CHECKING OFFSIDE', goalLine: 'GOAL-LINE CHECK', penalty: 'PENALTY CHECK' };
const LABEL = { tackle: 'Challenge', dive: 'Penalty appeal', handball: 'Handball', offside: 'Offside', goalLine: 'Goal-line', penalty: 'Penalty kick' };

export class Review {
  constructor(app) {
    this.app = app;
    this.stage = app.stage;
    this.view = app.replay;
    this.live = app.live;
    this.term = app.term;
    this.sound = app.sound;
    this.hud = app.hud;
    this.osd = app.osd;
    this.playing = false;
    this.speed = 0.5;
    this.tab = 'actions';
    this.case = null;
    this.locked = false;
    this.mode = 'desk';
    this.card = null;
    this.static = 0;
    this.nextNag = 25;
    this._keys = (e) => this._onKey(e);
    addEventListener('keydown', this._keys);
    this.view.onPick = (a) => this._onPick(a);
    const S = this.stage;
    S.onAction = (a, id) => this._onAction(a, id);
    S.onScreen = (type, u, v, e) => this._onScreen(type, u, v, e);
    S.onRail = (f, phase) => this._onRail(f, phase);
    S.onHover = (o, x, y) => this._onHover(o, x, y);
    this._skipClick = () => { if (this.hud.classList.contains('sequence')) this.skip(); };
    S.canvas.addEventListener('pointerdown', this._skipClick);
  }

  destroy() {
    removeEventListener('keydown', this._keys);
    this.stage.canvas.removeEventListener('pointerdown', this._skipClick);
    clearTimeout(this._startTimer);
    const S = this.stage;
    S.onAction = S.onScreen = S.onRail = S.onHover = null;
    S.screenInput = false;
    S.setNote(null);
    this.case = null;
    this.hud.innerHTML = '';
    this.hud.className = 'hud';
  }

  // ---------- load a case ----------
  load(c, ctx) {
    this.case = c;
    this.ctx = ctx; // { state, onSubmit, onMenu, caseNo, caseCount, shiftAvg }
    this.decision = { entries: [], restart: null };
    this.active = 0;
    this.flagged = false;
    this.caseTime = 0;
    this.locked = false;
    this.playing = false;
    this.watchKey = false;
    this.skipping = false;
    this._finished = null;
    this._finish = null;
    this.view.load(c.clip);
    this.view.setCam('broadcast');
    this.view.lineMode = false;
    this.t = 0;
    this.speed = 0.5;
    this.tab = 'actions';
    this.nextNag = 22;
    const k = c.clip.context;
    this.teams = { A: k.attack, D: k.defend };
    this.stage.resetTape();
    this.stage.setMainScreen(this.view.output, OSD_H);
    this.live.setMatch({ a: k.attack.short, b: k.defend.short, sa: k.score[0], sb: k.score[1], min: k.minute });
    this.live.setBanner({ top: 'VAR CHECK', main: QUESTION[c.gen] || 'CHECK' });
    this.stage.setBigScreen(['VAR', 'CHECK'], '#ffd23f', true);
    this.live.mode = 'check';
    this.live.anim = null;
    this.live.queue = null;
    const D = c.clip.duration;
    this.stage.setRail(0, c.clip.log.map((e) => ({ f: e.t / D, color: e.kind === 'goal' ? '#ffd23f' : e.kind === 'warn' ? '#ff6b6b' : '#9dffb8' })));
    if (c.bribe) this.stage.setNote((x) => drawNote(x, c.bribe));
    else this.stage.setNote(null);
    this._buildHud();
    this._drawTape();
    this._seek(0);
    // the tape arrives: desk view, power-on, title card, then in to the monitor
    const fast = this.app.fast;
    this.card = { t: 0, dur: fast ? 0 : 2.6 };
    this.setMode('desk', true);
    this.stage.power('main', 0);
    this._powerT = 0;
    this.sound.tapeIn();
    clearTimeout(this._startTimer);
    this._startTimer = setTimeout(() => { if (this.case === c && !this.locked) { this.setMode('focus'); this.play(true); } }, fast ? 0 : 1800);
  }

  setMode(m, quiet = false) {
    if (this.locked && m !== 'focus') return;
    this.mode = m;
    const S = this.stage;
    S.goTo(m === 'focus' ? 'focus' : m === 'tape' ? 'tape' : 'desk', this.app.fast ? 0 : 0.85);
    S.screenInput = m === 'focus';
    this.hud.classList.toggle('mode-focus', m === 'focus');
    this.hud.classList.toggle('mode-tape', m === 'tape');
    this.hud.classList.toggle('mode-desk', m === 'desk');
    this.panel.classList.toggle('open', m === 'tape');
    this.viewBtns.forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    if (m === 'tape') this._renderPanel();
    if (!quiet) this.sound.whoosh();
  }

  // ---------- frame ----------
  update(dt) {
    if (!this.case) return;
    if (this._powerT < 1) { this._powerT = Math.min(1, this._powerT + dt * 1.6); this.stage.power('main', this._powerT); }
    if (!this.locked) this.caseTime += dt;
    if (this.card) { this.card.t += dt; if (this.card.t > this.card.dur) this.card = null; }
    if (this.playing) {
      const prev = this.t;
      let t = this.t + dt * this.speed;
      if (t >= this.case.clip.duration) { t = this.case.clip.duration; this.playing = false; }
      this._cues(prev, t);
      this._seek(t);
    }
    const pressure = Math.min(1, this.caseTime / 100);
    if (!this.locked) {
      this.view.excite = 0.2 + pressure * 0.8;
      this.live.excite = 0.15 + pressure * 0.85;
      this.stage.crowdHeat = this.live.excite;
      this.sound.crowdLevel(0.15 + pressure * 0.7);
      if (this.caseTime > this.nextNag) { this.nextNag += 18 + Math.random() * 10; this._nag(pressure); }
      this.term.review({ caseNo: this.ctx.caseNo, caseCount: this.ctx.caseCount, seconds: this.caseTime, pressure, question: this.case.clip.context.question, onField: this.case.clip.context.onField, arbiter: this.case.arbiter, flagged: this.flagged });
    }
    this.static = Math.max(0, this.static - dt * 3);
    this.stage.H.main.screen.material.uniforms.noise.value = this.static;
    this._drawOSD();
    this.view.render(dt, this.osd.tex);
    this._tickHud();
    this._placeBubble();
  }

  _cues(a, b) {
    for (const e of this.case.clip.log) {
      if (e.t > a && e.t <= b) {
        if (e.kind === 'goal') this.sound.roar();
        else if (e.kind === 'warn') this.sound.groan();
      }
    }
    for (const act of this.case.clip.actors) for (const e of act.events) {
      if (e.type !== 'kick') continue;
      const tc = e.t + e.dur * 0.55;
      if (tc > a && tc <= b && (e.amp ?? 1) > 0.5) this.sound.kick();
    }
  }

  _seek(t) {
    this.t = Math.max(0, Math.min(this.case.clip.duration, t));
    this.view.setTime(this.t);
    this.stage.setRail(this.t / this.case.clip.duration);
  }
  play(force) {
    if (force === true) this.playing = true;
    else this.playing = !this.playing;
    if (this.playing && this.t >= this.case.clip.duration - 0.01) this._seek(0);
  }
  step(frames) { this.playing = false; this._seek(Math.round(this.t * FPS + frames) / FPS); }
  _setCam(id) { this.view.setCam(id); this.static = 0.9; this.sound.blip(); }
  _cycleCam() { const i = CAMS.findIndex((c) => c.id === this.view.cam); this._setCam(CAMS[(i + 1) % CAMS.length].id); }
  _toggleLines() {
    if (this.case.day < 3) { this.bubble('The line tool unlocks on day 3.', 'term', 2.2); return; }
    this.view.lineMode = !this.view.lineMode;
    this.sound.blip();
  }
  _speed(d) { const i = SPEEDS.indexOf(this.speed); this.speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + d))]; this.sound.blip(); }

  // ---------- on-screen display (drawn into the replay feed) ----------
  _drawOSD() {
    const x = this.osd.ctx, W = OSD_W, H = OSD_H, v = this.view, c = this.case;
    x.clearRect(0, 0, W, H);
    x.textBaseline = 'top';
    const txt = (s, X, Y, size = 8, col = '#fff', align = 'left', bg = null) => {
      x.font = `${size}px Silkscreen`; x.textAlign = align;
      if (bg) { const w = x.measureText(s).width; const bx = align === 'right' ? X - w - 4 : align === 'center' ? X - w / 2 - 4 : X - 4; x.fillStyle = bg; x.fillRect(Math.round(bx), Y - 3, Math.round(w + 8), size + 5); }
      x.fillStyle = col; x.fillText(s, X, Y);
    };
    // player tags
    const tags = [];
    if (v.selected) tags.push({ a: v.selected.actor, col: '#7dff9a' });
    for (const l of v.lines) if (l.pm !== v.selected) tags.push({ a: l.pm.actor, col: l.pm.actor.team === 'A' ? '#ff5d8f' : '#5fd4ff' });
    if (v.hover && v.hover !== v.selected && !v.lines.some((l) => l.pm === v.hover)) tags.push({ a: v.hover.actor, col: '#ffffff' });
    for (const tg of tags) {
      const p = v.screenOf(tg.a);
      if (!p.visible) continue;
      const s = `#${tg.a.num} ${this.teams[tg.a.team].short}`;
      x.font = '8px Silkscreen';
      const w = Math.round(x.measureText(s).width + 8), X = Math.round(p.x - w / 2), Y = Math.round(p.y - 14);
      x.fillStyle = 'rgba(10,14,20,0.85)'; x.fillRect(X, Y, w, 12);
      x.fillStyle = tg.col; x.fillRect(X, Y + 11, w, 1); x.fillRect(Math.round(p.x) - 1, Y + 12, 2, 3);
      x.textAlign = 'left'; x.fillText(s, X + 4, Y + 1);
    }
    // corners
    const blink = Math.floor(performance.now() / 500) % 2 === 0;
    txt(this.playing ? `PLAY ${this.speed}X` : 'PAUSE', 40, 26, 16, '#ffffff', 'left', 'rgba(10,14,20,0.6)');
    if (this.playing && blink) { x.fillStyle = '#ff4d4d'; x.fillRect(26, 31, 6, 6); }
    const cam = CAMS.find((q) => q.id === v.cam);
    txt(`CAM ${CAMS.indexOf(cam) + 1} ${cam.label.toUpperCase()}${v.zoom > 1.05 ? ` ${v.zoom.toFixed(1)}X` : ''}`, W - 30, 30, 8, '#ffffff', 'right', 'rgba(10,14,20,0.6)');
    const fr = Math.round(this.t * FPS);
    txt(`${fmt(this.t)}  F${String(fr).padStart(3, '0')}`, 30, H - 34, 8, '#ffffff', 'left', 'rgba(10,14,20,0.6)');
    const k = c.clip.context;
    txt(`${k.attack.short} ${k.score[0]}-${k.score[1]} ${k.defend.short}  ${matchClock(k.minute, this.t)}`, W - 30, H - 34, 8, '#ffffff', 'right', 'rgba(10,14,20,0.6)');
    // offside readout
    const info = v.lineInfo();
    if (info.length) {
      const att = info.find((i) => i.actor.team === 'A'), def = info.find((i) => i.actor.team === 'D');
      let s = info.map((i) => `#${i.actor.num} ${this.teams[i.actor.team].short}`).join(' VS ');
      if (att && def) {
        const d = att.x - def.x, cm = Math.round(Math.abs(d) * 100);
        s += d > 0.005 ? `  ATTACKER ${cm}CM BEYOND` : d < -0.005 ? `  ATTACKER ${cm}CM BEHIND` : '  LEVEL';
      }
      txt(s, W / 2, H - 58, 8, '#ffe066', 'center', 'rgba(10,14,20,0.8)');
    }
    if (v.lineMode) txt('LINE TOOL: CLICK A PLAYER', W / 2, 52, 8, blink ? '#ffe066' : '#c9a83a', 'center', 'rgba(10,14,20,0.7)');
    if (this.watchKey) txt('KEY MOMENT', W / 2, 52, 8, '#7dff9a', 'center', 'rgba(10,14,20,0.7)');
    // title card while the tape loads
    if (this.card) {
      const a = Math.min(1, (this.card.dur - this.card.t) / 0.4);
      x.globalAlpha = Math.max(0, a);
      x.fillStyle = '#0a0f14'; x.fillRect(0, 0, W, H);
      txt(`TAPE ${c.day}-${String(c.idx + 1).padStart(2, '0')}`, W / 2, 80, 16, '#7dff9a', 'center');
      txt(LABEL[c.gen].toUpperCase(), W / 2, 112, 16, '#ffffff', 'center');
      txt(k.attack.name.toUpperCase(), W / 2, 166, 8, '#ffffff', 'center');
      txt('VS', W / 2, 184, 8, '#8a95a5', 'center');
      txt(k.defend.name.toUpperCase(), W / 2, 202, 8, '#ffffff', 'center');
      txt(`${k.minute}'  ON-FIELD: ${k.onField.toUpperCase()}`, W / 2, 240, 8, '#ffe066', 'center');
      if (blink) txt('LOADING TAPE', W / 2, 292, 8, '#7dff9a', 'center');
      x.globalAlpha = 1;
    }
    this.osd.tex.needsUpdate = true;
  }

  // ---------- HUD ----------
  _buildHud() {
    const c = this.case, k = c.clip.context, s = this.ctx.state;
    this.hud.innerHTML = '';
    this.hud.className = 'hud';
    const chip = (t) => h('span', 'chip', [h('i', '', { style: `background:${hex(t.shirt)};box-shadow: inset -5px 0 0 ${hex(t.shorts)}` }), t.short]);
    this.slip = h('div', 'slip', [
      h('div', 'slip-top', [h('b', '', `Tape ${c.day}-${String(c.idx + 1).padStart(2, '0')}`), h('span', '', `${this.ctx.caseNo} of ${this.ctx.caseCount}`)]),
      h('div', 'slip-match', [chip(k.attack), h('b', 'sc', `${k.score[0]}–${k.score[1]}`), chip(k.defend), h('span', 'min', `${k.minute}'`)]),
      h('p', 'slip-q', k.question),
      h('div', 'slip-field', [h('small', '', 'On-field call'), h('b', '', k.onField)]),
    ]);
    this.top = h('div', 'topright', [
      h('div', 'pill', [h('small', '', 'Wallet'), h('b', '', `$${s.wallet.toLocaleString()}`)]),
      ...(this.ctx.shiftAvg != null ? [h('div', 'pill', [h('small', '', 'Shift'), h('b', '', `${this.ctx.shiftAvg}%`)])] : []),
      h('button', 'btn ghost', { onclick: () => this.ctx.onMenu() }, 'Menu'),
    ]);
    this.viewBtns = [['desk', 'Desk', 'Q'], ['focus', 'Monitor', 'W'], ['tape', 'Tape', 'E']].map(([m, l, key]) => h('button', 'vbtn', { 'data-mode': m, onclick: () => { if (!this.locked) this.setMode(m); } }, [h('kbd', '', key), l]));
    this.viewbar = h('div', 'viewbar', this.viewBtns);
    this.cta = h('button', 'btn primary cta', { onclick: () => this.setMode('tape') }, 'Make the call');
    this.tip = h('div', 'tip hidden');
    this.bub = h('div', 'bubble hidden');
    this.panel = h('aside', 'paper panel');
    this.skipHint = h('div', 'skiphint', [h('kbd', '', 'SPACE'), 'Skip']);
    this.hud.append(this.slip, this.top, this.viewbar, this.cta, this.panel, this.tip, this.bub, this.skipHint);
  }

  _tickHud() {
    this.cta.classList.toggle('hidden', this.mode === 'tape' || this.locked);
    this.viewbar.classList.toggle('hidden', this.locked);
  }

  bubble(text, where = 'live', dur = 3.2) {
    this.bub.textContent = '';
    this.bub.append(...richText(text));
    this.bub.classList.remove('hidden', 'pop');
    void this.bub.offsetWidth;
    this.bub.classList.add('pop');
    this.bubWhere = where;
    this._placeBubble();
    clearTimeout(this._bubT);
    this._bubT = setTimeout(() => this.bub.classList.add('hidden'), dur * 1000);
  }
  _placeBubble() {
    if (this.bub.classList.contains('hidden')) return;
    const S = this.stage, H = S.H;
    const anchor = this.bubWhere === 'term' ? S.toPage(H.term.group, [0, 0.2, 0]) : S.toPage(H.live.group, [0, 0.2, 0]);
    const w = this.bub.offsetWidth, ht = this.bub.offsetHeight;
    const x = Math.max(12, Math.min(innerWidth - w - 12, anchor.x - w / 2));
    const y = Math.max(12, anchor.y - ht - 14);
    this.bub.style.left = `${x}px`;
    this.bub.style.top = `${y}px`;
    this.bub.style.setProperty('--ax', `${Math.max(18, Math.min(w - 18, anchor.x - x))}px`);
  }
  _nag(p) {
    this.sound.groan();
    if (this.mode === 'focus') return;
    const lines = p > 0.7 ? ['How long does it take?!', 'Just make a <b>decision</b>!', 'We\'re freezing out here!'] : ['Come on, VAR...', 'Still checking?', 'What are they even looking at?'];
    this.bubble(lines[Math.floor(Math.random() * lines.length)], 'live', 2.6);
  }

  _onHover(o, cx, cy) {
    const a = o && o.userData.action;
    const tip = o && o.userData.tip ? o.userData.tip : a === 'book' ? 'Rulebook' : a === 'tape' ? 'The tape: stick your call on it' : a === 'monitor' && this.mode !== 'focus' ? 'Watch the replay' : a === 'rail' ? 'Drag to scrub' : null;
    if (!tip) { this.tip.classList.add('hidden'); return; }
    this.tip.textContent = tip;
    this.tip.classList.remove('hidden');
    this.tip.style.left = `${cx + 14}px`;
    this.tip.style.top = `${cy + 16}px`;
  }

  // ---------- desk input ----------
  _onAction(a, id) {
    if (this.hud.classList.contains('sequence')) return this.skip();
    if (a === 'key') return this._key(id);
    if (this.locked) return;
    if (a === 'monitor') this.setMode('focus');
    if (a === 'tape') { this.tab = 'actions'; this.setMode('tape'); }
    if (a === 'book') { this.tab = 'rules'; this.setMode('tape'); this.sound.paper(); }
  }
  _key(id) {
    this.sound.key();
    if (id === 'play') this.play();
    if (id === 'rew') this.step(-1);
    if (id === 'fwd') this.step(1);
    if (id === 'left') this.step(-10);
    if (id === 'right') this.step(10);
    if (id === 'up') this._speed(1);
    if (id === 'down') this._speed(-1);
    if (id === 'cam') this._cycleCam();
    if (id === 'line') this._toggleLines();
    if (id === 'zoom') this.view.resetView();
  }
  _onRail(f, phase) {
    if (phase === 'down') { this.playing = false; this.sound.key(); }
    this._seek(f * this.case.clip.duration);
  }
  _onScreen(type, u, v, e) {
    const V = this.view;
    if (type === 'wheel') V.wheel(u, v, e.deltaY);
    if (type === 'down') V.pointerDown(u, v, e.button);
    if (type === 'move') { V.pointerMove(u, v, e.shiftKey); this.stage.canvas.style.cursor = V.cursor; }
    if (type === 'up') V.pointerUp(u, v);
    if (type === 'dbl') V.resetView();
  }
  _onPick(a) {
    if (a) this.sound.blip();
    if (this.mode === 'tape' && this.tab === 'match') this._renderPanel();
  }

  // ---------- the paper panel ----------
  _renderPanel() {
    const P = this.panel, c = this.case, d = this.decision;
    const scroll = this.body ? this.body.scrollTop : 0;
    P.innerHTML = '';
    const tabs = [['actions', 'Actions'], ['match', 'Match'], ['log', 'Log'], ['rules', 'Rules'], ...(c.arbiter ? [['arbiter', 'Arbiter']] : [])];
    const newRules = rulebookFor(c.day).some((r) => r.isNew);
    P.append(
      h('div', 'tabs', tabs.map(([id, l]) => h('button', 'tab' + (this.tab === id ? ' on' : ''), { onclick: () => { this.tab = id; this.body.scrollTop = 0; this.sound.paper(); this._renderPanel(); } }, [l, id === 'rules' && newRules ? h('i', 'dot') : '', id === 'arbiter' && this.flagged ? h('i', 'dot') : '']))),
      this.body = h('div', 'pbody'),
      this._tapeSummary(),
    );
    const b = this.body;
    if (this.tab === 'actions') {
      b.append(h('h2', '', 'Actions'), h('p', 'hint', 'Drag stickers onto the tape, or click one to stick it on. Every offence needs a player from Match.'));
      b.append(h('h3', '', 'Offences'), h('div', 'grid', TYPES_BY_DAY(c.day).map((t) => this._stk('off', t, (x) => drawOffenceIcon(x, 8, 8, 68, t), t))));
      b.append(h('h3', '', 'Cards'), h('div', 'grid', [this._stk('card', 'Yellow', (x) => drawCardHand(x, 4, 2, 78, 'Yellow'), 'Yellow card'), this._stk('card', 'Red', (x) => drawCardHand(x, 4, 2, 78, 'Red'), 'Red card')]));
      b.append(h('h3', '', 'Restart'), h('div', 'grid', RESTARTS_BY_DAY(c.day).map((r) => this._stk('restart', r, (x) => { x.beginPath(); x.arc(42, 42, 34, 0, 7); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#20262e'; x.stroke(); drawRestartIcon(x, 14, 14, 56, r); }, r, d.restart === r))));
    }
    if (this.tab === 'match') {
      const sel = this.view.selected && this.view.selected.actor;
      b.append(h('h2', '', 'Match'), h('p', 'hint', sel ? `Selected on the monitor: #${sel.num} ${this.teams[sel.team].short}` : 'Click a player on the monitor and their shirt is marked here.'));
      for (const team of ['A', 'D']) {
        const T = this.teams[team];
        const nums = c.clip.actors.filter((a) => a.team === team).map((a) => a.num).sort((x, y) => x - y);
        b.append(h('h3', '', [T.name, h('small', '', team === 'A' ? ' · attacking' : ' · defending')]), h('div', 'grid shirts', nums.map((n) => this._stk('shirt', { team, num: n }, (x) => drawShirt(x, 6, 6, 72, T, n), `#${n}`, sel && sel.team === team && sel.num === n))));
      }
    }
    if (this.tab === 'log') {
      b.append(h('h2', '', 'Match log'), h('p', 'hint', 'Click an entry to jump the replay there. The log records what the stadium systems saw, never whether it was an offence.'),
        h('ul', 'log', c.clip.log.map((e) => h('li', e.kind, { onclick: () => { this.playing = false; this._seek(e.t); this.setMode('focus'); } }, [h('span', 't', fmt(e.t)), h('span', 'x', e.text)]))));
    }
    if (this.tab === 'rules') {
      b.append(h('h2', '', 'Regulations'));
      for (const r of rulebookFor(c.day)) b.append(h('section', 'rule' + (r.isNew ? ' new' : ''), [h('h3', '', [r.title, r.isNew ? h('span', 'badge', 'New') : '']), ...(r.directive ? [h('p', 'directive', r.directive)] : []), ...r.body.map((p) => h('p', '', p))]));
    }
    if (this.tab === 'arbiter') {
      const a = c.arbiter;
      b.append(h('h2', '', 'ARBITER'), h('p', 'hint', 'Lumen\'s review assistant. It is usually right. If you are sure it is wrong, flag it: upheld flags go to the audit trail.'),
        h('div', 'arb', [h('small', '', `Suggestion · ${a.conf}% confident`), h('b', '', a.restart), h('p', '', a.entries.length ? a.entries.map((e) => `${e.type} #${e.num} ${this.teams[e.team].short}${e.card !== 'None' ? ' + ' + e.card : ''}`).join(', ') : 'No offence')]),
        h('div', 'row', [
          h('button', 'btn', { onclick: () => this._applyArbiter() }, 'Stick it on the tape'),
          h('button', 'btn danger' + (this.flagged ? ' on' : ''), { onclick: () => this._flag() }, this.flagged ? 'Flagged' : 'Flag as wrong'),
        ]));
    }
    b.scrollTop = scroll;
  }

  _tapeSummary() {
    const d = this.decision;
    const missing = !d.restart ? 'Needs a restart sticker' : d.entries.some((e) => e.num == null) ? 'An offence sticker has no player' : null;
    const items = d.entries.map((e, i) => h('li', i === this.active ? 'on' : '', { onclick: () => { this.active = i; this._drawTape(); this._renderPanel(); } }, [
      h('span', '', `${e.type}${e.num != null ? ` · #${e.num} ${this.teams[e.team].short}` : ' · needs a player'}${e.card && e.card !== 'None' ? ` · ${e.card}` : ''}`),
      h('button', 'peel', { title: 'Peel off', onclick: (ev) => { ev.stopPropagation(); d.entries.splice(i, 1); this.active = Math.max(0, Math.min(this.active, d.entries.length - 1)); this.sound.peel(); this._drawTape(); this._renderPanel(); } }, '×'),
    ]));
    return h('div', 'tapebox', [
      h('div', 'tb-head', [h('b', '', 'On the tape'), d.restart ? h('span', 'rs', [d.restart, h('button', 'peel', { title: 'Peel off', onclick: () => { d.restart = null; this.sound.peel(); this._drawTape(); this._renderPanel(); } }, '×')]) : h('span', 'muted', 'No restart yet')]),
      items.length ? h('ul', 'tb-list', items) : h('p', 'muted', 'No offences. Leave it empty if nothing happened.'),
      h('div', 'row', [
        h('button', 'btn ghost', { onclick: () => this.setMode('focus') }, 'Back to monitor'),
        h('button', 'btn primary send', { disabled: !!missing || this.locked, onclick: () => this._submit() }, 'Send tape'),
      ]),
      h('small', missing ? 'warn' : 'ok', missing || 'Ready to send'),
    ]);
  }

  // a draggable sticker in the panel
  _stk(kind, value, draw, label, on = false) {
    const cv = h('canvas', '', { width: 84, height: 84 });
    draw(cv.getContext('2d'));
    const el = h('div', 'stk ' + kind + (on ? ' on' : ''), { title: label }, [cv, h('span', '', label)]);
    el.addEventListener('pointerdown', (e) => this._dragStart(e, cv, kind, value));
    return el;
  }

  _dragStart(e, cv, kind, value) {
    if (this.locked) return;
    e.preventDefault();
    const ghost = h('canvas', 'ghost', { width: 84, height: 84 });
    ghost.getContext('2d').drawImage(cv, 0, 0);
    document.body.append(ghost);
    const st = { x: e.clientX, y: e.clientY, moved: false };
    const place = (ev) => { ghost.style.transform = `translate(${ev.clientX - 42}px, ${ev.clientY - 42}px) rotate(-6deg) scale(1.15)`; };
    place(e);
    const move = (ev) => {
      if (!st.moved && Math.hypot(ev.clientX - st.x, ev.clientY - st.y) > 6) { st.moved = true; ghost.classList.add('on'); this.sound.peel(); }
      place(ev);
      if (st.moved) this._drawTape(this._hoverFor(kind, this._tapeHitAt(ev.clientX, ev.clientY)));
    };
    const up = (ev) => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      ghost.remove();
      const hit = st.moved ? this._tapeHitAt(ev.clientX, ev.clientY) : { part: 'auto' };
      if (st.moved && !hit) { this._drawTape(); return; }
      this._drop(kind, value, hit);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }
  _tapeHitAt(cx, cy) {
    const p = this.stage.tapeAt(cx, cy);
    if (!p) return null;
    return tapeHit(p.px, p.py, { offences: this.decision.entries }) || { part: 'body' };
  }
  _hoverFor(kind, hit) {
    if (!hit) return null;
    if (kind === 'restart') return 'label';
    if (kind === 'off') return this.decision.entries.length < 4 ? 'slot' : null;
    if (hit.part === 'off') return 'off' + hit.i;
    return this.decision.entries.length ? 'off' + this.active : null;
  }

  _drop(kind, value, hit) {
    const d = this.decision;
    const target = hit && hit.part === 'off' ? hit.i : this.active;
    if (kind === 'restart') { d.restart = value; this.sound.stick(); }
    else if (kind === 'off') {
      if (d.entries.length >= 4) { this.bubble('The tape only fits four offence stickers.', 'term', 2.4); return this._drawTape(); }
      const sel = this.view.selected && this.view.selected.actor;
      d.entries.push({ type: value, team: sel ? sel.team : 'D', num: sel ? sel.num : null, card: 'None' });
      this.active = d.entries.length - 1;
      this.sound.stick();
    } else if (kind === 'shirt' || kind === 'card') {
      if (!d.entries.length) { this.bubble('Stick an <b>offence</b> on the tape first, then add the player.', 'term', 2.6); this.sound.bad(); return this._drawTape(); }
      const e = d.entries[Math.min(target, d.entries.length - 1)];
      if (kind === 'shirt') { e.team = value.team; e.num = value.num; }
      else e.card = e.card === value ? 'None' : value;
      this.active = d.entries.indexOf(e);
      if (kind === 'shirt') { const nx = d.entries.findIndex((q) => q.num == null); if (nx >= 0) this.active = nx; }
      this.sound.stick();
    }
    this._drawTape();
    this._renderPanel();
  }

  _drawTape(hover = null) {
    const T = this.stage.H.tapeTex;
    drawTape(T.userData.ctx, { restart: this.decision.restart, offences: this.decision.entries }, this.teams, hover);
    T.needsUpdate = true;
  }

  _flag() {
    if (this.locked) return;
    this.flagged = !this.flagged;
    this.sound.stamp();
    this._renderPanel();
  }
  _applyArbiter() {
    if (this.locked) return;
    const a = this.case.arbiter;
    this.decision.restart = a.restart;
    this.decision.entries = a.entries.map((e) => ({ ...e }));
    this.active = 0;
    this.sound.stick();
    this._drawTape();
    this.tab = 'actions';
    this._renderPanel();
  }

  // ---------- submit: tape into the terminal, analysis, stadium reaction ----------
  async _submit() {
    if (this.locked || !this.decision.restart || this.decision.entries.some((e) => e.num == null)) return;
    this.locked = true;
    this.playing = false;
    this.view.lineMode = false;
    clearTimeout(this._startTimer);
    const entries = this.decision.entries.map((e) => ({ team: e.team, num: +e.num, type: e.type, card: e.card || 'None', teamName: this.teams[e.team].short }));
    const decision = { restart: this.decision.restart, entries };
    const res = judge(this.case.truth, decision, this.caseTime);
    const payload = { result: res, decision: this.decision, flagged: this.flagged, seconds: this.caseTime };
    this._drawTape();
    this.mode = 'results';
    this.panel.classList.remove('open');
    this.stage.screenInput = false;
    this.hud.classList.remove('mode-focus', 'mode-tape');
    this.hud.classList.add('mode-desk');
    const fast = this.app.fast;
    const c = this.case;
    this.skipping = false;
    const live = () => this.case === c;
    // waits that end early when the player skips (click / Space / Enter)
    const wait = (ms) => new Promise((r) => { if (this.skipping) return r(); const t = setTimeout(r, ms); this._skipWait = () => { clearTimeout(t); r(); }; });
    const kinds = { Penalty: 'penalty', 'Free kick': 'free', 'Goal stands': 'goal', 'Award goal': 'goal', 'Play on': 'playon', 'Retake penalty': 'penalty', 'Disallow goal': entries.some((e) => e.type === 'Offside') ? 'offside' : 'nogoal' };
    const verdictOnLive = () => {
      this.live.setBanner({ top: 'VAR DECISION', main: decision.restart.toUpperCase(), color: '#1d6b3a' });
      this.stage.setBigScreen(decision.restart.toUpperCase().split(' ').length > 1 ? decision.restart.toUpperCase().split(' ').slice(0, 2) : ['DECISION', decision.restart.toUpperCase()], '#8dff9f', false);
      this.sound.whistle();
      const loud = ['Goal stands', 'Award goal', 'Penalty'].includes(decision.restart);
      this.live.excite = loud ? 1 : 0.6;
      if (loud) this.sound.roar(); else this.sound.boo();
    };
    if (fast) { verdictOnLive(); this.ctx.onSubmit(payload); return; }
    this.hud.classList.add('sequence');
    this.stage.goTo('desk', 0.8);
    this.sound.whoosh();
    // up off the desk, over to the slot, then in
    const S = this.stage, a = S.slotPose(0), b = S.slotPose(1);
    await S.animateTape({ pos: a.pos, rot: a.rot, arc: 0.12 }, 0.85);
    await S.animateTape({ pos: b.pos, rot: b.rot }, 0.3);
    S.H.tape.visible = false;
    this.sound.tapeIn();
    if (!live()) return;
    // 1) the stadium: referee draws the screen, then gives the call
    this.live.mode = 'decided';
    this.live.signal(['screen', kinds[decision.restart] || 'playon', ...entries.filter((e) => e.card !== 'None').map((e) => ({ kind: 'card', card: e.card }))]);
    this.live.setBanner({ top: 'VAR', main: 'DECISION...' });
    this.term.text(['TAPE RECEIVED', '', 'READING...'], { cursor: true });
    if (!this.skipping) S.goTo('live', 0.7);
    await wait(2700);
    if (!live()) return;
    verdictOnLive();
    this.bubble(reaction(c.truth, decision, this.caseTime, res.score), 'live', 3.6);
    await wait(2300);
    if (!live()) return;
    // 2) the terminal scores the tape item by item
    const items = termItems(res, c.truth, decision);
    const grade = res.score >= 100 ? 'PERFECT CALL' : res.score >= 85 ? 'GREAT CALL' : res.score >= 55 ? 'PARTLY RIGHT' : 'WRONG CALL';
    const finish = () => {
      if (!live() || this._finished) return;
      this._finished = true;
      this.hud.classList.remove('sequence');
      if (res.score >= 85) this.sound.good(); else if (res.score < 55) this.sound.bad();
      this.ctx.onSubmit(payload);
    };
    this._finished = false;
    if (this.skipping) return finish();
    S.goTo('term', 0.7);
    this.term.analyze(items, res.score, grade, (q) => (q > 0 ? this.sound.coin() : this.sound.bad()), async () => { await wait(1000); finish(); });
    this._finish = finish;
  }

  // click / Space / Enter during the send sequence jumps to the report
  skip() {
    if (!this.locked || this._finished === true || this.skipping) return;
    this.skipping = true;
    if (this._skipWait) this._skipWait();
    if (this._finish) this._finish();
  }

  // jump to the key moment after the verdict
  cueKeyMoment() {
    const c = this.case.clip;
    this.setMode('focus', true);
    this.hud.classList.add('watching');
    this.watchKey = true;
    this.playing = false;
    this.speed = 0.25;
    if (c.goalCam) this._setCam('goalline');
    if (c.subjects && c.subjects[0]) this.view.selected = this.view.players.find((p) => p.actor === c.subjects[0]);
    this.view.setTime(c.keyMoment);
    const focus = c.goalCam ? c.ballAt(c.keyMoment) : c.subjects && c.subjects[0] ? c.subjects[0].jointsAt(c.keyMoment).pelvis : c.ballAt(c.keyMoment);
    this.view.focusOn(focus, c.goalCam ? 6 : 2.5);
    this._seek(Math.max(0, c.keyMoment - 1.2));
    this.play(true);
  }

  _onKey(e) {
    if (!this.case || document.querySelector('.modal.open')) return;
    if (e.target && (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT')) return;
    const k = e.key, press = (id) => this.stage.press(id);
    if (k === ' ' && this.hud.classList.contains('sequence')) { e.preventDefault(); this.skip(); }
    else if (k === ' ') { e.preventDefault(); press('play'); this.play(); }
    else if (k === 'ArrowLeft' || k === ',') { e.preventDefault(); press(e.shiftKey ? 'left' : 'rew'); this.step(e.shiftKey ? -10 : -1); }
    else if (k === 'ArrowRight' || k === '.') { e.preventDefault(); press(e.shiftKey ? 'right' : 'fwd'); this.step(e.shiftKey ? 10 : 1); }
    else if (k === 'ArrowUp') { e.preventDefault(); press('up'); this._speed(1); }
    else if (k === 'ArrowDown') { e.preventDefault(); press('down'); this._speed(-1); }
    else if (k >= '1' && k <= '6') { press('cam'); this._setCam(CAMS[+k - 1].id); }
    else if (k === 'c' || k === 'C') { press('cam'); this._cycleCam(); }
    else if (k === 'o' || k === 'O') { press('line'); this._toggleLines(); }
    else if (k === 'z' || k === 'Z') { press('zoom'); this.view.resetView(); }
    else if (k === 'Home') this._seek(0);
    else if (this.locked) { if (k === 'Enter' || k === 'Escape') this.skip(); return; }
    else if (k === 'q' || k === 'Q') this.setMode('desk');
    else if (k === 'w' || k === 'W') this.setMode('focus');
    else if (k === 'e' || k === 'E') this.setMode('tape');
    else if (k === 'Enter') { if (this.mode === 'tape') this._submit(); else this.setMode('tape'); }
    else if (k === 'Escape') this.setMode(this.mode === 'tape' ? 'focus' : 'desk');
  }
}

// ---------- helpers ----------
function fmt(t) { return `${String(Math.floor(t)).padStart(2, '0')}.${String(Math.floor((t % 1) * 100)).padStart(2, '0')}`; }
function matchClock(minute, t) { const s = Math.floor(minute * 60 + 12 + t); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }

// "<b>x</b>" → nodes; card words get their card colour
export function richText(s) {
  const out = [];
  const re = /<b>(.*?)<\/b>|(Red Card|Yellow Card)/g;
  let i = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > i) out.push(document.createTextNode(s.slice(i, m.index)));
    const b = document.createElement('b');
    b.textContent = m[1] || m[2];
    if (m[2]) b.className = /Red/.test(m[2]) ? 'red' : 'yellow';
    out.push(b);
    i = m.index + m[0].length;
  }
  if (i < s.length) out.push(document.createTextNode(s.slice(i)));
  return out;
}

function termItems(res, truth, decision) {
  const items = [];
  for (const l of res.lines) {
    const t = l.text;
    if (t.startsWith('Restart:')) {
      if (l.ok) items.push({ head: 'FOUND', text: 'RESTART: ' + decision.restart.toUpperCase(), balls: 4 });
      else items.push({ head: 'MISSED', text: 'RESTART WAS ' + truth.restart.toUpperCase(), balls: 0, note: `YOU SENT ${String(decision.restart).toUpperCase()}` });
    } else if (t.startsWith('Decision time')) {
      const b = Math.round(l.pts / 10);
      items.push(l.pts >= 8 ? { head: 'BONUS', text: 'INCREDIBLE SPEED', balls: b } : l.pts >= 5 ? { head: 'BONUS', text: 'QUICK CALL', balls: b } : { head: 'SLOW', text: 'THE CROWD KEPT WAITING', balls: 0, color: '#ffd23f', note: t.toUpperCase() });
    } else if (t.startsWith('Missed:')) items.push({ head: 'MISSED', text: t.replace('Missed: ', '').replace(' — off the ball', ' (OFF THE BALL)').toUpperCase(), balls: 0 });
    else if (l.pts < 0) items.push({ head: 'WRONG', text: t.replace(' — false call', '').toUpperCase(), balls: -Math.round(-l.pts / 10) });
    else if (t.startsWith('No offence')) items.push({ head: 'FOUND', text: 'NO OFFENCE', balls: 5 });
    else items.push({ head: 'FOUND', text: t.replace(' — ', ': ').toUpperCase(), balls: Math.max(1, Math.round(l.pts / 10)), color: l.partial ? '#ffd23f' : null });
  }
  return items;
}

function reaction(truth, decision, seconds, score) {
  const reds = truth.infringements.filter((i) => i.card === 'Red').length;
  const gaveRed = decision.entries.some((e) => e.card === 'Red');
  if (reds && !gaveRed) return 'WHAT? No Red Card?? Really???';
  if (!reds && gaveRed && score < 85) return 'A Red Card for THAT?! Ridiculous!';
  if (decision.restart !== truth.restart) {
    const r = truth.restart, d = decision.restart;
    if (r === 'Penalty' && d !== 'Penalty') return 'That\'s a <b>stonewall penalty</b>! Are you blind?!';
    if (d === 'Penalty') return 'He went down like a sack of potatoes. <b>Never</b> a penalty!';
    if (r === 'Disallow goal') return 'That goal should <b>never</b> have stood!';
    if (d === 'Disallow goal') return 'You\'ve robbed us! That was a <b>perfectly good goal</b>!';
    return 'Shocking decision. The pundits will have a field day.';
  }
  if (score < 85) return 'Right call... but they missed something.';
  if (seconds > 80) return 'Correct. Took them <b>long enough</b>.';
  return ['Spot on from VAR.', 'Great call! The replays prove it.', 'Correct decision, and quick too.'][Math.floor(seconds) % 3];
}

function drawNote(x, bribe) {
  x.clearRect(0, 0, 256, 256);
  x.fillStyle = '#ffe873'; x.fillRect(6, 6, 244, 244);
  x.fillStyle = 'rgba(0,0,0,0.06)'; x.fillRect(6, 6, 244, 30);
  x.fillStyle = '#2a2a6a'; x.font = '700 46px Caveat, cursive'; x.textAlign = 'left';
  x.fillText('K.', 24, 76);
  x.font = '700 38px Caveat, cursive';
  const lines = bribe.wants === 'Goal stands' ? ['Let it stand.', '$600'] : ['No retake.', '$900'];
  lines.forEach((l, i) => x.fillText(l, 24, 136 + i * 50));
}

export { LABEL };
