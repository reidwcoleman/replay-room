// Game flow: title → day card → inbox → cases → verdicts → shift report → … → ending.
// One booth (3D office) stays on screen the whole time; each step changes what the monitors show,
// where the camera sits, and which paper is in front of you.
import * as THREE from 'three';
import { DAYS, ENDINGS, WAGE } from './story.js';
import { buildCase } from './cases.js';
import { Review, LABEL, richText } from './ui/review.js';
import { h } from './ui/dom.js';
import { drawTape } from './ui/stickers.js';
import { Stage } from './render/stage.js';
import { ReplayView } from './render/view.js';
import { LiveFeed } from './render/live.js';
import { Terminal } from './render/terminal.js';

const SAVE = 'replayroom.save.v1';

export function newState(seed = (Math.random() * 1e9) >>> 0) {
  return { seed, day: 1, caseIdx: 0, stage: 'inbox', wallet: 0, integrity: 100, flags: [], choices: {}, results: [], warnings: 0, bribes: 0, read: {}, ending: null };
}
export function loadState() { try { return JSON.parse(localStorage.getItem(SAVE)); } catch { return null; } }
function saveState(s) { try { localStorage.setItem(SAVE, JSON.stringify(s)); } catch {} }

// A 480x360 canvas the main CRT shows when no replay is loaded.
class IdleScreen {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 480; this.canvas.height = 360;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.draw = null;
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    const x = this.ctx;
    x.fillStyle = '#0b1210'; x.fillRect(0, 0, 480, 360);
    x.textBaseline = 'top';
    if (this.draw) this.draw(x, this.t);
    this.tex.needsUpdate = true;
  }
}
const txt = (x, s, X, Y, size = 16, col = '#7dff9a', align = 'center') => { x.font = `${size}px Silkscreen`; x.textAlign = align; x.fillStyle = col; x.fillText(s, X, Y); };
function eyeLogo(x, cx, cy, s, col) {
  x.strokeStyle = col; x.lineWidth = 3 * s;
  x.beginPath(); x.moveTo(cx - 40 * s, cy); x.quadraticCurveTo(cx, cy - 34 * s, cx + 40 * s, cy); x.quadraticCurveTo(cx, cy + 34 * s, cx - 40 * s, cy); x.stroke();
  x.beginPath(); x.arc(cx, cy, 13 * s, 0, 7); x.stroke();
  x.fillStyle = col; x.fillRect(cx - 4 * s, cy - 4 * s, 8 * s, 8 * s);
}

export class App {
  constructor(root, sound, o = {}) {
    this.root = root;
    this.sound = sound;
    this.fast = !!o.fast;
    this.canvas = h('canvas', 'stage');
    this.hud = h('div', 'hud');
    this.screen = h('div', 'screen');
    this.modal = h('div', 'modal');
    root.append(this.canvas, this.hud, this.screen, this.modal);
    this.idle = new IdleScreen();
    this.term = new Terminal();
    this.stage = new Stage(this.canvas, { mainTex: this.idle.tex, mainRows: 360, liveTex: null, liveRows: 192, termTex: this.term.tex, termRows: 240 });
    this.live = new LiveFeed(this.stage.renderer);
    this.stage.H.live.screen.material.uniforms.tScreen.value = this.live.output;
    this.stage.H.live.screen.material.uniforms.rows.value = this.live.rows;
    this.replay = new ReplayView(this.stage.renderer, 480, 360);
    const oc = document.createElement('canvas');
    oc.width = 480; oc.height = 360;
    this.osd = { canvas: oc, ctx: oc.getContext('2d'), tex: new THREE.CanvasTexture(oc) };
    this.osd.tex.minFilter = this.osd.tex.magFilter = THREE.NearestFilter;
    this.osd.tex.colorSpace = THREE.SRGBColorSpace;
    this.review = null;
    this.state = null;
    this.clock = 9 * 60;
    drawTape(this.stage.H.tapeTex.userData.ctx, { restart: null, offences: [] }, {});
    this.stage.H.tapeTex.needsUpdate = true;
    addEventListener('resize', () => this.stage.resize());
  }

