// Game flow: title → day card → inbox → cases → verdicts → shift report → … → ending.
import { DAYS, ENDINGS, WAGE } from './story.js';
import { buildCase } from './cases.js';
import { Review } from './ui/review.js';
import { h } from './ui/dom.js';

const SAVE = 'replayroom.save.v1';

export function newState(seed = (Math.random() * 1e9) >>> 0) {
  return { seed, day: 1, caseIdx: 0, stage: 'inbox', wallet: 0, integrity: 100, flags: [], choices: {}, results: [], warnings: 0, bribes: 0, read: {}, ending: null };
}
export function loadState() { try { return JSON.parse(localStorage.getItem(SAVE)); } catch { return null; } }
function saveState(s) { try { localStorage.setItem(SAVE, JSON.stringify(s)); } catch {} }

export class App {
  constructor(root, sound) {
    this.root = root;
    this.sound = sound;
    this.screen = h('div', 'screen');
    this.modal = h('div', 'modal');
    root.append(this.screen, this.modal);
    this.review = null;
    this.state = null;
  }

  frame(dt) { if (this.review && this.mode === 'review') this.review.update(dt); }

  // ---------------- title ----------------
  title() {
    this.mode = 'title';
    this._closeModal();
    this._teardownReview();
    const saved = loadState();
    this.screen.className = 'screen title-screen';
    this.screen.innerHTML = '';
    this.screen.append(
      h('div', 'title-wrap', [
        h('div', 'title-eyebrow', [h('span', 'logo-dot'), 'Lumen Match Integrity · Remote Review']),
        h('h1', 'title', ['Replay', h('br'), 'Room']),
        h('p', 'title-sub', 'Five shifts in a video-review booth. Find what the referee missed, get the call right before the stadium turns on you, and decide who you really work for.'),
        h('div', 'title-actions', [
          h('button', 'primary big', { onclick: () => { this.sound.unlock(); this.start(newState()); } }, saved && !saved.ending ? 'New career' : 'Start shift one'),
          ...(saved && !saved.ending ? [h('button', 'ghost big', { onclick: () => { this.sound.unlock(); this.start(saved); } }, `Continue · Day ${saved.day}`)] : []),
        ]),
        h('p', 'title-foot', 'Best with a mouse. Space play/pause · , . frame step · 1–6 cameras · scroll to zoom'),
      ]),
      h('div', 'title-art', [titleArt()]),
    );
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
    this.screen.className = 'screen daycard';
    this.screen.innerHTML = '';
    this.screen.append(h('div', 'card-wrap', [
      h('small', '', `Shift ${D.day} of 5`),
      h('h1', '', D.name),
      h('p', '', D.title),
    ]));
    this.sound.ping();
    setTimeout(() => this.inbox(), 1900);
  }

  emails() {
    const D = DAYS[this.state.day - 1];
    return D.emails.filter((e) => !e.requires || Object.entries(e.requires).every(([k, v]) => this.state.choices[k] === v));
  }

