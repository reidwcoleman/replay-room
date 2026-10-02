// The review desk: monitor + transport + tools, case file, log / rulebook / decision panel.
import { ReplayView, CAMS } from '../render/view.js';
import { FPS } from '../sim/clip.js';
import { rulebookFor } from '../sim/rules.js';
import { judge } from '../sim/judge.js';
import { TYPES_BY_DAY, RESTARTS_BY_DAY } from '../cases.js';
import { h, hex, esc } from './dom.js';

const SPEEDS = [0.1, 0.25, 0.5, 1];

export class Review {
  constructor(root, sound) {
    this.sound = sound;
    this.root = root;
    root.innerHTML = '';
    root.append(
      this.top = h('header', 'topbar'),
      h('main', 'desk', [
        this.file = h('aside', 'casefile'),
        h('section', 'monitor-col', [
          this.monitor = h('div', 'monitor', [
            this.canvas = h('canvas', 'view'),
            this.overlay = h('div', 'overlay'),
          ]),
          this.transport = h('div', 'transport'),
          this.tools = h('div', 'tools'),
        ]),
        this.panel = h('aside', 'panel'),
      ]),
    );
    this.view = new ReplayView(this.canvas);
    this.view.onPick = (a) => this._onPick(a);
    this.view.onLines = () => this._drawLineReadout();
    this.playing = false;
    this.speed = 0.5;
    this.tab = 'log';
    this.case = null;
    this.locked = false;
    this._keys = (e) => this._onKey(e);
    addEventListener('keydown', this._keys);
  }

  destroy() { removeEventListener('keydown', this._keys); }

  // ---------- load a case ----------
  load(c, ctx) {
    this.case = c;
    this.ctx = ctx; // { state, onSubmit, caseNo, caseCount }
    this.decision = { entries: [], restart: null };
    this.flagged = false;
    this.caseTime = 0;
    this.locked = false;
    this.playing = false;
    this.view.load(c.clip);
    this.view.setCam(c.clip.goalCam ? 'broadcast' : 'broadcast');
    this.view.lineMode = false;
    this.t = 0;
    this.speed = 0.5;
    this.tab = c.idx === 0 && c.day === 1 ? 'log' : this.tab === 'decision' ? 'log' : this.tab;
    this._renderTop();
    this._renderFile();
    this._renderTransport();
    this._renderTools();
    this._renderPanel();
    this._seek(0);
    setTimeout(() => this.play(true), 400);
  }