  frame(dt) {
    if (this.review && this.mode === 'review') this.review.update(dt);
    else this.idle.update(dt);
    this.live.render(dt);
    this.term.update(dt);
    if (this.mode === 'review' && this.review && !this.review.locked) this.clock += dt * 2;
    this.stage.setClock(Math.floor(this.clock / 60) % 24, this.clock % 60);
    this.stage.render(dt);
  }

  _mainIdle(draw) {
    this.stage.setMainScreen(this.idle.tex, 360);
    this.stage.power('main', 1);
    this.idle.draw = draw;
  }
  _setScreen(cls, kids) {
    this.screen.className = 'screen ' + cls;
    this.screen.innerHTML = '';
    if (kids) this.screen.append(...[].concat(kids));
  }

  // ---------------- title ----------------
  title() {
    this.mode = 'title';
    this._closeModal();
    this._teardownReview();
    const saved = loadState();
    this.stage.goTo('title', 0);
    this.stage.resetTape();
    this.stage.setNote(null);
    this.live.setBanner({ top: 'COASTAL PREMIER LEAGUE', main: 'MATCHDAY LIVE' });
    this.live.mode = 'idle';
    this.live.setMatch(null);
    this.term.text(['REVIEW DESK OS 2.1', '', 'ALL SYSTEMS NOMINAL', 'AWAITING REVIEWER'], { cursor: true });
    this._mainIdle((x, t) => {
      eyeLogo(x, 240, 96, 1.3, '#7dff9a');
      txt(x, 'REPLAY', 240, 150, 32, '#c8ffd6');
      txt(x, 'ROOM', 240, 190, 32, '#c8ffd6');
      if (Math.floor(t * 2) % 2 === 0) txt(x, 'PRESS START', 240, 270, 16, '#7dff9a');
      txt(x, 'LUMEN MATCH INTEGRITY', 240, 320, 8, '#3f8f5a');
    });
    this._setScreen('title-screen', h('div', 'title-wrap', [
      h('div', 'title-tag', 'A video referee game'),
      h('h1', 'title', ['Replay', h('br'), 'Room']),
      h('p', 'title-sub', 'Five shifts in a review booth. Watch the tapes, find what the referee missed, stick your call on the cassette and get it right before the stadium turns on you.'),
      h('div', 'title-actions', [
        h('button', 'btn primary big', { onclick: () => { this.sound.unlock(); this.sound.key(); this.start(newState()); } }, saved && !saved.ending ? 'New career' : 'Start shift one'),
        ...(saved && !saved.ending ? [h('button', 'btn big', { onclick: () => { this.sound.unlock(); this.sound.key(); this.start(saved); } }, `Continue · ${DAYS[saved.day - 1].name}`)] : []),
      ]),
      h('p', 'title-foot', 'Mouse + keyboard. Headphones recommended.'),
    ]));
  }

  start(state) {
    this.state = state;
    saveState(state);
    if (state.ending) return this.ending(state.ending);
    if (state.stage === 'cases') return this.nextCase();
    this.dayCard();
  }

  // ---------------- day card + inbox ----------------
  dayCard() {
    const D = DAYS[this.state.day - 1];
    this.mode = 'card';
    this._teardownReview();
    this._setScreen('daycard', []);
    this.clock = 9 * 60;
    this.stage.goTo('focus', this.fast ? 0 : 1.2);
    this.live.setBanner({ top: 'TODAY', main: 'MATCHDAY ' + D.day });
    this.term.text([`SHIFT ${D.day} OF 5`, '', 'LOGGING IN...'], { cursor: true });
    this._mainIdle((x, t) => {
      txt(x, `SHIFT ${D.day} OF 5`, 240, 90, 16, '#3f8f5a');
      txt(x, D.name.toUpperCase(), 240, 140, 32, t % 0.6 < 0.45 || t > 1 ? '#c8ffd6' : '#0b1210');
      txt(x, D.title.toUpperCase(), 240, 200, 16, '#7dff9a');
      txt(x, `09:00`, 240, 280, 8, '#3f8f5a');
    });
    this.sound.ping();
    clearTimeout(this._cardT);
    this._cardT = setTimeout(() => this.inbox(), this.fast ? 0 : 2300);
  }

