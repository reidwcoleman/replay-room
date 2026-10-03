// Campaign: five shifts at Lumen Match Integrity. Emails, case lists, bribes, ARBITER and endings.

export const COMPANY = 'Lumen Match Integrity';
export const WAGE = 140;

const HALE = { from: 'Marion Hale', role: 'Head of Review Operations, Lumen', avatar: 'MH', tone: 'boss' };
const DEE = { from: 'Dee Okafor', role: 'Senior Reviewer, Booth 2', avatar: 'DO', tone: 'friend' };
const K = { from: 'K.', role: 'no-reply · encrypted', avatar: 'K', tone: 'shady' };
const ARB = { from: 'ARBITER', role: 'Automated Review Assistant', avatar: 'AR', tone: 'system' };

export const DAYS = [
  {
    day: 1, name: 'Monday', title: 'Orientation',
    emails: [
      { ...HALE, subject: 'Welcome to the Replay Room', body: [
        'Welcome aboard. You are now a remote video reviewer for the Coastal Premier League, contracted through Lumen.',
        'Stadiums flag contested moments to us. Each one arrives on your monitor as a replay. Review it, log any offences you find, and confirm the correct restart.',
        'You are scored on accuracy and speed. Base pay is $140 a shift, with a bonus for accuracy. Probation lasts five shifts.',
        'Today is challenges and simulation only. The red rulebook is on your desk. Read it.',
        '— M. Hale',
      ] },
      { ...DEE, subject: 'tips from booth 2', body: [
        'hey new person!! a few things nobody tells you:',
        '1. Slow it down with the down arrow on the deck. Then frame-step the contact with , and .',
        '2. The log tab in the tape panel jumps straight to each moment.',
        '3. Scroll on the monitor to zoom, drag to pan. CAM cycles angles. The tactical cam is your friend.',
        '4. Stick an offence on the tape, then put the player\'s shirt on it. Cards go on the same sticker. Restart goes on the label.',
        '5. "Ball first" is everything on tackles. If the boot gets the ball before the man, leave it.',
        'good luck — Dee',
      ] },
    ],
    cases: [
      { gen: 'tackle', opts: { variant: 'foul', box: true }, tutorial: true },
      { gen: 'tackle', opts: { variant: 'clean' } },
      { gen: 'dive' },
      { gen: 'tackle' },
    ],
  },
  {
    day: 2, name: 'Tuesday', title: 'Hands',
    emails: [
      { ...HALE, subject: 'Handball protocol is live', body: [
        'Good first shift. Today you also review handball appeals and goals with a handball in the build-up.',
        'The arm position at the moment of contact decides it. Raised above the shoulder or held away from the body is an offence. Hanging by the side is not.',
        'The page has been added to your rulebook.',
      ] },
      { ...DEE, subject: 're: the little camera', body: [
        'did you notice the little camera above your monitor? Every booth has one.',
        'Lumen records the whole session — every scrub, every zoom, every call. Hale says it is "training data for ARBITER".',
        'ARBITER is their robot ref. Apparently it is going to "assist" us soon. Love that for us.',
      ] },
    ],
    cases: [{ gen: 'handball' }, { gen: 'tackle' }, { gen: 'handball', opts: { variant: 'attacker' } }, { gen: 'dive' }, { gen: 'handball' }],
  },
  {
    day: 3, name: 'Wednesday', title: 'Lines',
    emails: [
      { ...HALE, subject: 'Offside lines', body: [
        'Offside reviews start today. Press LINE on the deck (or O), then click the attacker and the second-last defender at the exact frame the pass is played.',
        'Arms do not count. The line snaps to the player’s furthest scoring body part.',
        'One of today’s cases is Seren City v Redmill Rovers. The league is watching that fixture closely, so get it right.',
      ] },
      { ...K, subject: 'a small favour', body: [
        'You don’t know me. I know you, though: new to the booth, probationary pay, rent due Friday.',
        'Today you will review a Redmill Rovers goal against Seren City. Let it stand. That’s all.',
        '$600 lands in your account the moment the goal stands. Nobody checks a rookie’s close calls.',
      ], choice: { id: 'bribe1', yes: 'Reply: "Fine."', no: 'Delete and report nothing' } },
    ],
    cases: [
      { gen: 'offside' }, { gen: 'tackle' },
      { gen: 'offside', opts: { margin: 0.32, teams: ['RED', 'SER'], fixed: true }, bribe: { id: 'bribe1', wants: 'Goal stands', pay: 600 } },
      { gen: 'handball' }, { gen: 'offside' },
    ],
  },
  {
    day: 4, name: 'Thursday', title: 'Assistance',
    emails: [
      { ...HALE, subject: 'Directive 4 and ARBITER assist', body: [
        'Three things.',
        'DIRECTIVE 4: the league has ordered a crackdown on simulation. It is a red card from today. Your rulebook is updated.',
        'You also take goal-line checks, penalty-kick procedure and off-the-ball incidents now. Watch the whole picture, not just the ball.',
        'ARBITER assist is live. It pre-reviews every case and shows you a suggestion. It is 98.7% accurate. Agreeing with it is the fast path to a good score.',
      ] },
      { ...DEE, subject: 'am I crazy', body: [
        'ok am I crazy or does ARBITER always seem to find a way for Seren City?',
        'yesterday it told me a Seren handball was "natural position". It was not natural. The guy was doing a starfish.',
        'If you think it’s wrong, open the ARBITER tab in the tape panel and flag it. Flags go into the audit log, and Lumen can’t delete those (legal reasons).',
      ] },
      { ...K, subject: 'pleasure doing business', requires: { bribe1: 'yes' }, body: [
        'The goal stood. Money’s in. See? Easy.',
        'Today: Kingsgate Athletic have a penalty saved. Do NOT order a retake. Same money plus half.',
      ], choice: { id: 'bribe2', yes: 'Reply: "Understood."', no: 'Block the address' } },
      { ...K, subject: 'pity', requires: { bribe1: 'no' }, body: [
        'Your loss. But ask yourself who is really fixing games around here. It isn’t me.',
        'Look at who ARBITER is kind to.',
      ] },
    ],
    cases: [
      { gen: 'goalLine' },
      { gen: 'dive', arbiter: 'right' },
      { gen: 'handball', opts: { variant: 'raised', teams: ['KIN', 'SER'], fixed: true }, arbiter: 'biased' },
      { gen: 'tackle', offBall: true, arbiter: 'right' },
      { gen: 'penalty', opts: { variant: 'keeperEarly', teams: ['KIN', 'NOR'], fixed: true }, bribe: { id: 'bribe2', wants: 'Play on', pay: 900 }, arbiter: 'right' },
      { gen: 'offside', offBall: true, opts: { teams: ['SER', 'ASH'], fixed: true, margin: 0.28 }, arbiter: 'biased' },
    ],
  },
  {
    day: 5, name: 'Friday', title: 'Final whistle',
    emails: [
      { ...HALE, subject: 'Last day of probation + Directive 5', body: [
        'Final probation shift. Tomorrow Lumen presents ARBITER to the league board as a full replacement for human review.',
        'DIRECTIVE 5: an attacker less than 10 cm beyond the line now gets the benefit of the doubt (onside).',
        'Clean shift today and the senior reviewer role is yours.',
      ] },
      { ...DEE, subject: 'they let me go', body: [
        'Lumen let me go this morning. "Restructuring." Funny how that happened right after I flagged ARBITER six times.',
        'Before they locked my account I pulled the board papers. Seren City’s owners hold 40% of Lumen, and ARBITER is weighted toward their matches.',
        'Every flag you’ve raised is in the audit log. Flags on wrong suggestions are evidence. If you have enough of them, my contact at the Coastal Herald can run the story.',
        'Your call. I mean it. — D',
      ] },
    ],
    cases: [
      { gen: 'penalty', arbiter: 'right' },
      { gen: 'offside', opts: { margin: 0.06 }, arbiter: 'right' },
      { gen: 'tackle', offBall: true, arbiter: 'wrong' },
      { gen: 'dive', opts: { teams: ['SER', 'HAR'], fixed: true, variant: 'dive' }, arbiter: 'biased' },
      { gen: 'goalLine', arbiter: 'right' },
      { gen: 'penalty', arbiter: 'right' },
    ],
  },
];