  inbox(openIdx = 0) {
    this.mode = 'inbox';
    const s = this.state, D = DAYS[s.day - 1];
    const mails = this.emails();
    this.screen.className = 'screen inbox-screen';
    this.screen.innerHTML = '';
    const key = (i) => `${s.day}:${i}`;
    s.read[key(openIdx)] = true;
    saveState(s);
    const m = mails[openIdx];
    const pending = mails.filter((e) => e.choice && !s.choices[e.choice.id]);
    const unread = mails.filter((_, i) => !s.read[key(i)]).length;
    this.screen.append(
      h('div', 'inbox', [
        h('header', 'inbox-top', [h('div', 'brand', [h('span', 'logo-dot'), h('b', '', 'LUMEN'), h('span', 'sub', 'Booth 4 · Mail')]), h('div', 'crumbs', `${D.name} · Shift ${D.day}`), h('div', 'stats', [h('div', 'stat', [h('small', '', 'Wallet'), h('b', 'mono', `$${s.wallet.toLocaleString()}`)])])]),
        h('div', 'inbox-body', [
          h('ul', 'mail-list', mails.map((e, i) => h('li', (i === openIdx ? 'on ' : '') + (s.read[key(i)] ? '' : 'unread ') + e.tone, { onclick: () => { this.sound.click(); this.inbox(i); } }, [
            h('span', 'av ' + e.tone, e.avatar), h('div', '', [h('b', '', e.from), h('span', '', e.subject)]),
          ]))),
          h('article', 'mail ' + m.tone, [
            h('header', '', [h('span', 'av big ' + m.tone, m.avatar), h('div', '', [h('h2', '', m.subject), h('small', '', `${m.from} · ${m.role}`)])]),
            ...m.body.map((p) => h('p', '', p)),
            ...(m.choice ? [s.choices[m.choice.id]
              ? h('p', 'chosen', s.choices[m.choice.id] === 'yes' ? `You replied: ${m.choice.yes.replace(/^Reply: /, '')}` : 'You ignored it.')
              : h('div', 'choice', [
                h('button', 'ghost danger', { onclick: () => { s.choices[m.choice.id] = 'yes'; saveState(s); this.sound.click(); this.inbox(openIdx); } }, m.choice.yes),
                h('button', 'ghost', { onclick: () => { s.choices[m.choice.id] = 'no'; saveState(s); this.sound.click(); this.inbox(openIdx); } }, m.choice.no),
              ])] : []),
          ]),
        ]),
        h('footer', 'inbox-foot', [
          h('span', 'muted', pending.length ? 'Answer the message waiting for a reply first.' : unread ? `${unread} unread` : `${D.cases.length} cases in today’s queue`),
          h('button', 'primary big', { disabled: pending.length > 0, onclick: () => { s.stage = 'cases'; s.caseIdx = 0; s.shiftResults = []; saveState(s); this.nextCase(); } }, 'Start shift →'),
        ]),
      ]),
    );
  }

  // ---------------- cases ----------------
  nextCase() {
    const s = this.state, D = DAYS[s.day - 1];
    if (s.caseIdx >= D.cases.length) return this.shiftReport();
    this.mode = 'review';
    this.screen.className = 'screen review-screen';
    if (!this.review) { this.screen.innerHTML = ''; this.review = new Review(this.screen, this.sound); }
    const c = buildCase(s, s.day, s.caseIdx);
    this.current = c;
    const shiftRes = (s.shiftResults || []);
    this.review.load(c, {
      state: s,
      caseNo: s.caseIdx + 1,
      caseCount: D.cases.length,
      shiftAvg: shiftRes.length ? Math.round(shiftRes.reduce((a, r) => a + r.score, 0) / shiftRes.length) : null,
      onSubmit: (r) => this.verdict(r),
      onMenu: () => this.menu(),
    });
    if (c.spec.tutorial) setTimeout(() => this.tutorial(), 700);
  }

  verdict({ result, decision, flagged, seconds }) {
    const s = this.state, c = this.current;
    const lines = [...result.lines];
    let bonusNote = null;
    // ARBITER flags
    if (c.arbiter) {
      if (flagged && c.arbiter.wrong) { s.flags.push({ day: s.day, case: s.caseIdx, mode: c.arbiter.mode }); lines.push({ ok: true, text: 'Flag upheld: ARBITER was wrong. Logged to the audit trail.', pts: 0 }); }
      else if (flagged && !c.arbiter.wrong) { result.score = Math.max(0, result.score - 5); lines.push({ ok: false, text: 'Flag rejected: ARBITER was right', pts: -5 }); }
      else if (!flagged && c.arbiter.wrong && decision.restart === c.arbiter.restart) lines.push({ ok: false, text: 'You followed a wrong ARBITER suggestion', pts: 0 });
    }
    // bribe
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
    const grade = result.score >= 85 ? ['Correct call', 'good'] : result.score >= 55 ? ['Partly right', 'mid'] : ['Wrong call', 'bad'];
    if (grade[1] === 'good') this.sound.good(); else if (grade[1] === 'bad') this.sound.bad();
    const truth = c.truth;
    this._openModal(h('div', 'verdict ' + grade[1], [
      h('div', 'v-head', [h('div', 'stamp', grade[0]), h('div', 'v-score', [h('b', 'mono', String(result.score)), h('small', '', '/ 100')])]),
      h('div', 'v-truth', [
        h('small', '', 'Correct call'),
        h('b', '', truth.restart),
        h('div', 'v-offs', truth.infringements.length ? truth.infringements.map((i) => h('span', 'off', [i.card !== 'None' ? h('i', 'cardi ' + i.card.toLowerCase()) : '', `${i.type} · #${i.num} ${i.teamName}`])) : [h('span', 'off muted', 'No offence')]),
      ]),
      h('div', 'v-explain', c.explain.map((t) => h('p', '', t))),
      h('ul', 'v-lines', lines.map((l) => h('li', l.ok ? 'ok' : l.partial ? 'part' : 'no', [h('span', '', l.text), h('b', 'mono', l.pts > 0 ? `+${l.pts}` : String(l.pts))]))),
      ...(bonusNote ? [h('p', 'v-bribe', bonusNote)] : []),
      h('div', 'v-actions', [
        h('button', 'ghost', { onclick: () => { this._closeModal(); this.review.cueKeyMoment(); this._watchBar(); } }, 'Watch the key moment'),
        h('button', 'primary', { onclick: () => { this._closeModal(); this.nextCase(); } }, s.caseIdx >= DAYS[s.day - 1].cases.length ? 'Finish shift →' : 'Next case →'),
      ]),
    ]));
  }

