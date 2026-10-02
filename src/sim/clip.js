// A Clip is one replay: 22 actors on waypoint paths with timed actions, a ball made of flight
// segments, a match log and the ground truth. Everything is a pure function of time.
import { basePose, joints } from './kinematics.js';

export const FPS = 30;
export const BALL_R = 0.11;
export const GOAL_X = 52.5, HALF_W = 34, BOX_X = 52.5 - 16.5, BOX_HALF_W = 20.16, GOAL_HALF_W = 3.66, GOAL_H = 2.44;
const SAMPLE = 60;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

export class Actor {
  constructor(clip, o) {
    this.clip = clip;
    this.id = o.id;
    this.team = o.team;       // 'A' attacks +x, 'D' defends +x
    this.num = o.num;
    this.role = o.role || 'MF';
    this.keeper = this.role === 'GK';
    this.keys = [];           // [t, x, z]
    this.events = [];
    this.faceKeys = null;     // optional [t, yaw]
    this.key = false;         // part of the incident
  }
  path(keys) { this.keys = keys.map((k) => [...k]).sort((a, b) => a[0] - b[0]); return this; }
  add(t, x, z) { this.keys.push([t, x, z]); this.keys.sort((a, b) => a[0] - b[0]); return this; }
  face(keys) { this.faceKeys = keys; return this; }
  ev(type, o) { this.events.push({ type, ...o }); return this; }
  kick(t, leg = 1, dur = 0.5, amp = 1) { return this.ev('kick', { t: t - dur * 0.55, dur, leg, amp }); } // t = contact time
  fall(t, dir = 1, dur = 0.55, up = null) { return this.ev('fall', { t, dur, dir, up }); }
  slide(t, dur = 0.35, hold = 0.9, leg = 1) { return this.ev('slide', { t, dur, hold, leg }); }
  raise(t, dur, hold, leg = 1, amt = 1) { return this.ev('raise', { t, dur, hold, leg, amt }); }
  arm(side, t0, t1, to, ease = 0.18) { return this.ev('arm', { side, t0, t1, to, ease }); }
  headHold(t0, t1 = 99) { return this.ev('headHold', { t0, t1 }); }
  jump(t, dur = 0.6, h = 0.45) { return this.ev('jump', { t, dur, h }); }
  dive(t, dir, dur = 0.5, h = 0.35) { return this.ev('dive', { t, dur, dir, h }); }
  crouch(t0, t1, amt = 0.6) { return this.ev('crouch', { t0, t1, amt }); }
  celebrate(t0) { return this.ev('celebrate', { t0 }); }
  lean(t0, t1, amt) { return this.ev('lean', { t0, t1, amt }); }
  legOut(t0, t1, amt = 1) { return this.ev('legOut', { t0, t1, amt }); }

  // Smooth position on the waypoint path (Catmull-Rom, clamped).
  posAt(t) {
    const k = this.keys;
    if (!k.length) return [0, 0];
    if (t <= k[0][0]) return [k[0][1], k[0][2]];
    if (t >= k[k.length - 1][0]) return [k[k.length - 1][1], k[k.length - 1][2]];
    let i = 0;
    while (i < k.length - 2 && t > k[i + 1][0]) i++;
    const a = k[Math.max(0, i - 1)], b = k[i], c = k[i + 1], d = k[Math.min(k.length - 1, i + 2)];
    const u = (t - b[0]) / (c[0] - b[0] || 1);
    const cr = (p0, p1, p2, p3) => {
      // tension-reduced Catmull-Rom so paths don't overshoot
      const m1 = (p2 - p0) * 0.35, m2 = (p3 - p1) * 0.35;
      const u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2;
    };
    return [cr(a[1], b[1], c[1], d[1]), cr(a[2], b[2], c[2], d[2])];
  }

