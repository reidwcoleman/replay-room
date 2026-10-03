import { App, newState } from './app.js';
import { Sound } from './audio.js';

const q = new URLSearchParams(location.search);
const sound = new Sound();
addEventListener('pointerdown', () => sound.unlock());

// Canvas text (CRTs, stickers, posters) needs the web fonts loaded before the first draw.
const fonts = ['8px Silkscreen', '16px Silkscreen', '700 20px Nunito', '800 20px Nunito', '900 20px Nunito', '700 20px Caveat'];
await Promise.race([Promise.all(fonts.map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]);

const app = new App(document.getElementById('app'), sound, { fast: q.has('fast') });

// ?day=N&case=M jumps straight into a case (testing).
if (q.has('day')) {
  const s = newState(+(q.get('seed') || 12345));
  s.day = +q.get('day');
  s.stage = 'cases';
  s.caseIdx = +(q.get('case') || 0);
  s.shiftResults = [];
  if (q.has('bribe')) s.choices.bribe1 = s.choices.bribe2 = 'yes';
  app.state = s;
  app.nextCase();
} else app.title();

let last = performance.now(), held = false;
function loop(t) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  if (!held) app.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.__app = app;
window.__pump = (n = 1, dt = 1 / 60) => { held = true; for (let i = 0; i < n; i++) app.frame(dt); held = false; };
window.__ready = true;