  emails() {
    const D = DAYS[this.state.day - 1];
    return D.emails.filter((e) => !e.requires || Object.entries(e.requires).every(([k, v]) => this.state.choices[k] === v));
  }

  inbox(openIdx = 0) {
    const fresh = this.mode !== 'inbox';
    this.mode = 'inbox';
    const s = this.state, D = DAYS[s.day - 1];
    const mails = this.emails();
    if (this.stage.view !== 'report') this.stage.goTo('report', this.fast ? 0 : 1.0);
    const key = (i) => `${s.day}:${i}`;
    s.read[key(openIdx)] = true;
    saveState(s);
    const m = mails[openIdx];
    const pending = mails.filter((e) => e.choice && !s.choices[e.choice.id]);
    const unread = mails.filter((_, i) => !s.read[key(i)]).length;
    this.term.idle({ title: 'SHIFT QUOTA', done: 0, quota: D.cases.length * 7, sub: unread ? `${unread} UNREAD` : 'READY', blinkSub: !!unread });
    this._mainIdle((x, t) => {
      txt(x, 'MAIL', 240, 70, 32, '#c8ffd6');
      txt(x, `${mails.length} MESSAGES`, 240, 130, 16, '#7dff9a');
      if (pending.length && Math.floor(t * 2) % 2 === 0) txt(x, 'REPLY NEEDED', 240, 190, 16, '#ffd23f');
      txt(x, `TODAY: ${D.cases.length} TAPES`, 240, 260, 16, '#3f8f5a');
    });
    this._setScreen('inbox-screen', h('div', 'inbox paper' + (fresh ? ' enter' : ''), [
      h('header', 'inbox-top', [h('b', '', `${D.name} · Shift ${D.day}`), h('span', '', 'Booth 4 mail')]),
      h('div', 'inbox-body', [
        h('ul', 'mail-list', mails.map((e, i) => h('li', (i === openIdx ? 'on ' : '') + (s.read[key(i)] ? '' : 'unread ') + e.tone, { onclick: () => { this.sound.paper(); this.inbox(i); } }, [
          h('span', 'av ' + e.tone, e.avatar), h('div', '', [h('b', '', e.from), h('span', '', e.subject)]),
        ]))),
        h('article', 'mail ' + m.tone, [
          h('header', '', [h('span', 'av big ' + m.tone, m.avatar), h('div', '', [h('h2', '', m.subject), h('small', '', `${m.from} · ${m.role}`)])]),
          ...m.body.map((p) => h('p', '', p)),
          ...(m.choice ? [s.choices[m.choice.id]
            ? h('p', 'chosen', s.choices[m.choice.id] === 'yes' ? `You replied: ${m.choice.yes.replace(/^Reply: /, '')}` : 'You ignored it.')
            : h('div', 'choice', [
              h('button', 'btn danger', { onclick: () => { s.choices[m.choice.id] = 'yes'; saveState(s); this.sound.key(); this.inbox(openIdx); } }, m.choice.yes),
              h('button', 'btn', { onclick: () => { s.choices[m.choice.id] = 'no'; saveState(s); this.sound.key(); this.inbox(openIdx); } }, m.choice.no),
            ])] : []),
        ]),
      ]),
      h('footer', 'inbox-foot', [
        h('span', 'muted', pending.length ? 'Answer the message waiting for a reply first.' : unread ? `${unread} unread` : `${D.cases.length} tapes in today’s queue`),
        h('button', 'btn primary big', { disabled: pending.length > 0, onclick: () => { s.stage = 'cases'; s.caseIdx = 0; s.shiftResults = []; saveState(s); this.sound.key(); this.nextCase(); } }, 'Start shift →'),
      ]),
    ]));
  }

