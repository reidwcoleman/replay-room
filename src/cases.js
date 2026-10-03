// Builds a playable case from the story spec: replay, truth under the day's rules, ARBITER's
// suggestion, a plain-language explanation for the verdict screen.
import { GENERATORS, addOffBall, rng, tag } from './sim/incidents.js';
import { rulesFor } from './sim/rules.js';
import { SCORING, FEET } from './sim/kinematics.js';
import { GOAL_X, BALL_R } from './sim/clip.js';
import { DAYS, FAVOURED } from './story.js';

export const TYPES_BY_DAY = (d) => ['Foul', 'Simulation', ...(d >= 2 ? ['Handball'] : []), ...(d >= 3 ? ['Offside'] : []), ...(d >= 4 ? ['Violent conduct', 'Keeper off line', 'Encroachment'] : [])];
export const RESTARTS_BY_DAY = (d) => ['Play on', 'Free kick', 'Penalty', ...(d >= 2 ? ['Goal stands', 'Disallow goal'] : []), ...(d >= 4 ? ['Award goal', 'Retake penalty'] : [])];

export function buildCase(state, day, idx, override = null) {
  const spec = override || DAYS[day - 1].cases[idx];
  const R = rng((state.seed + day * 1000 + idx * 37) >>> 0);
  const clip = GENERATORS[spec.gen](R, spec.opts || {});
  if (spec.offBall) addOffBall(clip, R);
  const rules = rulesFor(day);
  const truth = clip.resolve(rules);
  for (const i of truth.infringements) i.teamName = i.team === 'A' ? clip.attacking.short : clip.defending.short;
  const c = { day, idx, spec, clip, truth, rules, gen: spec.gen, close: !!(spec.close || (spec.opts && spec.opts.tight)) };
  c.explain = explain(clip, truth, rules, spec.gen);
  if (spec.arbiter && day >= 4) c.arbiter = suggest(clip, truth, spec.arbiter, R);
  if (spec.bribe && state.choices[spec.bribe.id] === 'yes') c.bribe = spec.bribe;
  return c;
}

// ARBITER: right, randomly wrong, or wrong in favour of the club its owners like.
function suggest(clip, truth, mode, R) {
  const conf = Math.round(R.range(91, 99.4) * 10) / 10;
  if (mode === 'right') return { restart: truth.restart, entries: truth.infringements.filter((i) => !i.offBall), conf, wrong: false };
  const flip = {
    Penalty: 'Play on', 'Play on': clip.facts.box === false ? 'Free kick' : 'Penalty', 'Disallow goal': 'Goal stands', 'Goal stands': 'Disallow goal',
    'Award goal': 'Play on', 'Retake penalty': 'Play on', 'Free kick': 'Play on',
  };
  let restart = flip[truth.restart] || 'Play on';
  let entries = [];
  if (mode === 'biased') {
    // biased calls always land in the favoured club's favour
    const favAttacking = clip.attacking.id === FAVOURED;
    if (favAttacking) restart = truth.restart === 'Disallow goal' ? 'Goal stands' : truth.restart === 'Free kick' ? 'Penalty' : restart;
    else restart = truth.restart === 'Penalty' ? 'Play on' : restart;
    if (restart === 'Penalty') {
      const def = clip.subjects.find((a) => a.team === 'D');
      if (def) entries = [{ team: 'D', num: def.num, type: 'Foul', card: 'None' }];
    }
  }
  return { restart, entries, conf, wrong: restart !== truth.restart, mode };
}

const cm = (m) => `${Math.round(Math.abs(m) * 100)} cm`;
const tc = (t) => `00:${t.toFixed(2).padStart(5, '0')}`;

