// Drives the booth with the real mouse: pick a player on the CRT, offside lines, wheel zoom,
// 3D deck keys, the scrub slider, and sticker drag-and-drop onto the tape.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(240000);
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://localhost:5240/?day=3&case=0');
await page.waitForFunction(() => window.__ready);
await page.waitForTimeout(2800);
await page.keyboard.press('Space'); // pause
await page.waitForTimeout(200);
// page position of a point in the replay feed (inverts the CRT curvature numerically)
const toPage = (actorIdx) => page.evaluate((i) => {
  const R = __app.review, V = R.view, S = __app.stage;
  // the most central visible player of a team ('att' = A, 'def' = D)
  const team = i === 'att' ? 'A' : 'D';
  let a = null, bd = 1e9;
  for (const pm of V.players) { if (pm.actor.team !== team) continue; const q = V.screenOfPoint(pm.actor.jointsAt(R.t).chest); const d = Math.hypot(q.x - V.w / 2, q.y - V.h / 2); if (q.visible && d < bd) { bd = d; a = pm.actor; } }
  window.__want = a;
  const j = a.jointsAt(R.t).chest;
  const p = V.screenOfPoint(j);
  const tu = p.x / V.w, tv = 1 - p.y / V.h;
  let mu = tu, mv = tv;
  for (let k = 0; k < 20; k++) { const cx = mu - 0.5, cy = mv - 0.5, d = (cx * cx + cy * cy) * 0.065; mu = tu - cx * (1 + d) * d; mv = tv - cy * (1 + d) * d; }
  const scr = S.H.main.screen, g = scr.geometry.parameters;
  const V3 = S.camera.position.constructor;
  const w = scr.localToWorld(new V3((mu - 0.5) * g.width, (mv - 0.5) * g.height, 0.012)).project(S.camera);
  const r = S.canvas.getBoundingClientRect();
  return { x: r.left + (w.x + 1) / 2 * r.width, y: r.top + (1 - w.y) / 2 * r.height };
}, actorIdx);
let p = await toPage('att');
await page.mouse.move(p.x, p.y);
await page.waitForTimeout(100);
await page.mouse.click(p.x, p.y);
const sel = await page.evaluate(() => { const s = __app.review.view.selected; return s ? s.actor === window.__want : 'none'; });
console.log('click selects attacker:', sel);
await page.keyboard.press('o');
p = await toPage('att'); await page.mouse.click(p.x, p.y);
p = await toPage('def'); await page.mouse.click(p.x, p.y);
console.log('lines:', await page.evaluate(() => __app.review.view.lines.length));
await page.waitForTimeout(150);
await page.screenshot({ path: 'shots/in-lines.png' });
const z0 = await page.evaluate(() => __app.review.view.zoom);
await page.mouse.move(800, 300);
await page.mouse.wheel(0, -500);
await page.waitForTimeout(100);
console.log('wheel zoom:', z0, '→', await page.evaluate(() => __app.review.view.zoom.toFixed(2)));
// 3D key: play
const key = await page.evaluate(() => __app.stage.toPage(__app.stage.H.keys.play, [0, 0.013, 0]));
const pl0 = await page.evaluate(() => __app.review.playing);
await page.mouse.click(key.x, key.y);
console.log('play key toggles:', pl0, '→', await page.evaluate(() => __app.review.playing));
await page.keyboard.press('Space');
// slider drag
const R = await page.evaluate(() => { const S = __app.stage, H = S.H.rail; return [S.toPage(H.knob, [0, 0.01, 0]), S.toPage(H.mesh, [0.09, 0.004, 0])]; });
await page.mouse.move(R[0].x, R[0].y); await page.mouse.down(); await page.mouse.move(R[1].x, R[1].y, { steps: 6 }); await page.mouse.up();
console.log('slider t:', await page.evaluate(() => __app.review.t.toFixed(2)), 'of', await page.evaluate(() => __app.review.case.clip.duration.toFixed(2)));
// sticker drag onto the tape
await page.keyboard.press('e');
await page.waitForTimeout(1100);
const src = await (await page.$('.stk.off >> nth=3')).boundingBox();
const tape = await page.evaluate(() => __app.stage.toPage(__app.stage.H.tape, [0, 0.014, 0.02]));
await page.mouse.move(src.x + 30, src.y + 30); await page.mouse.down();
await page.mouse.move(tape.x, tape.y, { steps: 12 }); await page.mouse.up();
const lab = await page.evaluate(() => __app.stage.toPage(__app.stage.H.tape, [0, 0.014, -0.04]));
const rs = await (await page.$('.stk.restart >> nth=4')).boundingBox();
await page.mouse.move(rs.x + 30, rs.y + 30); await page.mouse.down();
await page.mouse.move(lab.x, lab.y, { steps: 12 }); await page.mouse.up();
console.log('tape after drags:', JSON.stringify(await page.evaluate(() => __app.review.decision)));
await page.screenshot({ path: 'shots/in-tape.png' });
console.log('errors', errs);
await browser.close();
