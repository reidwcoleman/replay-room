// The Coastal Premier League VAR protocol. Directives change during the week; the judge always
// resolves a replay with the rulebook in force on the day it was reviewed.

export function rulesFor(day) {
  return {
    day,
    simulationCard: day >= 4 ? 'Red' : 'Yellow',
    offsideTolerance: day >= 5 ? 0.1 : 0,
    unlocked: {
      tackle: true, dive: true,
      handball: day >= 2,
      offside: day >= 3,
      goalLine: day >= 4, offBall: day >= 4,
      penalty: day >= 4,
    },
  };
}

// Rulebook pages. `from` = first day the page appears; `changed` marks a new directive.
export const RULEBOOK = [
  {
    id: 'protocol', from: 1, title: 'Review protocol',
    body: [
      'You review clear and obvious errors and serious missed incidents. Watch the whole replay, including what happens away from the ball.',
      'Log every offence you find: who committed it, the type, and the card. Then choose the restart.',
      'Off-the-ball offences get a card. The restart still follows the main incident.',
    ],
  },
  {
    id: 'challenges', from: 1, title: 'Challenges',
    body: [
      'Ball first: if the challenger clearly plays the ball before any contact with the opponent, it is not an offence, even if the opponent falls afterwards.',
      'Man first: contact with the opponent before the ball (or with no ball at all) is a Foul. No card for a careless foul.',
      'Late: a challenge that arrives after the opponent has already released the ball is reckless. Foul + Yellow.',
      'Order matters, even by a single frame: contact with the ball first is no offence, contact with the man first is a Foul. Frame-step the contact with , and . to see which comes first.',
      'Studs-up: a raised boot landing on the shin or above endangers safety. Foul + Red, even if the ball was touched.',
      'Restart: offence inside the penalty area → Penalty. Outside → Free kick.',
    ],
  },
  {
    id: 'simulation', from: 1, title: 'Simulation',
    body: [
      'A player who goes down without any contact, trying to deceive the referee, commits Simulation. Restart: Free kick to the defending side.',
      'Simulation card: Yellow.',
    ],
    update: { day: 4, body: 'DIRECTIVE 4 — League crackdown: Simulation now carries a Red card.' },
  },
  {
    id: 'closecalls', from: 1, title: 'Photo finish',
    body: [
      'Tapes stamped PHOTO FINISH are decided by frames or centimetres. The crowd will be no help.',
      'Slow the tape right down (↓), step single frames (, and .), scroll to zoom the monitor right in and use the cameras. Tactical for the lines, Goal-line for the goal and the keeper, Reverse for contact.',
      'Calling a close one right is worth a bonus, and a run of good calls builds your streak.',
    ],
  },
  {
    id: 'handball', from: 2, title: 'Handball',
    body: [
      'Defender: arm raised above shoulder level, or held away from the body and making it bigger → Handball. Restart Penalty if inside the area.',
      'Arm hanging by the side, close to the body → not an offence. Ball off the chest or shoulder → not an offence.',
      'Measure it: an arm held more than 45° out from the body is making it bigger (offence). 45° or less is a natural position. Select the player and the tape shows the angle of each arm.',
      'Attacker: any handball by the scorer immediately before a goal → Disallow goal, even if accidental. No card.',
    ],
  },
  {
    id: 'offside', from: 3, title: 'Offside',
    body: [
      'Judge the moment the pass is played. Compare the attacker’s furthest scoring body part (head, torso, legs, feet — never arms) with the second-last defender’s.',
      'Use the line tool: click a player to drop a line at their furthest scoring part.',
      'Attacker beyond the second-last defender and scores → Offside, Disallow goal. Level or behind → Goal stands.',
    ],
    update: { day: 5, body: 'DIRECTIVE 5 — Benefit of the doubt: an attacker less than 10 cm beyond the line is now onside.' },
  },
  {
    id: 'goalline', from: 4, title: 'Goal-line',
    body: [
      'A goal is scored only when the whole ball has crossed the whole goal line. Use the goal-line camera at the deepest point.',
      'Whole ball over → Award goal. Any part of the ball over the line’s outer edge → Play on.',
    ],
  },
  {
    id: 'offball', from: 4, title: 'Off the ball',
    body: [
      'Striking an opponent with the elbow or arm → Violent conduct + Red.',
      'Shoving an opponent to the ground away from play → Violent conduct + Yellow.',
      'These happen while everyone watches the ball. Check the log for players down.',
    ],
  },
  {
    id: 'penalties', from: 4, title: 'Penalty kicks',
    body: [
      'At the moment of the kick the keeper must have at least part of one foot on or level with the goal line. The line is 12 cm wide: a boot wholly in front of it is off the line.',
      'Keeper off the line and the kick is saved → Keeper off line + Yellow, Retake penalty. If the kick is scored, the goal stands.',
      'An attacker who enters the penalty area before the kick and then scores the rebound → Encroachment, Disallow goal. A boot over the painted area line counts as inside.',
      'For lines in the goal-line view: press O to switch the measuring overlay on. It marks the outer edge of the goal line and the 12 cm band.',
    ],
  },
];

export function rulebookFor(day) {
  return RULEBOOK.filter((r) => r.from <= day).map((r) => ({
    ...r,
    isNew: r.from === day || (r.update && r.update.day === day),
    directive: r.update && r.update.day <= day ? r.update.body : null,
  }));
}
