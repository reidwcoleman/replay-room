// The review booth: desk, three CRTs, the control deck, rulebook, VHS tape, mug, shelves.
// Everything is generated here (no asset files) and drawn cel-shaded with ink outlines.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { toon } from './toon.js';
import { crtMaterial } from './crt.js';

const BEIGE = 0xe2dbc2, BEIGE2 = 0xcdc4a6, KEY = 0x2f6f9a, KEY2 = 0x3f86b0, TEAL = 0x2f7a72;
export const DESK_Y = 0.75;

export function canvasTex(w, h, draw, o = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  draw(x, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (o.nearest) { t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  else t.anisotropy = 8;
  t.userData.canvas = c;
  t.userData.ctx = x;
  return t;
}

const rbox = (w, h, d, r = 0.012, seg = 1) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
function mesh(geo, mat, o = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = o.cast ?? true;
  m.receiveShadow = o.receive ?? true;
  if (o.pos) m.position.set(...o.pos);
  if (o.rot) m.rotation.set(...o.rot);
  return m;
}

// A screen surface that bulges forward like a tube.
function screenGeo(w, h, bulge) {
  const g = new THREE.PlaneGeometry(w, h, 20, 16);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2), y = p.getY(i) / (h / 2);
    p.setZ(i, bulge * (1 - x * x * 0.8) * (1 - y * y * 0.8));
  }
  g.computeVertexNormals();
  return g;
}

// A chunky CRT: chamfered case, inset bezel, tapered back, stand. Returns the group + screen mesh.
function crt({ w, h, sw, sh, depth, tex, rows, mono, tint, gain, foot = true }) {
  const g = new THREE.Group();
  const caseMat = toon(BEIGE, { unique: true });
  const front = mesh(rbox(w, h, depth * 0.45, 0.03, 2), caseMat, { pos: [0, 0, -depth * 0.225] });
  g.add(front);
  const back = mesh(rbox(w * 0.78, h * 0.8, depth * 0.6, 0.04, 2), toon(BEIGE2), { pos: [0, -h * 0.02, -depth * 0.7] });
  g.add(back);
  // bezel recess (dark frame around the glass)
  const recess = mesh(rbox(sw * 1.08, sh * 1.1, 0.02, 0.012, 2), toon(0x1a1f26), { pos: [0, h * 0.05, 0.004] });
  g.add(recess);
  const mat = crtMaterial(tex, { rows, mono, tint, gain });
  const scr = new THREE.Mesh(screenGeo(sw, sh, 0.012), mat);
  scr.position.set(0, h * 0.05, 0.012);
  g.add(scr);
  if (foot) {
    const neck = mesh(new THREE.CylinderGeometry(w * 0.16, w * 0.22, 0.05, 10), toon(BEIGE2), { pos: [0, -h / 2 - 0.02, -depth * 0.35] });
    const base = mesh(new THREE.CylinderGeometry(w * 0.34, w * 0.38, 0.025, 14), toon(BEIGE), { pos: [0, -h / 2 - 0.05, -depth * 0.35] });
    base.scale.z = 0.8;
    g.add(neck, base);
  }
  return { group: g, screen: scr, caseMat };
}