  bake() {
    const n = Math.ceil(this.clip.duration * SAMPLE) + 2;
    this.sx = new Float32Array(n); this.sz = new Float32Array(n);
    this.ssp = new Float32Array(n); this.sph = new Float32Array(n); this.syaw = new Float32Array(n);
    let phase = this.id * 1.37, yaw = this.team === 'A' ? 0 : Math.PI;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE;
      const [x, z] = this.posAt(t);
      const [x2, z2] = this.posAt(t + 1 / SAMPLE);
      const vx = (x2 - x) * SAMPLE, vz = (z2 - z) * SAMPLE, sp = Math.hypot(vx, vz);
      // facing: travel direction when running, otherwise watch the ball
      let want;
      if (this.faceKeys) want = interpKeys(this.faceKeys, t);
      else if (sp > 1.6) want = Math.atan2(vz, vx);
      else {
        const b = this.clip.ballAt(t);
        want = Math.hypot(b[0] - x, b[2] - z) > 0.5 ? Math.atan2(b[2] - z, b[0] - x) : yaw;
        if (sp > 0.4) want = blendAngle(want, Math.atan2(vz, vx), (sp - 0.4) / 1.2);
      }
      yaw = blendAngle(yaw, want, i === 0 ? 1 : 0.12);
      phase += (sp * 1.45 + (sp > 0.2 ? 1.2 : 0)) / SAMPLE * 1.0;
      this.sx[i] = x; this.sz[i] = z; this.ssp[i] = sp; this.sph[i] = phase; this.syaw[i] = yaw;
    }
  }

  poseAt(t, out = basePose()) {
    const f = clamp(t, 0, this.clip.duration) * SAMPLE, i = Math.floor(f), u = f - i, j = Math.min(i + 1, this.sx.length - 1);
    out.x = lerp(this.sx[i], this.sx[j], u);
    out.z = lerp(this.sz[i], this.sz[j], u);
    out.speed = lerp(this.ssp[i], this.ssp[j], u);
    out.phase = lerp(this.sph[i], this.sph[j], u);
    out.yaw = blendAngle(this.syaw[i], this.syaw[j], u);
    out.lean = 0; out.crouch = 0; out.fall = 0; out.slide = 0; out.dive = 0; out.jump = 0;
    out.kick = -1; out.legRaise = 0; out.headHold = 0; out.celebrate = 0; out.legOut = 0;
    out.armL.abd = 0; out.armL.fwd = 0; out.armL.bend = 0.25;
    out.armR.abd = 0; out.armR.fwd = 0; out.armR.bend = 0.25;
    if (this.keeper) { out.crouch = 0.35; out.armL.abd = out.armR.abd = 0.45; out.armL.fwd = out.armR.fwd = 0.5; }
    let still = 1;
    for (const e of this.events) {
      switch (e.type) {
        case 'kick': {
          const q = (t - e.t) / e.dur;
          if (q >= 0 && q <= 1) { out.kick = q; out.kickLeg = e.leg; out.kickAmp = e.amp ?? 1; }
          break;
        }
        case 'fall': {
          if (t < e.t) break;
          let q = clamp((t - e.t) / e.dur, 0, 1);
          q = q < 1 ? q * q : 1;
          if (e.up != null && t > e.up) q *= 1 - clamp((t - e.up) / 0.9, 0, 1);
          out.fall = Math.max(out.fall, q);
          out.fallDir = e.dir;
          if (q > 0.2) { out.armL.abd = out.armR.abd = 1.2 * q; out.armL.fwd = out.armR.fwd = 0.8 * q; }
          still = Math.min(still, 1 - q);
          break;
        }
        case 'slide': {
          if (t < e.t) break;
          const inn = clamp((t - e.t) / e.dur, 0, 1), outq = clamp((t - e.t - e.dur - e.hold) / 0.6, 0, 1);
          const q = smooth(inn) * (1 - smooth(outq));
          out.slide = Math.max(out.slide, q);
          out.raiseLeg = e.leg;
          out.armL.abd = out.armR.abd = 0.9 * q; out.armL.fwd = out.armR.fwd = -0.5 * q;
          still = Math.min(still, 1 - q);
          break;
        }
        case 'raise': {
          if (t < e.t) break;
          const inn = clamp((t - e.t) / e.dur, 0, 1), outq = clamp((t - e.t - e.dur - e.hold) / 0.3, 0, 1);
          out.legRaise = Math.max(out.legRaise, smooth(inn) * (1 - smooth(outq)) * e.amt);
          out.raiseLeg = e.leg;
          break;
        }
        case 'arm': {
          if (t < e.t0 - e.ease || t > e.t1 + e.ease) break;
          const w = t < e.t0 ? smooth((t - e.t0 + e.ease) / e.ease) : t > e.t1 ? 1 - smooth((t - e.t1) / e.ease) : 1;
          for (const side of e.side === 'both' ? ['L', 'R'] : [e.side]) {
            const a = side === 'L' ? out.armL : out.armR;
            for (const k in e.to) a[k] = lerp(a[k], e.to[k], w);
          }
          break;
        }
        case 'headHold': if (t > e.t0 && t < e.t1) out.headHold = Math.min(1, (t - e.t0) / 0.3); break;
        case 'jump': {
          const q = (t - e.t) / e.dur;
          if (q >= 0 && q <= 1) out.jump = Math.max(out.jump, 4 * e.h * q * (1 - q));
          break;
        }
        case 'dive': {
          if (t < e.t) break;
          const q = clamp((t - e.t) / e.dur, 0, 1);
          out.dive = smooth(q); out.diveDir = e.dir;
          out.jump = Math.max(out.jump, 4 * e.h * q * (1 - q));
          out.armL.abd = out.armR.abd = lerp(out.armL.abd, 2.8, smooth(q));
          still = Math.min(still, 1 - q);
          break;
        }
        case 'crouch': if (t > e.t0 && t < e.t1) out.crouch = Math.max(out.crouch, e.amt * Math.min(1, (t - e.t0) / 0.25, (e.t1 - t) / 0.25)); break;
        case 'celebrate': if (t > e.t0) out.celebrate = Math.min(1, (t - e.t0) / 0.4); break;
        case 'lean': if (t > e.t0 && t < e.t1) out.lean += e.amt * Math.min(1, (t - e.t0) / 0.2, (e.t1 - t) / 0.2); break;
        case 'legOut': if (t > e.t0 && t < e.t1) out.legOut = e.amt * Math.min(1, (t - e.t0) / 0.15, (e.t1 - t) / 0.15); break;
      }
    }
    if (still < 1) out.speed *= still;
    return out;
  }

  jointsAt(t) { return joints(this.poseAt(t)); }
}

