// The on-screen display drawn over the replay feed (480x360): a TV scorebug, VCR PLAY / PAUSE
// glyphs, the lower-third question, player tags and the measuring overlays for close calls.
import { FPS } from '../sim/clip.js';
import { CAMS } from '../render/view.js';
import { BALL_R, GOAL_X, BOX_X } from '../sim/clip.js';
import { FEET } from '../sim/kinematics.js';
import { armAngleDeg } from '../sim/incidents.js';

const W = 480, H = 360, M = 28;
const INK = '#0a0e16', PANEL = 'rgba(8,12,22,0.86)';
const GREEN = '#7dff9a', AMBER = '#ffd23f', RED = '#ff4d4d', WHITE = '#ffffff', CYAN = '#5ef2c4', PINK = '#ff5d8f';
const hexCss = (h) => '#' + (h >>> 0).toString(16).padStart(6, '0');

const font = (x, size, w = 400) => { x.font = `${w} ${size}px Silkscreen`; };
function plate(x, X, Y, w, h, fill = PANEL, edge = INK) {
  x.fillStyle = edge; x.fillRect(Math.round(X) - 1, Math.round(Y) - 1, Math.round(w) + 2, Math.round(h) + 2);
  x.fillStyle = fill; x.fillRect(Math.round(X), Math.round(Y), Math.round(w), Math.round(h));
}
// text with a hard 1px drop shadow, like a character generator
function text(x, s, X, Y, size = 8, col = WHITE, align = 'left', weight = 400, shadow = INK) {
  font(x, size, weight); x.textAlign = align; x.textBaseline = 'top';
  X = Math.round(X); Y = Math.round(Y);
  if (shadow) { x.fillStyle = shadow; x.fillText(s, X + 1, Y + 1); }
  x.fillStyle = col; x.fillText(s, X, Y);
}
const wid = (x, s, size, weight = 400) => { font(x, size, weight); return Math.ceil(x.measureText(s).width); };
const mmss = (t) => `${String(Math.floor(t)).padStart(2, '0')}.${String(Math.floor((t % 1) * 10))}`;
const clock = (minute, t) => { const s = Math.floor(minute * 60 + 12 + t); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const cmText = (m) => { const c = Math.abs(m) * 100; return c < 10 ? `${c.toFixed(1)} CM` : `${Math.round(c)} CM`; };

function playGlyph(x, X, Y, s, col) { x.fillStyle = INK; x.beginPath(); x.moveTo(X, Y); x.lineTo(X + s * 0.9 + 2, Y + s / 2); x.lineTo(X, Y + s); x.fill(); x.fillStyle = col; x.beginPath(); x.moveTo(X + 1, Y + 2); x.lineTo(X + s * 0.8, Y + s / 2); x.lineTo(X + 1, Y + s - 2); x.fill(); }
function pauseGlyph(x, X, Y, s, col) { x.fillStyle = INK; x.fillRect(X - 1, Y - 1, s * 0.4 + 2, s + 2); x.fillRect(X + s * 0.6 - 1, Y - 1, s * 0.4 + 2, s + 2); x.fillStyle = col; x.fillRect(X, Y, s * 0.4, s); x.fillRect(X + s * 0.6, Y, s * 0.4, s); }
function slowGlyph(x, X, Y, s, col) { for (const o of [0, s * 0.55]) { x.fillStyle = INK; x.beginPath(); x.moveTo(X + o + s * 0.6 + 1, Y - 1); x.lineTo(X + o - 1, Y + s / 2); x.lineTo(X + o + s * 0.6 + 1, Y + s + 1); x.fill(); x.fillStyle = col; x.beginPath(); x.moveTo(X + o + s * 0.5, Y + 1); x.lineTo(X + o, Y + s / 2); x.lineTo(X + o + s * 0.5, Y + s - 1); x.fill(); } }

// a reference line through two world points, as a function of screen y
function lineThrough(v, a, b) {
  const A = v.screenOfPoint(a), B = v.screenOfPoint(b), dy = B.y - A.y;
  return Math.abs(dy) < 1e-3 ? () => A.x : (y) => A.x + ((y - A.y) * (B.x - A.x)) / dy;
}

// what the measuring tool says about this tape right now (null when it has nothing to measure)
export function measure(c, t) {
  const clip = c.clip, f = clip.facts;
  if (clip.goalCam) {
    const b = clip.ballAt(t);
    const d = b[0] - BALL_R - GOAL_X;
    if (Math.abs(b[0] - GOAL_X) > 0.6) return { head: 'BALL', body: 'NOT AT THE LINE', col: WHITE };
    return d > 0 ? { head: 'WHOLE BALL OVER', body: `${cmText(d)} PAST THE LINE`, col: GREEN } : { head: 'BALL SHORT OF LINE', body: `${cmText(d)} STILL ON THE LINE`, col: RED };
  }
  if (clip.penalty && f.variant && f.variant.startsWith('keeper')) {
    const j = clip.subjects[0].jointsAt(t), d = Math.max(...FEET.map((k) => j[k][0])) - (GOAL_X - 0.12);
    return d >= 0 ? { head: 'KEEPER REAR FOOT', body: `ON THE LINE (${cmText(d)} OVER THE EDGE)`, col: GREEN } : { head: 'KEEPER REAR FOOT', body: `${cmText(d)} IN FRONT OF THE LINE`, col: RED };
  }
  if (clip.penalty && clip.scorer) {
    const j = clip.scorer.jointsAt(t), d = Math.max(...FEET.map((k) => j[k][0])) - BOX_X;
    return d > 0 ? { head: `#${clip.scorer.num} LEADING BOOT`, body: `${cmText(d)} INSIDE THE AREA`, col: RED } : { head: `#${clip.scorer.num} LEADING BOOT`, body: `${cmText(d)} OUTSIDE THE AREA`, col: GREEN };
  }
  return null;
}

// everything the display needs, handed over by the review desk each frame
export function drawOSD(x, o) {
  const { view: v, case: c, teams, t, playing, speed, slow, caseTime, card, watchKey } = o;
  const k = c.clip.context;
  const blink = Math.floor(performance.now() / 450) % 2 === 0;
  x.clearRect(0, 0, W, H);
  x.textBaseline = 'top';

  // ---- scorebug, top left ----
  {
    const a = teams.A, d = teams.D;
    const nA = wid(x, a.short, 8, 700), nD = wid(x, d.short, 8, 700);
    const X = M, Y = 22, w = 6 + nA + 8 + 36 + nD + 8 + 6 + 38;
    plate(x, X, Y, w, 14);
    x.fillStyle = hexCss(a.shirt); x.fillRect(X, Y, 5, 14);
    text(x, a.short, X + 9, Y + 3, 8, WHITE, 'left', 700);
    const sx = X + 9 + nA + 6;
    x.fillStyle = '#f4f4f4'; x.fillRect(sx, Y + 1, 30, 12);
    text(x, `${k.score[0]}-${k.score[1]}`, sx + 15, Y + 3, 8, INK, 'center', 700, null);
    text(x, d.short, sx + 30 + 6, Y + 3, 8, WHITE, 'left', 700);
    x.fillStyle = hexCss(d.shirt); x.fillRect(sx + 30 + 6 + nD + 4, Y, 5, 14);
    const cx0 = sx + 30 + 6 + nD + 12;
    x.fillStyle = '#16213a'; x.fillRect(cx0, Y, 38, 14);
    text(x, clock(k.minute, t), cx0 + 19, Y + 3, 8, AMBER, 'center', 700, null);
  }

  // ---- VAR badge + REPLAY, top right ----
  {
    const X = W - M - 62, Y = 22;
    plate(x, X, Y, 62, 14, AMBER);
    text(x, 'VAR', X + 6, Y + 3, 8, INK, 'left', 700, null);
    x.fillStyle = INK; x.fillRect(X + 29, Y, 1, 14);
    if (playing || blink) { x.fillStyle = RED; x.fillRect(X + 34, Y + 4, 6, 6); }
    text(x, 'REC', X + 43, Y + 3, 8, INK, 'left', 700, null);
    const cam = CAMS.find((q) => q.id === v.cam);
    const label = `CAM ${CAMS.indexOf(cam) + 1} ${cam.label.toUpperCase()}`;
    text(x, label, W - M, Y + 20, 8, WHITE, 'right');
    if (v.zoom > 1.05) text(x, `ZOOM ${v.zoom < 10 ? v.zoom.toFixed(1) : Math.round(v.zoom)}X`, W - M, Y + 31, 8, AMBER, 'right');
  }

  // ---- photo finish badge ----
  if (c.close) {
    const label = 'PHOTO FINISH', w = wid(x, label, 8, 700) + 18, X = Math.round(W / 2 - w / 2), Y = 22;
    plate(x, X, Y, w, 14, blink ? RED : '#7a1020');
    x.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < w; i += 8) { x.beginPath(); x.moveTo(X + i, Y + 14); x.lineTo(X + i + 4, Y); x.lineTo(X + i + 8, Y); x.lineTo(X + i + 4, Y + 14); x.fill(); }
    text(x, label, W / 2, Y + 3, 8, WHITE, 'center', 700);
  }

  // ---- player tags ----
  const tags = [];
  if (v.selected) tags.push({ a: v.selected.actor, col: GREEN, sel: true });
  for (const l of v.lines) if (l.pm !== v.selected) tags.push({ a: l.pm.actor, col: l.pm.actor.team === 'A' ? PINK : '#5fd4ff' });
  if (v.hover && v.hover !== v.selected && !v.lines.some((l) => l.pm === v.hover)) tags.push({ a: v.hover.actor, col: WHITE });
  for (const tg of tags) {
    const p = v.screenOf(tg.a);
    if (!p.visible) continue;
    const kit = teams[tg.a.team];
    const s = `#${tg.a.num} ${kit.short}`, w = wid(x, s, 8) + 14, X = Math.round(p.x - w / 2), Y = Math.round(p.y - 16);
    plate(x, X, Y, w, 12);
    x.fillStyle = hexCss(kit.shirt); x.fillRect(X, Y, 4, 12);
    x.fillStyle = tg.col; x.fillRect(X, Y + 11, w, 1);
    x.beginPath(); x.moveTo(Math.round(p.x) - 3, Y + 12); x.lineTo(Math.round(p.x) + 3, Y + 12); x.lineTo(Math.round(p.x), Y + 16); x.fill();
    text(x, s, X + 8, Y + 2, 8, tg.col, 'left', 400, null);
    // arm angles: the handball rule is written in degrees
    if (tg.sel && c.gen === 'handball') {
      const j = tg.a.jointsAt(t), L = armAngleDeg(j, 'L'), Rr = armAngleDeg(j, 'R');
      if (L > 12 || Rr > 12) {
        const col = (a) => (a > 45 ? RED : a > 12 ? AMBER : '#8a95a5');
        const sl = `L ${L}`, sr = `R ${Rr}`, w2 = wid(x, 'ARM', 8) + wid(x, sl, 8) + wid(x, sr, 8) + 30;
        const X2 = Math.round(p.x - w2 / 2), Y2 = Y - 14;
        plate(x, X2, Y2, w2, 12);
        let cx = X2 + 5;
        text(x, 'ARM', cx, Y2 + 2, 8, '#8a95a5', 'left', 400, null); cx += wid(x, 'ARM', 8) + 6;
        text(x, sl, cx, Y2 + 2, 8, col(L), 'left', 400, null); cx += wid(x, sl, 8) + 8;
        text(x, sr, cx, Y2 + 2, 8, col(Rr), 'left', 400, null);
      }
    }
  }

  // ---- measuring overlays (goal-line, keeper, area line) ----
  const m = v.lineMode ? measure(c, t) : null;
  if (v.lineMode && v.cam === 'goalline' && (c.clip.goalCam || (c.clip.penalty && c.clip.facts.variant && c.clip.facts.variant.startsWith('keeper')))) {
    const outer = lineThrough(v, [GOAL_X, 0, 0], [GOAL_X, 2, 0]), inner = lineThrough(v, [GOAL_X - 0.12, 0, 0], [GOAL_X - 0.12, 2, 0]);
    x.fillStyle = 'rgba(94,242,196,0.16)';
    x.beginPath(); x.moveTo(outer(0), 0); x.lineTo(outer(H), H); x.lineTo(inner(H), H); x.lineTo(inner(0), 0); x.fill();
    x.fillStyle = CYAN; x.beginPath(); x.moveTo(outer(0) - 1, 0); x.lineTo(outer(0) + 1, 0); x.lineTo(outer(H) + 1, H); x.lineTo(outer(H) - 1, H); x.fill();
    x.fillStyle = PINK; x.fillRect(Math.round(inner(H / 2)), 0, 1, H);
    if (blink) text(x, 'OUTER EDGE', Math.round(outer(70)) + 4, 70, 8, CYAN);
    text(x, 'INNER EDGE', Math.round(inner(90)) - 4, 90, 8, PINK, 'right');
  }
  if (v.lineMode && c.clip.penalty && c.clip.scorer) {
    const a = v.screenOfPoint([BOX_X, 0, -6]), b = v.screenOfPoint([BOX_X, 0, 6]);
    x.strokeStyle = CYAN; x.lineWidth = 2; x.beginPath(); x.moveTo(a.x + (a.x - b.x) * 20, a.y + (a.y - b.y) * 20); x.lineTo(b.x + (b.x - a.x) * 20, b.y + (b.y - a.y) * 20); x.stroke();
  }
  if (m) {
    const w = Math.max(wid(x, m.head, 8), wid(x, m.body, 8)) + 16, X = Math.round(W / 2 - w / 2), Y = H - 88;
    plate(x, X, Y, w, 26);
    x.fillStyle = m.col; x.fillRect(X, Y, 3, 26);
    text(x, m.head, X + 9, Y + 4, 8, '#8a95a5', 'left', 400, null);
    text(x, m.body, X + 9, Y + 15, 8, m.col, 'left', 400, null);
  }

  // ---- offside lines: the readout plate ----
  const info = v.lineInfo();
  if (info.length) {
    const att = info.find((i) => i.actor.team === 'A'), def = info.find((i) => i.actor.team === 'D');
    const names = info.map((i) => `#${i.actor.num} ${teams[i.actor.team].short}`).join('  VS  ');
    let big = '', col = AMBER;
    if (att && def) {
      const dd = att.x - def.x, cm = Math.abs(dd) * 100;
      const cms = cm < 10 ? cm.toFixed(1) : String(Math.round(cm));
      if (dd > 0.0005) { big = `${cms} CM BEYOND`; col = RED; } else if (dd < -0.0005) { big = `${cms} CM BEHIND`; col = GREEN; } else { big = 'LEVEL'; col = AMBER; }
    }
    const w = Math.max(wid(x, names, 8), wid(x, big || '-', 16)) + 20, X = Math.round(W / 2 - w / 2), Y = H - (big ? 102 : 80);
    plate(x, X, Y, w, big ? 40 : 18);
    text(x, names, W / 2, Y + 5, 8, '#c9d3e0', 'center', 400, null);
    if (big) text(x, big, W / 2, Y + 18, 16, col, 'center', 700);
  }
  if (v.lineMode && !(info.length >= 2)) {
    const hint = c.clip.goalCam || c.clip.penalty ? 'MEASURE ON' : 'LINE TOOL: CLICK A PLAYER';
    text(x, hint, W / 2, 62, 8, blink ? AMBER : '#c9a83a', 'center', 400, INK);
  }
  if (watchKey) text(x, 'KEY MOMENT', W / 2, 62, 8, GREEN, 'center');

  // ---- goal banner ----
  const goal = c.clip.log.find((e) => e.kind === 'goal');
  if (goal && t >= goal.t && t < goal.t + 2.6) {
    const q = Math.min(1, (t - goal.t) / 0.25), w = 150;
    const X = Math.round(W / 2 - w / 2), Y = 92 - Math.round((1 - q) * 30);
    plate(x, X, Y, w, 34, AMBER);
    x.fillStyle = INK; x.fillRect(X + 4, Y + 4, w - 8, 26);
    text(x, 'GOAL!', W / 2, Y + 8, 16, blink ? AMBER : WHITE, 'center', 700);
  }

  // ---- VCR transport, bottom left ----
  {
    const X = M, Y = 45;
    if (playing) { playGlyph(x, X, Y, 12, GREEN); text(x, 'PLAY', X + 20, Y - 1, 16, GREEN, 'left', 700); }
    else if (blink) { pauseGlyph(x, X, Y, 12, WHITE); text(x, 'PAUSE', X + 20, Y - 1, 16, WHITE, 'left', 700); }
    if (playing) {
      const sp = speed * (slow || 1);
      const lab = sp >= 0.99 ? 'SP' : `SLOW ${Math.round(sp * 100)}%`;
      text(x, lab, X + 20 + wid(x, 'PLAY', 16, 700) + 8, Y + 4, 8, sp >= 0.99 ? '#c9d3e0' : AMBER);
    }
    const fr = Math.round(t * FPS);
    text(x, `${mmss(t)}  F${String(fr).padStart(3, '0')}`, X, H - 34, 8, WHITE);
  }
  if (slow && slow < 0.6 && playing) {
    const w = 78, X = W - M - w, Y = H - 40;
    plate(x, X, Y, w, 14, blink ? AMBER : '#c9a83a');
    slowGlyph(x, X + 5, Y + 3, 8, INK);
    text(x, 'SLOW-MO', X + 24, Y + 3, 8, INK, 'left', 700, null);
  }

  // ---- lower third: the question, for the first few seconds ----
  {
    const L = o.lower;
    if (L > 0.01) {
      const slide = L, q = (k.question || '').toUpperCase();
      const w = W - M * 2, X = M - Math.round((1 - slide) * 80), Y = H - 54;
      plate(x, X, Y, w, 18, '#16213a');
      plate(x, X, Y, 44, 18, AMBER);
      text(x, 'VAR', X + 22, Y + 5, 8, INK, 'center', 700, null);
      text(x, q.length > 52 ? q.slice(0, 51) + '.' : q, X + 52, Y + 5, 8, WHITE, 'left', 400, null);
      x.fillStyle = AMBER; x.fillRect(X, Y + 18, w, 1);
      void caseTime;
    }
  }

  // ---- title card while the tape loads ----
  if (card) {
    const a = Math.max(0, Math.min(1, (card.dur - card.t) / 0.4));
    x.globalAlpha = a;
    x.fillStyle = '#080b12'; x.fillRect(0, 0, W, H);
    // slow-moving bars, like a test card
    const bars = ['#c8c8c8', '#c8c800', '#00c8c8', '#00c800', '#c800c8', '#c80000', '#0000c8'];
    bars.forEach((b, i) => { x.fillStyle = b; x.globalAlpha = a * 0.22; x.fillRect(M + i * ((W - M * 2) / 7), 60, (W - M * 2) / 7, 8); });
    x.globalAlpha = a;
    text(x, `TAPE ${c.day}-${String(c.idx + 1).padStart(2, '0')}`, W / 2, 88, 16, GREEN, 'center', 700);
    text(x, o.label.toUpperCase(), W / 2, 118, 16, WHITE, 'center', 700);
    if (c.close) text(x, 'PHOTO FINISH', W / 2, 146, 16, blink ? RED : '#8a1a22', 'center', 700);
    const A = teams.A, D = teams.D;
    x.fillStyle = hexCss(A.shirt); x.fillRect(W / 2 - 100, 184, 10, 10); x.fillStyle = hexCss(D.shirt); x.fillRect(W / 2 + 90, 184, 10, 10);
    text(x, A.name.toUpperCase(), W / 2, 186, 8, WHITE, 'center');
    text(x, 'VS', W / 2, 202, 8, '#8a95a5', 'center');
    text(x, D.name.toUpperCase(), W / 2, 218, 8, WHITE, 'center');
    text(x, `${k.minute}'   ON-FIELD: ${k.onField.toUpperCase()}`, W / 2, 252, 8, AMBER, 'center');
    // loading bar
    const f = Math.min(1, card.t / Math.max(0.01, card.dur - 0.5));
    x.strokeStyle = GREEN; x.lineWidth = 1; x.strokeRect(W / 2 - 60.5, 288.5, 120, 8);
    x.fillStyle = GREEN; x.fillRect(W / 2 - 58, 291, Math.round(116 * f / 4) * 4, 3);
    if (blink) text(x, 'LOADING TAPE', W / 2, 308, 8, GREEN, 'center');
    x.globalAlpha = 1;
  }
}