export function buildOffice(o) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1124);
  const H = {}; // handles
  H.clickables = [];

  // ---------- room ----------
  // Back wall with a window cut into it: the booth looks out over the floodlit pitch at night.
  const WIN = { x0: -0.62, x1: 0.82, y0: 1.24, y1: 2.12 };
  const wallShape = new THREE.Shape([new THREE.Vector2(-3.5, 0), new THREE.Vector2(3.5, 0), new THREE.Vector2(3.5, 3.2), new THREE.Vector2(-3.5, 3.2)]);
  wallShape.holes.push(new THREE.Path([new THREE.Vector2(WIN.x0, WIN.y0), new THREE.Vector2(WIN.x0, WIN.y1), new THREE.Vector2(WIN.x1, WIN.y1), new THREE.Vector2(WIN.x1, WIN.y0)]));
  const paper = canvasTex(256, 256, drawWallpaper);
  paper.wrapS = paper.wrapT = THREE.RepeatWrapping;
  paper.repeat.set(2.2, 2.2);
  const wall = mesh(new THREE.ShapeGeometry(wallShape), toon(0xffffff, { map: paper, unique: true }), { pos: [0, 0, -0.75], cast: false });
  scene.add(wall);
  const panelTex = canvasTex(512, 128, drawWainscot);
  panelTex.wrapS = THREE.RepeatWrapping;
  panelTex.repeat.set(7, 1);
  const wains = mesh(new THREE.BoxGeometry(7, 0.9, 0.04), [toon(0x1f4f4a), toon(0x1f4f4a), toon(0x1f4f4a), toon(0x1f4f4a), toon(0xffffff, { map: panelTex, unique: true }), toon(0x1f4f4a)], { pos: [0, 0.45, -0.73] });
  scene.add(wains);
  const rail = mesh(rbox(7, 0.04, 0.06, 0.01), toon(0xd8c9a8), { pos: [0, 0.92, -0.71] });
  scene.add(rail);
  for (const s of [-1, 1]) {
    const side = mesh(new THREE.PlaneGeometry(3, 3.2), toon(0x1f4d49), { pos: [s * 2.2, 1.6, 0.6], rot: [0, -s * Math.PI / 2, 0], cast: false });
    scene.add(side);
  }
  const carpet = canvasTex(256, 256, drawCarpet);
  carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping;
  carpet.repeat.set(6, 4);
  const floor = mesh(new THREE.PlaneGeometry(7, 4), toon(0xffffff, { map: carpet, unique: true }), { pos: [0, 0, 0.5], rot: [-Math.PI / 2, 0, 0], cast: false });
  scene.add(floor);

  // window: frame, mullion, sill, half-open venetian blind
  const wx = (WIN.x0 + WIN.x1) / 2, wy = (WIN.y0 + WIN.y1) / 2, ww = WIN.x1 - WIN.x0, wh = WIN.y1 - WIN.y0;
  const frameM = toon(0xd8c9a8);
  scene.add(mesh(rbox(ww + 0.08, 0.05, 0.1, 0.01), frameM, { pos: [wx, WIN.y1 + 0.02, -0.72] }));
  scene.add(mesh(rbox(ww + 0.16, 0.04, 0.16, 0.01), frameM, { pos: [wx, WIN.y0 - 0.015, -0.69] }));
  for (const x of [WIN.x0 - 0.02, WIN.x1 + 0.02]) scene.add(mesh(rbox(0.05, wh + 0.06, 0.1, 0.01), frameM, { pos: [x, wy, -0.72] }));
  scene.add(mesh(rbox(0.03, wh, 0.05, 0.006), frameM, { pos: [wx + 0.18, wy, -0.745] }));
  scene.add(mesh(rbox(ww, 0.025, 0.04, 0.006), frameM, { pos: [wx, WIN.y0 + wh * 0.62, -0.745] }));
  // two venetian blinds: the left one pulled most of the way down and tilted open, the right
  // one hauled up so the big screen across the pitch stays in view
  const slatM = toon(0xe8dfc6);
  const mx = wx + 0.18;
  const blind = (x0, x1, bottom) => {
    const w = x1 - x0 - 0.02, cx = (x0 + x1) / 2;
    const geo = rbox(w, 0.022, 0.003, 0.0012);
    for (let y = WIN.y1 - 0.03; y > bottom; y -= 0.03) scene.add(mesh(geo, slatM, { pos: [cx, y, -0.705], rot: [1.15, 0, 0], cast: false }));
    scene.add(mesh(rbox(w, 0.018, 0.035, 0.005), toon(0xcfc6aa), { pos: [cx, bottom - 0.01, -0.705], rot: [0, 0, (x0 < 0 ? 0.015 : -0.01)] }));
    scene.add(mesh(rbox(w + 0.02, 0.04, 0.06, 0.008), toon(0xcfc6aa), { pos: [cx, WIN.y1 - 0.005, -0.705] }));
  };
  blind(WIN.x0, mx, WIN.y0 + wh * 0.28);
  blind(mx, WIN.x1, WIN.y0 + wh * 0.82);
  scene.add(mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.32, 4), toon(0xcfc6aa), { pos: [WIN.x1 - 0.06, WIN.y1 - 0.19, -0.69] }));

  // the view: a painted night stadium a few metres out, floodlight panels that bloom, flashes
  const viewTex = canvasTex(1024, 512, drawStadiumView, { nearest: true });
  const view = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 2.0), new THREE.MeshBasicMaterial({ map: viewTex, fog: false }));
  view.position.set(0.1, 1.2, -3.4);
  scene.add(view);
  const glowTex = canvasTex(1024, 512, drawStadiumLights, { nearest: true });
  const lights = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 2.0), new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(2.6, 2.5, 2.3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  lights.position.set(0.1, 1.2, -3.38);
  scene.add(lights);
  const flashTex = canvasTex(256, 128, () => {}, { nearest: true });
  const flashes = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 2.0), new THREE.MeshBasicMaterial({ map: flashTex, color: new THREE.Color(3, 3, 3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  flashes.position.set(0.1, 1.2, -3.36);
  scene.add(flashes);
  H.flashes = flashTex;
  // big screen across the pitch (drawn live: shows the VAR check while you work)
  const bigTex = canvasTex(128, 48, () => {}, { nearest: true });
  const big = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshBasicMaterial({ map: bigTex, color: new THREE.Color(1.7, 1.7, 1.7) }));
  big.position.set(0.45, 1.66, -3.35);
  scene.add(big);
  H.bigScreen = bigTex;
  // window glass: faint cool tint + streaks
  const glassTex = canvasTex(256, 256, drawGlass);
  scene.add(mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshBasicMaterial({ map: glassTex, transparent: true, depthWrite: false, opacity: 0.9 }), { pos: [wx, wy, -0.76], cast: false, receive: false }));

  // shelf with books (left of the window)
  const shelfX = -1.42;
  const shelf = mesh(rbox(0.95, 0.035, 0.22, 0.008), toon(0xd8c9a8), { pos: [shelfX, 1.62, -0.63] });
  scene.add(shelf);
  for (const s of [-1, 1]) scene.add(mesh(rbox(0.02, 0.08, 0.16, 0.004), toon(0x8a8470), { pos: [shelfX + s * 0.38, 1.57, -0.66] }));
  const bookCols = [0x2a3f6e, 0xc0463e, 0x3a6ea5, 0xe0b04a, 0x2d2d3a, 0x8a3e6a, 0x4a8f6a, 0xe7e2d2, 0x5a7fc0, 0xb8452f];
  let bx = shelfX - 0.44;
  for (let i = 0; i < 15; i++) {
    const bw = 0.028 + ((i * 7) % 5) * 0.006, bh = 0.2 + ((i * 11) % 7) * 0.018;
    if (i === 9) { bx += 0.13; continue; }
    const b = mesh(rbox(bw, bh, 0.16, 0.004), toon(bookCols[(i * 3) % bookCols.length]), { pos: [bx + bw / 2, 1.638 + bh / 2, -0.63] });
    if (i === 14) b.rotation.z = 0.35, b.position.x += 0.05, b.position.y -= 0.03;
    scene.add(b);
    bx += bw + 0.004;
  }
  // VHS archive on the shelf: spines with hand-written labels
  for (let i = 0; i < 6; i++) {
    const lt = canvasTex(32, 128, (x, W, Hh) => { x.fillStyle = '#1b1d22'; x.fillRect(0, 0, W, Hh); x.fillStyle = '#efe9d6'; x.fillRect(4, 14, W - 8, Hh - 28); x.fillStyle = ['#d9463e', '#2f6f9a', '#3f9a4a'][i % 3]; x.fillRect(4, 14, W - 8, 8); });
    const t = mesh(rbox(0.026, 0.19, 0.105, 0.003), [toon(0x1b1d22), toon(0x1b1d22), toon(0x1b1d22), toon(0x1b1d22), toon(0xffffff, { map: lt, unique: true }), toon(0x1b1d22)], { pos: [shelfX + 0.1 + i * 0.03, 1.638 + 0.095, -0.6] });
    scene.add(t);
  }
  // trophy + plant
  const cup = new THREE.Group();
  cup.add(mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.09, 12), toon(0xe9b949), { pos: [0, 0.1, 0] }));
  cup.add(mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 12), toon(0xe9b949), { pos: [0.05, 0.1, 0], rot: [0, 0, 0] }));
  cup.add(mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 12), toon(0xe9b949), { pos: [-0.05, 0.1, 0], rot: [0, 0, 0] }));
  cup.add(mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.05, 8), toon(0xe9b949), { pos: [0, 0.035, 0] }));
  cup.add(mesh(rbox(0.07, 0.025, 0.07, 0.005), toon(0x6b4a2b), { pos: [0, 0.012, 0] }));
  cup.position.set(shelfX + 0.34, 1.638, -0.63);
  scene.add(cup);
  const pot = mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.09, 10), toon(0xc0663e), { pos: [-0.86, DESK_Y + 0.045, -0.55] });
  scene.add(pot);
  for (let i = 0; i < 9; i++) {
    const leaf = mesh(new THREE.SphereGeometry(0.05, 6, 4), toon(i % 2 ? 0x3f9a4a : 0x4fae55), { pos: [-0.86 + Math.cos(i * 0.9) * 0.06, DESK_Y + 0.13 + (i % 3) * 0.04, -0.55 + Math.sin(i * 0.9) * 0.05] });
    leaf.scale.set(1, 0.55, 0.7);
    leaf.rotation.set(i * 0.4, i, i);
    scene.add(leaf);
  }

  // posters, corkboard, pennants
  const poster = (x, y, w, h, draw, rz = 0) => {
    const t = canvasTex(256, Math.round(256 * h / w), draw);
    const m = mesh(new THREE.PlaneGeometry(w, h), toon(0xffffff, { map: t, unique: true }), { pos: [x, y, -0.735], rot: [0, 0, rz], cast: false });
    scene.add(m);
    return m;
  };
  poster(1.22, 1.68, 0.4, 0.54, drawPosterA, -0.02);
  poster(1.68, 1.6, 0.32, 0.44, drawPosterB, 0.015);
  poster(-0.95, 1.36, 0.36, 0.48, drawPosterC, 0.02);
  const cork = canvasTex(512, 320, drawCorkboard);
  scene.add(mesh(rbox(0.56, 0.36, 0.02, 0.006), [toon(0x8a5a32), toon(0x8a5a32), toon(0x8a5a32), toon(0x8a5a32), toon(0xffffff, { map: cork, unique: true }), toon(0x8a5a32)], { pos: [1.36, 1.17, -0.72] }));
  // string of pennant flags across the top of the window
  const flagCols = [0xd9463e, 0xf4f0e2, 0x2f6f9a, 0xe0b04a, 0x3f9a4a];
  const flagGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.035, 0, 0), new THREE.Vector3(0.035, 0, 0), new THREE.Vector3(0, -0.08, 0)]);
  flagGeo.computeVertexNormals();
  for (let i = 0; i < 13; i++) {
    const u = i / 12, x = WIN.x0 - 0.1 + u * (ww + 0.2), y = WIN.y1 + 0.13 - Math.sin(u * Math.PI) * 0.1;
    const f = mesh(flagGeo, toon(flagCols[i % flagCols.length], { side: THREE.DoubleSide }), { pos: [x, y, -0.7], rot: [0, 0, (u - 0.5) * 0.3], cast: false });
    scene.add(f);
  }
  const bunt = new THREE.CatmullRomCurve3([0, 0.5, 1].map((u) => new THREE.Vector3(WIN.x0 - 0.12 + u * (ww + 0.24), WIN.y1 + 0.135 - Math.sin(u * Math.PI) * 0.1, -0.7)));
  scene.add(mesh(new THREE.TubeGeometry(bunt, 20, 0.003, 4), toon(0x20262e), { cast: false }));

  // wall clock (hands move with the shift clock)
  const clockFace = canvasTex(256, 256, () => {});
  const clock = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 24), [toon(0xf2efe6), toon(0xffffff, { map: clockFace, unique: true }), toon(0xf2efe6)], { pos: [-1.42, 2.08, -0.72], rot: [Math.PI / 2, 0, 0] });
  scene.add(clock);
  scene.add(mesh(new THREE.TorusGeometry(0.13, 0.014, 6, 28), toon(0x20262e), { pos: [-1.42, 2.08, -0.7] }));
  H.clock = clockFace;

  // ON AIR light above the window
  const airTex = canvasTex(256, 64, (x, W, Hh) => { x.fillStyle = '#3a0d0d'; x.fillRect(0, 0, W, Hh); x.fillStyle = '#ff6b5e'; x.font = '24px Silkscreen'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('REVIEW', W / 2, Hh / 2 + 2); }, { nearest: true });
  const airMat = new THREE.MeshBasicMaterial({ map: airTex, color: new THREE.Color(1, 1, 1) });
  scene.add(mesh(rbox(0.3, 0.09, 0.05, 0.01), toon(0x20262e), { pos: [wx, WIN.y1 + 0.3, -0.73] }));
  scene.add(mesh(new THREE.PlaneGeometry(0.27, 0.068), airMat, { pos: [wx, WIN.y1 + 0.3, -0.704], cast: false }));
  H.onAir = airMat;

  // ---------- desk ----------
  const deskTop = mesh(rbox(2.6, 0.05, 1.05, 0.015, 2), toon(0x4f97c4), { pos: [0, DESK_Y - 0.025, -0.15] });
  scene.add(deskTop);
  const deskFront = mesh(new THREE.BoxGeometry(2.56, 0.5, 0.03), toon(0x3d7aa3), { pos: [0, DESK_Y - 0.3, 0.32] });
  scene.add(deskFront);

  // ---------- monitors ----------
  const main = crt({ w: 0.62, h: 0.5, sw: 0.47, sh: 0.3525, depth: 0.44, tex: o.mainTex, rows: o.mainRows, gain: 1.12, tint: 0xfff6ea });
  main.group.position.set(0, DESK_Y + 0.31, -0.2);
  main.group.rotation.x = -0.08;
  scene.add(main.group);
  H.main = main;
  // side ears
  for (const s of [-1, 1]) main.group.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), toon(BEIGE2), { pos: [s * 0.325, 0.03, -0.12], rot: [0, 0, Math.PI / 2] }));
  // badge
  main.group.add(mesh(new THREE.PlaneGeometry(0.16, 0.03), toon(0xffffff, { map: canvasTex(256, 48, (x) => { x.fillStyle = '#ece6cf'; x.fillRect(0, 0, 256, 48); x.fillStyle = '#8a8470'; x.font = '700 30px Nunito, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('◉ LUMEN', 128, 26); }), unique: true }), { pos: [0, -0.205, 0.003], cast: false }));

  const live = crt({ w: 0.4, h: 0.34, sw: 0.29, sh: 0.2175, depth: 0.32, tex: o.liveTex, rows: o.liveRows, gain: 1.1, tint: 0xf4f6ff });
  live.group.position.set(-0.66, DESK_Y + 0.22, -0.25);
  live.group.rotation.y = 0.38;
  scene.add(live.group);
  H.live = live;
  live.group.add(mesh(rbox(0.1, 0.035, 0.02, 0.006), toon(0x2d8f99), { pos: [0, -0.142, 0.004] }));

  const term = crt({ w: 0.4, h: 0.34, sw: 0.29, sh: 0.2175, depth: 0.32, tex: o.termTex, rows: o.termRows, gain: 1.6, tint: 0xd0ffe0 });
  term.group.position.set(0.66, DESK_Y + 0.22, -0.25);
  term.group.rotation.y = -0.38;
  scene.add(term.group);
  H.term = term;
  term.group.add(mesh(rbox(0.1, 0.035, 0.02, 0.006), toon(0x2d8f99), { pos: [0, -0.142, 0.004] }));
  // tape slot on top of the terminal
  const slot = mesh(new THREE.BoxGeometry(0.22, 0.012, 0.05), toon(0x111418), { pos: [0, 0.166, -0.09] });
  term.group.add(slot);
  H.slot = slot;

  // ---------- control deck (keyboard) ----------
  const kb = new THREE.Group();
  kb.position.set(0, DESK_Y + 0.012, 0.13);
  kb.rotation.x = 0.06;
  scene.add(kb);
  kb.add(mesh(rbox(0.66, 0.03, 0.22, 0.012, 2), toon(BEIGE)));
  H.keys = {};
  const key = (id, x, z, w, d, label, color = KEY) => {
    const tex = canvasTex(128, Math.round(128 * d / w), (c, W, Hh) => drawKeyTop(c, W, Hh, label, color));
    const top = toon(0xffffff, { map: tex, unique: true });
    const side = toon(color, { unique: true });
    const m = mesh(rbox(w, 0.026, d, 0.004), [side, side, top, side, side, side], { pos: [x, 0.026, z] });
    m.userData = { action: 'key', id, baseY: 0.026, tip: label.tip };
    kb.add(m);
    H.keys[id] = m;
    H.clickables.push(m);
    return m;
  };
  key('rew', -0.27, -0.05, 0.05, 0.045, { icon: 'rew', tip: 'Back 1 frame  [ , ]' });
  key('play', -0.21, -0.05, 0.05, 0.045, { icon: 'play', tip: 'Play / pause  [Space]' }, 0x2d8f99);
  key('fwd', -0.15, -0.05, 0.05, 0.045, { icon: 'fwd', tip: 'Forward 1 frame  [ . ]' });
  key('cam', -0.27, 0.03, 0.05, 0.04, { text: 'CAM', tip: 'Next camera  [C or 1–6]' }, 0x4d5b6b);
  key('line', -0.21, 0.03, 0.05, 0.04, { text: 'LINE', tip: 'Offside line tool  [O]' }, 0x4d5b6b);
  key('zoom', -0.15, 0.03, 0.05, 0.04, { text: 'RESET', tip: 'Reset zoom  [Z]' }, 0x4d5b6b);
  // d-pad
  key('up', 0.24, -0.06, 0.042, 0.04, { icon: 'up', tip: 'Faster  [↑]' });
  key('down', 0.24, 0.035, 0.042, 0.04, { icon: 'down', tip: 'Slower  [↓]' });
  key('left', 0.19, -0.012, 0.042, 0.04, { icon: 'left', tip: 'Back 10 frames  [Shift+←]' });
  key('right', 0.29, -0.012, 0.042, 0.04, { icon: 'right', tip: 'Forward 10 frames  [Shift+→]' });
  // slider rail + knob
  const railTex = canvasTex(512, 32, () => {});
  const railM = mesh(new THREE.BoxGeometry(0.2, 0.006, 0.022), [toon(0x20262e), toon(0x20262e), toon(0xffffff, { map: railTex, unique: true }), toon(0x20262e), toon(0x20262e), toon(0x20262e)], { pos: [0.015, 0.018, -0.012] });
  railM.userData = { action: 'rail' };
  kb.add(railM);
  H.clickables.push(railM);
  const knob = mesh(rbox(0.018, 0.03, 0.04, 0.005), toon(0x2d8f99, { unique: true }), { pos: [-0.085, 0.03, -0.012] });
  knob.userData = { action: 'rail' };
  kb.add(knob);
  H.clickables.push(knob);
  H.rail = { mesh: railM, tex: railTex, knob, x0: -0.085, x1: 0.115 };
  H.kb = kb;

  // ---------- rulebook ----------
  const book = new THREE.Group();
  const coverTex = canvasTex(256, 320, drawBookCover);
  const red = toon(0xd9463e, { unique: true });
  book.add(mesh(rbox(0.21, 0.035, 0.27, 0.006), [red, red, toon(0xd8d8d8, { map: coverTex, unique: true }), red, red, red]));
  book.add(mesh(new THREE.BoxGeometry(0.2, 0.026, 0.262), toon(0xf4f0e2, { unique: true }), { pos: [0.006, 0, 0] }));
  book.position.set(-0.55, DESK_Y + 0.018, 0.17);
  book.rotation.y = 0.12;
  book.children.forEach((c) => { c.userData = { action: 'book' }; H.clickables.push(c); });
  scene.add(book);
  H.book = book;
  H.bookMat = red;

  // ---------- VHS tape ----------
  const tape = new THREE.Group();
  const tapeTex = canvasTex(1024, 576, () => {});
  const black = toon(0x22252c, { unique: true });
  const tapeBody = mesh(rbox(0.2, 0.026, 0.113, 0.004), [black, black, toon(0xd2d2d2, { map: tapeTex, unique: true }), black, black, black]);
  tape.add(tapeBody);
  tape.position.set(0.5, DESK_Y + 0.014, 0.2);
  tape.rotation.y = -0.1;
  tapeBody.userData = { action: 'tape' };
  H.clickables.push(tapeBody);
  scene.add(tape);
  H.tape = tape;
  H.tapeBody = tapeBody;
  H.tapeTex = tapeTex;
  H.tapeHome = { pos: tape.position.clone(), rot: tape.rotation.clone() };
  H.tapeMat = black;

  // ---------- clutter ----------
  // mug with steam
  const mug = new THREE.Group();
  const mugMat = toon(0x3b6fb6);
  mug.add(mesh(new THREE.CylinderGeometry(0.045, 0.042, 0.1, 16, 1, true), mugMat));
  mug.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.006, 16), toon(0x3a2416), { pos: [0, 0.035, 0] }));
  mug.add(mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.005, 16), mugMat, { pos: [0, -0.048, 0] }));
  mug.add(mesh(new THREE.TorusGeometry(0.026, 0.008, 6, 12, Math.PI), mugMat, { pos: [0.045, 0, 0], rot: [0, 0, -Math.PI / 2] }));
  mug.position.set(1.05, DESK_Y + 0.05, -0.16);
  scene.add(mug);
  const steamTex = canvasTex(64, 64, (x) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
  H.steam = [];
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.position.copy(mug.position);
    s.userData.phase = i / 9;
    scene.add(s);
    H.steam.push(s);
  }
  H.mugPos = mug.position.clone();
  // pen pot
  const potM = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 12), toon(0xe7e2d2), { pos: [1.2, DESK_Y + 0.05, 0.02] });
  scene.add(potM);
  [[0xd9463e, 0.2], [0x2f6f9a, -0.15], [0xe0b04a, 0.05]].forEach(([c, a], i) => scene.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.16, 6), toon(c), { pos: [1.2 + (i - 1) * 0.012, DESK_Y + 0.12, 0.02], rot: [a, 0, a * 0.6] })));
  // anglepoise desk lamp, head aimed at the left of the desk
  const lamp = new THREE.Group();
  const lampM = toon(0x2d3440);
  const lampBase = new THREE.Vector3(-1.26, DESK_Y + 0.01, -0.5);
  lamp.position.copy(lampBase);
  lamp.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.025, 16), lampM));
  const strut = (a, b) => {
    const d = b.clone().sub(a);
    const m = mesh(new THREE.CylinderGeometry(0.008, 0.008, d.length(), 6), lampM);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    lamp.add(m);
  };
  const elbow = new THREE.Vector3(-0.07, 0.3, 0.0), hp = new THREE.Vector3(0.14, 0.33, 0.04);
  strut(new THREE.Vector3(0, 0.01, 0), elbow);
  strut(elbow, hp);
  lamp.add(mesh(new THREE.SphereGeometry(0.014, 8, 6), lampM, { pos: [elbow.x, elbow.y, elbow.z] }));
  const headG = new THREE.Group();
  headG.position.copy(hp);
  headG.add(mesh(new THREE.ConeGeometry(0.08, 0.12, 18, 1, true), toon(0xd9463e, { side: THREE.DoubleSide }), { pos: [0, -0.02, 0] }));
  headG.add(mesh(new THREE.SphereGeometry(0.028, 10, 8), toon(0xd9463e), { pos: [0, 0.04, 0] }));
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 0.95, 0.6) }));
  bulb.position.set(0, -0.02, 0);
  headG.add(bulb);
  const aim = new THREE.Vector3(-0.8, DESK_Y, 0.25).sub(lampBase.clone().add(hp)).normalize();
  headG.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), aim);
  lamp.add(headG);
  scene.add(lamp);
  H.lampHead = headG;
  // papers
  const paperTex = canvasTex(256, 330, drawMemo);
  const papers = mesh(new THREE.BoxGeometry(0.21, 0.01, 0.28), [toon(0xf4f0e2), toon(0xf4f0e2), toon(0xd8d8d8, { map: paperTex, unique: true }), toon(0xf4f0e2), toon(0xf4f0e2), toon(0xf4f0e2)], { pos: [0.92, DESK_Y + 0.005, 0.2], rot: [0, -0.25, 0] });
  scene.add(papers);
  // red hotline phone: the league's line to the booth
  const phone = new THREE.Group();
  const phoneRed = toon(0xd23b34);
  phone.add(mesh(rbox(0.16, 0.05, 0.13, 0.02, 2), phoneRed, { pos: [0, 0.025, 0] }));
  phone.add(mesh(rbox(0.13, 0.03, 0.1, 0.015, 2), phoneRed, { pos: [0, 0.06, -0.005] }));
  const dialTex = canvasTex(128, 128, (x) => { x.fillStyle = '#f4f0e2'; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.fill(); x.fillStyle = '#2a2a2a'; for (let i = 0; i < 10; i++) { const a = -0.6 + i * 0.5; x.beginPath(); x.arc(64 + Math.cos(a) * 42, 64 + Math.sin(a) * 42, 10, 0, 7); x.fill(); } x.fillStyle = '#d23b34'; x.beginPath(); x.arc(64, 64, 20, 0, 7); x.fill(); });
  phone.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 20), [toon(0xe7e2d2), toon(0xffffff, { map: dialTex, unique: true }), toon(0xe7e2d2)], { pos: [0, 0.052, 0.05], rot: [0.5, 0, 0] }));
  const hs = new THREE.Group();
  hs.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.15, 10), phoneRed, { rot: [0, 0, Math.PI / 2] }));
  for (const s of [-1, 1]) hs.add(mesh(rbox(0.05, 0.03, 0.045, 0.012), phoneRed, { pos: [s * 0.075, -0.008, 0] }));
  hs.position.set(0, 0.092, -0.01);
  phone.add(hs);
  const coil = new THREE.CatmullRomCurve3(Array.from({ length: 60 }, (_, i) => { const u = i / 59; return new THREE.Vector3(-0.09 - u * 0.05 + Math.cos(u * 60) * 0.008, 0.02 + Math.sin(u * 60) * 0.008 - u * 0.012, -u * 0.06); }));
  phone.add(mesh(new THREE.TubeGeometry(coil, 200, 0.0025, 4), toon(0xa82e28), { cast: false }));
  phone.position.set(-1.0, DESK_Y, 0.05);
  phone.rotation.y = 0.45;
  scene.add(phone);
  H.phone = phone;
  // headset resting by the live monitor
  const set = new THREE.Group();
  const hsM = toon(0x23272f);
  set.add(mesh(new THREE.TorusGeometry(0.075, 0.008, 6, 20, Math.PI), hsM, { rot: [-Math.PI / 2 + 0.25, 0, 0] }));
  for (const s of [-1, 1]) {
    set.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.022, 14), hsM, { pos: [s * 0.075, 0.012, 0], rot: [0, 0, Math.PI / 2] }));
    set.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 14), toon(0x4a5060), { pos: [s * 0.088, 0.012, 0], rot: [0, 0, Math.PI / 2] }));
  }
  const boom = new THREE.CatmullRomCurve3([new THREE.Vector3(0.08, 0.012, 0), new THREE.Vector3(0.09, 0.01, 0.06), new THREE.Vector3(0.06, 0.008, 0.11)]);
  set.add(mesh(new THREE.TubeGeometry(boom, 12, 0.004, 5), hsM));
  set.add(mesh(new THREE.SphereGeometry(0.012, 8, 6), toon(0x111111), { pos: [0.06, 0.008, 0.11] }));
  set.position.set(-0.36, DESK_Y + 0.025, 0.05);
  set.rotation.y = -0.5;
  scene.add(set);
  // cutting mat under the control deck
  const matTex = canvasTex(512, 220, drawDeskMat);
  scene.add(mesh(new THREE.BoxGeometry(0.84, 0.003, 0.34), [toon(0x1f3b33), toon(0x1f3b33), toon(0xffffff, { map: matTex, unique: true }), toon(0x1f3b33), toon(0x1f3b33), toon(0x1f3b33)], { pos: [0.02, DESK_Y + 0.0015, 0.14], rot: [0, 0.015, 0], cast: false }));
  // stack of finished tapes
  for (let i = 0; i < 3; i++) {
    const lt = canvasTex(256, 144, (x, W, Hh) => { x.fillStyle = '#1b1d22'; x.fillRect(0, 0, W, Hh); x.fillStyle = '#efe9d6'; x.fillRect(70, 8, 116, 30); x.fillStyle = '#2f6f9a'; x.fillRect(70, 8, 116, 6); x.fillStyle = '#2b2e36'; x.beginPath(); x.arc(70, 88, 26, 0, 7); x.arc(186, 88, 26, 0, 7); x.fill(); });
    const t = mesh(rbox(0.19, 0.025, 0.105, 0.004), [toon(0x1b1d22), toon(0x1b1d22), toon(0xffffff, { map: lt, unique: true }), toon(0x1b1d22), toon(0x1b1d22), toon(0x1b1d22)], { pos: [1.13, DESK_Y + 0.0125 + i * 0.026, -0.42], rot: [0, 0.3 + i * 0.12 - (i === 2 ? 0.3 : 0), 0] });
    scene.add(t);
  }
  // cable from the main monitor
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.02, DESK_Y + 0.06, -0.42), new THREE.Vector3(0.12, DESK_Y + 0.008, -0.05), new THREE.Vector3(0.05, DESK_Y + 0.008, 0.02), new THREE.Vector3(0, DESK_Y + 0.02, 0.06)]);
  scene.add(mesh(new THREE.TubeGeometry(curve, 24, 0.006, 6), toon(0x9aa3ad)));

  // sticky note (bribes) on the main monitor
  const noteTex = canvasTex(256, 256, () => {});
  const note = mesh(new THREE.PlaneGeometry(0.11, 0.11), toon(0xffffff, { map: noteTex, unique: true }), { pos: [0.245, 0.2, 0.005], rot: [0, 0, -0.12], cast: false });
  note.visible = false;
  main.group.add(note);
  H.note = { mesh: note, tex: noteTex };

  // ---------- lights ----------
  // Evening booth: cool fill, warm desk lamp, blue floodlight rim through the window, and each
  // CRT spilling its own colour onto the desk.
  scene.add(new THREE.HemisphereLight(0xbfd6ff, 0x2a3446, 0.8));
  const key1 = new THREE.DirectionalLight(0xffe2bc, 1.2);
  key1.position.set(-1.4, 2.6, 1.5);
  key1.target.position.set(0, DESK_Y, -0.2);
  key1.castShadow = true;
  key1.shadow.mapSize.set(2048, 2048);
  const sc = key1.shadow.camera;
  sc.left = -1.8; sc.right = 1.8; sc.top = 1.6; sc.bottom = -1.2; sc.near = 0.5; sc.far = 6;
  key1.shadow.bias = -0.0005; key1.shadow.normalBias = 0.01;
  key1.shadow.radius = 3;
  scene.add(key1, key1.target);
  const rim = new THREE.DirectionalLight(0x8fb8ff, 1.3);
  rim.position.set(0.3, 2.6, -3.2);
  rim.target.position.set(0, DESK_Y, 0);
  scene.add(rim, rim.target);
  const lampLight = new THREE.SpotLight(0xffb36b, 2.0, 1.7, 0.7, 0.7, 1.6);
  lampLight.position.set(-1.1, DESK_Y + 0.33, -0.46);
  lampLight.target.position.set(-0.8, DESK_Y, 0.25);
  scene.add(lampLight, lampLight.target);
  H.glow = {
    main: addGlow(scene, 0x9fffc8, [0, DESK_Y + 0.25, 0.14]),
    live: addGlow(scene, 0x9fc8ff, [-0.55, DESK_Y + 0.2, 0.02]),
    term: addGlow(scene, 0x6dff8a, [0.55, DESK_Y + 0.2, 0.02]),
  };

  // light you can see: the lamp's cone and dust drifting through the floodlight glow
  const coneMat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(0xffc98a) }, strength: { value: 0.08 } },
    vertexShader: `varying float vY; varying vec3 vN, vV; void main() { vY = clamp(uv.y, 0., 1.); vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; uniform float strength; varying float vY; varying vec3 vN, vV; void main() { float f = abs(dot(vN, vV)) / max(length(vN) * length(vV), 1e-4); f = f * sqrt(f); float y = clamp(vY, 0., 1.); gl_FragColor = vec4(color * strength * f * y * y, 1.); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.56, 24, 1, true), coneMat);
  cone.position.copy(lampLight.position).lerp(lampLight.target.position, 0.5);
  cone.lookAt(lampLight.position);
  cone.rotateX(Math.PI / 2);
  cone.renderOrder = 5;
  H.lampCone = cone;
  const shaft = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.4), new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(0x9fc4ff) } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform vec3 color; varying vec2 vUv; void main() { float s = 0.5 + 0.5 * sin(vUv.x * 40.0); float a = smoothstep(0., 0.5, vUv.y) * smoothstep(0., .25, vUv.x) * (1. - smoothstep(.75, 1., vUv.x)) * (0.6 + 0.4 * s); gl_FragColor = vec4(color * a * 0.05, 1.); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  shaft.position.set(0.1, 1.35, -0.25);
  shaft.rotation.x = -0.9;
  shaft.renderOrder = 5;
  scene.add(shaft);
  H.shaft = shaft;
  const N = 260, dp = new Float32Array(N * 3);
  const dr = rng(19);
  for (let i = 0; i < N; i++) { dp[i * 3] = -1.3 + dr() * 2.6; dp[i * 3 + 1] = DESK_Y + 0.05 + dr() * 1.4; dp[i * 3 + 2] = -0.7 + dr() * 1.0; }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dotTex = canvasTex(32, 32, (x) => { const g = x.createRadialGradient(16, 16, 0, 16, 16, 15); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32); });
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ map: dotTex, size: 0.008, color: 0xfff0d8, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  dust.userData.base = dp.slice();
  dust.renderOrder = 6;
  scene.add(dust);
  H.dust = dust;
  H.effects = [shaft, dust];

  return { scene, H };
}

function addGlow(scene, color, pos) {
  const l = new THREE.PointLight(color, 0.15, 0.7, 2);
  l.position.set(...pos);
  scene.add(l);
  return l;
}

// ---------- canvas art ----------
export function drawKeyTop(x, W, H, label, color) {
  const c = new THREE.Color(color);
  x.fillStyle = '#' + c.clone().offsetHSL(0, 0, 0.08).getHexString();
  x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(255,255,255,0.12)';
  x.fillRect(6, 6, W - 12, H * 0.35);
  x.fillStyle = '#eef6f8';
  x.strokeStyle = '#eef6f8';
  const cx = W / 2, cy = H / 2, s = Math.min(W, H) * 0.22;
  if (label.text) {
    x.font = `800 ${Math.round(H * 0.32)}px Nunito, sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(label.text, cx, cy + 2);
    return;
  }
  const tri = (dir, ox = 0) => {
    x.beginPath();
    if (dir === 'r') { x.moveTo(cx - s * 0.8 + ox, cy - s); x.lineTo(cx + s * 0.9 + ox, cy); x.lineTo(cx - s * 0.8 + ox, cy + s); }
    if (dir === 'l') { x.moveTo(cx + s * 0.8 + ox, cy - s); x.lineTo(cx - s * 0.9 + ox, cy); x.lineTo(cx + s * 0.8 + ox, cy + s); }
    if (dir === 'u') { x.moveTo(cx - s, cy + s * 0.7); x.lineTo(cx, cy - s * 0.9); x.lineTo(cx + s, cy + s * 0.7); }
    if (dir === 'd') { x.moveTo(cx - s, cy - s * 0.7); x.lineTo(cx, cy + s * 0.9); x.lineTo(cx + s, cy - s * 0.7); }
    x.fill();
  };
  if (label.icon === 'play') { tri('r', -s * 0.9); x.fillRect(cx + s * 0.35, cy - s, s * 0.35, s * 2); x.fillRect(cx + s * 0.95, cy - s, s * 0.35, s * 2); }
  if (label.icon === 'rew') { x.fillRect(cx - s * 1.2, cy - s, s * 0.35, s * 2); tri('l', s * 0.25); }
  if (label.icon === 'fwd') { tri('r', -s * 0.25); x.fillRect(cx + s * 0.85, cy - s, s * 0.35, s * 2); }
  if (label.icon === 'up') tri('u');
  if (label.icon === 'down') tri('d');
  if (label.icon === 'left') { tri('l', -s * 0.5); tri('l', s * 0.6); }
  if (label.icon === 'right') { tri('r', -s * 0.6); tri('r', s * 0.5); }
}

