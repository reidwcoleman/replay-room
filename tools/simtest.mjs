// Generates many replays of every type and checks geometry agrees with the stated truth.
import { GENERATORS, rng, addOffBall } from '../src/sim/incidents.js';
import { rulesFor } from '../src/sim/rules.js';
import { SCORING, FEET, vec, segDist } from '../src/sim/kinematics.js';
import { BALL_R, GOAL_X } from '../src/sim/clip.js';

let fails = 0, n = 0;
const bad = (m) => { fails++; console.log('FAIL', m); };
const r5 = rulesFor(5), r1 = rulesFor(1);
const counts = {};
for (const [name, gen] of Object.entries(GENERATORS)) {
  for (let seed = 1; seed <= 40; seed++) {
    n++;
    const R = rng(seed * 7919 + name.length);
    let c;
    try { c = gen(R); } catch (e) { bad(`${name}#${seed} threw ${e.stack}`); continue; }
    if (seed % 3 === 0) addOffBall(c, R);
    const t = c.resolve(r1);
    const key = name + ':' + (c.facts.variant ?? c.facts.margin ?? c.facts.delta ?? c.facts.contact);
    counts[key] = (counts[key] || 0) + 1;
    // generic sanity: nobody leaves the pitch or teleports, ball has no jumps
    for (const a of c.actors) {
      for (let tt = 0; tt < c.duration; tt += 0.1) {
        const p = a.poseAt(tt), q = a.poseAt(tt + 0.1);
        const v = Math.hypot(q.x - p.x, q.z - p.z) / 0.1;
        if (v > 11) { bad(`${name}#${seed} actor ${a.team}${a.num} speed ${v.toFixed(1)} at ${tt.toFixed(1)}`); break; }
        if (Math.abs(p.z) > 36 || p.x > 54 || p.x < -54) { bad(`${name}#${seed} actor off pitch ${a.team}${a.num}`); break; }
      }
      const j = a.jointsAt(c.duration / 2);
      for (const k in j) if (!j[k].every(Number.isFinite)) { bad(`${name}#${seed} NaN joint ${k}`); break; }
    }
    for (let tt = 0; tt < c.duration; tt += 1 / 30) {
      const a = c.ballAt(tt), b = c.ballAt(tt + 1 / 30);
      const v = vec.dist(a, b) * 30;
      if (v > 40) { bad(`${name}#${seed} ball jump ${v.toFixed(1)} m/s at ${tt.toFixed(2)}`); break; }
    }
    // type-specific checks
    if (name === 'offside') {
      const tP = c.facts.passT;
      const runner = c.subjects[0], last = c.subjects[1];
      const px = (a) => Math.max(...SCORING.map((k) => a.jointsAt(tP)[k][0]));
      const m = px(runner) - Math.max(...c.actors.filter((a) => a.team === 'D' && !a.keeper).map(px));
      if (Math.abs(m - c.facts.margin) > 0.01) bad(`offside#${seed} margin ${m.toFixed(3)} vs ${c.facts.margin}`);
      const t5 = c.resolve(r5);
      if (c.facts.margin > 0 && c.facts.margin <= 0.1 && t5.restart !== 'Goal stands') bad('tolerance not applied');
    }
    if (name === 'handball' && ['raised', 'side', 'body'].includes(c.facts.variant)) {
      const d = c.subjects[0], tH = c.keyMoment, b = c.ballAt(tH), j = d.jointsAt(tH);
      const arm = Math.min(segDist(b, j.shL, j.elL), segDist(b, j.elL, j.haL), segDist(b, j.shR, j.elR), segDist(b, j.elR, j.haR));
      if (c.facts.variant !== 'body' && arm > 0.06) bad(`handball#${seed} ball misses arm by ${arm.toFixed(2)}`);
      if (c.facts.variant === 'raised') {
        const hand = [j.haL, j.haR].reduce((a, h) => (vec.dist(h, b) < vec.dist(a, b) ? h : a));
        if (hand[1] < j.shL[1] - 0.05) bad(`handball#${seed} raised hand below shoulder ${hand[1].toFixed(2)} vs ${j.shL[1].toFixed(2)}`);
      }
    }
    if (name === 'dive') {
      if (c.facts.contact && c.facts.minGap > 0.12) bad(`dive#${seed} contact variant gap ${c.facts.minGap.toFixed(2)}`);
      if (!c.facts.contact && c.facts.minGap < 0.25) bad(`dive#${seed} dive variant too close ${c.facts.minGap.toFixed(2)}`);
    }
    if (name === 'tackle' && c.facts.variant !== 'clean') {
      const [att, def] = c.subjects, tC = c.keyMoment;
      const j = def.jointsAt(tC), ja = att.jointsAt(tC);
      const d = Math.min(...[j.toL, j.toR, j.anL, j.anR].map((p) => Math.min(segDist(p, ja.knL, ja.anL), segDist(p, ja.knR, ja.anR))));
      if (d > 0.2) bad(`tackle#${seed} ${c.facts.variant} boot misses leg by ${d.toFixed(2)}`);
    }
    if (name === 'tackle' && c.facts.variant === 'clean') {
      const [att, def] = c.subjects, tC = c.keyMoment;
      const j = def.jointsAt(tC), b = c.ballAt(tC - 0.05);
      const d = Math.min(vec.dist(j.toL, b), vec.dist(j.toR, b));
      if (d > 0.35) bad(`tackle#${seed} clean boot misses ball by ${d.toFixed(2)}`);
    }
    if (name === 'goalLine') {
      let maxX = 0;
      for (let tt = 0; tt < c.duration; tt += 1 / 30) maxX = Math.max(maxX, c.ballAt(Math.round(tt * 30) / 30)[0]);
      const over = maxX - BALL_R > GOAL_X;
      if (over !== c.facts.delta > 0) bad(`goalLine#${seed} over=${over} delta=${c.facts.delta}`);
    }
    if (name === 'penalty' && c.facts.variant.startsWith('keeper')) {
      const gk = c.subjects[0], j = gk.jointsAt(c.keyMoment);
      const footOnLine = Math.max(...FEET.map((k) => j[k][0])) >= GOAL_X - 0.12 - 0.08;
      if (c.facts.variant === 'keeperEarly' && footOnLine) bad(`penalty#${seed} early keeper still on line`);
      if (c.facts.variant === 'keeperLegal' && !footOnLine) bad(`penalty#${seed} legal keeper off line`);
    }
  }
}
console.log(Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  '));
console.log(`${n} replays, ${fails} failures`);
process.exit(fails ? 1 : 0);
