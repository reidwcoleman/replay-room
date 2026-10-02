// Pose → joint positions. Pure math (no three.js) so the judge, the tests and the renderer all
// agree on exactly where every boot, knee and hand is at any instant.

export const DIM = {
  pelvisH: 0.95, thigh: 0.45, shin: 0.45, foot: 0.19,
  torso: 0.5, headR: 0.115, shoulderW: 0.2, hipW: 0.1, upper: 0.29, fore: 0.27,
};

export const JOINTS = ['pelvis', 'chest', 'neck', 'head', 'shL', 'elL', 'haL', 'shR', 'elR', 'haR', 'hipL', 'knL', 'anL', 'toL', 'hipR', 'knR', 'anR', 'toR'];
// Parts that count for offside (arms and hands never do).
export const SCORING = ['head', 'chest', 'pelvis', 'shL', 'shR', 'knL', 'knR', 'anL', 'anR', 'toL', 'toR'];
export const FEET = ['anL', 'anR', 'toL', 'toR'];

export function basePose() {
  return {
    x: 0, z: 0, yaw: 0, speed: 0, phase: 0,
    lean: 0, crouch: 0, fall: 0, fallDir: 1, slide: 0, dive: 0, diveDir: 1, jump: 0,
    kick: -1, kickLeg: 1, legRaise: 0, raiseLeg: 1, legOut: 0,
    armL: { abd: 0, fwd: 0, bend: 0.25 }, armR: { abd: 0, fwd: 0, bend: 0.25 },
    headHold: 0, celebrate: 0,
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

// Leg swing (rad, + forward) and knee bend for the kick animation, q in [0,1]. Ball contact at q = 0.55.
export function kickCurve(q) {
  if (q < 0.4) { const u = smooth(q / 0.4); return [lerp(0, -0.85, u), lerp(0.2, 1.5, u)]; }
  if (q < 0.55) { const u = (q - 0.4) / 0.15; return [lerp(-0.85, 0.35, u), lerp(1.5, 0.25, u)]; }
  if (q < 0.75) { const u = (q - 0.55) / 0.2; return [lerp(0.35, 1.15, u), lerp(0.25, 0.05, u)]; }
  const u = smooth((q - 0.75) / 0.25);
  return [lerp(1.15, 0, u), lerp(0.05, 0.2, u)];
}

export function joints(p, out = {}) {
  const D = DIM;
  // ---- local frame: +X forward, +Y up, +Z right ----
  const crouch = p.crouch || 0;
  const P = [0, D.pelvisH - crouch * 0.22, 0];
  const amp = clamp(p.speed / 7, 0, 1) * 0.8 + (p.speed > 0.3 ? 0.08 : 0);
  const L = {};
  L.pelvis = P;

  for (const s of [-1, 1]) {
    const tag = s < 0 ? 'L' : 'R';
    const ph = p.phase + (s > 0 ? 0 : Math.PI);
    let a = amp * Math.sin(ph);
    let k = amp * 1.2 * Math.max(0, Math.sin(ph + 1.3)) + crouch * 0.9 + 0.08;
    if (p.kick >= 0 && p.kick <= 1 && p.kickLeg === s) { const [ka, kk] = kickCurve(p.kick); const m = p.kickAmp ?? 1; a = a + (ka - a) * m; k = k + (kk - k) * m; }
    if (p.legRaise > 0 && p.raiseLeg === s) { a = lerp(a, 1.35, p.legRaise); k = lerp(k, 0.05, p.legRaise); }
    if (p.slide > 0) {
      // lead leg straight out, trailing leg tucked
      if (s === p.raiseLeg) { a = lerp(a, 0.22, p.slide); k = lerp(k, 0.02, p.slide); }
      else { a = lerp(a, 0.2, p.slide); k = lerp(k, 2.7, p.slide); }
    }
    if (p.fall > 0) { a = lerp(a, s > 0 ? 0.15 : -0.1, p.fall); k = lerp(k, s > 0 ? 0.2 : 0.9, p.fall); }
    const hip = [P[0], P[1], P[2] + s * D.hipW];
    const lo = (p.legOut || 0) * s * 0.35; // splay sideways
    const kn = [hip[0] + Math.sin(a) * D.thigh * Math.cos(lo), hip[1] - Math.cos(a) * D.thigh * Math.cos(lo), hip[2] + Math.sin(lo) * D.thigh];
    const b = a - k;
    const an = [kn[0] + Math.sin(b) * D.shin, kn[1] - Math.cos(b) * D.shin, kn[2] + Math.sin(lo) * 0.1];
    // toes point along the shin for a tucked slide leg, otherwise square to it
    const pt = p.slide > 0 && s !== p.raiseLeg ? p.slide : 0;
    const fx = Math.cos(b) * (1 - pt) + Math.sin(b) * pt, fy = Math.sin(b) * (1 - pt) - Math.cos(b) * pt;
    const fl = Math.hypot(fx, fy) || 1;
    const to = [an[0] + (fx / fl) * D.foot, an[1] + (fy / fl) * D.foot, an[2]];
    L['hip' + tag] = hip; L['kn' + tag] = kn; L['an' + tag] = an; L['to' + tag] = to;
  }

  // torso
  const lean = (p.lean || 0) + amp * 0.12 + crouch * 0.35;
  const up = [Math.sin(lean), Math.cos(lean), 0];
  const fw = [Math.cos(lean), -Math.sin(lean), 0];
  const add = (a, v, s) => [a[0] + v[0] * s, a[1] + v[1] * s, a[2] + v[2] * s];
  const C = add(P, up, D.torso);
  L.chest = C;
  L.neck = add(C, up, 0.06);
  L.head = add(L.neck, up, 0.07 + D.headR);

  for (const s of [-1, 1]) {
    const tag = s < 0 ? 'L' : 'R';
    const arm = s < 0 ? p.armL : p.armR;
    let abd = arm.abd, f = arm.fwd, bend = arm.bend;
    const ph = p.phase + (s > 0 ? Math.PI : 0);
    f += -amp * 0.9 * Math.sin(ph) * (1 - Math.min(1, abd));
    bend += amp * 0.9;
    if (p.headHold > 0) { abd = lerp(abd, 0.35, p.headHold); f = lerp(f, 1.9, p.headHold); bend = lerp(bend, 2.25, p.headHold); }
    if (p.celebrate > 0) { abd = lerp(abd, 2.6, p.celebrate); f = lerp(f, 0.3, p.celebrate); bend = lerp(bend, 0.2, p.celebrate); }
    const sh = add(add(C, up, -0.04), [0, 0, 1], s * D.shoulderW);
    // upper arm direction: start hanging, raise forward by f, abduct sideways by abd
    const ca = Math.cos(abd), sa = Math.sin(abd), cf = Math.cos(f), sf = Math.sin(f);
    let d = [-up[0] * cf * ca + fw[0] * sf * ca, -up[1] * cf * ca + fw[1] * sf * ca, s * sa];
    d = norm(d);
    const el = add(sh, d, D.upper);
    // forearm bends toward the front (or up when the upper arm points forward)
    let perp = sub(fw, scale(d, dot(fw, d)));
    if (len(perp) < 0.2) perp = sub(up, scale(d, dot(up, d)));
    perp = norm(perp);
    const fd = norm(add(scale(d, Math.cos(bend)), perp, Math.sin(bend)));
    const ha = add(el, fd, D.fore);
    L['sh' + tag] = sh; L['el' + tag] = el; L['ha' + tag] = ha;
  }

  // ---- whole-body rotations about the pelvis: fall / slide pitch, dive roll ----
  const pitch = (p.fall || 0) * (Math.PI / 2) * 0.96 * (p.fallDir || 1) - (p.slide || 0) * 1.2;
  const roll = (p.dive || 0) * (Math.PI / 2) * 0.9 * (p.diveDir || 1);
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  let minY = Infinity;
  for (const j of JOINTS) {
    const v = L[j];
    let x = v[0] - P[0], y = v[1] - P[1], z = v[2] - P[2];
    // pitch: rotate so +Y tips toward +X
    let x1 = x * cp + y * sp, y1 = -x * sp + y * cp;
    // roll: +Y tips toward +Z
    let y2 = y1 * cr - z * sr, z2 = y1 * sr + z * cr;
    L[j] = [x1 + P[0], y2 + P[1], z2 + P[2]];
    const r = j === 'head' ? D.headR : j === 'chest' || j === 'pelvis' ? 0.16 : 0.06;
    minY = Math.min(minY, L[j][1] - r);
  }
  // keep the lowest point on the grass (gives a natural bob), plus jumps
  const yOff = -minY + (p.jump || 0);

  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  for (const j of JOINTS) {
    const v = L[j];
    out[j] = [p.x + v[0] * c - v[2] * s, v[1] + yOff, p.z + v[0] * s + v[2] * c];
  }
  return out;
}

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function len(a) { return Math.hypot(a[0], a[1], a[2]); }
function norm(a) { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

export const vec = { sub, scale, dot, len, norm, add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], dist: (a, b) => len(sub(a, b)) };

// Segment distance helpers for contact checks.
export function segDist(p, a, b) {
  const ab = sub(b, a), t = clamp(dot(sub(p, a), ab) / (dot(ab, ab) || 1), 0, 1);
  return len(sub(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]));
}
