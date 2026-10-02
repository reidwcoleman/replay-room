import { App, newState } from './app.js';
import { Sound } from './audio.js';

const sound = new Sound();
const app = new App(document.getElementById('app'), sound);
addEventListener('pointerdown', () => sound.unlock(), { once: false });

// ?day=N&case=M jumps straight into a case (testing); ?title shows the title.
const q = new URLSearchParams(location.search);
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
