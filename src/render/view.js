// The replay feed: scene, camera angles, zoom/pan, player picking and offside lines. It renders
// into a small render target (chunky pixels + ink outlines) that the main CRT on the desk shows.
// Input arrives as screen UVs (0..1, v down) from whatever is displaying the feed.
import * as THREE from 'three';
import { buildStadium } from './stadium.js';
import { PlayerMesh, setGhost } from './players.js';
import { SCORING } from '../sim/kinematics.js';
import { BALL_R, GOAL_X } from '../sim/clip.js';
import { pixelMaterial } from './crt.js';
import { toon } from './toon.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

export const CAMS = [
  { id: 'broadcast', label: 'Main' },
  { id: 'reverse', label: 'Reverse' },
  { id: 'behind', label: 'Behind goal' },
  { id: 'tactical', label: 'Tactical' },
  { id: 'goalline', label: 'Goal-line (virtual)' },
  { id: 'free', label: 'Free' },
];

export class ReplayView {
  constructor(renderer, w = 480, h = 360) {
    this.renderer = renderer;
    this.w = w; this.h = h;
    const mk = (o = {}) => { const t = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, ...o }); return t; };
    this.colorRT = mk({ samples: 0 });
    this.colorRT.texture.colorSpace = THREE.SRGBColorSpace;
    this.ndRT = mk({ depthTexture: new THREE.DepthTexture(w, h) });
    this.outRT = mk();
    this.outRT.texture.colorSpace = THREE.SRGBColorSpace;
    this.output = this.outRT.texture;
    this.normalMat = new THREE.MeshNormalMaterial();
    this.pix = pixelMaterial();
    this.pix.uniforms.resolution.value.set(w, h);
    this.quad = new FullScreenQuad(this.pix);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, w / h, 0.3, 600);
    this.stadium = null;
    this.players = [];
    this.clip = null;
    this.t = 0;
    this.cam = 'broadcast';
    this.zoom = 1;
    this.pan = new THREE.Vector2();
    this.orbit = { yaw: -0.9, pitch: 0.45, dist: 28 };
    this.lines = [];       // { actor, mesh, color }
    this.lineMode = false;
    this.selected = null;
    this.hover = null;
    this.onPick = null;
    this.onLines = null;
    this.excite = 0.3;

    const ballTex = ballTexture();
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), toon(0xffffff, { map: ballTex }));
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.drag = null;
    this.cursor = 'grab';
  }

  load(clip) {
    if (!this.stadium) this.stadium = buildStadium(this.scene, clip.kits.A);
    for (const p of this.players) this.scene.remove(p.group);
    this.clearLines();
    this.clip = clip;
    this.players = clip.actors.map((a) => {
      const pm = new PlayerMesh(a, clip.kits[a.team]);
      this.scene.add(pm.group);
      return pm;
    });
    this.selected = null;
    this.zoom = 1;
    this.pan.set(0, 0);
    this.setTime(0);
  }

  setTime(t) {
    this.t = t;
    if (!this.clip) return;
    for (const p of this.players) p.update(p.actor.jointsAt(t));
    const b = this.clip.ballAt(t);
    this.ball.position.set(...b);
    // spin the ball along its travel
    const b2 = this.clip.ballAt(t + 0.02);
    const v = new THREE.Vector3(b2[0] - b[0], 0, b2[2] - b[2]);
    if (v.lengthSq() > 1e-8) this.ball.rotation.set(0, Math.atan2(v.x, v.z), 0), this.ball.rotateX(t * 9);
    for (const l of this.lines) this._placeLine(l);
    if (this.onLines) this.onLines(this.lineInfo());
  }

  setCam(id) { this.cam = id; this.zoom = id === 'goalline' ? 2 : 1; this.pan.set(0, 0); }

  _smoothBall(t) {
    let x = 0, y = 0, z = 0, n = 0;
    for (let d = -0.8; d <= 0.81; d += 0.2) { const b = this.clip.ballAt(t + d); x += b[0]; y += b[1]; z += b[2]; n++; }
    return new THREE.Vector3(x / n, y / n, z / n);
  }

  _placeCamera() {
    const c = this.camera, sb = this._smoothBall(this.t);
    let pos, look, fov = 30;
    const focus = this.selected ? new THREE.Vector3(...this.selected.actor.jointsAt(this.t).pelvis) : null;
    switch (this.cam) {
      case 'broadcast': pos = new THREE.Vector3(sb.x * 0.85, 16, -37.5); look = new THREE.Vector3(sb.x, 0, sb.z * 0.8 + 2); fov = 25; break;
      case 'reverse': pos = new THREE.Vector3(sb.x * 0.85, 14, 37.5); look = new THREE.Vector3(sb.x, 0, sb.z * 0.8 - 2); fov = 32; break;
      case 'behind': pos = new THREE.Vector3(GOAL_X + 5, 6.5, sb.z * 0.25); look = new THREE.Vector3(Math.min(sb.x, GOAL_X - 6) - 4, 0.6, sb.z * 0.6); fov = 40; break;
      case 'tactical': pos = new THREE.Vector3(sb.x, 62, sb.z); look = new THREE.Vector3(sb.x, 0, sb.z); fov = 38; break;
      // High gantry camera sitting exactly in the plane of the goal line's outer edge: that whole
      // plane projects to one straight line on screen, so "whole ball over" is readable.
      case 'goalline': pos = new THREE.Vector3(GOAL_X, 26, -20); look = new THREE.Vector3(GOAL_X, 0.5, 0); fov = 12; break;
      case 'free': {
        const tgt = focus || sb;
        const o = this.orbit;
        pos = new THREE.Vector3(tgt.x + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist, tgt.y + Math.sin(o.pitch) * o.dist, tgt.z + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist);
        look = tgt.clone();
        fov = 34;
        break;
      }
    }
    c.position.copy(pos);
    // top-down view keeps the pitch's length running left-to-right
    if (this.cam === 'tactical') c.up.set(0, 0, -1); else c.up.set(0, 1, 0);
    c.lookAt(look);
    // pan in screen space, scaled by distance and zoom
    const dist = pos.distanceTo(look);
    const right = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld, 1);
    const k = (dist * Math.tan(THREE.MathUtils.degToRad(fov / 2))) / this.zoom;
    const off = right.multiplyScalar(this.pan.x * k).add(up.multiplyScalar(this.pan.y * k));
    // pan by turning the camera (like a broadcast operator); it never leaves its mount
    c.lookAt(look.clone().add(off));
    c.fov = fov / this.zoom;
    c.updateProjectionMatrix();
  }

  render(dt = 0, osd = null) {
    if (!this.clip) return;
    this._placeCamera();
    // Goal-line view is a reconstruction: no goal frame, ghosted players, so the ball is never hidden.
    const virt = this.cam === 'goalline';
    if (this._virt !== virt) {
      this._virt = virt;
      if (this.stadium) for (const g of this.stadium.goals) g.visible = !virt;
      setGhost(virt);
    }
    for (const p of this.players) {
      p.ring.visible = !virt && (p === this.selected || p === this.hover || this.lines.some((l) => l.pm === p));
      const lc = this.lines.find((l) => l.pm === p);
      p.ring.material.color.set(lc ? lc.color : p === this.selected ? 0x5ef2c4 : 0xffffff);
      p.ring.material.opacity = p === this.hover && p !== this.selected ? 0.5 : 0.9;
    }
    // offside lines stay ~2.5 px wide at any distance / zoom
    const hPx = this.h;
    for (const l of this.lines) {
      const d = this.camera.position.distanceTo(l.mesh.position.clone().setZ(this.camera.position.z * 0 + this._smoothBall(this.t).z));
      const perPx = (2 * d * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / hPx;
      l.mesh.children[0].scale.set(Math.max(1, (perPx * 1.6) / 0.035), 1, 1);
    }
    if (this.stadium) this.stadium.update(dt, this.excite);
    const r = this.renderer, prev = r.getRenderTarget();
    // depth + normals for the outline pass (lines and rings stay out of it)
    const hidden = [];
    for (const l of this.lines) { l.mesh.visible = false; hidden.push(l.mesh); }
    for (const p of this.players) if (p.ring.visible) { p.ring.visible = false; hidden.push(p.ring); }
    this.scene.overrideMaterial = this.normalMat;
    r.setRenderTarget(this.ndRT);
    r.render(this.scene, this.camera);
    this.scene.overrideMaterial = null;
    for (const m of hidden) m.visible = true;
    r.shadowMap.needsUpdate = true;
    r.setRenderTarget(this.colorRT);
    r.render(this.scene, this.camera);
    const u = this.pix.uniforms;
    u.tColor.value = this.colorRT.texture;
    u.tDepth.value = this.ndRT.depthTexture;
    u.tNormal.value = this.ndRT.texture;
    u.tOSD.value = osd;
    u.cameraNear.value = this.camera.near; u.cameraFar.value = this.camera.far;
    u.ghost.value = virt ? 1 : 0;
    r.setRenderTarget(this.outRT);
    this.quad.render(r);
    r.setRenderTarget(prev);
  }

  // ---- offside lines ----
  furthestX(actor, t = this.t) {
    const j = actor.jointsAt(t);
    let best = -Infinity, part = null;
    for (const k of SCORING) if (j[k][0] > best) { best = j[k][0]; part = k; }
    return { x: best, part };
  }

  addLine(pm) {
    if (this.lines.some((l) => l.pm === pm)) { this.removeLine(pm); return; }
    if (this.lines.length >= 2) this.removeLine(this.lines[0].pm);
    const color = pm.actor.team === 'A' ? 0xff3d7f : 0x3ec9ff;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 68), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false }));
    mesh.renderOrder = 5;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(68, 2.2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
    wall.rotation.y = Math.PI / 2;
    const g = new THREE.Group();
    g.add(mesh); g.add(wall);
    wall.position.y = 1.1;
    this.scene.add(g);
    const l = { pm, mesh: g, color };
    this.lines.push(l);
    this._placeLine(l);
    if (this.onLines) this.onLines(this.lineInfo());
  }
  removeLine(pm) {
    const i = this.lines.findIndex((l) => l.pm === pm);
    if (i < 0) return;
    this.scene.remove(this.lines[i].mesh);
    this.lines.splice(i, 1);
    if (this.onLines) this.onLines(this.lineInfo());
  }
  clearLines() { for (const l of this.lines) this.scene.remove(l.mesh); this.lines = []; if (this.onLines) this.onLines(this.lineInfo()); }
  _placeLine(l) { l.mesh.position.set(this.furthestX(l.pm.actor).x, 0.012, 0); }
  lineInfo() {
    return this.lines.map((l) => ({ actor: l.pm.actor, x: this.furthestX(l.pm.actor).x, part: this.furthestX(l.pm.actor).part, color: l.color }));
  }

  // ---- input (u, v in 0..1, v down) ----
  wheel(u, v, deltaY) {
    const z0 = this.zoom;
    this.zoom = Math.max(0.6, Math.min(this.cam === 'goalline' ? 40 : 14, this.zoom * Math.exp(-deltaY * 0.0015)));
    // keep the point under the cursor fixed: (pan + n) / zoom is constant
    const ax = (u * 2 - 1) * this.camera.aspect, ay = -(v * 2 - 1);
    this.pan.x = clampPan((this.pan.x + ax) * (this.zoom / z0) - ax);
    this.pan.y = clampPan((this.pan.y + ay) * (this.zoom / z0) - ay);
  }
  pointerDown(u, v, button = 0) { this.drag = { u, v, moved: false, button }; }
  pointerMove(u, v, shift = false) {
    const d = this.drag;
    if (!d) { this.hover = this.pickAt(u, v); this.cursor = this.hover ? 'pointer' : this.lineMode ? 'crosshair' : 'grab'; return; }
    const du = u - d.u, dv = v - d.v;
    if (Math.abs(du) * this.w + Math.abs(dv) * this.h > 3) d.moved = true;
    d.u = u; d.v = v;
    if (this.cam === 'free' && d.button === 0 && !shift) {
      this.orbit.yaw += du * this.w * 0.012;
      this.orbit.pitch = Math.max(0.05, Math.min(1.45, this.orbit.pitch + dv * this.h * 0.01));
    } else {
      this.pan.x = clampPan(this.pan.x - du * 2 * this.camera.aspect);
      this.pan.y = clampPan(this.pan.y + dv * 2);
    }
    this.cursor = 'grabbing';
  }
  // returns the picked actor (or null) when the press was a click, undefined after a drag
  pointerUp(u, v) {
    const d = this.drag;
    this.drag = null;
    this.cursor = this.lineMode ? 'crosshair' : 'grab';
    if (!d || d.moved) return undefined;
    const pm = this.pickAt(u, v);
    if (this.lineMode && pm) this.addLine(pm);
    else this.selected = pm && pm !== this.selected ? pm : null;
    if (this.onPick) this.onPick(pm ? pm.actor : null);
    return pm ? pm.actor : null;
  }
  resetView() { this.zoom = this.cam === 'goalline' ? 2 : 1; this.pan.set(0, 0); }

  pickAt(u, v) {
    if (!this.clip) return null;
    const mx = u * this.w, my = v * this.h;
    let best = null, bd = 14;
    const p3 = new THREE.Vector3();
    this.camera.updateMatrixWorld();
    for (const p of this.players) {
      const j = p.actor.jointsAt(this.t);
      for (const k of ['head', 'chest', 'pelvis', 'knL', 'knR', 'anL', 'anR']) {
        p3.set(...j[k]).project(this.camera);
        if (p3.z > 1) continue;
        const sx = (p3.x + 1) / 2 * this.w, sy = (1 - p3.y) / 2 * this.h;
        const d = Math.hypot(sx - mx, sy - my);
        if (d < bd) { bd = d; best = p; }
      }
    }
    return best;
  }

  // Centre the view on a world point at the given zoom.
  focusOn(point, zoom = this.zoom) {
    this.zoom = 1; this.pan.set(0, 0);
    this._placeCamera();
    this.camera.updateMatrixWorld();
    const v = new THREE.Vector3(...point).project(this.camera);
    this.zoom = zoom;
    this.pan.set(v.x * this.camera.aspect * zoom, v.y * zoom);
  }

  // Feed-pixel position of a world point / an actor's head (for OSD labels).
  screenOfPoint(p) {
    const v = new THREE.Vector3(...p).project(this.camera);
    return { x: (v.x + 1) / 2 * this.w, y: (1 - v.y) / 2 * this.h, visible: v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2 };
  }
  screenOf(actor) { const h = actor.jointsAt(this.t).head; return this.screenOfPoint([h[0], h[1] + 0.4, h[2]]); }
}

const clampPan = (v) => Math.max(-40, Math.min(40, v));

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#f7f7f7'; x.fillRect(0, 0, 256, 128);
  x.fillStyle = '#1b1f2a';
  for (let i = 0; i < 10; i++) {
    const cx = (i * 53) % 256, cy = 20 + ((i * 37) % 90);
    x.beginPath();
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; x.lineTo(cx + Math.cos(a) * 13, cy + Math.sin(a) * 13); }
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