  // ---------------- cases ----------------
  nextCase() {
    const s = this.state, D = DAYS[s.day - 1];
    this._closeModal();
    if (s.caseIdx >= D.cases.length) return this.shiftReport();
    this.mode = 'review';
    this._setScreen('review-screen', []);
    if (!this.review) this.review = new Review(this);
    const c = buildCase(s, s.day, s.caseIdx);
    this.current = c;
    const shiftRes = s.shiftResults || [];
    this.review.load(c, {
      state: s,
      caseNo: s.caseIdx + 1,
      caseCount: D.cases.length,
      shiftAvg: shiftRes.length ? Math.round(shiftRes.reduce((a, r) => a + r.score, 0) / shiftRes.length) : null,
      onSubmit: (r) => this.verdict(r),
      onMenu: () => this.menu(),
    });
    if (c.spec.tutorial && !this.fast) setTimeout(() => this.tutorial(), 2600);
  }

  verdict({ result, decision, flagged, seconds }) {
    const s = this.state, c = this.current;
    const lines = [...result.lines];
    let bonusNote = null;
    if (c.arbiter) {
      if (flagged && c.arbiter.wrong) { s.flags.push({ day: s.day, case: s.caseIdx, mode: c.arbiter.mode }); lines.push({ ok: true, text: 'Flag upheld: ARBITER was wrong. Logged to the audit trail.', pts: 0 }); }
      else if (flagged && !c.arbiter.wrong) { result.score = Math.max(0, result.score - 5); lines.push({ ok: false, text: 'Flag rejected: ARBITER was right', pts: -5 }); }
      else if (!flagged && c.arbiter.wrong && decision.restart === c.arbiter.restart) lines.push({ ok: false, text: 'You followed a wrong ARBITER suggestion', pts: 0 });
    }
    if (c.bribe && decision.restart === c.bribe.wants) {
      s.wallet += c.bribe.pay;
      s.integrity -= 35;
      s.bribes++;
      bonusNote = `K. transferred $${c.bribe.pay}.`;
    }
    const r = { day: s.day, idx: s.caseIdx, gen: c.gen, score: result.score, restartOk: result.restartOk, seconds: Math.round(seconds) };
    s.results.push(r);
    (s.shiftResults = s.shiftResults || []).push(r);
    s.caseIdx++;
    saveState(s);
    const D = DAYS[s.day - 1];
    const done = s.shiftResults.reduce((a, q) => a + Math.round(q.score / 10), 0);
    this.term.idle({ title: 'SHIFT QUOTA', done, quota: D.cases.length * 7, sub: s.caseIdx >= D.cases.length ? 'SHIFT COMPLETE' : 'INSERT NEXT TAPE', blinkSub: true });
    const grade = result.score >= 85 ? ['Correct call', 'good'] : result.score >= 55 ? ['Partly right', 'mid'] : ['Wrong call', 'bad'];
    const truth = c.truth;
    this.stage.goTo('report', this.fast ? 0 : 0.8);
    this._openModal(h('div', 'verdict paper ' + grade[1], [
      h('div', 'v-head', [h('small', '', `Review report · Tape ${c.day}-${String(c.idx + 1).padStart(2, '0')} · ${LABEL[c.gen]}`), h('div', 'v-score', [h('b', '', String(result.score)), h('small', '', '/ 100')])]),
      h('div', 'stamp ' + grade[1], grade[0]),
      h('div', 'v-truth', [
        h('small', '', 'The correct call'),
        h('b', '', truth.restart),
        h('div', 'v-offs', truth.infringements.length ? truth.infringements.map((i) => h('span', 'off', [i.card !== 'None' ? h('i', 'cardi ' + i.card.toLowerCase()) : '', `${i.type} · #${i.num} ${i.teamName}`])) : [h('span', 'off muted', 'No offence')]),
      ]),
      h('div', 'v-explain', c.explain.map((t) => h('p', '', t))),
      h('ul', 'v-lines', lines.map((l) => h('li', l.ok ? 'ok' : l.partial ? 'part' : 'no', [h('span', '', l.text), h('b', '', l.pts > 0 ? `+${l.pts}` : String(l.pts))]))),
      ...(bonusNote ? [h('p', 'v-bribe', bonusNote)] : []),
      h('div', 'v-actions', [
        h('button', 'btn', { onclick: () => { this._closeModal(); this.review.cueKeyMoment(); this._watchBar(); } }, 'Watch the key moment'),
        h('button', 'btn primary', { onclick: () => { this.sound.key(); this._closeModal(); this.nextCase(); } }, s.caseIdx >= D.cases.length ? 'Finish shift →' : 'Next tape →'),
      ]),
    ]), 'side');
    this.sound.paper();
  }

