// The LIVE feed on the left CRT: the referee on the touchline waiting on you, the crowd behind,
// TV graphics. After a decision the referee draws the screen signal and gives the call.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { PlayerMesh } from './players.js';
import { basePose, joints } from '../sim/kinematics.js';
import { pixelMaterial } from './crt.js';
import { toon } from './toon.js';

const W = 256, H = 192;
// the referee faces the touchline camera
const FACE = -Math.PI / 2;
const REF_KIT = { shirt: 0xf2c230, shorts: 0x16181f, socks: 0x16181f, num: 0x16181f, gk: 0xf2c230 };
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));

export class LiveFeed {
  constructor(renderer) {
    this.renderer = renderer;
    const mk = (o = {}) => new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, ...o });
    this.colorRT = mk(); this.colorRT.texture.colorSpace = THREE.SRGBColorSpace;
    this.ndRT = mk({ depthTexture: new THREE.DepthTexture(W, H) });
    this.outRT = mk(); this.outRT.texture.colorSpace = THREE.SRGBColorSpace;
    this.output = this.outRT.texture;
    this.rows = H;
    this.pix = pixelMaterial();
    this.pix.uniforms.resolution.value.set(W, H);
    this.quad = new FullScreenQuad(this.pix);
    this.normalMat = new THREE.MeshNormalMaterial();
    this.osd = document.createElement('canvas');
    this.osd.width = W; this.osd.height = H;
    this.osdTex = new THREE.CanvasTexture(this.osd);
    this.osdTex.minFilter = this.osdTex.magFilter = THREE.NearestFilter;
    this.osdTex.colorSpace = THREE.SRGBColorSpace;

    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x253049);
    s.add(new THREE.HemisphereLight(0xeaf2ff, 0x3a5a30, 1.9));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.0);
    sun.position.set(3, 6, 4);
    s.add(sun);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), toon(0x56b845));
    grass.rotation.x = -Math.PI / 2;
    s.add(grass);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(40, 0.12), toon(0xf4f4f4));
    line.rotation.x = -Math.PI / 2; line.position.set(0, 0.01, 1.2);
    s.add(line);
    // LED ad boards that scroll, stands with an animated crowd, a roof edge and floodlight glow
    this.ledCanvas = document.createElement('canvas');
    this.ledCanvas.width = 512; this.ledCanvas.height = 16;
    this.ledTex = new THREE.CanvasTexture(this.ledCanvas);
    this.ledTex.minFilter = this.ledTex.magFilter = THREE.NearestFilter;
    this.ledTex.colorSpace = THREE.SRGBColorSpace;
    this.ledTex.wrapS = THREE.RepeatWrapping;
    this.ledTex.repeat.set(6, 1);
    const boards = new THREE.Mesh(new THREE.BoxGeometry(40, 0.7, 0.1), [toon(0x16213a), toon(0x16213a), toon(0x16213a), toon(0x16213a), new THREE.MeshBasicMaterial({ map: this.ledTex }), toon(0x16213a)]);
    boards.position.set(0, 0.35, -4);
    s.add(boards);
    this.crowdCanvas = document.createElement('canvas');
    this.crowdCanvas.width = 384; this.crowdCanvas.height = 192;
    this.crowdTex = new THREE.CanvasTexture(this.crowdCanvas);
    this.crowdTex.minFilter = this.crowdTex.magFilter = THREE.NearestFilter;
    this.crowdTex.colorSpace = THREE.SRGBColorSpace;
    const stand = new THREE.Mesh(new THREE.PlaneGeometry(24, 12), new THREE.MeshBasicMaterial({ map: this.crowdTex }));
    stand.position.set(0, 4.5, -7);
    stand.rotation.x = -0.35;
    s.add(stand);
    this.fans = [];
    const pal = ['#d9463e', '#f4f4f4', '#2f6f9a', '#e0b04a', '#2a2a2a', '#5ad1e6', '#e85a8a', '#3f9a4a'];
    const skins = ['#f1c7a5', '#d9a47c', '#b57c55', '#8a5636', '#5e3a24'];
    const hairs = ['#1a1410', '#3b2a1e', '#6b4a2b', '#c9a35a', '#8c3b1d'];
    let seed = 9;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let r = 0; r < 16; r++) for (let c = 0; c < 48; c++) {
      if (rnd() < 0.08) continue;
      this.fans.push({ x: c * 8 + (r % 2) * 4, y: 10 + r * 11, col: pal[Math.floor(rnd() * pal.length)], skin: skins[Math.floor(rnd() * skins.length)], hair: hairs[Math.floor(rnd() * hairs.length)], ph: rnd() * 6, scarf: rnd() < 0.2 });
    }
    this.ref = new PlayerMesh({ keeper: false, num: '', id: 3, jointsAt: () => null }, REF_KIT, { face: true });
    s.add(this.ref.group);
    this.ref.ring.visible = false;
    // the card he shows
    this.card = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.085), toon(0xffd23f, { unique: true }));
    this.card.visible = false;
    s.add(this.card);
    this.camera = new THREE.PerspectiveCamera(30, W / H, 0.3, 80);
    this.camera.position.set(0.0, 1.5, 3.1);
    this.camera.lookAt(0, 1.3, 0);

    this.t = 0;
    this.excite = 0.2;
    this.anim = null;           // { kind, t, card }
    this.banner = null;         // { top, main, color }
    this.score = null;
    this.mode = 'idle';
  }

  setMatch(k) { this.score = k; }
  setBanner(b) { this.banner = b; }
  // queue the referee's signal sequence
  signal(seq) { this.queue = seq.slice(); this._next(); }
  _next() { const k = this.queue && this.queue.shift(); this.anim = k ? { kind: k.kind || k, card: k.card, t: 0 } : null; }

  _pose() {
    const p = basePose();
    p.x = 0; p.z = 0; p.yaw = FACE + Math.sin(this.t * 0.4) * 0.08;
    p.phase = 0;
    p.lean = Math.sin(this.t * 1.3) * 0.02;
    const A = this.anim;
    let card = false;
    // default: hand to the earpiece, listening to VAR
    if (this.mode === 'check' && !A) { p.armR = { abd: 0.55, fwd: 1.55, bend: 2.45 }; p.armL = { abd: 0.1, fwd: 0.05, bend: 0.3 }; }
    if (A) {
      A.t += 0;
      const t = A.t;
      if (A.kind === 'screen') {
        // draw a TV screen in the air: top edge outwards, down, bottom edge back in
        const top = 1.75, bot = 1.15, inA = 0.12, outA = 0.62;
        let abd, fwd;
        if (t < 0.4) { abd = lerp(inA, inA, 0); fwd = lerp(0.4, top, ease(t / 0.4)); }
        else if (t < 1.0) { abd = lerp(inA, outA, ease((t - 0.4) / 0.6)); fwd = top; }
        else if (t < 1.5) { abd = outA; fwd = lerp(top, bot, ease((t - 1.0) / 0.5)); }
        else if (t < 2.1) { abd = lerp(outA, inA, ease((t - 1.5) / 0.6)); fwd = bot; }
        else { abd = inA; fwd = lerp(bot, 0.1, ease((t - 2.1) / 0.4)); }
        p.armL = { abd, fwd, bend: 0.15 }; p.armR = { abd, fwd, bend: 0.15 };
        if (t > 2.6) this._next();
      } else if (A.kind === 'penalty') {
        const u = ease(t / 0.4);
        p.armR = { abd: 0.1, fwd: lerp(0, 1.15, u), bend: 0.05 }; p.yaw = FACE - 0.5 * u;
        if (t > 2.2) this._next();
      } else if (A.kind === 'free') {
        const u = ease(t / 0.4);
        p.armR = { abd: lerp(0, 0.5, u), fwd: lerp(0, 1.5, u), bend: 0.05 };
        if (t > 2.0) this._next();
      } else if (A.kind === 'goal') {
        const u = ease(t / 0.4);
        p.armR = { abd: 0.05, fwd: lerp(0, 1.45, u), bend: 0.05 }; p.yaw = FACE + 0.9 * u;
        if (t > 2.0) this._next();
      } else if (A.kind === 'nogoal') {
        const w = Math.sin(t * 9) * 0.35 * ease(t / 0.3) * (1 - ease((t - 1.6) / 0.4));
        p.armL = { abd: 0.5 + w, fwd: 1.2, bend: 0.1 }; p.armR = { abd: 0.5 - w, fwd: 1.2, bend: 0.1 };
        if (t > 2.0) this._next();
      } else if (A.kind === 'playon') {
        const u = ease(t / 0.4);
        p.armL = { abd: 0.25, fwd: lerp(0, 1.25, u), bend: 0.1 }; p.armR = { abd: 0.25, fwd: lerp(0, 1.25, u), bend: 0.1 };
        if (t > 2.0) this._next();
      } else if (A.kind === 'card') {
        const u = ease(t / 0.35);
        p.armR = { abd: 0.25, fwd: lerp(0.2, 2.75, u), bend: 0.1 };
        card = A.card;
        if (t > 2.4) this._next();
      } else if (A.kind === 'offside') {
        const u = ease(t / 0.4);
        p.armR = { abd: 0.05, fwd: lerp(0, 2.9, u), bend: 0.0 };
        if (t > 2.0) this._next();
      } else this._next();
    }
    return { p, card };
  }

  update(dt) {
    this.t += dt;
    if (this.anim) this.anim.t += dt;
    const { p, card } = this._pose();
    const j = joints(p);
    this.ref.update(j);
    this.card.visible = !!card;
    if (card) {
      this.card.material.color.set(card === 'Red' ? 0xe43a3a : 0xffd23f);
      this.card.position.set(j.haR[0], j.haR[1] + 0.06, j.haR[2]);
      this.card.rotation.y = 0;
    }
    this._drawCrowd();
  }

  _drawCrowd() {
    const x = this.crowdCanvas.getContext('2d');
    const Wc = 384, Hc = 192;
    x.fillStyle = '#272d3d'; x.fillRect(0, 0, Wc, Hc);
    for (let r = 0; r < 17; r++) { x.fillStyle = r % 2 ? '#323a50' : '#2b3246'; x.fillRect(0, r * 11 + 6, Wc, 11); }
    const ex = this.excite;
    for (const f of this.fans) {
      const bob = Math.max(0, Math.sin(this.t * (5 + ex * 6) + f.ph)) * (1 + ex * 3);
      const y = Math.round(f.y - bob);
      x.fillStyle = f.col; x.fillRect(f.x + 1, y + 4, 5, 6);
      x.fillStyle = f.skin; x.fillRect(f.x + 2, y, 3, 4);
      x.fillStyle = f.hair; x.fillRect(f.x + 2, y, 3, 1);
      if (f.scarf) { x.fillStyle = '#f4f4f4'; x.fillRect(f.x + 1, y + 4, 5, 1); }
      // arms up when the crowd is going
      if (ex > 0.55 && Math.sin(f.ph * 3 + this.t * 2) > 0.5 - ex * 0.4) { x.fillStyle = f.skin; x.fillRect(f.x, y - 3, 1, 5); x.fillRect(f.x + 6, y - 3, 1, 5); }
    }
    // camera flashes
    for (let i = 0; i < 2 + ex * 6; i++) if (Math.random() < 0.3) { x.fillStyle = '#fff'; x.fillRect(Math.random() * Wc, 10 + Math.random() * 160, 2, 2); }
    // roof edge
    x.fillStyle = '#0f1320'; x.fillRect(0, 0, Wc, 6);
    this.crowdTex.needsUpdate = true;
    // scrolling LED boards
    const l = this.ledCanvas.getContext('2d');
    const ads = [['#d9463e', '#fff', 'REPLAY ROOM'], ['#1b2a6b', '#ffd23f', 'FAIR PLAY'], ['#e0b04a', '#10141c', 'COASTAL LEAGUE'], ['#3f9a4a', '#fff', 'RESPECT THE CALL']];
    const off = Math.floor(this.t * 24) % 512;
    l.font = '8px Silkscreen'; l.textBaseline = 'middle';
    for (let i = 0; i < 4; i++) {
      const [bg, fg, txt] = ads[i], x0 = ((i * 128 - off) % 512 + 512) % 512;
      for (const xx of [x0, x0 - 512]) { l.fillStyle = bg; l.fillRect(xx, 0, 128, 16); l.fillStyle = fg; l.fillText(txt, xx + 6, 9); }
    }
    this.ledTex.needsUpdate = true;
  }

  _drawOSD() {
    const x = this.osd.getContext('2d');
    x.clearRect(0, 0, W, H);
    x.imageSmoothingEnabled = false;
    x.font = '8px Silkscreen'; x.textBaseline = 'top';
    // LIVE bug
    x.fillStyle = '#1b2a6b'; x.fillRect(6, 6, 40, 13);
    x.fillStyle = Math.sin(this.t * 4) > -0.3 ? '#ff3b3b' : '#7a1f1f'; x.fillRect(10, 10, 5, 5);
    x.fillStyle = '#fff'; x.fillText('LIVE', 19, 8);
    if (this.score) {
      const k = this.score, txt = `${k.a} ${k.sa}-${k.sb} ${k.b}`;
      const w = x.measureText(txt).width + 26;
      x.fillStyle = '#10141c'; x.fillRect(W - w - 6, 6, w, 13);
      x.fillStyle = '#fff'; x.fillText(txt, W - w, 8);
      x.fillStyle = '#9dffb8'; x.fillText(`${k.min}'`, W - 22, 8);
    }
    const b = this.banner;
    if (b) {
      const y = H - 40;
      x.fillStyle = b.color || '#1b2a6b'; x.fillRect(10, y, W - 20, 13);
      x.fillStyle = '#fff'; x.textAlign = 'left'; x.fillText(b.top, 15, y + 2);
      x.fillStyle = '#f4f0e2'; x.fillRect(10, y + 13, W - 20, 16);
      x.fillStyle = '#10141c';
      x.font = '16px Silkscreen'; x.fillText(b.main, 15, y + 13);
      x.font = '8px Silkscreen';
    }
    this.osdTex.needsUpdate = true;
  }

  render(dt) {
    this.update(dt);
    this._drawOSD();
    const r = this.renderer, prev = r.getRenderTarget();
    this.scene.overrideMaterial = this.normalMat;
    r.setRenderTarget(this.ndRT); r.render(this.scene, this.camera);
    this.scene.overrideMaterial = null;
    r.setRenderTarget(this.colorRT); r.render(this.scene, this.camera);
    const u = this.pix.uniforms;
    u.tColor.value = this.colorRT.texture; u.tDepth.value = this.ndRT.depthTexture; u.tNormal.value = this.ndRT.texture; u.tOSD.value = this.osdTex;
    u.cameraNear.value = this.camera.near; u.cameraFar.value = this.camera.far;
    r.setRenderTarget(this.outRT); this.quad.render(r);
    r.setRenderTarget(prev);
  }
}