export class Clip {
  constructor(o) {
    this.duration = o.duration || 9;
    this.actors = [];
    this.ballSegs = [];
    this.log = [];
    this.truth = { infringements: [], restart: 'Play on' };
    this.context = {};
    this.focus = [30, 0];
    this.kits = o.kits;
  }
  actor(o) { const a = new Actor(this, { id: this.actors.length, ...o }); this.actors.push(a); return a; }
  find(team, num) { return this.actors.find((a) => a.team === team && a.num === num); }

  // Ball segments: { t0, t1, p0:[x,y,z], p1, h (arc height), roll (decelerating) }
  ball(seg) { this.ballSegs.push(seg); this.ballSegs.sort((a, b) => a.t0 - b.t0); return this; }
  ballAt(t) {
    const S = this.ballSegs;
    if (!S.length) return [0, BALL_R, 0];
    if (t <= S[0].t0) return [...S[0].p0];
    let s = S[0];
    for (const g of S) if (t >= g.t0) s = g;
    const u = clamp((t - s.t0) / (s.t1 - s.t0 || 1), 0, 1);
    const k = s.roll ? 1 - (1 - u) * (1 - u) : u;
    const y = lerp(s.p0[1], s.p1[1], k) + 4 * (s.h || 0) * u * (1 - u);
    return [lerp(s.p0[0], s.p1[0], k), Math.max(BALL_R, y), lerp(s.p0[2], s.p1[2], k)];
  }

  note(t, text, kind = 'info') { this.log.push({ t, text, kind }); this.log.sort((a, b) => a.t - b.t); return this; }
  bake() { for (const a of this.actors) a.bake(); return this; }
}

function interpKeys(k, t) {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 0; i < k.length - 1; i++) if (t < k[i + 1][0]) return blendAngle(k[i][1], k[i + 1][1], (t - k[i][0]) / (k[i + 1][0] - k[i][0]));
  return k[k.length - 1][1];
}
export function blendAngle(a, b, t) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * clamp(t, 0, 1);
}