function drawBookCover(x, W, H) {
  x.fillStyle = '#d9463e'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#b8372f'; x.fillRect(0, 0, 22, H);
  x.fillStyle = '#f4f0e2';
  x.fillRect(48, 70, W - 80, 86);
  x.fillStyle = '#b8372f';
  x.font = '900 34px Nunito, sans-serif'; x.textAlign = 'center';
  x.fillText('RULES', (W + 22) / 2, 112);
  x.font = '800 18px Nunito, sans-serif';
  x.fillText('OF THE GAME', (W + 22) / 2, 140);
  x.fillStyle = '#f4f0e2';
  x.font = '700 16px Nunito, sans-serif';
  x.fillText('COASTAL PREMIER', (W + 22) / 2, 250);
  x.fillText('LEAGUE', (W + 22) / 2, 272);
}

function drawMemo(x, W, H) {
  x.fillStyle = '#f4f0e2'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#2f6f9a'; x.fillRect(18, 18, 80, 10);
  x.fillStyle = '#b9b3a0';
  for (let i = 0; i < 14; i++) x.fillRect(18, 50 + i * 18, W - 36 - ((i * 37) % 70), 5);
  x.fillStyle = '#d9463e'; x.font = '700 20px Caveat, cursive'; x.fillText('quota!!', 150, 315);
}

