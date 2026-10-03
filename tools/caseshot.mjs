// node tools/caseshot.mjs day case "t" cam zoom out [selectSubject]
import { chromium } from 'playwright-core';
const [day = 1, cs = 0, t = 'key', cam = 'broadcast', zoom = '1', out = 'shots/c.png'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(120000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text()); });
await page.goto(`http://localhost:5240/?day=${day}&case=${cs}`);
await page.waitForFunction(() => window.__ready);
const info = await page.evaluate(([t, cam, zoom]) => {
  document.querySelector('.coach')?.remove();
  const r = __app.review, c = r.case;
  r.card = null; r.cine.on = false; r.setMode('focus', true);
  __pump(30);
  r.playing = false;
  const tt = t === 'key' ? c.clip.keyMoment : +t;
  r._setCam(cam);
  r.view.zoom = +zoom;
  if (c.clip.subjects) r.view.selected = r.view.players.find((p) => p.actor === c.clip.subjects[0]);
  r._seek(tt);
  const f = c.goalCam && cam === 'goalline' ? c.clip.ballAt(tt) : c.clip.subjects ? c.clip.subjects[0].jointsAt(tt).pelvis : c.clip.ballAt(tt);
  r.view.focusOn(f, +zoom);
  __pump(40);
  return { gen: c.gen, facts: c.clip.facts, truth: c.truth, t: tt };
}, [t, cam, zoom]);
console.log(JSON.stringify(info));
await page.screenshot({ path: out });
await browser.close();