  _watchBar() {
    const bar = h('div', 'watchbar paper', [h('span', '', 'Replaying the key moment'), h('button', 'btn primary', { onclick: () => { bar.remove(); this.nextCase(); } }, 'Next tape →')]);
    this.screen.append(bar);
  }

  // ---------------- shift report ----------------
  shiftReport() {
    const s = this.state, D = DAYS[s.day - 1];
    this.mode = 'report';
    this._teardownReview();
    this._setScreen('report-screen', []);
    this.stage.goTo('report', this.fast ? 0 : 0.8);
    this.stage.resetTape();
    const res = s.shiftResults || [];
    const avg = res.length ? Math.round(res.reduce((a, r) => a + r.score, 0) / res.length) : 0;
    const bonus = Math.round(avg * 1.2);
    s.wallet += WAGE + bonus;
    let note;
    if (avg >= 85) note = 'Excellent shift. Exactly the standard we need. — M.H.';
    else if (avg >= 65) note = 'Solid. Tighten up the close ones. — M.H.';
    else if (avg >= 45) note = 'Below standard. Read the rulebook before tomorrow. — M.H.';
    else { s.warnings++; note = s.warnings >= 2 ? 'This is your second failed shift.' : 'Formal warning: one more shift like this and your contract ends. — M.H.'; }
    const fired = s.warnings >= 2;
    s.stage = 'inbox';
    s.caseIdx = 0;
    const lastDay = s.day >= DAYS.length;
    if (!fired && !lastDay) s.day++;
    saveState(s);
    this.term.text(['SHIFT COMPLETE', '', `ACCURACY ${avg}%`, avg >= 65 ? 'QUOTA MET' : 'QUOTA MISSED']);
    this._mainIdle((x) => { txt(x, 'END OF SHIFT', 240, 120, 32, '#c8ffd6'); txt(x, `${res.length} TAPES REVIEWED`, 240, 200, 16, '#7dff9a'); });
    this._openModal(h('div', 'report paper', [
      h('small', 'eyebrow', `${D.name} · Shift report`),
      h('h2', '', `Accuracy ${avg}%`),
      h('table', '', [
        h('thead', '', h('tr', '', [h('th', '', 'Tape'), h('th', '', 'Type'), h('th', '', 'Time'), h('th', '', 'Score')])),
        h('tbody', '', res.map((r, i) => h('tr', '', [h('td', '', String(i + 1)), h('td', '', LABEL[r.gen]), h('td', '', `${r.seconds}s`), h('td', r.score >= 85 ? 'g' : r.score >= 55 ? 'm' : 'b', String(r.score))]))),
      ]),
      h('div', 'pay', [h('span', '', `Base $${WAGE} + accuracy bonus $${bonus}`), h('b', '', `$${s.wallet.toLocaleString()}`)]),
      h('p', 'note', note),
      h('button', 'btn primary big', { onclick: () => {
        this.sound.key();
        this._closeModal();
        if (fired) return this.ending('fired');
        if (lastDay) return this.finalChoice();
        this.dayCard();
      } }, fired ? 'Read email' : lastDay ? 'End of probation →' : 'Clock out →'),
    ]), 'side');
  }