export const ENDINGS = {
  whistle: { title: 'Final Whistle', tag: 'Whistleblower', body: [
    'The Coastal Herald runs the story on Sunday: "THE REFEREE IN THE MACHINE". The audit log, with your flags timestamped against every skewed suggestion, is printed in full.',
    'The league suspends the ARBITER rollout. Marion Hale resigns. Seren City’s owners "strongly deny any wrongdoing".',
    'You never work for Lumen again. Dee buys you a coffee, and the league’s new independent review body sends you an application form.',
  ] },
  weak: { title: 'Not Enough', tag: 'Ignored', body: [
    'You send what you have. The Herald’s editor replies politely: two cherry-picked calls from a probationary reviewer is not a story.',
    'ARBITER goes live in the Coastal Premier League on Monday. You are not renewed. Somewhere a Seren City striker goes down without contact, and nobody flags it.',
  ] },
  company: { title: 'Senior Reviewer', tag: 'Company player', body: [
    'You sign. The NDA is fourteen pages. The new desk has a window.',
    'ARBITER goes live on Monday. Your job is to approve its suggestions, about four hundred a week. It is very rarely wrong. When it is, it is usually wrong for the same club.',
    'The pay is good.',
  ] },
  bought: { title: 'Paid in Full', tag: 'On the take', body: [
    'K’s last transfer clears on Saturday. You close your Lumen account and change your number.',
    'Three weeks later a betting-integrity unit sends Lumen a list of suspicious outcomes. Your booth number is on it twice.',
    'The money is already gone.',
  ] },
  fired: { title: 'Contract Terminated', tag: 'Fired', body: [
    'Hale’s email is two lines long. Your accuracy did not meet the standard required for review operations.',
    'Your login stops working before you’ve finished reading it.',
  ] },
};

// Who the suggestion favours when ARBITER is biased.
export const FAVOURED = 'SER';
