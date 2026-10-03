// Sticker art (drawn in 2D canvas, used both in the paper panel and on the VHS tape label).
import { hex } from './dom.js';

const INK = '#20262e';
export const OFFENCE_COLORS = { Foul: '#e8573f', Simulation: '#9b6ad6', Handball: '#e0a030', Offside: '#e0b04a', 'Violent conduct': '#c0392b', 'Keeper off line': '#2f9a8a', Encroachment: '#3f86b0' };

function rr(x, X, Y, W, H, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); }

// ---- small icons, drawn in a size x size box ----
export function drawShirt(x, X, Y, s, team, num) {
  const shirt = hex(team.shirt), trim = hex(team.shorts === team.shirt ? team.num : team.shorts), numc = hex(team.num ?? 0xffffff);
  x.save(); x.translate(X, Y); x.scale(s / 100, s / 100);
  x.beginPath();
  x.moveTo(30, 8); x.lineTo(42, 4); x.quadraticCurveTo(50, 14, 58, 4); x.lineTo(70, 8);
  x.lineTo(96, 26); x.lineTo(84, 44); x.lineTo(76, 38); x.lineTo(76, 94); x.lineTo(24, 94); x.lineTo(24, 38); x.lineTo(16, 44); x.lineTo(4, 26); x.closePath();
  x.fillStyle = shirt; x.fill();
  x.lineWidth = 4; x.strokeStyle = INK; x.stroke();
  // sleeve cuffs + collar in the trim colour
  x.fillStyle = trim;
  x.beginPath(); x.moveTo(4, 26); x.lineTo(10, 21); x.lineTo(22, 39); x.lineTo(16, 44); x.closePath(); x.fill();
  x.beginPath(); x.moveTo(96, 26); x.lineTo(90, 21); x.lineTo(78, 39); x.lineTo(84, 44); x.closePath(); x.fill();
  x.beginPath(); x.moveTo(42, 4); x.quadraticCurveTo(50, 14, 58, 4); x.lineTo(55, 3); x.quadraticCurveTo(50, 9, 45, 3); x.closePath(); x.fill();
  if (num != null) {
    x.font = `900 ${String(num).length > 1 ? 40 : 46}px Nunito, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 5; x.strokeStyle = shirt === numc ? INK : 'rgba(0,0,0,0.0)';
    x.fillStyle = numc; x.fillText(String(num), 50, 62);
  }
  x.restore();
}

export function drawCardHand(x, X, Y, s, color) {
  x.save(); x.translate(X, Y); x.scale(s / 100, s / 100);
  x.rotate(-0.12);
  rr(x, 30, 6, 44, 62, 5); x.fillStyle = color === 'Red' ? '#e43a3a' : '#ffd23f'; x.fill(); x.lineWidth = 4; x.strokeStyle = INK; x.stroke();
  // hand
  x.fillStyle = '#f0c49a';
  x.beginPath(); x.moveTo(28, 56); x.quadraticCurveTo(24, 70, 34, 84); x.lineTo(60, 84); x.quadraticCurveTo(66, 70, 60, 58); x.lineTo(52, 50); x.lineTo(44, 60); x.closePath(); x.fill(); x.stroke();
  x.fillStyle = INK; x.fillRect(32, 84, 30, 14);
  x.restore();
}

function ball(x, cx, cy, r) {
  x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fillStyle = '#fff'; x.fill(); x.lineWidth = r * 0.16; x.strokeStyle = INK; x.stroke();
  x.fillStyle = INK; x.beginPath();
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 - Math.PI / 2; x.lineTo(cx + Math.cos(a) * r * 0.36, cy + Math.sin(a) * r * 0.36); }
  x.fill();
}
function goalFrame(x, X, Y, W, H) {
  x.strokeStyle = INK; x.lineWidth = 5; x.beginPath(); x.moveTo(X, Y + H); x.lineTo(X, Y); x.lineTo(X + W, Y); x.lineTo(X + W, Y + H); x.stroke();
  x.lineWidth = 1.5; x.strokeStyle = 'rgba(32,38,46,0.45)';
  for (let i = X + 8; i < X + W; i += 8) { x.beginPath(); x.moveTo(i, Y); x.lineTo(i, Y + H); x.stroke(); }
  for (let j = Y + 8; j < Y + H; j += 8) { x.beginPath(); x.moveTo(X, j); x.lineTo(X + W, j); x.stroke(); }
}
function noSign(x, cx, cy, r) { x.strokeStyle = '#e43a3a'; x.lineWidth = r * 0.22; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke(); x.beginPath(); x.moveTo(cx - r * 0.7, cy - r * 0.7); x.lineTo(cx + r * 0.7, cy + r * 0.7); x.stroke(); }
function check(x, cx, cy, r) { x.strokeStyle = '#2f9a4a'; x.lineWidth = r * 0.35; x.lineCap = 'round'; x.beginPath(); x.moveTo(cx - r, cy); x.lineTo(cx - r * 0.25, cy + r * 0.7); x.lineTo(cx + r, cy - r * 0.8); x.stroke(); x.lineCap = 'butt'; }

export function drawOffenceIcon(x, X, Y, s, type) {
  x.save(); x.translate(X, Y); x.scale(s / 100, s / 100);
  x.lineJoin = 'round';
  const c = OFFENCE_COLORS[type] || '#888';
  x.beginPath(); x.arc(50, 50, 46, 0, 7); x.fillStyle = c; x.fill(); x.lineWidth = 4; x.strokeStyle = INK; x.stroke();
  x.fillStyle = '#fff'; x.strokeStyle = INK; x.lineWidth = 4;
  if (type === 'Foul') {
    // whistle
    x.beginPath(); x.arc(42, 56, 20, 0, 7); x.fill(); x.stroke();
    rr(x, 44, 32, 36, 18, 4); x.fill(); x.stroke();
    x.fillStyle = INK; x.beginPath(); x.arc(42, 56, 7, 0, 7); x.fill();
  } else if (type === 'Simulation') {
    // diving player + motion lines
    x.beginPath(); x.arc(28, 40, 9, 0, 7); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(36, 46); x.lineTo(72, 56); x.lineTo(84, 70); x.moveTo(60, 53); x.lineTo(66, 72); x.moveTo(44, 48); x.lineTo(40, 64); x.stroke();
    x.lineWidth = 3; for (const [a, b] of [[20, 62], [16, 72], [26, 74]]) { x.beginPath(); x.moveTo(a, b); x.lineTo(a - 10, b + 4); x.stroke(); }
    x.font = '900 30px Nunito'; x.fillStyle = '#fff'; x.fillText('?', 64, 40);
  } else if (type === 'Handball') {
    x.beginPath(); x.moveTo(36, 84); x.lineTo(34, 50); x.quadraticCurveTo(30, 30, 38, 30); x.lineTo(42, 48); x.lineTo(42, 22); x.quadraticCurveTo(48, 16, 52, 22); x.lineTo(52, 46); x.lineTo(54, 20); x.quadraticCurveTo(60, 14, 63, 22); x.lineTo(62, 48); x.lineTo(66, 30); x.quadraticCurveTo(72, 28, 72, 36); x.lineTo(68, 64); x.quadraticCurveTo(64, 82, 56, 84); x.closePath(); x.fill(); x.stroke();
    ball(x, 74, 66, 13);
  } else if (type === 'Offside') {
    x.beginPath(); x.moveTo(32, 86); x.lineTo(32, 16); x.stroke();
    x.fillStyle = '#ffd23f'; x.fillRect(34, 18, 40, 30); x.strokeRect(34, 18, 40, 30);
    x.fillStyle = '#e43a3a'; x.fillRect(34, 18, 20, 15); x.fillRect(54, 33, 20, 15);
  } else if (type === 'Violent conduct') {
    x.beginPath(); for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, r = k % 2 ? 18 : 36; x.lineTo(50 + Math.cos(a) * r, 50 + Math.sin(a) * r); } x.closePath(); x.fillStyle = '#ffd23f'; x.fill(); x.stroke();
    x.fillStyle = '#fff'; rr(x, 34, 36, 32, 28, 9); x.fill(); x.stroke();
  } else if (type === 'Keeper off line') {
    x.fillRect(14, 72, 72, 6); x.strokeRect(14, 72, 72, 6);
    x.fillStyle = '#7cd36b'; rr(x, 34, 22, 32, 40, 10); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(50, 64); x.lineTo(50, 84); x.moveTo(42, 82); x.lineTo(58, 82); x.stroke();
  } else if (type === 'Encroachment') {
    x.strokeRect(20, 26, 60, 50);
    x.fillStyle = INK; x.beginPath(); x.moveTo(8, 50); x.lineTo(40, 50); x.lineTo(40, 40); x.lineTo(56, 54); x.lineTo(40, 68); x.lineTo(40, 58); x.lineTo(8, 58); x.fill();
  }
  x.restore();
}

export function drawRestartIcon(x, X, Y, s, r) {
  x.save(); x.translate(X, Y); x.scale(s / 100, s / 100);
  x.lineJoin = 'round';
  if (r === 'Play on') {
    x.fillStyle = '#2f9a4a'; x.strokeStyle = INK; x.lineWidth = 4;
    for (const o of [18, 48]) { x.beginPath(); x.moveTo(o, 24); x.lineTo(o + 34, 50); x.lineTo(o, 76); x.closePath(); x.fill(); x.stroke(); }
  } else if (r === 'Free kick') {
    ball(x, 34, 62, 18);
    x.strokeStyle = INK; x.lineWidth = 6; x.beginPath(); x.moveTo(54, 50); x.quadraticCurveTo(70, 26, 88, 30); x.stroke();
    x.fillStyle = INK; x.beginPath(); x.moveTo(90, 22); x.lineTo(94, 36); x.lineTo(80, 34); x.fill();
  } else if (r === 'Penalty') {
    goalFrame(x, 12, 12, 76, 40);
    x.fillStyle = '#fff'; x.beginPath(); x.ellipse(50, 84, 10, 4, 0, 0, 7); x.fill();
    ball(x, 50, 72, 11);
  } else if (r === 'Goal stands' || r === 'Award goal' || r === 'Disallow goal') {
    goalFrame(x, 10, 16, 80, 50);
    ball(x, 50, 50, 14);
    if (r === 'Disallow goal') noSign(x, 74, 74, 18);
    else if (r === 'Award goal') { x.fillStyle = '#2f9a4a'; x.beginPath(); x.arc(76, 76, 18, 0, 7); x.fill(); x.fillStyle = '#fff'; x.fillRect(66, 73, 20, 6); x.fillRect(73, 66, 6, 20); }
    else check(x, 74, 76, 16);
  } else if (r === 'Retake penalty') {
    ball(x, 50, 52, 16);
    x.strokeStyle = INK; x.lineWidth = 6; x.beginPath(); x.arc(50, 52, 34, -2.6, 1.9); x.stroke();
    x.fillStyle = INK; x.beginPath(); x.moveTo(14, 38); x.lineTo(30, 24); x.lineTo(34, 44); x.fill();
  }
  x.restore();
}

// ---- full stickers ----
export const STICKER = { off: [300, 120], restart: [300, 96] };

export function drawOffenceSticker(x, X, Y, st, teams, highlight = null) {
  const [W, H] = STICKER.off;
  x.save(); x.translate(X, Y);
  x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 8; x.shadowOffsetY = 3;
  rr(x, 0, 0, W, H, 14); x.fillStyle = '#f7f4ea'; x.fill();
  x.shadowColor = 'transparent';
  x.lineWidth = 3; x.strokeStyle = '#c9c2ac'; x.stroke();
  drawOffenceIcon(x, 10, 10, 72, st.type);
  x.font = '800 15px Nunito, sans-serif'; x.fillStyle = INK; x.textAlign = 'center';
  x.fillText(st.type.toUpperCase(), 46, 108);
  const slot = (sx, label, filled, hi) => {
    rr(x, sx, 10, 96, 86, 10);
    if (!filled) { x.setLineDash([7, 6]); x.lineWidth = 3; x.strokeStyle = hi ? '#e8573f' : '#a9a28c'; x.stroke(); x.setLineDash([]); x.font = '700 13px Nunito, sans-serif'; x.fillStyle = hi ? '#e8573f' : '#a9a28c'; x.fillText(label, sx + 48, 58); }
    else { x.fillStyle = '#ece6cf'; x.fill(); }
  };
  slot(94, 'PLAYER', st.num != null, highlight === 'player');
  if (st.num != null) drawShirt(x, 100, 12, 84, teams[st.team], st.num);
  slot(196, 'CARD', st.card && st.card !== 'None', highlight === 'card');
  if (st.card && st.card !== 'None') drawCardHand(x, 200, 10, 86, st.card);
  x.restore();
}

export function drawRestartSticker(x, X, Y, value) {
  const [W, H] = STICKER.restart;
  x.save(); x.translate(X, Y);
  x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 8; x.shadowOffsetY = 3;
  rr(x, 0, 0, W, H, 14); x.fillStyle = '#f7f4ea'; x.fill();
  x.shadowColor = 'transparent';
  x.lineWidth = 3; x.strokeStyle = '#c9c2ac'; x.stroke();
  drawRestartIcon(x, 10, 8, 80, value);
  x.font = '900 24px Nunito, sans-serif'; x.fillStyle = INK; x.textAlign = 'left'; x.textBaseline = 'middle';
  x.fillText(value.toUpperCase(), 102, H / 2 + 1);
  x.restore();
}

// ---- the VHS tape top ----
export const TAPE = { W: 1024, H: 576, label: [362, 26, 300, 96], slots: [[86, 188], [638, 188], [86, 372], [638, 372]] };

export function drawTape(x, state, teams, hover = null) {
  const { W, H } = TAPE;
  x.fillStyle = '#25282f'; x.fillRect(0, 0, W, H);
  // moulded edges + reel windows
  x.fillStyle = '#2d3139'; rr(x, 18, 18, W - 36, H - 36, 18); x.fill();
  for (const cx of [262, 762]) {
    x.fillStyle = '#16181d'; rr(x, cx - 150, 200, 300, 200, 26); x.fill();
    x.fillStyle = '#3a3f4a'; x.beginPath(); x.arc(cx, 300, 70, 0, 7); x.fill();
    x.fillStyle = '#1a1c21'; x.beginPath(); x.arc(cx, 300, 28, 0, 7); x.fill();
    x.strokeStyle = '#4c5260'; x.lineWidth = 6;
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; x.beginPath(); x.moveTo(cx + Math.cos(a) * 12, 300 + Math.sin(a) * 12); x.lineTo(cx + Math.cos(a) * 26, 300 + Math.sin(a) * 26); x.stroke(); }
  }
  // paper label strip
  const [lx, ly, lw, lh] = TAPE.label;
  x.fillStyle = '#e9e4d4'; rr(x, lx - 20, ly - 6, lw + 40, lh + 12, 8); x.fill();
  if (state.restart) drawRestartSticker(x, lx, ly, state.restart);
  else {
    rr(x, lx, ly, lw, lh, 14);
    x.setLineDash([10, 8]); x.lineWidth = 4; x.strokeStyle = hover === 'label' ? '#e8573f' : '#9a937e'; x.stroke(); x.setLineDash([]);
    x.font = '800 22px Nunito, sans-serif'; x.fillStyle = hover === 'label' ? '#e8573f' : '#8a8470'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('RESTART STICKER', lx + lw / 2, ly + lh / 2);
  }
  state.offences.forEach((st, i) => {
    const [sx, sy] = TAPE.slots[i];
    x.save(); x.translate(sx + 150, sy + 60); x.rotate(((i * 37) % 7 - 3) * 0.008); x.translate(-150, -60);
    drawOffenceSticker(x, 0, 0, st, teams, hover === 'off' + i ? 'hover' : st.num == null ? 'player' : null);
    if (hover === 'off' + i) { rr(x, -4, -4, 308, 128, 16); x.lineWidth = 5; x.strokeStyle = '#7dff9a'; x.stroke(); }
    x.restore();
  });
  if (state.offences.length < 4 && hover === 'slot') {
    const [sx, sy] = TAPE.slots[state.offences.length];
    rr(x, sx, sy, 300, 120, 14); x.setLineDash([10, 8]); x.lineWidth = 4; x.strokeStyle = '#7dff9a'; x.stroke(); x.setLineDash([]);
  }
}

// What part of the tape is under a texture coordinate (px in tape canvas space).
export function tapeHit(px, py, state) {
  const [lx, ly, lw, lh] = TAPE.label;
  if (px >= lx - 20 && px <= lx + lw + 20 && py >= ly - 6 && py <= ly + lh + 12) return { part: 'label' };
  for (let i = 0; i < state.offences.length; i++) {
    const [sx, sy] = TAPE.slots[i];
    if (px >= sx && px <= sx + 300 && py >= sy && py <= sy + 120) return { part: 'off', i, sub: px - sx < 94 ? 'icon' : px - sx < 196 ? 'player' : 'card' };
  }
  if (px > 0 && px < TAPE.W && py > 0 && py < TAPE.H) return { part: 'body' };
  return null;
}