  // ---------------- finale ----------------
  finalChoice() {
    const s = this.state;
    this.mode = 'final';
    this._teardownReview();
    this.stage.goTo('desk', this.fast ? 0 : 1.2);
    this.term.text(['FRIDAY 18:04', '', 'ARBITER BOARD REVIEW', 'TOMORROW 09:00']);
    this._mainIdle((x, t) => { txt(x, 'CLOCK OUT?', 240, 150, 32, Math.floor(t * 2) % 2 ? '#c8ffd6' : '#7dff9a'); });
    const ev = s.flags.length;
    const opts = [
      { id: 'whistle', label: 'Send the audit log to Dee’s contact at the Coastal Herald', sub: `${ev} upheld flag${ev === 1 ? '' : 's'} in the log` },
      { id: 'company', label: 'Sign Lumen’s NDA and take the senior reviewer role', sub: 'Hale’s offer is on your desk' },
      ...(s.bribes ? [{ id: 'bought', label: 'Take K.’s final payment and disappear', sub: `You have taken ${s.bribes} payment${s.bribes > 1 ? 's' : ''}`, cls: 'danger' }] : []),
    ];
    this._setScreen('final-screen', h('div', 'final paper', [
      h('small', 'eyebrow', 'Friday, 18:04'),
      h('h1', '', 'Clock out?'),
      h('p', '', 'ARBITER goes in front of the league board tomorrow morning. Hale’s contract is on your desk. Dee’s last email is still open.'),
      h('div', 'final-opts', opts.map((o) => h('button', 'final-opt ' + (o.cls || ''), { onclick: () => {
        this.sound.stamp();
        this.ending(o.id === 'whistle' ? (ev >= 2 ? 'whistle' : 'weak') : o.id);
      } }, [h('b', '', o.label), h('small', '', o.sub)]))),
    ]));
  }

  ending(id) {
    const s = this.state, E = ENDINGS[id];
    s.ending = id;
    saveState(s);
    this.mode = 'ending';
    this._teardownReview();
    this._closeModal();
    this.stage.goTo('title', this.fast ? 0 : 1.6);
    const all = s.results;
    const acc = all.length ? Math.round(all.reduce((a, r) => a + r.score, 0) / all.length) : 0;
    this.term.text(['SESSION CLOSED', '', E.tag.toUpperCase()]);
    this._mainIdle((x, t) => { txt(x, 'THE END', 240, 140, 32, '#c8ffd6'); txt(x, E.title.toUpperCase(), 240, 200, 8, '#7dff9a'); });
    this._setScreen('ending-screen', h('div', 'ending paper', [
      h('small', 'eyebrow', `Ending · ${E.tag}`),
      h('h1', '', E.title),
      ...E.body.map((p) => h('p', '', p)),
      h('div', 'end-stats', [
        h('div', 'stat', [h('small', '', 'Tapes reviewed'), h('b', '', String(all.length))]),
        h('div', 'stat', [h('small', '', 'Career accuracy'), h('b', '', `${acc}%`)]),
        h('div', 'stat', [h('small', '', 'Upheld flags'), h('b', '', String(s.flags.length))]),
        h('div', 'stat', [h('small', '', 'Wallet'), h('b', '', `$${s.wallet.toLocaleString()}`)]),
      ]),
      h('button', 'btn primary big', { onclick: () => { try { localStorage.removeItem(SAVE); } catch {} this.title(); } }, 'Back to title'),
    ]));
  }

