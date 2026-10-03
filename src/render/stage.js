// The booth renderer: owns the WebGL renderer, the office scene, camera moves between desk /
// monitor / tape views, the ink-outline + bloom post chain, and pointer routing (desk objects vs.
// the replay on the main CRT).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildOffice, DESK_Y } from './office.js';
import { InkShader, curveUV, CURVE } from './crt.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// Camera views: look point, direction back toward the camera, the half extents that must fit.
const VIEWS = {
  title: { look: V(0.05, 1.02, -0.22), dir: V(0.32, 0.22, 1), halfW: 0.95, halfH: 0.5, fov: 32 },
  desk: { look: V(0, 0.99, -0.14), dir: V(0, 0.42, 1), halfW: 1.02, halfH: 0.44, fov: 32 },
  focus: { look: V(0, 1.0, -0.06), dir: V(0, 0.36, 1), halfW: 0.36, halfH: 0.31, fov: 30 },
  tape: { look: V(0.5, DESK_Y + 0.02, 0.2), dir: V(-0.1, 1.7, 0.85), halfW: 0.16, halfH: 0.12, fov: 30, film: 0.16 },
  report: { look: V(0, 0.96, -0.14), dir: V(-0.1, 0.42, 1), halfW: 1.0, halfH: 0.42, fov: 32, film: 0.12 },
};

