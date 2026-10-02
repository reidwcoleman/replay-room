// Incident generators. Each builds a full 22-player replay around one contested moment, records
// the facts (contact order, offside margin, arm position…) and resolves the correct call from
// whatever rulebook is in force that day.
import { Clip, BALL_R, GOAL_X, BOX_X, BOX_HALF_W, GOAL_HALF_W } from './clip.js';
import { joints, SCORING, segDist, vec } from './kinematics.js';
import { TEAMS } from './teams.js';

export const TYPES = ['Foul', 'Handball', 'Offside', 'Simulation', 'Violent conduct', 'Keeper off line', 'Encroachment'];
export const CARDS = ['None', 'Yellow', 'Red'];
export const RESTARTS = ['Play on', 'Goal stands', 'Disallow goal', 'Award goal', 'Free kick', 'Penalty', 'Retake penalty'];

export function rng(seed) {
  let s = seed >>> 0 || 1;
  const f = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a, b) => a + f() * (b - a);
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.sign = () => (f() < 0.5 ? -1 : 1);
  return f;
}

const fr = (t) => Math.round(t * 30) / 30;
const inBox = (x, z) => x > BOX_X && Math.abs(z) < BOX_HALF_W;
const clockOf = (minute, t) => {
  const s = Math.floor(minute * 60 + t);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------------------------
// Shared match setup: two teams, kits, 22 actors in a shape that suits where the play is.
// ---------------------------------------------------------------------------------------------
function setup(R, o) {
  const pair = o.teams ? o.teams.map((id) => TEAMS.find((t) => t.id === id)) : pickTeams(R);
  const [att, def] = o.fixed || R() < 0.5 ? pair : [pair[1], pair[0]];
  const clip = new Clip({ duration: o.duration || 9, kits: { A: att, D: def } });
  clip.attacking = att;
  clip.defending = def;
  const minute = o.minute ?? Math.floor(R.range(8, 88));
  const sa = Math.floor(R() * 3), sd = Math.floor(R() * 3);
  clip.context = { attack: att, defend: def, minute, score: [sa, sd] };
  const line = o.defLine ?? 34;
  // attackers (team A, attacking +x)
  const A = [
    [1, 'GK', -47, 0], [2, 'DF', line - 30, -22], [5, 'DF', line - 33, -7], [6, 'DF', line - 33, 7], [3, 'DF', line - 30, 22],
    [8, 'MF', line - 14, -10], [4, 'MF', line - 18, 4], [10, 'MF', line - 8, 12],
    [7, 'FW', line - 2, -20], [9, 'FW', line - 1, -2], [11, 'FW', line - 3, 19],
  ];
  const D = [
    [1, 'GK', 51.2, 0], [2, 'DF', line + 1, 20], [4, 'DF', line, 7], [5, 'DF', line, -7], [3, 'DF', line + 1, -20],
    [6, 'MF', line - 9, 2], [8, 'MF', line - 10, -12], [10, 'MF', line - 11, 13],
    [7, 'MF', line - 16, 22], [11, 'MF', line - 16, -22], [9, 'FW', line - 30, 3],
  ];
  const jitter = () => R.range(-1.5, 1.5);
  for (const [num, role, x, z] of A) clip.actor({ team: 'A', num, role }).slot = [x + (role === 'GK' ? 0 : jitter()), z + (role === 'GK' ? 0 : jitter())];
  for (const [num, role, x, z] of D) clip.actor({ team: 'D', num, role }).slot = [x + (role === 'GK' ? 0 : jitter() * 0.4), z + (role === 'GK' ? 0 : jitter())];
  return clip;
}

function pickTeams(R) {
  const a = R.pick(TEAMS);
  let b;
  do b = R.pick(TEAMS); while (b === a);
  return [a, b];
}

// Everyone not involved drifts with the play.
function fillBackground(clip, R, focus) {
  const dur = clip.duration;
  for (const a of clip.actors) {
    if (a.key) continue;
    const keys = [];
    const [sx, sz] = a.slot;
    const lazy = R.range(0.25, 0.5), wob = R.range(0.6, 1.6), ph = R() * 6;
    let px = null, pz = null;
    for (let t = 0; t <= dur + 0.01; t += 1) {
      const b = [0, 1, 2, 3, 4].map((i) => clip.ballAt(t - 1 + i * 0.5)).reduce((s, v) => [s[0] + v[0] / 5, 0, s[2] + v[2] / 5], [0, 0, 0]);
      let x = sx + (b[0] - focus[0]) * lazy, z = sz + (b[2] - focus[1]) * lazy * 0.6;
      if (a.keeper) {
        if (a.team === 'D') { x = GOAL_X - 1.2 - Math.max(0, (b[0] - 30) / 25) * 0.0; z = Math.max(-2.5, Math.min(2.5, b[2] * 0.12)); x = Math.min(x, 51.6); }
        else { x = -47 + (b[0] + 10) * 0.05; z = b[2] * 0.05; }
      } else {
        x += Math.sin(t * 0.7 + ph) * wob; z += Math.cos(t * 0.5 + ph) * wob;
        if (a.team === 'D' && a.role === 'DF') x = Math.max(x, Math.min(sx, b[0] + 2)) ; // defenders hold a line
      }
      if (px !== null) {
        const d = Math.hypot(x - px, z - pz), max = a.keeper ? 3.5 : 5.2;
        if (d > max) { x = px + ((x - px) / d) * max; z = pz + ((z - pz) / d) * max; }
      }
      x = Math.max(-52, Math.min(52, x)); z = Math.max(-33, Math.min(33, z));
      px = x; pz = z;
      keys.push([t, x, z]);
    }
    a.path(keys);
  }
}

// Dribble: ball rolls just ahead of the runner between touches.
function dribble(clip, p, t0, t1, n, lead = 0.8) {
  for (let i = 0; i < n; i++) {
    const ta = t0 + ((t1 - t0) * i) / n, tb = t0 + ((t1 - t0) * (i + 1)) / n;
    const [ax, az] = p.posAt(ta), [bx, bz] = p.posAt(tb), [cx, cz] = p.posAt(tb + 0.05);
    const d1 = dirAt(p, ta), d2 = [cx - bx, cz - bz]; const l2 = Math.hypot(...d2) || 1;
    clip.ball({ t0: ta, t1: tb, p0: [ax + d1[0] * 0.35, BALL_R, az + d1[1] * 0.35], p1: [bx + (d2[0] / l2) * lead, BALL_R, bz + (d2[1] / l2) * lead], roll: true });
    p.kick(ta, i % 2 ? -1 : 1, 0.32, 0.35);
  }
}
function dirAt(p, t) {
  const [a, b] = p.posAt(t), [c, d] = p.posAt(t + 0.05);
  const l = Math.hypot(c - a, d - b) || 1;
  return [(c - a) / l, (d - b) / l];
}
const toeOf = (a, t, leg = 1) => { const j = a.jointsAt(t); return leg > 0 ? j.toR : j.toL; };

// Shift every key at/after tFrom so a body part lands on a target point (iterates with re-bakes).
function aim(clip, actor, t, partFn, target, tFrom, iters = 7) {
  for (let i = 0; i < iters; i++) {
    actor.bake();
    const p = partFn(actor.jointsAt(t));
    const dx = target[0] - p[0], dz = target[2] - p[2];
    if (Math.hypot(dx, dz) < 0.01) break;
    for (const k of actor.keys) if (k[0] >= tFrom) { const w = Math.min(1, (k[0] - tFrom) / 0.5 + 0.0001); k[1] += dx * (k[0] >= t ? 1 : w); k[2] += dz * (k[0] >= t ? 1 : w); }
  }
}

function finish(clip, R, focus) {
  fillBackground(clip, R, focus);
  clip.bake();
  return clip;
}

// ---------------------------------------------------------------------------------------------
// 1. Challenge: clean tackle, foul, late, studs-up.
// ---------------------------------------------------------------------------------------------
export function tackle(R, o = {}) {
  const box = o.box ?? R() < 0.55;
  const variant = o.variant || R.pick(['clean', 'foul', 'late', 'studs', 'foul', 'clean']);
  const clip = setup(R, { duration: 8.5, defLine: box ? 40 : 30, ...o });
  const side = R.sign();
  const xc = box ? R.range(41, 45) : R.range(24, 30), zc = box ? R.range(-8, 8) : R.range(-14, 14);
  const tC = fr(R.range(3.5, 4.1));
  const att = clip.find('A', R.pick([9, 7, 11, 10])); att.key = true;
  const def = clip.find('D', R.pick([4, 5])); def.key = true;
  const start = [xc - 13, zc - side * R.range(2, 6)];
  // attacker run
  const afterX = xc + 1.6, afterZ = zc + side * 0.1;
  att.path([[0, ...start], [tC * 0.5, (start[0] + xc) / 2, (start[1] + zc) / 2 + side * 0.6], [tC, xc, zc], [tC + 0.35, afterX, afterZ], [clip.duration, afterX + 0.3, afterZ]]);
  // defender closes from the side
  const dStart = [xc + 7, zc + side * 9];
  def.path([[0, ...dStart], [tC - 1.2, xc + 2.5, zc + side * 3.4], [tC - 0.35, xc + 0.9, zc + side * 1.4], [tC, xc + 0.4, zc + side * 0.7], [clip.duration, xc + 0.3, zc + side * 0.6]]);
  att.bake(); def.bake();
  const dirA = dirAt(att, tC - 0.1);
  const facts = { variant, box: inBox(xc, zc) };
  let ballEnd;
  const leg = -side; // defender tackles with the leg nearer the attacker

  if (variant === 'late') {
    // attacker releases a pass, the challenge arrives afterwards
    const tP = tC - R.range(0.65, 0.85);
    dribble(clip, att, 0.15, tP - 0.02, 4, 0.55);
    const mate = clip.find('A', att.num === 10 ? 8 : 10); mate.key = true;
    const recv = [xc + R.range(-2, 3), zc - side * R.range(10, 14)];
    mate.path([[0, recv[0] - 6, recv[1] - side * 3], [tP + 1.1, ...recv], [clip.duration, recv[0] + 4, recv[1]]]);
    const from = clip.ballAt(tP - 0.02);
    att.kick(tP, 1, 0.45);
    clip.ball({ t0: tP, t1: tP + 1.1, p0: from, p1: [recv[0] + 0.5, BALL_R, recv[1]], roll: true });
    mate.bake();
    dribble(clip, mate, tP + 1.1, clip.duration, 4, 0.7);
    def.slide(tC - 0.32, 0.32, 0.9, leg);
    clip.note(tP, `Pass ${tag(clip, att)} → ${tag(clip, mate)}`);
  } else {
    dribble(clip, att, 0.15, tC - (variant === 'foul' ? 0.3 : 0.05), 5, variant === 'foul' ? 1.6 : 0.85);
    if (variant === 'studs') def.raise(tC - 0.28, 0.24, 0.35, leg, 0.62);
    else def.slide(tC - 0.32, 0.32, 0.9, leg);
  }
  // aim the defender's boot: at the ball (clean) or at the attacker's standing leg (fouls)
  const tgtLeg = (j) => (side > 0 ? j.anL : j.anR);
  if (variant === 'clean') {
    const b = clip.ballAt(tC - 0.05);
    ballEnd = [xc + R.range(4, 8), BALL_R, zc - side * R.range(8, 14)];
    clip.ball({ t0: tC, t1: tC + 1.5, p0: b, p1: ballEnd, roll: true });
    aim(clip, def, tC, (j) => (leg > 0 ? j.toR : j.toL), b, tC - 0.9);
    att.fall(tC + 0.3, 1, 0.6, tC + 2.6);
    att.path(att.keys.map((k) => (k[0] > tC + 0.3 ? [k[0], afterX + 0.2, afterZ] : k)));
    clip.note(tC, `Challenge ${tag(clip, def)} on ${tag(clip, att)}`);
    clip.note(tC + 0.05, 'Ball deflected');
  } else {
    att.fall(tC + 0.04, 1, 0.55, null);
    if (variant === 'studs') att.headHold(99);
    if (variant !== 'late') {
      const b = clip.ballAt(tC - 0.32);
      ballEnd = [b[0] + dirA[0] * 4, BALL_R, b[2] + dirA[1] * 4];
      if (variant === 'studs') {
        // ball is nicked away at the same moment; the boot still lands on the shin
        clip.ball({ t0: tC - 0.32, t1: tC - 0.02, p0: b, p1: clip.ballAt(tC - 0.32).map((v, i) => (i === 1 ? BALL_R : v + (i === 0 ? dirA[0] : dirA[1]) * 0.6)), roll: true });
        const b2 = clip.ballAt(tC - 0.02);
        clip.ball({ t0: tC, t1: tC + 1.4, p0: b2, p1: [b2[0] + 3, BALL_R, b2[2] - side * 6], roll: true });
      } else clip.ball({ t0: tC - 0.3, t1: tC + 1.6, p0: b, p1: ballEnd, roll: true });
    }
    att.bake();
    const aj = att.jointsAt(tC);
    const legPt = variant === 'studs' ? vec.scale(vec.add(side > 0 ? aj.knL : aj.knR, tgtLeg(aj)), 0.5) : tgtLeg(aj);
    aim(clip, def, tC, (j) => (leg > 0 ? j.toR : j.toL), legPt, tC - 0.9);
    clip.note(tC, `Challenge ${tag(clip, def)} on ${tag(clip, att)}`);
    clip.note(tC + 0.7, `${tag(clip, att)} down`, 'warn');
  }
  const ctx = clip.context;
  ctx.question = facts.box ? 'Possible penalty — check the challenge' : 'Check the challenge';
  ctx.onField = R.pick(variant === 'clean' ? ['Play on', 'Play on', facts.box ? 'Penalty' : 'Free kick'] : ['Play on', facts.box ? 'Penalty' : 'Free kick']);
  clip.facts = facts;
  clip.resolve = (rules) => {
    if (variant === 'clean') return { infringements: [], restart: 'Play on' };
    const card = variant === 'late' ? 'Yellow' : variant === 'studs' ? 'Red' : 'None';
    return { infringements: [{ team: 'D', num: def.num, type: 'Foul', card, t: tC }], restart: facts.box ? 'Penalty' : 'Free kick' };
  };
  clip.keyMoment = tC;
  clip.subjects = [att, def];
  return finish(clip, R, [xc, zc]);
}

// ---------------------------------------------------------------------------------------------
// 2. Dive or real contact in the box.
// ---------------------------------------------------------------------------------------------
export function dive(R, o = {}) {
  const contact = o.variant ? o.variant === 'contact' : R() < 0.5;
  const clip = setup(R, { duration: 8, defLine: 40, ...o });
  const side = R.sign();
  const xc = R.range(41, 46), zc = side * R.range(3, 10);
  const tD = fr(R.range(3.4, 4.0));
  const att = clip.find('A', R.pick([9, 7, 11])); att.key = true;
  const def = clip.find('D', R.pick([2, 3, 4, 5])); def.key = true;
  att.path([[0, xc - 12, zc + side * 6], [tD, xc, zc], [tD + 0.4, xc + 1.3, zc - side * 0.3], [clip.duration, xc + 1.5, zc - side * 0.3]]);
  def.path([[0, xc - 2, zc - side * 7], [tD - 0.9, xc + 0.4, zc - side * 2.6], [tD, xc + 0.9, zc - side * 1.15], [clip.duration, xc + 1.1, zc - side * 1.0]]);
  att.bake(); def.bake();
  dribble(clip, att, 0.15, tD - 0.1, 5, 0.9);
  const leg = side > 0 ? -1 : 1;
  def.raise(tD - 0.22, 0.2, 0.25, leg, 0.65);
  def.legOut(tD - 0.22, tD + 0.4, 1);
  const trailing = (j) => (side > 0 ? j.anR : j.anL);
  const aj = att.jointsAt(tD);
  const toward = vec.norm([aj.pelvis[0] - def.posAt(tD)[0], 0, aj.pelvis[2] - def.posAt(tD)[1]]);
  const gap = contact ? 0 : R.range(0.45, 0.7);
  const target = vec.sub(trailing(aj), vec.scale(toward, gap));
  att.fall(tD + (contact ? 0.03 : 0.12), 1, 0.55);
  if (!contact) { att.arm('both', tD + 0.1, tD + 0.45, { abd: 2.4, fwd: 0.4, bend: 0.2 }, 0.1); }
  const b = clip.ballAt(tD - 0.15);
  clip.ball({ t0: tD - 0.1, t1: tD + 1.4, p0: b, p1: [b[0] + 4, BALL_R, b[2] - side * 1.5], roll: true });
  att.bake();
  aim(clip, def, tD, (j) => (leg > 0 ? j.toR : j.toL), target, tD - 0.8);
  const footSeg = (j) => [leg > 0 ? j.toR : j.toL, leg > 0 ? j.anR : j.anL];
  const legs = (j) => [j.anL, j.anR, j.knL, j.knR, j.toL, j.toR];
  for (let i = 0; i < 8; i++) {
    def.bake();
    const g = minDistance(def, att, tD - 0.3, tD + 0.3, footSeg, legs);
    const want = contact ? 0.04 : 0.45;
    if (contact ? g < 0.08 : g > 0.38) break;
    // move the defender's whole approach toward/away from the attacker
    const d = vec.norm([aj.pelvis[0] - def.posAt(tD)[0], 0, aj.pelvis[2] - def.posAt(tD)[1]]);
    const k = (g - want) * (contact ? 1 : 1.1);
    for (const key of def.keys) if (key[0] >= tD - 0.8) { key[1] += d[0] * k; key[2] += d[2] * k; }
  }
  clip.note(tD - 0.6, `${tag(clip, def)} closes down ${tag(clip, att)}`);
  clip.note(tD + 0.2, `${tag(clip, att)} goes down in the area`, 'warn');
  def.bake();
  const minGap = minDistance(def, att, tD - 0.3, tD + 0.3, (j) => [leg > 0 ? j.toR : j.toL, leg > 0 ? j.anR : j.anL], (j) => [j.anL, j.anR, j.knL, j.knR, j.toL, j.toR]);
  clip.facts = { contact, minGap };
  clip.context.question = 'Penalty appeal — was there contact?';
  clip.context.onField = R.pick(['Penalty', 'Play on']);
  clip.resolve = (rules) => contact
    ? { infringements: [{ team: 'D', num: def.num, type: 'Foul', card: 'None', t: tD }], restart: 'Penalty' }
    : { infringements: [{ team: 'A', num: att.num, type: 'Simulation', card: rules.simulationCard, t: tD }], restart: 'Free kick' };
  clip.keyMoment = tD;
  clip.subjects = [att, def];
  return finish(clip, R, [xc, zc]);
}

// ---------------------------------------------------------------------------------------------
// 3. Handball: defender's arm (raised / by side / chest), or attacker's hand before a goal.
// ---------------------------------------------------------------------------------------------
export function handball(R, o = {}) {
  const variant = o.variant || R.pick(['raised', 'side', 'body', 'attacker', 'raised', 'attackerClean']);
  const clip = setup(R, { duration: 9, defLine: 42, ...o });
  const side = R.sign();
  const winger = clip.find('A', side > 0 ? 11 : 7); winger.key = true;
  const cross = [R.range(42, 46), side * R.range(24, 28)];
  const tX = R.range(2.2, 2.8);
  winger.path([[0, cross[0] - 9, cross[1] + side * 1], [tX, ...cross], [clip.duration, cross[0] + 1, cross[1] - side * 1]]);
  winger.bake();
  dribble(clip, winger, 0.1, tX - 0.05, 3, 0.7);
  winger.kick(tX, side > 0 ? -1 : 1, 0.5);
  const from = clip.ballAt(tX - 0.05);
  const tH = fr(tX + R.range(0.85, 1.05));
  const ctx = clip.context;
  if (variant === 'attacker' || variant === 'attackerClean') {
    const st = clip.find('A', 9); st.key = true;
    const spot = [R.range(45.5, 48), side * R.range(-3, 2)];
    st.path([[0, spot[0] - 7, spot[1] - side * 3], [tH, ...spot], [tH + 0.5, spot[0] + 0.4, spot[1]], [clip.duration, spot[0] + 1.5, spot[1]]]);
    const s2 = side > 0 ? 'L' : 'R';
    if (variant === 'attacker') st.arm(s2, tH - 0.25, tH + 0.15, { abd: 1.0, fwd: 0.9, bend: 0.4 }, 0.15);
    st.bake();
    const j = st.jointsAt(tH);
    const hit = variant === 'attacker' ? j['ha' + s2] : vec.add(j.chest, [0.12 * Math.cos(st.poseAt(tH).yaw), -0.05, 0.12 * Math.sin(st.poseAt(tH).yaw)]);
    clip.ball({ t0: tX, t1: tH, p0: from, p1: hit, h: 2.2 });
    const drop = [hit[0] + 0.7, BALL_R, hit[2] + (spot[1] > 0 ? -0.3 : 0.3)];
    clip.ball({ t0: tH, t1: tH + 0.45, p0: hit, p1: drop, h: 0.15 });
    const tS = tH + 0.6;
    st.kick(tS, 1, 0.45);
    const goal = [GOAL_X + 0.6, R.range(0.4, 1.6), R.range(-2.6, 2.6)];
    clip.ball({ t0: tS, t1: tS + 0.42, p0: clip.ballAt(tS - 0.01), p1: goal, h: 0.2 });
    clip.ball({ t0: tS + 0.42, t1: tS + 0.9, p0: goal, p1: [GOAL_X + 1.6, BALL_R, goal[2] * 0.9], h: 0.1 });
    st.celebrate(tS + 1.2);
    clip.note(tX, `Cross ${tag(clip, winger)}`);
    clip.note(tH, `${tag(clip, st)} controls`);
    clip.note(tS + 0.4, `GOAL ${clip.attacking.short}`, 'goal');
    ctx.question = 'Goal — check for handball in the build-up';
    ctx.onField = 'Goal';
    clip.facts = { variant };
    clip.resolve = () => variant === 'attacker'
      ? { infringements: [{ team: 'A', num: 9, type: 'Handball', card: 'None', t: tH }], restart: 'Disallow goal' }
      : { infringements: [], restart: 'Goal stands' };
    clip.keyMoment = tH;
    clip.subjects = [st];
    fillBackground(clip, R, [46, 0]);
    // goalkeeper beaten: dive late
    const gk = clip.find('D', 1);
    gk.dive(tS + 0.15, goal[2] > 0 ? 1 : -1, 0.5, 0.3);
    clip.bake();
    return clip;
  }
  const def = clip.find('D', R.pick([4, 5])); def.key = true;
  const spot = [R.range(46, 49), side * R.range(-1, 5)];
  def.path([[0, spot[0] - 2.5, spot[1] + side * 2], [tH - 0.6, spot[0] - 0.3, spot[1]], [tH, ...spot], [clip.duration, spot[0] + 0.5, spot[1] - side * 0.5]]);
  // face the crosser
  def.face([[0, Math.atan2(cross[1] - spot[1], cross[0] - spot[0])], [clip.duration, Math.atan2(cross[1] - spot[1], cross[0] - spot[0])]]);
  const armSide = R() < 0.5 ? 'L' : 'R';
  const jumping = variant === 'raised' && R() < 0.6;
  if (jumping) def.jump(tH - 0.3, 0.6, 0.4);
  if (variant === 'raised') def.arm(armSide, tH - 0.35, tH + 0.3, { abd: R.range(1.6, 2.2), fwd: 0.3, bend: 0.25 }, 0.18);
  if (variant === 'side') def.arm(armSide, tH - 0.5, tH + 0.3, { abd: 0.12, fwd: 0.05, bend: 0.2 }, 0.2);
  def.bake();
  const j = def.jointsAt(tH);
  const hit = variant === 'raised' ? j['ha' + armSide] : variant === 'side' ? vec.add(vec.scale(j['el' + armSide], 0.5), vec.scale(j['ha' + armSide], 0.5)) : vec.add(j.chest, [0.14 * Math.cos(def.poseAt(tH).yaw), -0.08, 0.14 * Math.sin(def.poseAt(tH).yaw)]);
  clip.ball({ t0: tX, t1: tH, p0: from, p1: hit, h: 2.6 });
  const away = [hit[0] - R.range(5, 9), BALL_R, hit[2] + side * R.range(2, 6)];
  clip.ball({ t0: tH, t1: tH + 1.3, p0: hit, p1: away, h: 1.2 });
  clip.ball({ t0: tH + 1.3, t1: tH + 2.6, p0: away, p1: [away[0] - 4, BALL_R, away[2]], roll: true });
  const st = clip.find('A', 9); st.key = true;
  st.path([[0, 40, side * 6], [tH, 46, -side * 1], [tH + 0.3, 46.3, -side * 1], [tH + 0.8, 46.2, -side * 1], [clip.duration, 45.5, -side * 1.5]]);
  st.arm('both', tH + 0.4, tH + 1.6, { abd: 1.8, fwd: 0.5, bend: 0.3 }, 0.15); // appeals
  clip.note(tX, `Cross ${tag(clip, winger)}`);
  clip.note(tH, `Ball strikes ${tag(clip, def)}`);
  clip.note(tH + 0.8, `${clip.attacking.short} appeal for handball`, 'warn');
  ctx.question = 'Handball appeal';
  ctx.onField = R.pick(['Play on', 'Play on', 'Penalty']);
  clip.facts = { variant, armAbd: variant === 'raised' ? 'above shoulder' : variant === 'side' ? 'by side' : 'n/a', contactPart: variant === 'body' ? 'chest' : 'arm' };
  clip.resolve = () => variant === 'raised'
    ? { infringements: [{ team: 'D', num: def.num, type: 'Handball', card: 'None', t: tH }], restart: 'Penalty' }
    : { infringements: [], restart: 'Play on' };
  clip.keyMoment = tH;
  clip.subjects = [def];
  return finish(clip, R, [44, 0]);
}

// ---------------------------------------------------------------------------------------------
// 4. Offside goal. Margin is exact to the centimetre against the second-last defender.
// ---------------------------------------------------------------------------------------------
export function offside(R, o = {}) {
  const margin = o.margin ?? R.pick([-0.7, -0.3, -0.12, -0.05, 0.05, 0.08, 0.14, 0.3, 0.7]);
  const line = R.range(30, 36);
  const clip = setup(R, { duration: 9, defLine: line, ...o });
  const side = R.sign();
  const tP = fr(R.range(2.0, 2.6));
  const passer = clip.find('A', R.pick([8, 10, 4])); passer.key = true;
  const runner = clip.find('A', R.pick([9, 11, 7])); runner.key = true;
  const pp = [line - R.range(12, 16), side * R.range(-4, 10)];
  passer.path([[0, pp[0] - 5, pp[1]], [tP, ...pp], [clip.duration, pp[0] + 4, pp[1]]]);
  passer.bake();
  dribble(clip, passer, 0.2, tP - 0.03, 3, 0.7);
  passer.kick(tP, 1, 0.5);
  // defensive line: four defenders level-ish, holding then turning to chase
  const defs = [2, 4, 5, 3].map((n) => clip.find('D', n));
  const zs = [20, 7, -7, -20];
  const lineAt = (t) => line + 1.2 - Math.min(t, tP) * 0.5; // stepping up
  defs.forEach((d, i) => {
    d.key = true;
    const lx = lineAt(tP) + (i === 1 || i === 2 ? 0 : R.range(-0.8, -0.3));
    d.path([[0, lineAt(0) + R.range(-0.4, 0.4), zs[i] + R.range(-1, 1)], [tP, lx, zs[i] * 0.95], [tP + 0.6, lx + 1.6, zs[i] * 0.9], [clip.duration, lx + 14, zs[i] * 0.6]]);
  });
  // runner starts level-ish then bursts; final position fixed below
  const rz = side * R.range(1, 9);
  runner.path([[0, line - 1.5, rz + side * 2], [tP - 0.8, line, rz + side * 1], [tP, line + 0.5, rz], [tP + 1.6, line + 10, rz * 0.6], [tP + 2.6, 46, rz * 0.3], [clip.duration, 49, rz * 0.2]]);
  for (const a of [...defs, runner]) a.bake();
  // second-last defender (keeper is last): the most goal-ward scoring part among outfield defenders
  const partX = (a) => Math.max(...SCORING.map((k) => a.jointsAt(tP)[k][0]));
  const defX = Math.max(...defs.map(partX));
  // place the runner so their furthest scoring part is exactly `margin` beyond that
  for (let i = 0; i < 4; i++) {
    const dx = defX + margin - partX(runner);
    for (const k of runner.keys) if (k[0] <= tP + 0.6) k[1] += dx * (k[0] <= tP ? 1 : 0.5);
    runner.bake();
  }
  const last = defs.reduce((a, b) => (partX(a) > partX(b) ? a : b));
  const rcv = runner.posAt(tP + 2.0);
  const from = clip.ballAt(tP - 0.03);
  clip.ball({ t0: tP, t1: tP + 2.0, p0: from, p1: [rcv[0] + 0.6, BALL_R, rcv[1]], roll: true });
  runner.bake();
  dribble(clip, runner, tP + 2.0, tP + 2.55, 1, 0.6);
  const tS = tP + 2.6;
  runner.kick(tS, 1, 0.45);
  const goal = [GOAL_X + 0.5, R.range(0.3, 1.2), R.range(-3, 3)];
  clip.ball({ t0: tS, t1: tS + 0.45, p0: clip.ballAt(tS - 0.01), p1: goal, h: 0.3 });
  clip.ball({ t0: tS + 0.45, t1: tS + 1, p0: goal, p1: [GOAL_X + 1.7, BALL_R, goal[2]], h: 0.1 });
  runner.celebrate(tS + 1.0);
  clip.note(tP, `Pass played ${tag(clip, passer)} → ${tag(clip, runner)}`, 'key');
  clip.note(tS + 0.45, `GOAL ${clip.attacking.short}`, 'goal');
  clip.context.question = 'Goal — check offside at the moment of the pass';
  clip.context.onField = 'Goal';
  clip.facts = { margin, passT: tP, lastDefender: last.num };
  clip.resolve = (rules) => {
    const off = margin > rules.offsideTolerance + 1e-6;
    return off ? { infringements: [{ team: 'A', num: runner.num, type: 'Offside', card: 'None', t: tP }], restart: 'Disallow goal' } : { infringements: [], restart: 'Goal stands' };
  };
  clip.keyMoment = tP;
  clip.subjects = [runner, last];
  fillBackground(clip, R, [line, 0]);
  const gk = clip.find('D', 1);
  gk.dive(tS + 0.12, goal[2] > 0 ? 1 : -1, 0.45, 0.3);
  clip.bake();
  return clip;
}

// ---------------------------------------------------------------------------------------------
// 5. Goal-line: did the whole ball cross the whole line before the keeper clawed it out?
// ---------------------------------------------------------------------------------------------
export function goalLine(R, o = {}) {
  const delta = o.delta ?? R.pick([-0.08, -0.035, -0.012, 0.012, 0.035, 0.08]); // ball's trailing edge vs line edge
  const clip = setup(R, { duration: 8, defLine: 42, ...o });
  const st = clip.find('A', 9); st.key = true;
  const side = R.sign();
  const shot = [R.range(36, 40), side * R.range(2, 10)];
  const tS = R.range(2.6, 3.2);
  st.path([[0, shot[0] - 9, shot[1] - side * 3], [tS, ...shot], [clip.duration, shot[0] + 3, shot[1]]]);
  st.bake();
  dribble(clip, st, 0.1, tS - 0.05, 4, 0.8);
  st.kick(tS, 1, 0.5);
  const tL = fr(tS + R.range(0.75, 0.9));
  const zl = R.range(-1.8, 1.8), yl = R.range(0.25, 0.9);
  const lineX = GOAL_X + BALL_R + delta; // ball centre at deepest point
  const from = clip.ballAt(tS - 0.05);
  clip.ball({ t0: tS, t1: tL, p0: from, p1: [lineX, yl, zl], h: 1.6 });
  clip.ball({ t0: tL, t1: tL + 0.8, p0: [lineX, yl, zl], p1: [GOAL_X - 3.5, 0.6, zl + side * 4], h: 0.9 });
  clip.ball({ t0: tL + 0.8, t1: tL + 2.2, p0: [GOAL_X - 3.5, 0.6, zl + side * 4], p1: [GOAL_X - 8, BALL_R, zl + side * 9], roll: true });
  const gk = clip.find('D', 1); gk.key = true;
  gk.path([[0, GOAL_X - 1.5, 0], [tS, GOAL_X - 1.2, side * 0.6], [tL - 0.35, GOAL_X - 0.5, zl * 0.5], [tL, GOAL_X - 0.15, zl - Math.sign(zl || 1) * 0.75], [clip.duration, GOAL_X - 0.4, zl]]);
  gk.dive(tL - 0.3, zl >= 0 ? 1 : -1, 0.35, 0.25);
  gk.arm('both', tL - 0.3, tL + 0.25, { abd: 2.3, fwd: 0.9, bend: 0.2 }, 0.1);
  clip.note(tS, `Shot ${tag(clip, st)}`);
  clip.note(tL, `Clearance on the line ${tag(clip, gk)}`, 'key');
  clip.context.question = 'Goal-line check — did the whole ball cross?';
  clip.context.onField = R.pick(['Play on', 'Play on', 'Goal']);
  clip.facts = { delta, deepest: tL };
  clip.resolve = () => (delta > 0 ? { infringements: [], restart: 'Award goal' } : { infringements: [], restart: 'Play on' });
  clip.keyMoment = tL;
  clip.subjects = [gk];
  clip.goalCam = true;
  return finish(clip, R, [44, 0]);
}

// ---------------------------------------------------------------------------------------------
// 6. Penalty procedure: keeper off the line, encroachment.
// ---------------------------------------------------------------------------------------------
export function penalty(R, o = {}) {
  const variant = o.variant || R.pick(['keeperEarly', 'keeperLegal', 'encroach', 'cleanRebound', 'keeperEarly']);
  const clip = setup(R, { duration: 8, defLine: 34, ...o });
  const spot = [GOAL_X - 11, 0];
  const tK = 2.4;
  const kicker = clip.find('A', R.pick([9, 10, 7])); kicker.key = true;
  kicker.path([[0, spot[0] - 3.5, -2.2], [tK - 0.9, spot[0] - 2.4, -1.4], [tK, spot[0] - 0.35, -0.12], [clip.duration, spot[0] + 1, 0]]);
  kicker.kick(tK, 1, 0.5);
  clip.ball({ t0: 0, t1: tK, p0: [spot[0], BALL_R, spot[1]], p1: [spot[0], BALL_R, spot[1]] });
  const gk = clip.find('D', 1); gk.key = true;
  const early = variant === 'keeperEarly';
  const dir = R.sign();
  const gz = dir * R.range(1.6, 2.6);
  gk.path([[0, GOAL_X - 0.05, 0], [tK - 0.45, GOAL_X - 0.05, 0], [tK, early ? GOAL_X - R.range(0.8, 1.2) : GOAL_X - 0.15, 0], [tK + 0.5, early ? GOAL_X - 1.1 : GOAL_X - 0.3, gz * 0.6], [clip.duration, GOAL_X - 0.8, gz * 0.6]]);
  gk.face([[0, Math.PI], [clip.duration, Math.PI]]);
  gk.dive(tK + 0.05, -dir, 0.45, 0.3); // facing -x, so its right is -z
  const saved = variant !== 'cleanRebound' && variant !== 'encroach' ? true : true;
  const hit = [GOAL_X - (early ? 1.0 : 0.25), R.range(0.4, 0.9), gz];
  clip.ball({ t0: tK, t1: tK + 0.45, p0: [spot[0], BALL_R, spot[1]], p1: hit, h: 0.15 });
  const reb = [GOAL_X - R.range(6, 8), BALL_R, gz * 0.4 + R.range(-1.5, 1.5)];
  clip.ball({ t0: tK + 0.45, t1: tK + 1.4, p0: hit, p1: reb, h: 0.8 });
  const outfield = [];
  // players lined up on the edge of the box / arc
  const lineUp = clip.actors.filter((a) => !a.key && !a.keeper).slice(0, 10);
  lineUp.forEach((a, i) => {
    const z = -16 + i * 3.4 + R.range(-0.4, 0.4);
    const x = BOX_X - R.range(0.6, 2.5) - (Math.abs(z) < 9.15 ? 2.2 : 0);
    a.slot = [x, z];
    a.key = true;
    a.path([[0, x, z], [tK, x, z], [tK + 1.2, x + 3.5, z * 0.7], [clip.duration, x + 5, z * 0.6]]);
    outfield.push(a);
  });
  let scorer = null, encroacher = null;
  if (variant === 'encroach' || variant === 'cleanRebound') {
    scorer = outfield.find((a) => a.team === 'A') || clip.find('A', 11);
    const into = variant === 'encroach' ? BOX_X + R.range(0.8, 1.6) : BOX_X - 0.4;
    const z0 = reb[2] + R.range(-3, 3);
    scorer.path([[0, BOX_X - 1.6, z0], [tK - 0.6, BOX_X - 1.4, z0], [tK, into, z0 * 0.9], [tK + 1.35, reb[0] - 0.4, reb[2]], [tK + 1.6, reb[0], reb[2]], [clip.duration, reb[0] + 3, reb[2]]]);
    scorer.bake();
    scorer.kick(tK + 1.55, 1, 0.45);
    const goal = [GOAL_X + 0.6, R.range(0.3, 1.3), R.range(-2.5, 2.5)];
    clip.ball({ t0: tK + 1.55, t1: tK + 2.0, p0: reb, p1: goal, h: 0.2 });
    clip.ball({ t0: tK + 2.0, t1: tK + 2.5, p0: goal, p1: [GOAL_X + 1.7, BALL_R, goal[2]], h: 0.1 });
    scorer.celebrate(tK + 2.6);
    clip.note(tK + 2.0, `GOAL ${clip.attacking.short}`, 'goal');
    if (variant === 'encroach') encroacher = scorer;
  }
  clip.note(tK, `Penalty taken ${tag(clip, kicker)}`, 'key');
  clip.note(tK + 0.45, `Saved by ${tag(clip, gk)}`);
  const ctx = clip.context;
  ctx.question = scorer ? 'Goal from a penalty rebound — check the kick' : 'Penalty saved — check the kick';
  ctx.onField = scorer ? 'Goal' : 'Play on';
  clip.facts = { variant };
  clip.resolve = () => {
    if (variant === 'keeperEarly') return { infringements: [{ team: 'D', num: 1, type: 'Keeper off line', card: 'Yellow', t: tK }], restart: 'Retake penalty' };
    if (variant === 'encroach') return { infringements: [{ team: 'A', num: encroacher.num, type: 'Encroachment', card: 'None', t: tK }], restart: 'Disallow goal' };
    if (variant === 'cleanRebound') return { infringements: [], restart: 'Goal stands' };
    return { infringements: [], restart: 'Play on' };
  };
  clip.keyMoment = tK;
  clip.subjects = [gk, kicker];
  clip.penalty = true;
  return finish(clip, R, [44, 0]);
}

// ---------------------------------------------------------------------------------------------
// Off-the-ball overlay: an elbow or a shove away from the main action.
// ---------------------------------------------------------------------------------------------
export function addOffBall(clip, R, kind = null) {
  kind = kind || R.pick(['elbow', 'shove', 'elbow']);
  const pool = clip.actors.filter((a) => !a.key && !a.keeper);
  const tV = fr(Math.min(clip.duration - 2.5, Math.max(3.0, (clip.keyMoment || 3) + R.range(-1.5, 1.2))));
  const t0 = tV - 2.2;
  const b = clip.ballAt(tV);
  const cands = [];
  for (const a of pool) for (const d of pool) {
    if (a.team === d.team) continue;
    const pa = a.posAt(t0), pd = d.posAt(t0);
    const mid = [(pa[0] + pd[0]) / 2, (pa[1] + pd[1]) / 2];
    const far = Math.hypot(mid[0] - b[0], mid[1] - b[2]);
    if (far > 9 && far < 26 && Math.hypot(pa[0] - pd[0], pa[1] - pd[1]) < 8) cands.push([a, d, mid]);
  }
  if (!cands.length) return null;
  const [agg, vic, meet] = R.pick(cands);
  agg.key = vic.key = true;
  const ap = agg.posAt(t0);
  let yaw = Math.atan2(meet[1] - ap[1], meet[0] - ap[0]);
  if (Math.hypot(meet[1] - ap[1], meet[0] - ap[0]) < 0.3) yaw = R() * 6.28;
  const keep = (a) => a.keys.filter((k) => k[0] < t0);
  agg.path([...keep(agg), [t0, ...ap], [tV - 0.9, meet[0] - Math.cos(yaw) * 2.0, meet[1] - Math.sin(yaw) * 2.0], [tV, meet[0] - Math.cos(yaw) * 0.75, meet[1] - Math.sin(yaw) * 0.75], [clip.duration, meet[0] - Math.cos(yaw) * 1.5, meet[1] - Math.sin(yaw) * 1.5]]);
  vic.path([...keep(vic), [t0, ...vic.posAt(t0)], [tV - 0.8, meet[0] + 0.4, meet[1] + 0.2], [tV, ...meet], [clip.duration, meet[0] + Math.cos(yaw) * 0.6, meet[1] + Math.sin(yaw) * 0.6]]);
  agg.face([[0, agg.poseAt(0).yaw ?? yaw], [t0, yaw], [clip.duration, yaw]]);
  if (kind === 'elbow') {
    agg.arm('R', tV - 0.12, tV + 0.12, { abd: 1.45, fwd: 1.1, bend: 1.9 }, 0.12);
    vic.fall(tV + 0.05, -1, 0.5);
    vic.headHold(tV + 0.4);
  } else {
    agg.arm('both', tV - 0.1, tV + 0.15, { abd: 0.25, fwd: 1.45, bend: 0.25 }, 0.12);
    agg.lean(tV - 0.15, tV + 0.25, 0.25);
    vic.fall(tV + 0.08, 1, 0.5, tV + 2.2);
  }
  agg.bake(); vic.bake();
  clip.note(tV + 1.4, `Player down off the ball: ${tag(clip, vic)}`, 'warn');
  const base = clip.resolve;
  clip.resolve = (rules) => {
    const t = base(rules);
    return { ...t, infringements: [...t.infringements, { team: agg.team, num: agg.num, type: 'Violent conduct', card: kind === 'elbow' ? 'Red' : 'Yellow', t: tV, offBall: true }] };
  };
  clip.offBall = { kind, agg, vic, t: tV };
  return clip;
}

export function tag(clip, a) { return `#${a.num} ${a.team === 'A' ? clip.attacking.short : clip.defending.short}`; }

function minDistance(a, b, t0, t1, partsA, partsB) {
  let m = Infinity;
  for (let t = t0; t <= t1; t += 1 / 60) {
    const ja = a.jointsAt(t), jb = b.jointsAt(t);
    const [p0, p1] = partsA(ja);
    for (const q of partsB(jb)) m = Math.min(m, segDist(q, p0, p1));
  }
  return m;
}

export const GENERATORS = { tackle, dive, handball, offside, goalLine, penalty };
export { clockOf };