  // ---------------- menu / tutorial / modal ----------------
  menu() {
    this._openModal(h('div', 'menu paper', [
      h('h2', '', 'Paused'),
      h('label', 'vol', ['Volume', (() => { const r = h('input', '', { type: 'range', min: 0, max: 1, step: 0.05 }); r.value = this.sound.vol; r.oninput = () => this.sound.setVolume(+r.value); return r; })()]),
      h('div', 'keys', [
        ['Space', 'Play / pause'], [', .  or ← →', 'Step a frame (Shift = 10)'], ['↑ ↓', 'Playback speed'], ['1–6 / C', 'Cameras'], ['Scroll / drag', 'Zoom / pan the replay'], ['Click player', 'Select (their shirt is marked in Match)'], ['O', 'Offside line tool'], ['Z', 'Reset zoom'], ['Q W E', 'Desk / monitor / tape'], ['Enter', 'Send the tape'],
      ].map(([k, v]) => h('div', '', [h('kbd', '', k), h('span', '', v)]))),
      h('div', 'v-actions', [
        h('button', 'btn', { onclick: () => this.title() }, 'Save & quit to title'),
        h('button', 'btn primary', { onclick: () => this._closeModal() }, 'Resume'),
      ]),
    ]), 'center');
  }

  // Speech-bubble walkthrough pinned to things on the desk.
  tutorial() {
    const S = this.stage, H = S.H, R = this.review;
    if (!R) return;
    const steps = [
      ['focus', () => S.toPage(H.main.group, [0, 0.27, 0]), 'This is the replay. Scroll to <b>zoom</b>, drag to <b>pan</b>, click a player to select them.'],
      ['focus', () => S.toPage(H.kb, [0, 0.03, -0.05]), 'Use the deck: <b>play</b>, step <b>frame by frame</b>, change speed and camera. Drag the slider to scrub.'],
      ['desk', () => S.toPage(H.live.group, [0, 0.2, 0]), 'The stadium is live. The longer you take, the <b>angrier</b> they get.'],
      ['desk', () => S.toPage(H.book, [0, 0.03, 0]), 'The <b>rulebook</b>. New directives arrive during the week. Read them.'],
      ['tape', () => S.toPage(H.tape, [0, 0.03, -0.04]), 'Make the call by sticking <b>stickers</b> on the tape: offences, the player, cards and the restart. Then send it.'],
    ];
    let i = 0;
    const tip = h('div', 'bubble coach');
    this.root.append(tip);
    const place = () => {
      if (!tip.isConnected) return;
      const p = steps[Math.min(i, steps.length - 1)][1]();
      const w = tip.offsetWidth, ht = tip.offsetHeight;
      const x = Math.max(12, Math.min(innerWidth - w - 12, p.x - w / 2));
      tip.style.left = `${x}px`; tip.style.top = `${Math.max(12, p.y - ht - 16)}px`;
      tip.style.setProperty('--ax', `${Math.max(18, Math.min(w - 18, p.x - x))}px`);
      requestAnimationFrame(place);
    };
    const show = () => {
      if (i >= steps.length || this.mode !== 'review' || R.locked) { tip.remove(); R.setMode('focus', true); return; }
      const [mode, , text] = steps[i];
      if (R.mode !== mode) R.setMode(mode, true);
      tip.innerHTML = '';
      tip.append(h('p', '', richText(text)), h('div', 'coach-foot', [h('small', '', `${i + 1}/${steps.length}`), h('button', 'btn primary small', { onclick: () => { i++; this.sound.key(); show(); } }, i === steps.length - 1 ? 'Got it' : 'Next')]));
    };
    show();
    place();
  }

  _openModal(content, kind = 'center') {
    this.modal.innerHTML = '';
    this.modal.className = 'modal open ' + kind;
    this.modal.append(content);
  }
  _closeModal() { this.modal.className = 'modal'; this.modal.innerHTML = ''; }
  _teardownReview() { if (this.review) { this.review.destroy(); this.review = null; } document.querySelectorAll('.coach').forEach((e) => e.remove()); }
}