  // ---------- frame ----------
  update(dt) {
    if (!this.case) return;
    if (!this.locked) this.caseTime += dt;
    if (this.playing) {
      const prev = this.t;
      let t = this.t + dt * this.speed;
      if (t >= this.case.clip.duration) { t = this.case.clip.duration; this.playing = false; this._renderPlay(); }
      this._cues(prev, t);
      this._seek(t, true);
    }
    const pressure = Math.min(1, this.caseTime / 100);
    this.view.excite = 0.2 + pressure * 0.8;
    this.sound.crowdLevel(0.15 + pressure * 0.7);
    this.view.render(dt);
    this._tickFile(pressure);
    this._drawLabels();
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

  _seek(t, fromPlay = false) {
    this.t = Math.max(0, Math.min(this.case.clip.duration, t));
    this.view.setTime(this.t);
    const d = this.case.clip.duration;
    this.head.style.left = `${(this.t / d) * 100}%`;
    this.fill.style.width = `${(this.t / d) * 100}%`;
    this.code.textContent = `${fmt(this.t)} / ${fmt(d)}  ·  F${String(Math.round(this.t * FPS)).padStart(3, '0')}`;
    this.bugClock.textContent = matchClock(this.case.clip.context.minute, this.t);
  }

  play(force) {
    if (force === true) this.playing = true;
    else this.playing = !this.playing;
    if (this.playing && this.t >= this.case.clip.duration - 0.01) this._seek(0);
    this._renderPlay();
  }
  step(frames) { this.playing = false; this._renderPlay(); this._seek(Math.round(this.t * FPS + frames) / FPS); }

  // ---------- top bar ----------
  _renderTop() {
    const s = this.ctx.state;
    this.top.innerHTML = '';
    this.top.append(
      h('div', 'brand', [h('span', 'logo-dot'), h('b', '', 'LUMEN'), h('span', 'sub', 'Replay Room · Booth 4')]),
      h('div', 'crumbs', `Day ${this.case.day} · Case ${this.ctx.caseNo} of ${this.ctx.caseCount}`),
      h('div', 'stats', [
        stat('Shift avg', this.ctx.shiftAvg != null ? `${this.ctx.shiftAvg}` : '—'),
        stat('Wallet', `$${s.wallet.toLocaleString()}`),
        ...(s.day >= 4 ? [stat('Flags', `${s.flags.length}`)] : []),
      ]),
      h('button', 'ghost small', { onclick: () => this.ctx.onMenu() }, 'Menu'),
    );
  }

  // ---------- case file ----------
  _renderFile() {
    const c = this.case, k = c.clip.context, A = k.attack, D = k.defend;
    this.file.innerHTML = '';
    const arb = c.arbiter;
    this.file.append(
      h('div', 'eyebrow', `Case ${String(c.day)}-${String(c.idx + 1).padStart(2, '0')} · ${labelOf(c.gen)}`),
      h('div', 'matchup', [
        teamRow(A, k.score[0], 'Attacking'),
        teamRow(D, k.score[1], 'Defending'),
        h('div', 'minute', `${k.minute}' · Coastal Premier League`),
      ]),
      h('div', 'callbox', [h('small', '', 'On-field decision'), h('b', '', k.onField)]),
      h('div', 'question', [h('small', '', 'Review'), h('p', '', k.question)]),
      ...(arb ? [this.arbEl = h('div', 'arbiter', [
        h('div', 'arb-head', [h('span', 'arb-dot'), h('b', '', 'ARBITER'), h('span', 'conf', `${arb.conf}%`)]),
        h('p', '', [h('span', 'muted', 'Suggests '), h('b', '', arb.restart), arb.entries.length ? h('span', '', ` · ${arb.entries.map((e) => `${e.type} #${e.num}`).join(', ')}`) : h('span', 'muted', ' · no offence')]),
        h('div', 'arb-actions', [
          h('button', 'small', { onclick: () => this._applyArbiter() }, 'Use suggestion'),
          this.flagBtn = h('button', 'small ghost danger', { onclick: () => this._flag() }, 'Flag as wrong'),
        ]),
      ])] : []),
      ...(c.bribe ? [h('div', 'sticky', [h('b', '', 'K.'), h('p', '', c.bribe.wants === 'Goal stands' ? 'Let it stand. $600.' : 'No retake. $900.')])] : []),
      h('div', 'clockbox', [h('small', '', 'Time on case'), this.caseClock = h('b', 'mono', '0:00'), h('div', 'pressure', [this.pBar = h('i')]), this.pLabel = h('small', 'muted', 'Crowd is patient')]),
    );
  }

  _tickFile(p) {
    const s = Math.floor(this.caseTime);
    this.caseClock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.pBar.style.width = `${p * 100}%`;
    this.pBar.className = p > 0.8 ? 'hot' : p > 0.5 ? 'warm' : '';
    this.pLabel.textContent = p > 0.9 ? 'The stadium is booing' : p > 0.6 ? 'Crowd getting restless' : p > 0.3 ? 'Waiting on VAR…' : 'Crowd is patient';
  }

  _flag() {
    if (this.locked) return;
    this.flagged = !this.flagged;
    this.flagBtn.classList.toggle('on', this.flagged);
    this.flagBtn.textContent = this.flagged ? 'Flagged ✓' : 'Flag as wrong';
    this.sound.click();
  }
  _applyArbiter() {
    if (this.locked) return;
    const a = this.case.arbiter;
    this.decision.restart = a.restart;
    this.decision.entries = a.entries.map((e) => ({ ...e }));
    this.tab = 'decision';
    this._renderPanel();
    this.sound.click();
  }

  // ---------- monitor overlay ----------
  _buildOverlay() {
    const k = this.case.clip.context;
    this.overlay.innerHTML = '';
    this.overlay.append(
      h('div', 'rec', [h('span', 'dot'), 'VAR REVIEW']),
      this.camLabel = h('div', 'camlabel', ''),
      h('div', 'bug', [
        h('span', 'tm', [h('i', '', { style: `background:${hex(k.attack.shirt)}` }), k.attack.short]),
        h('span', 'sc', `${k.score[0]}–${k.score[1]}`),
        h('span', 'tm', [k.defend.short, h('i', '', { style: `background:${hex(k.defend.shirt)}` })]),
        this.bugClock = h('span', 'clk', ''),
      ]),
      this.readout = h('div', 'readout hidden'),
      this.labels = h('div', 'labels'),
      this.lineHint = h('div', 'linehint hidden', 'LINE TOOL · click a player to drop their offside line · O to exit'),
    );
  }

  _drawLabels() {
    const v = this.view;
    const items = [];
    if (v.selected) items.push({ a: v.selected.actor, cls: 'sel' });
    for (const l of v.lines) if (l.pm !== v.selected) items.push({ a: l.pm.actor, cls: l.pm.actor.team === 'A' ? 'att' : 'def' });
    if (v.hover && v.hover !== v.selected && !v.lines.some((l) => l.pm === v.hover)) items.push({ a: v.hover.actor, cls: 'hov' });
    const key = items.map((i) => i.a.id + i.cls).join();
    if (this._lblKey !== key) {
      this._lblKey = key;
      this.labels.innerHTML = '';
      this._lblEls = items.map((i) => {
        const e = h('div', 'plabel ' + i.cls, `#${i.a.num} ${i.a.team === 'A' ? this.case.clip.attacking.short : this.case.clip.defending.short}`);
        this.labels.append(e);
        return e;
      });
    }
    items.forEach((i, n) => {
      const p = v.screenOf(i.a);
      const e = this._lblEls[n];
      e.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      e.style.display = p.visible ? '' : 'none';
    });
    this.camLabel.textContent = (CAMS.find((c) => c.id === v.cam) || {}).label + (v.zoom > 1.05 ? ` · ${v.zoom.toFixed(1)}×` : '');
  }

  _drawLineReadout() {
    if (!this.readout) return;
    const info = this.view.lineInfo();
    if (!info.length) { this.readout.classList.add('hidden'); return; }
    this.readout.classList.remove('hidden');
    const att = info.find((i) => i.actor.team === 'A'), def = info.find((i) => i.actor.team === 'D');
    let txt = info.map((i) => `<span class="${i.actor.team === 'A' ? 'att' : 'def'}">#${i.actor.num}</span>`).join(' vs ');
    if (att && def) {
      const d = att.x - def.x;
      const cmv = Math.round(Math.abs(d) * 100);
      txt += d > 0.005 ? ` · attacker <b>${cmv} cm</b> beyond` : d < -0.005 ? ` · attacker <b>${cmv} cm</b> behind` : ' · <b>level</b>';
    }
    txt += ` · at ${fmt(this.t)}`;
    this.readout.innerHTML = txt;
  }

  // ---------- transport ----------
  _renderTransport() {
    const c = this.case.clip, d = c.duration;
    this._buildOverlay();
    this.transport.innerHTML = '';
    const ticks = c.log.map((e) => h('i', 'tick ' + e.kind, { style: `left:${(e.t / d) * 100}%`, title: `${fmt(e.t)} ${e.text}` }));
    const track = h('div', 'track', [this.fill = h('div', 'fill'), ...ticks, this.head = h('div', 'head')]);
    const scrub = (e) => {
      const r = track.getBoundingClientRect();
      this._seek(((e.clientX - r.left) / r.width) * d);
    };
    track.addEventListener('pointerdown', (e) => {
      this.playing = false; this._renderPlay();
      track.setPointerCapture(e.pointerId);
      scrub(e);
      const mv = (ev) => scrub(ev);
      const up = () => { track.removeEventListener('pointermove', mv); track.removeEventListener('pointerup', up); };
      track.addEventListener('pointermove', mv);
      track.addEventListener('pointerup', up);
    });
    this.transport.append(
      h('div', 'buttons', [
        iconBtn('restart', 'Restart', () => { this._seek(0); }),
        iconBtn('back10', '−10 frames (Shift+←)', () => this.step(-10)),
        iconBtn('back1', '−1 frame (←)', () => this.step(-1)),
        this.playBtn = iconBtn('play', 'Play / pause (Space)', () => { this.play(); this.sound.click(); }, 'primary'),
        iconBtn('fwd1', '+1 frame (→)', () => this.step(1)),
        iconBtn('fwd10', '+10 frames (Shift+→)', () => this.step(10)),
      ]),
      this.speedEl = h('div', 'speeds', SPEEDS.map((s) => h('button', 'seg' + (s === this.speed ? ' on' : ''), { onclick: () => { this.speed = s; this._renderSpeeds(); } }, s === 1 ? '1×' : `${s}×`))),
      track,
      this.code = h('div', 'code mono', ''),
    );
    this._renderPlay();
  }
  _renderSpeeds() { [...this.speedEl.children].forEach((b, i) => b.classList.toggle('on', SPEEDS[i] === this.speed)); }
  _renderPlay() { if (this.playBtn) this.playBtn.innerHTML = icon(this.playing ? 'pause' : 'play'); }

  // ---------- tools ----------
  _renderTools() {
    this.tools.innerHTML = '';
    const day = this.case.day;
    this.camBtns = CAMS.map((c, i) => h('button', 'seg' + (this.view.cam === c.id ? ' on' : ''), { onclick: () => this._setCam(c.id), title: `Camera ${i + 1}` }, [h('kbd', '', String(i + 1)), c.label]));
    this.tools.append(
      h('div', 'cams', this.camBtns),
      h('div', 'tool-btns', [
        ...(day >= 3 ? [this.lineBtn = h('button', 'tool', { onclick: () => this._toggleLines(), title: 'Offside lines (O)' }, [h('kbd', '', 'O'), 'Line tool']),
          h('button', 'tool ghost', { onclick: () => this.view.clearLines(), title: 'Clear lines' }, 'Clear')] : []),
        h('button', 'tool ghost', { onclick: () => { this.view.zoom = this.view.cam === 'goalline' ? 2 : 1; this.view.pan.set(0, 0); }, title: 'Reset zoom (Z)' }, [h('kbd', '', 'Z'), 'Reset view']),
      ]),
    );
  }
  _setCam(id) {
    this.view.setCam(id);
    this.camBtns.forEach((b, i) => b.classList.toggle('on', CAMS[i].id === id));
    this.sound.click();
  }
  _toggleLines() {
    this.view.lineMode = !this.view.lineMode;
    this.lineBtn.classList.toggle('on', this.view.lineMode);
    this.lineHint.classList.toggle('hidden', !this.view.lineMode);
    this.canvas.style.cursor = this.view.lineMode ? 'crosshair' : 'grab';
  }

  // ---------- right panel ----------
  _renderPanel() {
    this.panel.innerHTML = '';
    const tabs = [['log', 'Match log'], ['rules', 'Rulebook'], ['decision', 'Decision']];
    const newRules = rulebookFor(this.case.day).some((r) => r.isNew);
    this.panel.append(
      h('div', 'tabs', tabs.map(([id, label]) => h('button', 'tab' + (this.tab === id ? ' on' : ''), { onclick: () => { this.tab = id; this._renderPanel(); this.sound.click(); } }, [label, id === 'rules' && newRules ? h('span', 'badge', 'NEW') : id === 'decision' && (this.decision.entries.length || this.decision.restart) ? h('span', 'dotb') : '']))),
      this.body = h('div', 'panel-body'),
    );
    if (this.tab === 'log') this._renderLog();
    if (this.tab === 'rules') this._renderRules();
    if (this.tab === 'decision') this._renderDecision();
  }

  _renderLog() {
    const c = this.case.clip;
    this.body.append(
      h('p', 'hint', 'Click an entry to jump to it. The log only records what the stadium systems saw. It never tells you whether something was an offence.'),
      h('ul', 'log', c.log.map((e) => h('li', e.kind, { onclick: () => { this.playing = false; this._renderPlay(); this._seek(e.t); this.sound.click(); } }, [h('span', 'mono t', fmt(e.t)), h('span', 'k'), h('span', 'x', e.text)]))),
    );
  }

  _renderRules() {
    for (const r of rulebookFor(this.case.day)) {
      this.body.append(h('section', 'rule' + (r.isNew ? ' new' : ''), [
        h('h3', '', [r.title, r.isNew ? h('span', 'badge', 'NEW') : '']),
        ...(r.directive ? [h('p', 'directive', r.directive)] : []),
        ...r.body.map((p) => h('p', '', p)),
      ]));
    }
  }

  _renderDecision() {
    const c = this.case, clip = c.clip, day = c.day, d = this.decision;
    const types = TYPES_BY_DAY(day), restarts = RESTARTS_BY_DAY(day);
    const numsOf = (team) => clip.actors.filter((a) => a.team === team).map((a) => a.num).sort((x, y) => x - y);
    const short = (team) => (team === 'A' ? clip.attacking.short : clip.defending.short);
    const sel = this.view.selected && this.view.selected.actor;
    const rows = d.entries.map((e, i) => h('div', 'entry', [
      h('div', 'row', [
        select(['A', 'D'].map((t) => [t, short(t)]), e.team, (v) => { e.team = v; if (!numsOf(v).includes(+e.num)) e.num = numsOf(v)[0]; this._renderPanel(); }),
        select(numsOf(e.team).map((n) => [n, `#${n}`]), e.num, (v) => { e.num = +v; }),
        select(types.map((t) => [t, t]), e.type, (v) => { e.type = v; }),
        h('button', 'x', { onclick: () => { d.entries.splice(i, 1); this._renderPanel(); }, title: 'Remove' }, '×'),
      ]),
      h('div', 'cards', ['None', 'Yellow', 'Red'].map((k) => h('button', 'card-btn ' + k.toLowerCase() + (e.card === k ? ' on' : ''), { onclick: () => { e.card = k; this._renderPanel(); } }, [k !== 'None' ? h('i') : '', k === 'None' ? 'No card' : k]))),
    ]));
    this.body.append(
      h('h4', '', 'Offences'),
      ...(rows.length ? rows : [h('p', 'empty', 'No offences logged. If you saw nothing wrong, leave this empty.')]),
      h('div', 'add-row', [
        h('button', 'ghost', { onclick: () => { d.entries.push({ team: 'D', num: numsOf('D')[1] ?? 1, type: types[0], card: 'None' }); this._renderPanel(); } }, '+ Add offence'),
        sel ? h('button', 'accent-ghost', { onclick: () => { d.entries.push({ team: sel.team, num: sel.num, type: types[0], card: 'None' }); this._renderPanel(); } }, `+ Offence by #${sel.num} ${short(sel.team)}`) : h('span', 'hint', 'Tip: click a player in the replay to add them quickly.'),
      ]),
      h('h4', '', 'Restart'),
      h('div', 'restarts', restarts.map((r) => h('button', 'restart' + (d.restart === r ? ' on' : ''), { onclick: () => { d.restart = r; this._renderPanel(); this.sound.click(); } }, r))),
      h('button', 'primary big confirm', { disabled: !d.restart || this.locked, onclick: () => this._submit() }, 'Confirm decision'),
    );
  }

  _onPick(a) {
    if (a) this.sound.click();
    if (this.tab === 'decision') this._renderPanel();
  }

  _submit() {
    if (this.locked || !this.decision.restart) return;
    this.locked = true;
    this.playing = false;
    this._renderPlay();
    this.sound.stamp();
    const clip = this.case.clip;
    const named = { ...this.decision, entries: this.decision.entries.map((e) => ({ ...e, teamName: e.team === 'A' ? clip.attacking.short : clip.defending.short })) };
    const res = judge(this.case.truth, named, this.caseTime);
    this.ctx.onSubmit({ result: res, decision: this.decision, flagged: this.flagged, seconds: this.caseTime });
  }

  // jump to the key moment after the verdict
  cueKeyMoment() {
    const c = this.case.clip;
    this.playing = false;
    this._seek(Math.max(0, c.keyMoment - 1.2));
    this.speed = 0.25; this._renderSpeeds();
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
    const k = e.key;
    if (k === ' ') { e.preventDefault(); this.play(); }
    else if (k === 'ArrowLeft' || k === ',') { e.preventDefault(); this.step(e.shiftKey ? -10 : -1); }
    else if (k === 'ArrowRight' || k === '.') { e.preventDefault(); this.step(e.shiftKey ? 10 : 1); }
    else if (k >= '1' && k <= '6') this._setCam(CAMS[+k - 1].id);
    else if ((k === 'o' || k === 'O') && this.case.day >= 3) this._toggleLines();
    else if (k === 'z' || k === 'Z') { this.view.zoom = this.view.cam === 'goalline' ? 2 : 1; this.view.pan.set(0, 0); }
    else if (k === 'Home') this._seek(0);
  }
}

// ---------- helpers ----------
function fmt(t) { return `${String(Math.floor(t)).padStart(2, '0')}.${String(Math.floor((t % 1) * 100)).padStart(2, '0')}`; }
function matchClock(minute, t) { const s = Math.floor(minute * 60 + 12 + t); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function stat(label, value) { return h('div', 'stat', [h('small', '', label), h('b', 'mono', value)]); }
function teamRow(t, score, role) {
  return h('div', 'team', [h('i', 'kit', { style: `background:${hex(t.shirt)};box-shadow: inset -6px 0 0 ${hex(t.shorts)}` }), h('div', 'tn', [h('b', '', t.name), h('small', '', role)]), h('span', 'score mono', String(score))]);
}
function labelOf(gen) { return { tackle: 'Challenge', dive: 'Penalty appeal', handball: 'Handball', offside: 'Offside', goalLine: 'Goal-line', penalty: 'Penalty kick' }[gen]; }
function select(opts, value, on) {
  const s = h('select', '', opts.map(([v, l]) => { const o = h('option', '', l); o.value = v; if (String(v) === String(value)) o.selected = true; return o; }));
  s.addEventListener('change', () => on(s.value));
  return s;
}
const PATHS = {
  play: 'M7 4.5v15l12-7.5z', pause: 'M6 4h4v16H6zM14 4h4v16h-4z', restart: 'M5 4h2v16H5zM20 4.5v15L9 12z',
  back1: 'M17 4.5v15L6 12z', fwd1: 'M7 4.5v15L18 12z', back10: 'M12 4.5v15L3 12zM21 4.5v15L12 12z', fwd10: 'M3 4.5v15l9-7.5zM12 4.5v15l9-7.5z',
};
function icon(name) { return `<svg viewBox="0 0 24 24" width="18" height="18"><path d="${PATHS[name]}" fill="currentColor"/></svg>`; }
function iconBtn(name, title, on, cls = '') { const b = h('button', 'icon ' + cls, { onclick: on, title }); b.innerHTML = icon(name); return b; }