  _watchBar() {
    const bar = h('div', 'watchbar', [h('span', '', 'Reviewing the key moment'), h('button', 'primary small', { onclick: () => { bar.remove(); this.nextCase(); } }, 'Continue →')]);
    this.screen.append(bar);
    const orig = this.nextCase.bind(this);
    this.nextCase = () => { bar.remove(); this.nextCase = orig; orig(); };
  }

  // ---------------- shift report ----------------
  shiftReport() {
    const s = this.state, D = DAYS[s.day - 1];
    this.mode = 'report';
    const res = s.shiftResults || [];
    const avg = res.length ? Math.round(res.reduce((a, r) => a + r.score, 0) / res.length) : 0;
    const bonus = Math.round(avg * 1.2);
    s.wallet += WAGE + bonus;
    let note;
    if (avg >= 85) note = 'Excellent shift. Exactly the standard we need. — M.H.';
    else if (avg >= 65) note = 'Solid. Tighten up the close ones. — M.H.';
    else if (avg >= 45) note = 'Below standard. Review the rulebook before tomorrow. — M.H.';
    else { s.warnings++; note = s.warnings >= 2 ? 'This is your second failed shift.' : 'Formal warning: one more shift like this and your contract ends. — M.H.'; }
    const fired = s.warnings >= 2;
    s.stage = 'inbox';
    s.caseIdx = 0;
    const lastDay = s.day >= DAYS.length;
    if (!fired && !lastDay) s.day++;
    saveState(s);
    this._openModal(h('div', 'report', [
      h('small', 'eyebrow', `${D.name} · Shift report`),
      h('h2', '', `Accuracy ${avg}%`),
      h('table', '', [
        h('thead', '', h('tr', '', [h('th', '', 'Case'), h('th', '', 'Type'), h('th', '', 'Time'), h('th', '', 'Score')])),
        h('tbody', '', res.map((r, i) => h('tr', '', [h('td', '', String(i + 1)), h('td', '', label(r.gen)), h('td', 'mono', `${r.seconds}s`), h('td', 'mono ' + (r.score >= 85 ? 'g' : r.score >= 55 ? 'm' : 'b'), String(r.score))]))),
      ]),
      h('div', 'pay', [h('span', '', `Base $${WAGE} + accuracy bonus $${bonus}`), h('b', 'mono', `$${s.wallet.toLocaleString()}`)]),
      h('p', 'note', note),
      h('button', 'primary big', { onclick: () => {
        this._closeModal();
        if (fired) return this.ending('fired');
        if (lastDay) return this.finalChoice();
        this.dayCard();
      } }, fired ? 'Read email' : lastDay ? 'End of probation →' : 'Clock out →'),
    ]));
  }