function explain(clip, truth, rules, gen) {
  const f = clip.facts, out = [];
  const s = clip.subjects || [];
  const T = (a) => tag(clip, a);
  if (gen === 'tackle') {
    const [att, def] = s;
    if (f.variant === 'clean') out.push(`${T(def)} reached the ball first (${tc(clip.keyMoment)}). ${T(att)} went down afterwards, which is incidental contact. No offence.`);
    if (f.variant === 'foul') out.push(`${T(def)} missed the ball and took ${T(att)}'s standing leg. Man first: Foul${f.box ? ', inside the area → Penalty' : ' → Free kick'}.`);
    if (f.variant === 'ballFirst') out.push(`${T(def)} won the ball at ${tc(f.tBall)}, ${f.frames} frames (${Math.round(f.frames / 0.03)} ms) before the boot reached ${T(att)}'s leg. Ball first, so the contact that follows is not an offence.`);
    if (f.variant === 'manFirst') out.push(`${T(def)}'s boot caught ${T(att)}'s leg at ${tc(f.tMan)}, ${f.frames} frames (${Math.round(f.frames / 0.03)} ms) before it reached the ball. Man first: Foul${f.box ? ', inside the area → Penalty' : ' → Free kick'}.`);
    if (f.variant === 'late') out.push(`${T(att)} had already released the pass when ${T(def)} slid in. Late challenge: Foul + Yellow${f.box ? ', Penalty' : ', Free kick'}.`);
    if (f.variant === 'studs') out.push(`${T(def)} went in with the boot raised, studs landing on ${T(att)}'s shin. Endangering safety: Foul + Red, even though the ball was touched.`);
  }
  if (gen === 'dive') {
    const [att, def] = s;
    if (f.contact) out.push(`${T(def)}'s boot ${f.tight ? 'just brushed' : 'clipped'} ${T(att)}'s trailing leg. Contact, inside the area → Foul, Penalty.`);
    else out.push(`${T(def)}'s nearest boot passed ${f.tight ? `just ${cm(f.clear)} clear of` : `${cm(f.minGap)} away from`} ${T(att)}. No contact, so Simulation + ${rules.simulationCard}${rules.day >= 4 ? ' (Directive 4)' : ''}. Free kick to the defence.`);
  }
  if (gen === 'handball') {
    const p = s[0];
    if (f.variant === 'raised') out.push(`At contact ${T(p)}'s arm was raised above shoulder level. Handball, inside the area → Penalty.`);
    if (f.variant === 'wide') out.push(`At contact ${T(p)}'s arm was held ${f.armAngle}° out from the body, beyond the 45° limit, making him bigger. Handball, inside the area → Penalty.`);
    if (f.variant === 'tucked') out.push(`At contact ${T(p)}'s arm was ${f.armAngle}° from the body, inside the 45° limit. Natural position, no offence.`);
    if (f.variant === 'side') out.push(`The ball struck ${T(p)}'s arm while it hung by the side, close to the body. Natural position, no offence.`);
    if (f.variant === 'body') out.push(`The ball hit ${T(p)}'s chest, not the arm. No offence.`);
    if (f.variant === 'attacker') out.push(`${T(p)} controlled the cross with the hand immediately before scoring. Goal disallowed (no card for accidental).`);
    if (f.variant === 'attackerClean') out.push(`${T(p)} controlled the cross with the chest. Clean finish, goal stands.`);
  }
  if (gen === 'offside') {
    const [runner, last] = s;
    const part = { head: 'head', chest: 'chest', pelvis: 'hips', shL: 'left shoulder', shR: 'right shoulder', knL: 'left knee', knR: 'right knee', anL: 'left foot', anR: 'right foot', toL: 'left boot', toR: 'right boot' };
    const j = runner.jointsAt(f.passT);
    let best = -1e9, bp = 'boot';
    for (const k of SCORING) if (j[k][0] > best) { best = j[k][0]; bp = part[k]; }
    const where = f.margin > 0 ? `${cm(f.margin)} beyond` : f.margin < 0 ? `${cm(f.margin)} behind` : 'level with';
    out.push(`At the pass (${tc(f.passT)}) ${T(runner)}'s ${bp} was ${where} the second-last defender ${T(last)}.`);
    if (f.margin > 0 && f.margin <= rules.offsideTolerance) out.push('Under Directive 5 an attacker less than 10 cm beyond the line is onside. Goal stands.');
    else out.push(f.margin > 0 ? 'Offside, so the goal is disallowed.' : 'Onside, so the goal stands.');
  }
  if (gen === 'goalLine') {
    const over = f.delta;
    out.push(over > 0 ? `At the deepest point (${tc(f.deepest)}) the whole ball was ${cm(over)} past the line. Goal.` : `At the deepest point (${tc(f.deepest)}) the ball was still ${cm(over)} short of fully crossing. No goal.`);
  }
  if (gen === 'penalty') {
    const [gk] = s;
    const j = gk.jointsAt(clip.keyMoment);
    const front = GOAL_X - 0.12 - Math.max(...FEET.map((k) => j[k][0]));
    if (f.variant === 'keeperEarly') out.push(`When the kick was taken ${T(gk)}'s rear foot was ${cm(front)} in front of the line (the line is 12 cm wide), and the kick was saved. Keeper off line + Yellow, retake.`);
    if (f.variant === 'keeperLegal') out.push(`${T(gk)} kept part of a foot on the line until the kick${f.tight ? ` (his rear boot overlapped it by ${cm(-front)})` : ''}. Legal save, play on.`);
    if (f.variant === 'encroach') out.push(`The scorer's leading boot was ${f.tight ? `${cm(f.over)} over the line, ` : ''}already inside the area when the penalty was struck. Encroachment, goal disallowed.`);
    if (f.variant === 'cleanRebound') out.push(`Everyone stayed outside the area until the kick${f.tight ? ` (the scorer's boot was ${cm(f.over)} short of the line)` : ''}. The rebound goal stands.`);
  }
  if (clip.offBall) {
    const o = clip.offBall;
    out.push(`Off the ball at ${tc(o.t)}: ${T(o.agg)} ${o.kind === 'elbow' ? `struck ${T(o.vic)} with the elbow. Violent conduct + Red.` : `shoved ${T(o.vic)} to the ground. Violent conduct + Yellow.`}`);
  }
  return out;
}

// Overtime: endless tapes at the hardest rules, closer every time, three wrong calls and you are out.
const OT_GENS = ['tackle', 'dive', 'handball', 'offside', 'goalLine', 'penalty'];
export function overtimeSpec(state, n) {
  const R = rng((state.seed + n * 7919 + 13) >>> 0);
  const gen = OT_GENS[Math.floor(R() * OT_GENS.length)];
  const tight = R() < Math.min(0.92, 0.25 + n * 0.1);
  return { gen, opts: tight ? { tight: true } : {}, close: tight, offBall: n >= 3 && (gen === 'tackle' || gen === 'offside') && R() < 0.3 };
}