function pixelFootballer(x, ox, oy, s, shirt, shorts, skin = '#e0a878') {
  const px = (cx, cy, w, h, c) => { x.fillStyle = c; x.fillRect(ox + cx * s, oy + cy * s, w * s, h * s); };
  px(5, 0, 4, 4, skin); px(5, 0, 4, 1, '#3a2416');
  px(3, 4, 8, 6, shirt); px(1, 5, 2, 4, shirt); px(11, 5, 2, 4, shirt);
  px(1, 9, 2, 1, skin); px(11, 9, 2, 1, skin);
  px(4, 10, 6, 3, shorts);
  px(4, 13, 2, 5, skin); px(8, 13, 2, 4, skin); px(9, 16, 3, 2, skin);
  px(3, 18, 3, 2, '#111'); px(10, 17, 3, 2, '#111');
}
function drawPosterA(x, W, H) {
  x.fillStyle = '#f4ecd6'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#e8573f'; x.fillRect(16, 16, W - 32, H * 0.62);
  pixelFootballer(x, 70, 40, 8, '#2f6f9a', '#f4f4f4');
  x.fillStyle = '#ffffff'; x.beginPath(); x.arc(196, 196, 14, 0, 7); x.fill();
  x.fillStyle = '#20262e'; x.font = '900 30px Nunito, sans-serif'; x.textAlign = 'center';
  x.fillText('FAIR PLAY', W / 2, H * 0.62 + 60);
  x.font = '700 16px Nunito, sans-serif'; x.fillText('RESPECT THE CALL', W / 2, H * 0.62 + 86);
}
function drawPosterB(x, W, H) {
  x.fillStyle = '#20262e'; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#5cbf48'; x.lineWidth = 6; x.strokeRect(14, 14, W - 28, H - 28);
  x.fillStyle = '#5cbf48'; x.font = '900 34px Nunito, sans-serif'; x.textAlign = 'center';
  x.fillText('LAW 11', W / 2, 70);
  x.fillStyle = '#f4f0e2'; x.font = '700 18px Nunito, sans-serif';
  ['ANY PART', 'OF HEAD,', 'BODY OR FEET', 'BEYOND THE', 'SECOND-LAST', 'DEFENDER'].forEach((t, i) => x.fillText(t, W / 2, 120 + i * 30));
  x.strokeStyle = '#e8573f'; x.lineWidth = 4; x.beginPath(); x.moveTo(40, 320); x.lineTo(W - 40, 320); x.stroke();
}
function drawPosterC(x, W, H) {
  x.fillStyle = '#e0b04a'; x.fillRect(0, 0, W, H);
  pixelFootballer(x, 40, 60, 7, '#d9463e', '#20262e');
  pixelFootballer(x, 130, 70, 7, '#f4f4f4', '#2f6f9a', '#8a5636');
  x.fillStyle = '#20262e'; x.font = '900 28px Nunito, sans-serif'; x.textAlign = 'center';
  x.fillText('MATCHDAY', W / 2, H - 50);
}