  // ---------------- finale ----------------
  finalChoice() {
    const s = this.state;
    this.mode = 'final';
    this._teardownReview();
    this.screen.className = 'screen final-screen';
    this.screen.innerHTML = '';
    const ev = s.flags.length;
    const opts = [
      { id: 'whistle', label: 'Send the audit log to Dee’s contact at the Coastal Herald', sub: `${ev} upheld flag${ev === 1 ? '' : 's'} in the log`, cls: 'ghost' },
      { id: 'company', label: 'Sign Lumen’s NDA and take the senior reviewer role', sub: 'Hale’s offer is on your desk', cls: 'ghost' },
      ...(s.bribes ? [{ id: 'bought', label: 'Take K.’s final payment and disappear', sub: `You have taken ${s.bribes} payment${s.bribes > 1 ? 's' : ''}`, cls: 'ghost danger' }] : []),
    ];
    this.screen.append(h('div', 'final', [
      h('small', 'eyebrow', 'Friday, 18:04'),
      h('h1', '', 'Clock out?'),
      h('p', '', 'ARBITER goes in front of the league board tomorrow morning. Hale’s contract is on your desk. Dee’s last email is still open.'),
      h('div', 'final-opts', opts.map((o) => h('button', 'final-opt ' + o.cls, { onclick: () => {
        const end = o.id === 'whistle' ? (ev >= 2 ? 'whistle' : 'weak') : o.id;
        this.ending(end);
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
    const all = s.results;
    const acc = all.length ? Math.round(all.reduce((a, r) => a + r.score, 0) / all.length) : 0;
    this.screen.className = 'screen ending-screen';
    this.screen.innerHTML = '';
    this.screen.append(h('div', 'ending', [
      h('small', 'eyebrow', `Ending · ${E.tag}`),
      h('h1', '', E.title),
      ...E.body.map((p) => h('p', '', p)),
      h('div', 'end-stats', [
        h('div', 'stat', [h('small', '', 'Cases reviewed'), h('b', 'mono', String(all.length))]),
        h('div', 'stat', [h('small', '', 'Career accuracy'), h('b', 'mono', `${acc}%`)]),
        h('div', 'stat', [h('small', '', 'Upheld flags'), h('b', 'mono', String(s.flags.length))]),
        h('div', 'stat', [h('small', '', 'Wallet'), h('b', 'mono', `$${s.wallet.toLocaleString()}`)]),
      ]),
      h('button', 'primary big', { onclick: () => { try { localStorage.removeItem(SAVE); } catch {} this.title(); } }, 'Back to title'),
    ]));
  }

  // ---------------- menu / tutorial / modal ----------------
  menu() {
    this._openModal(h('div', 'menu', [
      h('h2', '', 'Paused'),
      h('label', 'vol', ['Volume', (() => { const r = h('input', '', { type: 'range', min: 0, max: 1, step: 0.05 }); r.value = this.sound.vol; r.oninput = () => this.sound.setVolume(+r.value); return r; })()]),
      h('div', 'keys', [
        ['Space', 'Play / pause'], [', .  or ← →', 'Step a frame (Shift = 10)'], ['1–6', 'Cameras'], ['Scroll / drag', 'Zoom / pan'], ['Click player', 'Select (quick-add offence)'], ['O', 'Offside line tool'], ['Z', 'Reset view'],
      ].map(([k, v]) => h('div', '', [h('kbd', '', k), h('span', '', v)]))),
      h('div', 'v-actions', [
        h('button', 'ghost', { onclick: () => this.title() }, 'Save & quit to title'),
        h('button', 'primary', { onclick: () => this._closeModal() }, 'Resume'),
      ]),
    ]));
  }

  tutorial() {
    const steps = [
      ['.monitor', 'This is the replay. Space plays and pauses. Scroll to zoom, drag to pan, and click a player to select them.'],
      ['.transport', 'Scrub the timeline, or step frame by frame with , and . (or the arrow keys). Slow it down to 0.25× for contact.'],
      ['.tools .cams', 'Switch camera angles with 1–6. The tactical cam shows the whole shape from above.'],
      ['.casefile', 'The case file shows what the referee gave on the pitch and what you have been asked to check.'],
      ['.panel', 'The match log jumps to key moments. The rulebook defines every call. When you are sure, open Decision, log the offence and choose the restart.'],
    ];
    let i = 0;
    const tip = h('div', 'coach');
    this.root.append(tip);
    const show = () => {
      if (i >= steps.length) { tip.remove(); return; }
      const [sel, text] = steps[i];
      const el = document.querySelector(sel);
      const r = el ? el.getBoundingClientRect() : { left: 100, top: 100, width: 0, height: 0, bottom: 100 };
      tip.innerHTML = '';
      tip.append(h('p', '', text), h('div', 'coach-foot', [h('small', '', `${i + 1}/${steps.length}`), h('button', 'primary small', { onclick: () => { i++; show(); } }, i === steps.length - 1 ? 'Got it' : 'Next')]));
      const below = r.bottom + 180 < innerHeight;
      tip.style.left = `${Math.min(innerWidth - 340, Math.max(16, r.left + r.width / 2 - 160))}px`;
      tip.style.top = `${below ? r.bottom + 12 : Math.max(16, r.top - 150)}px`;
      document.querySelectorAll('.coach-hi').forEach((e) => e.classList.remove('coach-hi'));
      if (el) el.classList.add('coach-hi');
      if (i === steps.length - 1) setTimeout(() => {}, 0);
    };
    const cleanup = new MutationObserver(() => { if (!tip.isConnected) { document.querySelectorAll('.coach-hi').forEach((e) => e.classList.remove('coach-hi')); cleanup.disconnect(); } });
    cleanup.observe(this.root, { childList: true });
    show();
  }

  _openModal(content) { this.modal.innerHTML = ''; this.modal.append(h('div', 'modal-card', content)); this.modal.classList.add('open'); }
  _closeModal() { this.modal.classList.remove('open'); this.modal.innerHTML = ''; }
  _teardownReview() { if (this.review) { this.review.destroy(); this.review = null; } }
}

function label(gen) { return { tackle: 'Challenge', dive: 'Penalty appeal', handball: 'Handball', offside: 'Offside', goalLine: 'Goal-line', penalty: 'Penalty kick' }[gen]; }

// Title art: a stylised monitor with a frozen offside frame, drawn in SVG.
function titleArt() {
  const d = document.createElement('div');
  d.innerHTML = `<svg viewBox="0 0 520 380" class="art">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f7d3a"/><stop offset="1" stop-color="#1f5a29"/></linearGradient></defs>
    <rect x="10" y="10" width="500" height="300" rx="18" fill="#0a0e13" stroke="#25303d" stroke-width="2"/>
    <rect x="26" y="26" width="468" height="268" rx="8" fill="url(#g)"/>
    ${Array.from({ length: 9 }, (_, i) => `<rect x="${26 + i * 52}" y="26" width="26" height="268" fill="#ffffff" opacity="0.035"/>`).join('')}
    <line x1="210" y1="26" x2="170" y2="294" stroke="#3ec9ff" stroke-width="3"/>
    <line x1="232" y1="26" x2="192" y2="294" stroke="#ff3d7f" stroke-width="3"/>
    <g fill="#e9eef4"><circle cx="196" cy="140" r="9"/><rect x="186" y="150" width="20" height="40" rx="9"/><rect x="186" y="186" width="8" height="38" rx="4"/><rect x="198" y="186" width="8" height="38" rx="4" transform="rotate(14 202 186)"/></g>
    <g fill="#ff4d5a"><circle cx="222" cy="134" r="9" fill="#f1c7a5"/><rect x="212" y="144" width="20" height="40" rx="9"/><rect x="212" y="180" width="8" height="40" rx="4" fill="#111"/><rect x="224" y="180" width="8" height="40" rx="4" fill="#111" transform="rotate(-22 228 180)"/></g>
    <circle cx="300" cy="230" r="7" fill="#fff"/>
    <rect x="40" y="40" width="96" height="22" rx="11" fill="#0a0e13" opacity="0.8"/><circle cx="54" cy="51" r="5" fill="#ff4d5a"/><text x="64" y="56" font-size="12" font-weight="700" fill="#e8eef5" font-family="Space Grotesk, sans-serif">VAR CHECK</text>
    <rect x="330" y="40" width="150" height="22" rx="11" fill="#0a0e13" opacity="0.8"/><text x="342" y="56" font-size="12" font-weight="700" fill="#e8eef5" font-family="Space Grotesk, sans-serif">+12 cm · OFFSIDE?</text>
    <rect x="200" y="310" width="120" height="40" fill="#141b24"/><rect x="150" y="346" width="220" height="14" rx="7" fill="#1b2430"/>
  </svg>`;
  return d.firstElementChild;
}
