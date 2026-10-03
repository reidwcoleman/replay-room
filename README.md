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

## The booth
Everything happens at a cel-shaded 3D desk with ink outlines (`src/render/office.js`, `stage.js`):
- **Main CRT**: the replay, rendered at 480×360 with pixel outlines and shown through a curved, scanlined tube
  shader (`crt.js`). The timecode, camera, player tags and offside readout are drawn into the picture.
- **Live CRT**: the stadium feed. The referee listens to his earpiece while the crowd gets restless. After you
  send a tape he draws the screen signal and gives your call (`live.js`).
- **Terminal CRT**: green phosphor. Shift quota, case clock, crowd meter, ARBITER. It scores a sent tape item by
  item: FOUND / MISSED / WRONG / BONUS, with footballs flying up to the counter (`terminal.js`).
- **Control deck**: play, frame step, speed, camera, line tool, reset zoom, and a slider to scrub. Every key is
  clickable and also has a keyboard shortcut.
- **VHS tape + sticker panel**: make the call by sticking an offence sticker on the tape, putting the player's
  shirt and a card on it, and putting the restart sticker on the label. Drag or click. Then send the tape.
- **Rulebook**: opens the regulations, including the day's new directives.

## Controls
- Space play/pause · `,` `.` or ←/→ frame step (Shift = 10) · ↑/↓ speed · 1–6 or C cameras · O line tool · Z reset
- Scroll on the monitor to zoom toward the cursor, drag to pan, click a player to select them
- Q / W / E: desk / monitor / tape · Enter sends the tape · Space or click skips the result sequence

## Photo finishes
Some tapes are stamped PHOTO FINISH and are decided by frames or centimetres:
- **Tackles**: one boot hits the ball and the standing leg 2-4 frames apart. Whichever comes first decides it.
- **Dives**: a boot that passes 3-7 cm clear of the leg, or brushes it by a centimetre.
- **Handball**: an arm held ~50-58 degrees out against one tucked at ~20-30. The limit is 45. Select the player and the tape shows each arm's angle.
- **Offside**: 1.5 to 6 cm. **Goal-line**: 3 to 9 mm. **Penalty**: the keeper's rear boot 2 to 9 cm either side of the 12 cm line, or a striker's boot a few cm either side of the area line.
- The LINE tool (O) measures all of them: attacker vs defender in cm, the ball's edge against the goal line, the keeper's foot against the line, the striker's boot against the area line.
- The first time you watch a tape it crawls into slow-mo and the camera pushes in on the incident. Any input hands control back.
- Calling a photo finish right pays a bonus; consecutive good calls build a streak. **Overtime** (title screen) is an endless run at the hardest rules, closer every tape, three wrong calls and you are out. Best score is kept in localStorage.

## How the replays work
Every replay is generated (`src/sim/incidents.js`) from a single skeleton model (`src/sim/kinematics.js`).
The renderer and the judge read the same model, so the correct call matches what you see on screen. Offside
margins and goal-line gaps are exact to the centimetre. The judge resolves each case under the rulebook
in force that day (`src/sim/rules.js`).

## Dev
- `npm run dev` (port 5240). `?day=4&case=2` jumps straight to a case, `?fast` skips camera moves and the result sequence.
- `npm test` generates 480 replays (half of them tight photo finishes), builds every campaign and Overtime case and checks the geometry matches the stated outcome: contact gaps, arm height at a handball, offside margin, goal-line depth, keeper's feet at a penalty.
- `node tools/playthrough.mjs honest|bribe|sloppy` plays all five shifts headless and prints every case and the ending.
- `node tools/inputtest.mjs` drives the booth with the real mouse (pick on the CRT, lines, zoom, deck keys, slider, sticker drag).
- `node tools/feed.mjs day case t cam zoom out` saves the raw 480x360 replay feed (no desk or glass) at 2x for checking the picture.
- `node tools/views.mjs [prefix]` screenshots every booth view (title, monitor, desk, tape, the send sequence, the printout) into `shots/`.