// ---------- room art ----------
// seeded noise so the painted textures are the same every load
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function drawWallpaper(x, W, H) {
  x.fillStyle = '#2b6b64'; x.fillRect(0, 0, W, H);
  // soft vertical stripes with a small diamond motif, like 80s office wallpaper
  for (let i = 0; i < 4; i++) { x.fillStyle = 'rgba(255,255,255,0.035)'; x.fillRect(i * 64, 0, 30, H); }
  x.fillStyle = 'rgba(10,40,38,0.35)';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const cx = i * 64 + 47, cy = j * 64 + (i % 2 ? 32 : 0) + 16;
    x.beginPath(); x.moveTo(cx, cy - 6); x.lineTo(cx + 5, cy); x.lineTo(cx, cy + 6); x.lineTo(cx - 5, cy); x.fill();
  }
  const r = rng(7);
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '0,20,20' : '255,255,240'},${0.03 + r() * 0.03})`; x.fillRect(r() * W, r() * H, 2, 2); }
}
function drawWainscot(x, W, H) {
  x.fillStyle = '#1f4f4a'; x.fillRect(0, 0, W, H);
  // two raised panels per tile
  for (const px of [12, W / 2 + 12]) {
    const pw = W / 2 - 24;
    x.fillStyle = '#245a54'; x.fillRect(px, 14, pw, H - 28);
    x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(px, 14, pw, 3); x.fillRect(px, 14, 3, H - 28);
    x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(px, H - 17, pw, 3); x.fillRect(px + pw - 3, 14, 3, H - 28);
  }
}
function drawCarpet(x, W, H) {
  x.fillStyle = '#2c3346'; x.fillRect(0, 0, W, H);
  const r = rng(11);
  for (let i = 0; i < 2600; i++) { x.fillStyle = ['#262c3e', '#343c52', '#3a3248', '#2a3a4a'][Math.floor(r() * 4)]; x.fillRect(r() * W, r() * H, 3, 3); }
  x.strokeStyle = 'rgba(224,176,74,0.22)'; x.lineWidth = 3;
  for (let i = 0; i < 2; i++) { x.beginPath(); x.moveTo(0, 64 + i * 128); x.lineTo(W, 64 + i * 128); x.stroke(); }
}
function drawGlass(x, W, H) {
  x.clearRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, 'rgba(160,200,255,0.10)'); g.addColorStop(0.5, 'rgba(160,200,255,0.03)'); g.addColorStop(1, 'rgba(160,200,255,0.08)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(255,255,255,0.10)'; x.lineWidth = 10;
  for (const o of [40, 70, 180]) { x.beginPath(); x.moveTo(o, 0); x.lineTo(o - 120, H); x.stroke(); x.lineWidth = 4; }
}

// The stadium seen from the booth at night. Coordinates: 1024x512 over a 4.6m x 2.3m plane.
const FLOODS = [[150, 70], [420, 40], [640, 40], [900, 70]];
function drawStadiumView(x, W, H) {
  const sky = x.createLinearGradient(0, 0, 0, H * 0.55);
  sky.addColorStop(0, '#070b1e'); sky.addColorStop(0.7, '#14244a'); sky.addColorStop(1, '#2b4370');
  x.fillStyle = sky; x.fillRect(0, 0, W, H);
  const r = rng(3);
  for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.5})`; x.fillRect(r() * W, r() * H * 0.3, 2, 2); }
  // floodlight haze
  for (const [fx, fy] of FLOODS) {
    const g = x.createRadialGradient(fx, fy + 40, 10, fx, fy + 60, 260);
    g.addColorStop(0, 'rgba(200,220,255,0.35)'); g.addColorStop(1, 'rgba(200,220,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  }
  // opposite stand: roof, tiers of crowd
  const top = 150, bot = 300;
  x.fillStyle = '#0e1426'; x.fillRect(0, top - 34, W, 34);
  x.fillStyle = '#26314f'; x.fillRect(0, top - 6, W, 6);
  for (let y = top; y < bot; y += 6) {
    const k = (y - top) / (bot - top);
    x.fillStyle = `rgb(${30 + k * 30},${36 + k * 34},${60 + k * 40})`; x.fillRect(0, y, W, 6);
  }
  const shirts = ['#d9463e', '#f4f0e2', '#2f6f9a', '#e0b04a', '#5ad1e6', '#e85a8a', '#3f9a4a'];
  for (let y = top + 4, row = 0; y < bot - 6; y += 10, row++) for (let px = (row % 2) * 4; px < W; px += 8) {
    if (r() < 0.18) continue;
    const k = (y - top) / (bot - top);
    x.globalAlpha = 0.35 + k * 0.5;
    x.fillStyle = shirts[Math.floor(r() * shirts.length)]; x.fillRect(px + 1, y + 3, 6, 6);
    x.fillStyle = r() < 0.7 ? '#e0a878' : '#8a5636'; x.fillRect(px + 2, y, 4, 4);
  }
  x.globalAlpha = 1;
  // ad boards + pitch in perspective
  x.fillStyle = '#10141c'; x.fillRect(0, bot, W, 14);
  const ads = ['#d9463e', '#2f6f9a', '#e0b04a', '#3f9a4a'];
  for (let i = 0; i < 10; i++) { x.fillStyle = ads[i % 4]; x.fillRect(i * 104 + 6, bot + 3, 92, 8); }
  for (let y = bot + 14, i = 0; y < H; i++) {
    const h = 8 + i * 5;
    x.fillStyle = i % 2 ? '#2f7d3a' : '#3a8f43'; x.fillRect(0, y, W, h);
    y += h;
  }
  x.strokeStyle = 'rgba(255,255,255,0.75)'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(0, bot + 30); x.lineTo(W, bot + 30); x.stroke();
  x.beginPath(); x.moveTo(W / 2, bot + 30); x.lineTo(W / 2, H); x.stroke();
  x.beginPath(); x.ellipse(W / 2, bot + 120, 180, 50, 0, Math.PI, 0); x.stroke();
  // floodlight masts
  x.fillStyle = '#0a0e1a';
  for (const [fx, fy] of FLOODS) { x.fillRect(fx - 3, fy, 6, top - fy); x.fillRect(fx - 34, fy - 4, 68, 30); }
}
function drawStadiumLights(x, W, H) {
  x.clearRect(0, 0, W, H);
  for (const [fx, fy] of FLOODS) {
    for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) {
      x.fillStyle = '#fff6e0'; x.fillRect(fx - 28 + i * 12, fy + 2 + j * 12, 8, 8);
    }
    // light cones falling to the pitch
    x.globalCompositeOperation = 'lighter';
    const g = x.createLinearGradient(fx, fy, fx, 420);
    g.addColorStop(0, 'rgba(255,245,220,0.22)'); g.addColorStop(1, 'rgba(255,245,220,0)');
    x.fillStyle = g;
    x.beginPath(); x.moveTo(fx - 30, fy + 22); x.lineTo(fx + 30, fy + 22); x.lineTo(fx + 120, 420); x.lineTo(fx - 120, 420); x.fill();
    x.globalCompositeOperation = 'source-over';
  }
  // roof strip lights
  for (let px = 4; px < W; px += 16) { x.fillStyle = 'rgba(255,240,210,0.6)'; x.fillRect(px, 119, 8, 3); }
}
function drawCorkboard(x, W, H) {
  x.fillStyle = '#b98a55'; x.fillRect(0, 0, W, H);
  const r = rng(5);
  for (let i = 0; i < 2200; i++) { x.fillStyle = r() < 0.5 ? 'rgba(90,55,25,0.25)' : 'rgba(240,200,150,0.2)'; x.fillRect(r() * W, r() * H, 2, 2); }
  const card = (cx, cy, w, h, rot, fill, draw) => {
    x.save(); x.translate(cx, cy); x.rotate(rot);
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(-w / 2 + 4, -h / 2 + 5, w, h);
    x.fillStyle = fill; x.fillRect(-w / 2, -h / 2, w, h);
    draw(-w / 2, -h / 2, w, h);
    x.fillStyle = '#d9463e'; x.beginPath(); x.arc(0, -h / 2 + 8, 6, 0, 7); x.fill();
    x.restore();
  };
  // polaroid of a pitch
  card(90, 120, 120, 140, -0.08, '#f4f0e2', (l, t, w) => { x.fillStyle = '#3a8f43'; x.fillRect(l + 10, t + 10, w - 20, 92); x.strokeStyle = '#f4f0e2'; x.lineWidth = 2; x.strokeRect(l + 30, t + 30, w - 60, 52); x.fillStyle = '#20262e'; x.font = '18px Caveat'; x.fillText('cup final', l + 16, t + 128); });
  // fixtures list
  card(250, 150, 150, 200, 0.04, '#fbf8ef', (l, t, w) => {
    x.fillStyle = '#2f6f9a'; x.fillRect(l, t, w, 26); x.fillStyle = '#fff'; x.font = '14px Silkscreen'; x.fillText('FIXTURES', l + 10, t + 18);
    x.fillStyle = '#5b6170'; for (let i = 0; i < 8; i++) x.fillRect(l + 12, t + 42 + i * 18, w - 24 - (i * 13) % 40, 5);
  });
  // index card with a scribble
  card(420, 100, 140, 96, -0.06, '#fff7a8', (l, t) => { x.fillStyle = '#20262e'; x.font = '22px Caveat'; x.fillText('watch the', l + 14, t + 40); x.fillText('second-last!', l + 14, t + 68); });
  card(420, 240, 110, 80, 0.1, '#ffd0d8', (l, t) => { x.fillStyle = '#20262e'; x.font = '20px Caveat'; x.fillText('ext. 4410', l + 12, t + 46); });
}

function drawDeskMat(x, W, H) {
  x.fillStyle = '#24463c'; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(180,230,200,0.18)'; x.lineWidth = 1;
  for (let i = 0; i < W; i += 16) { x.beginPath(); x.moveTo(i + 0.5, 0); x.lineTo(i + 0.5, H); x.stroke(); }
  for (let j = 0; j < H; j += 16) { x.beginPath(); x.moveTo(0, j + 0.5); x.lineTo(W, j + 0.5); x.stroke(); }
  x.strokeStyle = 'rgba(220,250,230,0.35)'; x.lineWidth = 2;
  for (let i = 0; i < W; i += 80) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 10); x.stroke(); }
  x.strokeStyle = 'rgba(224,176,74,0.5)'; x.beginPath(); x.moveTo(0, H - 20); x.lineTo(W, H - 20); x.stroke();
}