export class Stage {
  constructor(canvas, textures) {
    this.canvas = canvas;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    this.textures = textures;
    const { scene, H } = buildOffice(textures);
    this.scene = scene;
    this.H = H;
    this.camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.05, 20);
    this.view = 'title';
    this.cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 32, film: 0 };
    this.tween = null;
    this.time = 0;
    this.mouse = new THREE.Vector2();
    this.drift = new THREE.Vector2();
    this.hover = null;
    this.onAction = null;   // (action, id, event)
    this.onScreen = null;   // (type, u, v, event) pointer over the main CRT
    this.onHover = null;    // (object|null, clientX, clientY)
    this.onRail = null;     // (fraction 0..1, phase)
    this.screenInput = false;
    this.crowdHeat = 0.3;
    this.bigBlink = true;
    this.ray = new THREE.Raycaster();

    // post chain
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    this.ndRT = new THREE.WebGLRenderTarget(size.x, size.y, { depthTexture: new THREE.DepthTexture(size.x, size.y) });
    this.normalMat = new THREE.MeshNormalMaterial();
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.ink = new ShaderPass(InkShader);
    this.composer.addPass(this.ink);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.45, 0.5, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // close-ups on the two side monitors, square to their screens
    for (const [name, which] of [['live', 'live'], ['term', 'term']]) {
      const g = H[which].group;
      g.updateMatrixWorld(true);
      const look = H[which].screen.getWorldPosition(new THREE.Vector3());
      const n = new THREE.Vector3(0, 0.3, 1).applyQuaternion(g.quaternion);
      VIEWS[name] = { look, dir: n, halfW: 0.26, halfH: 0.19, fov: 30 };
    }
    this._bind();
    this.resize();
    this.goTo('title', 0);
  }

  // ---- camera ----
  _viewPose(name) {
    const v = VIEWS[name], c = this.camera;
    const t = Math.tan(THREE.MathUtils.degToRad(v.fov / 2));
    const film = v.film && c.aspect > 1.2 ? v.film : 0;
    // with a film offset part of the frame is reserved for the side panel
    const usable = 1 - film * 1.6;
    const d = Math.max(v.halfH / t, v.halfW / (t * c.aspect * usable));
    const dir = v.dir.clone().normalize();
    return { pos: v.look.clone().addScaledVector(dir, d), look: v.look.clone(), fov: v.fov, film };
  }
  goTo(name, dur = 0.9) {
    this.view = name;
    const to = this._viewPose(name);
    if (!dur) { Object.assign(this.cam, { pos: to.pos, look: to.look, fov: to.fov, film: to.film }); this.tween = null; return; }
    this.tween = { from: { pos: this.cam.pos.clone(), look: this.cam.look.clone(), fov: this.cam.fov, film: this.cam.film }, to, t: 0, dur };
  }
  get moving() { return !!this.tween; }

  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.ndRT.setSize(s.x, s.y);
    this.ink.uniforms.resolution.value.set(s.x, s.y);
    this.ink.uniforms.thickness.value = Math.max(1, Math.min(2.2, s.y / 620));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.tween) { const p = this._viewPose(this.view); Object.assign(this.cam, p); }
    else this.tween.to = this._viewPose(this.view);
  }

  _applyCamera(dt) {
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt;
      const u = Math.min(1, tw.t / tw.dur), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      this.cam.pos.lerpVectors(tw.from.pos, tw.to.pos, e);
      this.cam.look.lerpVectors(tw.from.look, tw.to.look, e);
      this.cam.fov = tw.from.fov + (tw.to.fov - tw.from.fov) * e;
      this.cam.film = tw.from.film + (tw.to.film - tw.from.film) * e;
      if (u >= 1) this.tween = null;
    }
    // gentle hand-held drift toward the mouse in the wide views
    const wide = this.view === 'desk' || this.view === 'title' || this.view === 'report';
    const k = this.view === 'title' ? 0.04 : wide ? 0.018 : 0.004;
    const tx = this.view === 'title' ? Math.sin(this.time * 0.15) * 0.8 : this.mouse.x, ty = this.view === 'title' ? Math.sin(this.time * 0.11) * 0.4 : this.mouse.y;
    this.drift.x += (tx * k - this.drift.x) * Math.min(1, dt * 3);
    this.drift.y += (ty * k - this.drift.y) * Math.min(1, dt * 3);
    const c = this.camera;
    c.position.copy(this.cam.pos).add(new THREE.Vector3(this.drift.x, this.drift.y * 0.6, 0));
    c.lookAt(this.cam.look);
    c.fov = this.cam.fov;
    c.filmOffset = this.cam.film * c.getFilmWidth();
    c.updateProjectionMatrix();
  }

  // ---- input ----
  _bind() {
    const el = this.canvas;
    const nd = (e) => { const r = el.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1]; };
    let down = null;
    el.addEventListener('pointermove', (e) => {
      const [x, y] = nd(e);
      this.mouse.set(x, y);
      if (down && down.rail) { const f = this._railFrac(x, y); if (f != null && this.onRail) this.onRail(f, 'move'); return; }
      if (down && down.screen) { const uv = this._screenUV(x, y, true); if (uv && this.onScreen) this.onScreen('move', uv[0], uv[1], e); return; }
      const hit = this._pick(x, y);
      if (hit && hit.screen && this.screenInput) {
        this._setHover(null, e);
        if (this.onScreen) this.onScreen('move', hit.u, hit.v, e);
        return;
      }
      if (hit && hit.screen) { this._setHover(hit.screenObj, e); el.style.cursor = 'pointer'; return; }
      this._setHover(hit ? hit.obj : null, e);
      el.style.cursor = hit ? 'pointer' : 'default';
    });
    el.addEventListener('pointerdown', (e) => {
      const [x, y] = nd(e);
      const hit = this._pick(x, y);
      el.setPointerCapture(e.pointerId);
      if (hit && hit.screen && this.screenInput) { down = { screen: true }; if (this.onScreen) this.onScreen('down', hit.u, hit.v, e); return; }
      if (hit && hit.obj && hit.obj.userData.action === 'rail') {
        down = { rail: true };
        const f = this._railFrac(x, y); if (f != null && this.onRail) this.onRail(f, 'down');
        return;
      }
      down = { obj: hit ? (hit.screen ? hit.screenObj : hit.obj) : null };
      if (down.obj && down.obj.userData.action === 'key') this.press(down.obj.userData.id);
    });
    el.addEventListener('pointerup', (e) => {
      const [x, y] = nd(e);
      const d = down;
      down = null;
      if (!d) return;
      if (d.screen) { const uv = this._screenUV(x, y, true); if (this.onScreen) this.onScreen('up', uv ? uv[0] : 0.5, uv ? uv[1] : 0.5, e); return; }
      if (d.rail) { if (this.onRail) this.onRail(this._railFrac(x, y) ?? 0, 'up'); return; }
      const hit = this._pick(x, y);
      const obj = hit ? (hit.screen ? hit.screenObj : hit.obj) : null;
      if (obj && obj === d.obj && this.onAction) this.onAction(obj.userData.action, obj.userData.id, e);
    });
    el.addEventListener('wheel', (e) => {
      const [x, y] = nd(e);
      const uv = this._screenUV(x, y);
      if (uv && this.screenInput && this.onScreen) { e.preventDefault(); this.onScreen('wheel', uv[0], uv[1], e); }
    }, { passive: false });
    el.addEventListener('dblclick', (e) => {
      const [x, y] = nd(e);
      const uv = this._screenUV(x, y);
      if (uv && this.screenInput && this.onScreen) this.onScreen('dbl', uv[0], uv[1], e);
    });
    el.addEventListener('pointerleave', () => this._setHover(null));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _pick(x, y) {
    this.ray.setFromCamera({ x, y }, this.camera);
    const scr = this.H.main.screen;
    const targets = [...this.H.clickables, scr, this.H.live.screen, this.H.term.screen];
    const hits = this.ray.intersectObjects(targets, false);
    if (!hits.length) return null;
    const h = hits[0];
    if (h.object === scr) {
      const [u, v] = curveUV(h.uv.x, h.uv.y, CURVE);
      scr.userData.action = 'monitor';
      return { screen: true, screenObj: scr, u, v: 1 - v };
    }
    if (h.object === this.H.live.screen || h.object === this.H.term.screen) return null;
    return { obj: h.object };
  }
  // UV on the main screen even when the cursor strays slightly outside (for drags).
  _screenUV(x, y, clampIt = false) {
    this.ray.setFromCamera({ x, y }, this.camera);
    const h = this.ray.intersectObject(this.H.main.screen, false)[0];
    if (h) { const [u, v] = curveUV(h.uv.x, h.uv.y, CURVE); return [u, 1 - v]; }
    if (!clampIt) return null;
    // project onto the screen plane instead
    const s = this.H.main.screen;
    const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1).applyQuaternion(s.getWorldQuaternion(new THREE.Quaternion())), s.getWorldPosition(new THREE.Vector3()));
    const p = this.ray.ray.intersectPlane(pl, new THREE.Vector3());
    if (!p) return null;
    s.worldToLocal(p);
    const g = s.geometry.parameters;
    return [Math.max(0, Math.min(1, p.x / g.width + 0.5)), Math.max(0, Math.min(1, 0.5 - p.y / g.height))];
  }
  // tape label coordinates (tape canvas pixels) under a page point, or null
  tapeAt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * 2 - 1, y = -((clientY - r.top) / r.height) * 2 + 1;
    this.ray.setFromCamera({ x, y }, this.camera);
    const h = this.ray.intersectObject(this.H.tapeBody, false)[0];
    if (!h || !h.uv || h.face.normal.y < 0.5) return h ? { px: -1, py: -1 } : null;
    return { px: h.uv.x * 1024, py: (1 - h.uv.y) * 576 };
  }
  _railFrac(x, y) {
    this.ray.setFromCamera({ x, y }, this.camera);
    const kb = this.H.kb;
    const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0).applyQuaternion(kb.quaternion), kb.localToWorld(new THREE.Vector3(0, 0.03, 0)));
    const p = this.ray.ray.intersectPlane(pl, new THREE.Vector3());
    if (!p) return null;
    kb.worldToLocal(p);
    const R = this.H.rail;
    return Math.max(0, Math.min(1, (p.x - R.x0) / (R.x1 - R.x0)));
  }

  _setHover(obj, e) {
    const groupOf = (o) => (o && o.userData.action === 'book' ? this.H.book.children : o && o.userData.action === 'rail' ? [this.H.rail.knob] : o ? [o] : []);
    if (this.hover === obj) { if (obj && this.onHover && e) this.onHover(obj, e.clientX, e.clientY); return; }
    for (const m of groupOf(this.hover)) setEmissive(m, 0);
    this.hover = obj;
    for (const m of groupOf(obj)) setEmissive(m, obj.userData.action === 'monitor' ? 0 : obj.userData.action === 'tape' ? 0.06 : 0.16);
    if (this.onHover) this.onHover(obj, e ? e.clientX : 0, e ? e.clientY : 0);
  }

  // key press animation (also used by keyboard shortcuts)
  press(id) {
    const k = this.H.keys[id];
    if (!k) return;
    k.userData.pressT = 0.14;
  }

  setRail(frac, ticks = null) {
    const R = this.H.rail;
    R.knob.position.x = R.x0 + (R.x1 - R.x0) * frac;
    if (ticks && ticks !== R.lastTicks) {
      R.lastTicks = ticks;
      const x = R.tex.userData.ctx, c = R.tex.userData.canvas;
      x.fillStyle = '#20262e'; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#3a8f5a'; x.fillRect(0, 13, c.width, 6);
      for (const t of ticks) { x.fillStyle = t.color; x.fillRect(t.f * c.width - 3, 4, 6, 24); }
      R.tex.needsUpdate = true;
    }
  }
  setMainScreen(tex, rows) {
    const u = this.H.main.screen.material.uniforms;
    u.tScreen.value = tex;
    u.rows.value = rows;
  }
  power(which, v) { this.H[which].screen.material.uniforms.power.value = v; }
  setNote(draw) {
    const n = this.H.note;
    if (!draw) { n.mesh.visible = false; return; }
    draw(n.tex.userData.ctx, 256, 256);
    n.tex.needsUpdate = true;
    n.mesh.visible = true;
  }
  setClock(hh, mm) {
    const t = this.H.clock, x = t.userData.ctx;
    const key = hh * 60 + Math.floor(mm);
    if (t.userData.key === key) return;
    t.userData.key = key;
    x.fillStyle = '#fbf8ef'; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = '#20262e';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; x.lineWidth = i % 3 ? 4 : 8; x.beginPath(); x.moveTo(128 + Math.sin(a) * 100, 128 - Math.cos(a) * 100); x.lineTo(128 + Math.sin(a) * 116, 128 - Math.cos(a) * 116); x.stroke(); }
    const hand = (a, l, w, c) => { x.strokeStyle = c; x.lineWidth = w; x.lineCap = 'round'; x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + Math.sin(a) * l, 128 - Math.cos(a) * l); x.stroke(); };
    hand(((hh % 12) + mm / 60) / 12 * Math.PI * 2, 60, 10, '#20262e');
    hand((mm / 60) * Math.PI * 2, 92, 6, '#20262e');
    x.fillStyle = '#d9463e'; x.beginPath(); x.arc(128, 128, 9, 0, 7); x.fill();
    // the cylinder cap's UVs are mirrored relative to the wall; flip so the clock reads right
    t.needsUpdate = true;
  }

  // tape flight (e.g. into the terminal slot); returns a promise
  animateTape(to, dur = 0.9) {
    const T = this.H.tape;
    const from = { pos: T.position.clone(), rot: T.rotation.clone() };
    return new Promise((res) => { this._tapeAnim = { from, to, t: 0, dur, res }; });
  }
  resetTape() { const T = this.H.tape; T.position.copy(this.H.tapeHome.pos); T.rotation.copy(this.H.tapeHome.rot); T.visible = true; this._tapeAnim = null; }
  slotPose(stage = 0) {
    // stage 0: hovering above the slot, 1: inside it
    const term = this.H.term.group;
    const p = term.localToWorld(new THREE.Vector3(0, stage ? 0.1 : 0.32, -0.09));
    return { pos: p, rot: new THREE.Euler(-Math.PI / 2, -0.38, 0, 'YXZ') };
  }

  // ---- frame ----
  render(dt) {
    this.time += dt;
    this._applyCamera(dt);
    const H = this.H;
    for (const id in H.keys) {
      const k = H.keys[id];
      if (k.userData.pressT > 0) k.userData.pressT -= dt;
      k.position.y = k.userData.baseY - (k.userData.pressT > 0 ? 0.008 : 0);
    }
    for (const s of H.steam) {
      const ph = (s.userData.phase + this.time * 0.18) % 1;
      s.position.set(H.mugPos.x + Math.sin(ph * 9 + s.userData.phase * 20) * 0.02, H.mugPos.y + 0.06 + ph * 0.28, H.mugPos.z + Math.cos(ph * 7) * 0.01);
      s.scale.setScalar(0.04 + ph * 0.09);
      s.material.opacity = Math.sin(ph * Math.PI) * 0.35;
    }
    if (this._tapeAnim) {
      const a = this._tapeAnim, T = H.tape;
      a.t += dt;
      const u = Math.min(1, a.t / a.dur), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      T.position.lerpVectors(a.from.pos, a.to.pos, e);
      if (a.to.arc) T.position.y += Math.sin(u * Math.PI) * a.to.arc;
      const q0 = new THREE.Quaternion().setFromEuler(a.from.rot), q1 = new THREE.Quaternion().setFromEuler(a.to.rot);
      T.quaternion.slerpQuaternions(q0, q1, e);
      if (u >= 1) { this._tapeAnim = null; a.res(); }
    }
    for (const w of ['main', 'live', 'term']) {
      const u = H[w].screen.material.uniforms;
      u.time.value = this.time;
      H.glow[w].intensity = (w === 'main' ? 0.07 : 0.12) * u.power.value;
    }
    this.ink.uniforms.time.value = this.time;
    this._ambient(dt);

    // office depth + normals for the ink pass
    const r = this.renderer;
    const hidden = [...H.steam, ...H.effects].filter((s) => s.visible);
    hidden.forEach((s) => (s.visible = false));
    this.scene.overrideMaterial = this.normalMat;
    r.setRenderTarget(this.ndRT);
    r.render(this.scene, this.camera);
    this.scene.overrideMaterial = null;
    hidden.forEach((s) => (s.visible = true));
    r.setRenderTarget(null);
    this.ink.uniforms.tDepth.value = this.ndRT.depthTexture;
    this.ink.uniforms.tNormal.value = this.ndRT.texture;
    this.ink.uniforms.cameraNear.value = this.camera.near;
    this.ink.uniforms.cameraFar.value = this.camera.far;
    r.shadowMap.needsUpdate = true;
    this.composer.render(dt);
  }

  // the room around you keeps moving: dust drifts, cameras flash in the stands, the big screen
  _ambient(dt) {
    const H = this.H, t = this.time;
    const p = H.dust.geometry.attributes.position, b = H.dust.userData.base;
    for (let i = 0; i < p.count; i++) {
      p.array[i * 3] = b[i * 3] + Math.sin(t * 0.13 + i) * 0.05;
      p.array[i * 3 + 1] = b[i * 3 + 1] + Math.sin(t * 0.09 + i * 1.7) * 0.06;
      p.array[i * 3 + 2] = b[i * 3 + 2] + Math.cos(t * 0.11 + i * 0.7) * 0.04;
    }
    p.needsUpdate = true;
    this._flashT = (this._flashT || 0) - dt;
    if (this._flashT <= 0) {
      this._flashT = 0.08;
      const f = H.flashes.userData.ctx;
      f.clearRect(0, 0, 256, 128);
      const n = 1 + Math.floor(Math.random() * (2 + this.crowdHeat * 8));
      for (let i = 0; i < n; i++) { f.fillStyle = '#fff'; f.fillRect(Math.random() * 256, 38 + Math.random() * 34, 1, 1); }
      H.flashes.needsUpdate = true;
    }
    this._bigT = (this._bigT || 0) - dt;
    if (this._bigT <= 0) {
      this._bigT = 0.5;
      const x = H.bigScreen.userData.ctx, on = Math.floor(t * 2) % 2 === 0;
      x.fillStyle = '#05070d'; x.fillRect(0, 0, 128, 48);
      x.fillStyle = '#10182c'; for (let i = 0; i < 48; i += 2) x.fillRect(0, i, 128, 1);
      x.font = '16px Silkscreen'; x.textAlign = 'center'; x.textBaseline = 'middle';
      const msg = this.bigText || ['VAR', 'CHECK'];
      x.fillStyle = this.bigColor || '#ffd23f';
      if (on || !this.bigBlink) { x.fillText(msg[0], 64, 15); x.fillText(msg[1] || '', 64, 34); }
      H.bigScreen.needsUpdate = true;
    }
  }
  setBigScreen(lines, color = '#ffd23f', blink = true) { this.bigText = lines; this.bigColor = color; this.bigBlink = blink; this._bigT = 0; }

  // where a world point lands on the page (for speech bubbles / tooltips)
  toPage(obj, offset = [0, 0, 0]) {
    const p = obj.localToWorld(new THREE.Vector3(...offset)).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }
}

function setEmissive(m, v) {
  const mats = Array.isArray(m.material) ? m.material : [m.material];
  for (const mt of mats) if (mt.emissive) mt.emissive.setRGB(v, v * 0.95, v * 0.8);
}
