// The replay monitor: scene, camera angles, zoom/pan, player picking and offside lines.
import * as THREE from 'three';
import { buildStadium } from './stadium.js';
import { PlayerMesh, setGhost } from './players.js';
import { SCORING } from '../sim/kinematics.js';
import { BALL_R, GOAL_X } from '../sim/clip.js';

export const CAMS = [
  { id: 'broadcast', label: 'Main' },
  { id: 'reverse', label: 'Reverse' },
  { id: 'behind', label: 'Behind goal' },
  { id: 'tactical', label: 'Tactical' },
  { id: 'goalline', label: 'Goal-line (virtual)' },
  { id: 'free', label: 'Free' },
];

export class ReplayView {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.3, 600);
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
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.4 }));
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this._bindInput();
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

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

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
      case 'broadcast': pos = new THREE.Vector3(sb.x * 0.85, 16, -37.5); look = new THREE.Vector3(sb.x, 0, sb.z * 0.8 + 2); fov = 30; break;
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

  render(dt = 0) {
    if (!this.clip) return;
    this.resize();
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
    const hPx = this.canvas.clientHeight || 600;
    for (const l of this.lines) {
      const d = this.camera.position.distanceTo(l.mesh.position.clone().setZ(this.camera.position.z * 0 + this._smoothBall(this.t).z));
      const perPx = (2 * d * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / hPx;
      l.mesh.children[0].scale.set(Math.max(1, (perPx * 2.5) / 0.035), 1, 1);
    }
    if (this.stadium) this.stadium.update(dt, this.excite);
    this.renderer.render(this.scene, this.camera);
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

  // ---- input: wheel zoom, drag pan / orbit, click to pick ----
  _bindInput() {
    const el = this.canvas;
    let drag = null;
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const z0 = this.zoom;
      this.zoom = Math.max(0.6, Math.min(this.cam === 'goalline' ? 40 : 14, this.zoom * Math.exp(-e.deltaY * 0.0015)));
      // zoom toward the cursor
      const r = el.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1, ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
      // keep the point under the cursor fixed: (pan + n) / zoom is constant
      const ax = nx * this.camera.aspect, ay = ny;
      this.pan.x = (this.pan.x + ax) * (this.zoom / z0) - ax;
      this.pan.y = (this.pan.y + ay) * (this.zoom / z0) - ay;
      this.pan.x = clampPan(this.pan.x); this.pan.y = clampPan(this.pan.y);
    }, { passive: false });
    el.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, moved: false, button: e.button };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) { this.hover = this.pickAt(e.clientX, e.clientY); el.style.cursor = this.hover ? 'pointer' : this.lineMode ? 'crosshair' : 'grab'; return; }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      drag.x = e.clientX; drag.y = e.clientY;
      const h = el.clientHeight;
      if (this.cam === 'free' && drag.button === 0 && !e.shiftKey) {
        this.orbit.yaw += dx * 0.006;
        this.orbit.pitch = Math.max(0.05, Math.min(1.45, this.orbit.pitch + dy * 0.005));
      } else {
        this.pan.x = clampPan(this.pan.x - (dx / h) * 2 / 1);
        this.pan.y = clampPan(this.pan.y + (dy / h) * 2 / 1);
      }
      el.style.cursor = 'grabbing';
    });
    el.addEventListener('pointerup', (e) => {
      if (drag && !drag.moved) {
        const pm = this.pickAt(e.clientX, e.clientY);
        if (this.lineMode && pm) this.addLine(pm);
        else this.selected = pm && pm !== this.selected ? pm : null;
        if (this.onPick) this.onPick(pm ? pm.actor : null);
      }
      drag = null;
      el.style.cursor = this.lineMode ? 'crosshair' : 'grab';
    });
    el.addEventListener('dblclick', () => { this.zoom = this.cam === 'goalline' ? 2 : 1; this.pan.set(0, 0); });
  }

  pickAt(cx, cy) {
    if (!this.clip) return null;
    const r = this.canvas.getBoundingClientRect();
    const mx = cx - r.left, my = cy - r.top;
    let best = null, bd = 26;
    const v = new THREE.Vector3();
    for (const p of this.players) {
      const j = p.actor.jointsAt(this.t);
      for (const k of ['head', 'chest', 'pelvis', 'knL', 'knR', 'anL', 'anR']) {
        v.set(...j[k]).project(this.camera);
        if (v.z > 1) continue;
        const sx = (v.x + 1) / 2 * r.width, sy = (1 - v.y) / 2 * r.height;
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

  // Screen position of an actor's head (for labels).
  screenOf(actor) {
    const r = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector3(...actor.jointsAt(this.t).head).add(new THREE.Vector3(0, 0.45, 0)).project(this.camera);
    return { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height, visible: v.z < 1 };
  }
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
