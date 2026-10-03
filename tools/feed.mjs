// Saves the raw replay feed (no desk, no CRT glass): node tools/feed.mjs day case t cam zoom out [select] [line]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [day = 1, cs = 0, t = 'key', cam = 'broadcast', zoom = '1', out = 'shots/f.png', sel = '1', line = '0'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(120000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text()); });
await page.goto(`http://localhost:5240/?day=${day}&case=${cs}`);
await page.waitForFunction(() => window.__ready);
const data = await page.evaluate(([t, cam, zoom, sel, line]) => {
  document.querySelector('.coach')?.remove();
  const r = __app.review, c = r.case;
  r.card = null; r.cine.on = false; r.lower = 7;
  __pump(30);
  r.playing = false;
  const tt = t === 'key' ? c.clip.keyMoment : +t;
  r._setCam(cam);
  r.view.zoom = +zoom;
  r.view.selected = sel === '1' && c.clip.subjects ? r.view.players.find((p) => p.actor === c.clip.subjects[0]) : null;
  if (line === '1') { r.view.lineMode = true; if (c.gen === 'offside') for (const a of c.clip.subjects) r.view.addLine(r.view.players.find((p) => p.actor === a)); }
  r._seek(tt);
  const f = c.goalCam && cam === 'goalline' ? c.clip.ballAt(tt) : c.clip.subjects ? c.clip.subjects[0].jointsAt(tt).pelvis : c.clip.ballAt(tt);
  r.view.focusOn(f, +zoom);
  __pump(3);
  const rd = __app.stage.renderer, rt = __app.replay.outRT, W = rt.width, H = rt.height;
  const buf = new Uint8Array(W * H * 4);
  rd.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2;
  const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
  const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
  const id = new ImageData(new Uint8ClampedArray(W * H * 4), W, H);
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) { const s = ((H - 1 - y) * W + xx) * 4, d = (y * W + xx) * 4; id.data[d] = buf[s]; id.data[d + 1] = buf[s + 1]; id.data[d + 2] = buf[s + 2]; id.data[d + 3] = 255; }
  tmp.getContext('2d').putImageData(id, 0, 0);
  x.drawImage(tmp, 0, 0, W * 2, H * 2);
  return { url: cv.toDataURL('image/png'), gen: c.gen, facts: c.clip.facts };
}, [t, cam, zoom, sel, line]);
fs.writeFileSync(out, Buffer.from(data.url.split(',')[1], 'base64'));
console.log(JSON.stringify({ gen: data.gen, facts: data.facts }));
await browser.close();
