# Replay Room

A video-referee (VAR) review game. You work five probation shifts as a remote reviewer for Lumen Match
Integrity, the contractor that runs video review for the fictional Coastal Premier League. Each case is a 3D
replay of a contested moment: a tackle, a penalty appeal, a handball, an offside goal, a goal-line
clearance or a penalty kick. You review it with broadcast tools and log every offence you find, including
ones that happen off the ball. Then you pick the restart before the crowd loses patience.

The story runs alongside the shifts. Rule directives change during the week. An anonymous sender offers
money for specific calls. An "assistant" AI called ARBITER starts suggesting decisions that keep
favouring one club. There are five endings.

Original game: the league, clubs, company, characters and story are all fictional and written for this project.

## Tools
- Play / pause, frame step (`,` `.` or arrow keys; hold Shift for 10 frames), speeds 0.1×–1×, a scrubber with log markers
- Six cameras: Main, Reverse, Behind goal, Tactical (top-down), Goal-line (virtual), Free orbit. Scroll to zoom toward the cursor, drag to pan
- Click a player to select them and quick-add an offence. The offside line tool (`O`) snaps to each player's furthest scoring body part
- Match log (click an entry to jump to it), Rulebook with the day's directives, Decision form (offender, type, card, restart)

## How the replays work
Every replay is generated (`src/sim/incidents.js`) from a single skeleton model (`src/sim/kinematics.js`).
The renderer and the judge read the same model, so the correct call matches what you see on screen. Offside
margins and goal-line gaps are exact to the centimetre. The judge resolves each case under the rulebook
in force that day (`src/sim/rules.js`).

## Dev
- `npm run dev` (port 5240). `?day=4&case=2` jumps straight to a case.
- `npm test` generates 240 replays and checks the geometry matches the stated outcome: contact gaps, arm height at a handball, offside margin, goal-line depth, keeper's feet at a penalty.
- `node tools/playthrough.mjs honest|bribe|sloppy` plays all five shifts headless and prints every case and the ending.
