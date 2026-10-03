// Pitch, goals, stands, crowd, boards and floodlights. Line positions are exact (FIFA dimensions).
// Look: a dusk match under floodlights, painted the way a 16-bit sports game would, with a
// two-frame pixel crowd, scrolling LED boards, a sunset sky and a lit skyline.
import * as THREE from 'three';
import { GOAL_X, HALF_W, GOAL_HALF_W, GOAL_H } from '../sim/clip.js';
import { toon } from './toon.js';

const LINE = 0.12;
const lcg = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const hexCss = (h) => '#' + new THREE.Color(h).getHexString();
const nearest = (t) => { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return t; };

export function buildStadium(scene, home, away) {
  const g = new THREE.Group();
  scene.add(g);
  const fx = []; // things that must stay out of the ink/outline pre-pass (sky, glows)

  // ---- pitch ----
  const W = 2048, H = 1366; // texture covers 120 x 80 m (with run-off)
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const sx = W / 120, sz = H / 80;
  const px = (m) => (m + 60) * sx, pz = (m) => (m + 40) * sz;
  const R = lcg(7);
  x.fillStyle = '#379a37'; x.fillRect(0, 0, W, H);
  // mown stripes (alternating nap), each with a faint chequer so it reads as cut grass, not paint
  for (let i = 0; i < 20; i++) {
    x.fillStyle = i % 2 ? '#47bb46' : '#2f8c34';
    x.fillRect(px(-52.5 + i * 5.25), pz(-34), 5.25 * sx + 1, 68 * sz);
  }
  for (let i = 0; i < 20; i++) for (let k = 0; k < 8; k++) {
    if ((i + k) % 2) continue;
    x.fillStyle = 'rgba(0,30,10,0.06)';
    x.fillRect(px(-52.5 + i * 5.25), pz(-34 + k * 8.5), 5.25 * sx + 1, 8.5 * sz);
  }
  // blades
  for (let i = 0; i < 26000; i++) {
    const a = R();
    x.fillStyle = a < 0.45 ? 'rgba(210,255,170,0.07)' : a < 0.8 ? 'rgba(0,40,10,0.09)' : 'rgba(255,255,160,0.05)';
    x.fillRect(R() * W, R() * H, 2 + R() * 3, 3 + R() * 6);
  }
  // wear: goalmouths, centre spot, penalty spots
  const wear = (cx, cz, rx, rz, a) => {
    const gr = x.createRadialGradient(px(cx), pz(cz), 0, px(cx), pz(cz), rx * sx);
    gr.addColorStop(0, `rgba(120,96,50,${a})`); gr.addColorStop(1, 'rgba(120,96,50,0)');
    x.save(); x.translate(0, 0); x.fillStyle = gr; x.beginPath(); x.ellipse(px(cx), pz(cz), rx * sx, rz * sz, 0, 0, 7); x.fill(); x.restore();
  };
  for (const s of [-1, 1]) { wear(s * 50, 0, 6, 5.5, 0.55); wear(s * 41.5, 0, 1.8, 1.8, 0.5); }
  wear(0, 0, 2.2, 2.2, 0.4);
  // floodlight pools: bright in the middle, falling off toward the touchlines
  const pool = x.createRadialGradient(px(0), pz(0), 8 * sx, px(0), pz(0), 66 * sx);
  pool.addColorStop(0, 'rgba(255,245,200,0.22)'); pool.addColorStop(0.6, 'rgba(255,230,170,0.0)'); pool.addColorStop(1, 'rgba(20,10,60,0.38)');
  x.fillStyle = pool; x.fillRect(0, 0, W, H);
  // lines
  x.strokeStyle = 'rgba(255,255,255,0.95)';
  x.lineWidth = LINE * sx;
  const rect = (x0, z0, x1, z1) => x.strokeRect(px(x0), pz(z0), (x1 - x0) * sx, (z1 - z0) * sz);
  const inset = LINE / 2;
  rect(-52.5 + inset, -34 + inset, 52.5 - inset, 34 - inset);
  x.beginPath(); x.moveTo(px(0), pz(-34)); x.lineTo(px(0), pz(34)); x.stroke();
  x.beginPath(); x.ellipse(px(0), pz(0), 9.15 * sx, 9.15 * sz, 0, 0, Math.PI * 2); x.stroke();
  for (const s of [-1, 1]) {
    const gx = s * (52.5 - inset);
    rect(Math.min(gx, gx - s * 16.5), -20.16, Math.max(gx, gx - s * 16.5), 20.16);
    rect(Math.min(gx, gx - s * 5.5), -9.16, Math.max(gx, gx - s * 5.5), 9.16);
    x.beginPath(); x.ellipse(px(s * 41.5), pz(0), 9.15 * sx, 9.15 * sz, 0, s > 0 ? Math.PI - 0.93 : -0.93, s > 0 ? Math.PI + 0.93 : 0.93); x.stroke();
    x.fillStyle = 'white';
    x.beginPath(); x.ellipse(px(s * 41.5), pz(0), 0.2 * sx, 0.2 * sz, 0, 0, Math.PI * 2); x.fill();
    // corner arcs
    for (const zc of [-1, 1]) { x.beginPath(); x.ellipse(px(s * 52.5), pz(zc * 34), 1 * sx, 1 * sz, 0, 0, 7); x.stroke(); }
  }
  x.fillStyle = 'white';
  x.beginPath(); x.ellipse(px(0), pz(0), 0.25 * sx, 0.25 * sz, 0, 0, Math.PI * 2); x.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(120, 80), toon(0xffffff, { map: tex }));
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  g.add(pitch);

  // A crisp geometric goal line (the texture blurs at goal-line zoom).
  const glMat = new THREE.MeshBasicMaterial({ color: 0xf4f4f4 });
  for (const s of [-1, 1]) {
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(LINE, 68), glMat);
    gl.rotation.x = -Math.PI / 2;
    gl.position.set(s * (GOAL_X - LINE / 2), 0.004, 0);
    g.add(gl);
  }

  // ---- goals ----
  const post = toon(0xffffff);
  const netMat = new THREE.MeshBasicMaterial({ map: netTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const goals = [];
  for (const s of [-1, 1]) {
    const goal = new THREE.Group();
    const r = 0.06;
    for (const z of [-GOAL_HALF_W - r, GOAL_HALF_W + r]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, GOAL_H + r, 16), post);
      p.position.set(0, (GOAL_H + r) / 2, z);
      p.castShadow = true;
      goal.add(p);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, GOAL_HALF_W * 2 + 4 * r, 16), post);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(0, GOAL_H + r, 0);
    bar.castShadow = true;
    goal.add(bar);
    const depth = 2.2;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_HALF_W * 2, GOAL_H), netMat);
    back.position.set(depth, GOAL_H / 2, 0);
    back.rotation.y = Math.PI / 2;
    goal.add(back);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(depth, GOAL_HALF_W * 2), netMat);
    roof.rotation.x = -Math.PI / 2;
    roof.position.set(depth / 2, GOAL_H, 0);
    goal.add(roof);
    for (const z of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(depth, GOAL_H), netMat);
      side.position.set(depth / 2, GOAL_H / 2, z * GOAL_HALF_W);
      goal.add(side);
    }
    goal.position.x = s * (GOAL_X + r);
    if (s < 0) goal.rotation.y = Math.PI;
    g.add(goal);
    goals.push(goal);
  }

  // corner flags
  const flagPole = toon(0xffffff), flagCloth = new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.DoubleSide });
  for (const [fx0, fz0] of [[-52.5, -34], [52.5, -34], [-52.5, 34], [52.5, 34]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 6), flagPole);
    pole.position.set(fx0, 0.8, fz0);
    g.add(pole);
    const tri = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.28, 0), new THREE.Vector3(-0.38 * Math.sign(fx0 || 1), -0.14, 0)]), flagCloth);
    tri.position.set(fx0, 1.6, fz0);
    g.add(tri);
  }

  // ---- surrounds ----
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(170, 130), toon(0x24592a));
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.08;
  g.add(apron);

  // LED ad boards, scrolling
  const boards = boardTexture();
  const boardMat = new THREE.MeshBasicMaterial({ map: boards });
  const dark = new THREE.MeshBasicMaterial({ color: 0x0d0d14 });
  for (const [px0, pz0, rot, len] of [[0, -38.5, 0, 112], [0, 38.5, Math.PI, 112], [-58, 0, Math.PI / 2, 74], [58, 0, -Math.PI / 2, 74]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.12), [boardMat, boardMat, dark, dark, boardMat, boardMat]);
    b.position.set(px0, 0.45, pz0);
    b.rotation.y = rot;
    g.add(b);
  }

  // ---- sky and skyline (kept out of the outline pass) ----
  const sky = new THREE.Mesh(new THREE.SphereGeometry(480, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vP;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vP); float h = clamp(d.y, 0.0, 1.0);
        vec3 zen = vec3(0.09, 0.07, 0.30), mid = vec3(0.50, 0.17, 0.52), hor = vec3(1.0, 0.52, 0.28);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.2, h));
        c = mix(c, zen, smoothstep(0.1, 0.75, h));
        float sun = exp(-pow(length(vec2(atan(d.z, d.x) + 0.6, h * 2.2)), 2.0) * 6.0);
        c += vec3(1.0, 0.6, 0.25) * sun * 0.5;
        vec2 sp = floor(vec2(atan(d.z, d.x) * 90.0, h * 140.0));
        c += vec3(1.0) * step(0.9975, h21(sp)) * smoothstep(0.25, 0.55, h);
        c = pow(clamp(c, 0.0, 1.0), vec3(2.2));
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  sky.renderOrder = -10;
  g.add(sky); fx.push(sky);
  {
    const wc = document.createElement('canvas'); wc.width = 32; wc.height = 64;
    const wx = wc.getContext('2d'); const wr = lcg(3);
    wx.fillStyle = '#1b1238'; wx.fillRect(0, 0, 32, 64);
    for (let yy = 2; yy < 62; yy += 4) for (let xx = 2; xx < 30; xx += 4) if (wr() < 0.38) { wx.fillStyle = wr() < 0.7 ? '#ffd27a' : '#8fe3ff'; wx.fillRect(xx, yy, 2, 2); }
    const wt = nearest(new THREE.CanvasTexture(wc)); wt.colorSpace = THREE.SRGBColorSpace; wt.wrapS = wt.wrapT = THREE.RepeatWrapping;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const sk = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: wt, fog: false }), 70);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), sr = lcg(11);
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2 + sr() * 0.05, rad = 260 + sr() * 70, w = 14 + sr() * 26, hh = 18 + sr() * 70;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      M.compose(new THREE.Vector3(Math.cos(a) * rad, hh / 2 - 2, Math.sin(a) * rad), q, new THREE.Vector3(w, hh, w));
      sk.setMatrixAt(i, M);
    }
    g.add(sk); fx.push(sk);
  }

  // ---- stands: tiered concrete + a pixel crowd painted on the ramp, two animation frames ----
  const standMat = toon(0x2c2a48);
  const stands = [];
  const crowdCache = { key: null, sets: null };
  const makeStand = (cx, cz, rot, len) => {
    const stand = new THREE.Group();
    // crowd ramp follows the front edge of the old terraces: 13.7 m long, rising 31 degrees
    const ramp = new THREE.Mesh(new THREE.PlaneGeometry(len, 13.71), new THREE.MeshBasicMaterial({ color: 0xd9d2ee }));
    ramp.rotation.x = -1.021;
    ramp.position.set(0, 5.25, -5.4);
    stand.add(ramp);
    // concrete behind and underneath, so nothing shows through
    const back = new THREE.Mesh(new THREE.BoxGeometry(len, 12.4, 1), standMat);
    back.position.set(0, 6.2, -13.2);
    stand.add(back);
    const under = new THREE.Mesh(new THREE.BoxGeometry(len, 1.6, 12), standMat);
    under.position.set(0, 0.8, -5.2);
    stand.add(under);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 2, 0.5, 16), toon(0x1f1c36));
    roof.position.set(0, 13, -6);
    stand.add(roof);
    // lit lip along the roof edge and a fascia of floodlit windows behind the top row
    const lip = new THREE.Mesh(new THREE.BoxGeometry(len + 2, 0.18, 0.2), new THREE.MeshBasicMaterial({ color: 0xffe9b0 }));
    lip.position.set(0, 12.7, 2);
    stand.add(lip);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.4), new THREE.MeshBasicMaterial({ map: windowStrip(), color: 0xbfb8dc }));
    glass.material.map.repeat.set(len / 12, 1);
    glass.position.set(0, 10.6, -12.65);
    stand.add(glass);
    stand.position.set(cx, 0, cz);
    stand.rotation.y = rot;
    g.add(stand);
    const s = { group: stand, ramp, len, t: Math.random() * 2, idx: 0, set: null };
    stands.push(s);
    return s;
  };
  makeStand(0, -41, 0, 118); makeStand(0, 41, Math.PI, 118); makeStand(-61, 0, Math.PI / 2, 80); makeStand(61, 0, -Math.PI / 2, 80);

  // paints the crowd for these two clubs: a calm pair of frames and an excited pair
  const setTeams = (a, d) => {
    const key = (a ? a.id : '') + (d ? d.id : '');
    if (crowdCache.key === key) return;
    crowdCache.key = key;
    if (crowdCache.sets) for (const set of crowdCache.sets) for (const t of set) t.dispose();
    const homeHex = a ? a.shirt : 0x1d3a8a, awayHex = d ? d.shirt : 0xd8262f;
    const sets = [0.1, 0.45].map((p) => [0, 1].map((f) => nearestTex(crowdCanvas(homeHex, awayHex, p, f))));
    crowdCache.sets = sets;
    for (const s of stands) {
      s.maps = sets.map((set) => set.map((t) => { const c2 = t.clone(); c2.needsUpdate = true; c2.repeat.set(s.len / 40.96, 1); return c2; }));
      s.ramp.material.map = s.maps[0][0];
      s.ramp.material.needsUpdate = true;
    }
  };
  setTeams(home, away);

  // floodlight masts: a pylon, a bank of lamps and a bloom of additive glare
  const glowTex = glowTexture();
  for (const [fx0, fz0] of [[-58, -44], [58, -44], [-58, 44], [58, 44]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 34, 10), toon(0x9aa3b8));
    pole.position.set(fx0, 17, fz0);
    g.add(pole);
    const head = new THREE.Group();
    head.position.set(fx0 * 0.97, 34, fz0 * 0.97);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(7.4, 4.6, 0.5), new THREE.MeshBasicMaterial({ color: 0x15131f }));
    head.add(frame);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff3cf });
    for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), lampMat);
      l.position.set(-2.7 + i * 1.8, -1.4 + k * 1.4, 0.3);
      head.add(l);
    }
    head.lookAt(0, 8, 0);
    g.add(head);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe2a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    sp.scale.set(34, 34, 1);
    sp.position.copy(head.position).multiplyScalar(0.985);
    g.add(sp); fx.push(sp);
  }

  // lights: warm floodlight key with shadows, a cool dusk fill from the other side
  const hemi = new THREE.HemisphereLight(0xb3b0ff, 0x3b5a35, 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe6bd, 2.2);
  sun.position.set(-30, 60, -25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -62; sc.right = 62; sc.top = 42; sc.bottom = -42; sc.near = 10; sc.far = 160;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x7f9cff, 0.55);
  fill.position.set(40, 30, 35);
  scene.add(fill);

  scene.background = new THREE.Color(0x2a1a50);
  scene.fog = new THREE.Fog(0x7a4f86, 150, 340);

  let t = 0;
  return {
    group: g,
    goals,
    fx,
    setTeams,
    // crowd animation: swap between two painted frames, faster and wilder as the pressure builds
    update(dt, excite = 0.3) {
      t += dt;
      boards.offset.x = (t * 0.018) % 1;
      const set = excite > 0.55 ? 1 : 0;
      for (const s of stands) {
        s.t -= dt;
        if (s.t < 0) {
          s.idx ^= 1;
          s.t = (0.62 - 0.38 * excite) * (0.75 + Math.random() * 0.5);
          if (s.maps) { s.ramp.material.map = s.maps[set][s.idx]; }
        }
      }
    },
  };
}

function nearestTex(canvas) {
  const t = nearest(new THREE.CanvasTexture(canvas));
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// 64 fans across, 12 rows, each fan a 16 x 22 pixel figure. `p` = share with their arms up.
function crowdCanvas(homeHex, awayHex, p, frame) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 264;
  const x = c.getContext('2d');
  const R = lcg(101); // same people in every frame; only arms and flashes change
  const F = lcg(500 + frame * 977);
  const skin = ['#f1c7a5', '#d9a47c', '#b57c55', '#8a5636', '#5e3a24', '#e8b894'];
  const hair = ['#1a1410', '#3b2a1e', '#6b4a2b', '#c9a35a', '#0f0f0f', '#8c3b1d', '#b8b8b8'];
  const home = hexCss(homeHex), away = hexCss(awayHex);
  const shirts = [home, home, home, home, away, '#f2f2f2', '#2a2a2a', '#4a7fd5', '#e04848', '#f2d84b'];
  const g = x.createLinearGradient(0, 0, 0, 264);
  g.addColorStop(0, '#171430'); g.addColorStop(1, '#2a2650');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 264);
  for (let row = 0; row < 12; row++) {
    const y0 = row * 22, off = row % 2 ? 8 : 0;
    // seat backs: a darker band behind every row
    x.fillStyle = row % 2 ? '#201c40' : '#25214a'; x.fillRect(0, y0 + 12, 1024, 10);
    for (let i = -1; i < 65; i++) {
      const fx = i * 16 + off;
      if (R() < 0.07) { R(); R(); R(); R(); continue; } // empty seat
      const sk = skin[Math.floor(R() * skin.length)], hr = hair[Math.floor(R() * hair.length)];
      const sh = shirts[Math.floor(R() * shirts.length)], scarf = R() < 0.18, flag = R() < 0.03;
      const up = F() < p, up2 = F() < p;
      const flash = F() < 0.012;
      // body
      x.fillStyle = sh; x.fillRect(fx + 3, fy(y0, 11), 10, 11);
      x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(fx + 3, fy(y0, 18), 10, 4);
      if (scarf) { x.fillStyle = R() < 0.5 ? home : '#f2f2f2'; x.fillRect(fx + 3, fy(y0, 10), 10, 2); x.fillStyle = away; x.fillRect(fx + 6, fy(y0, 10), 2, 2); }
      // head and hair
      x.fillStyle = sk; x.fillRect(fx + 5, fy(y0, 4), 6, 6);
      x.fillStyle = hr; x.fillRect(fx + 5, fy(y0, 3), 6, 2); if (R() < 0.3) x.fillRect(fx + 4, fy(y0, 4), 1, 4);
      x.fillStyle = '#111'; x.fillRect(fx + 6, fy(y0, 6), 1, 1); x.fillRect(fx + 9, fy(y0, 6), 1, 1);
      // arms
      x.fillStyle = sk;
      if (up) { x.fillRect(fx + 2, fy(y0, 0), 2, 8); x.fillStyle = sh; x.fillRect(fx + 2, fy(y0, 8), 2, 3); } else { x.fillStyle = sh; x.fillRect(fx + 1, fy(y0, 11), 2, 6); }
      x.fillStyle = sk;
      if (up2) { x.fillRect(fx + 12, fy(y0, 0), 2, 8); x.fillStyle = sh; x.fillRect(fx + 12, fy(y0, 8), 2, 3); } else { x.fillStyle = sh; x.fillRect(fx + 13, fy(y0, 11), 2, 6); }
      if (flag) { x.fillStyle = '#eee'; x.fillRect(fx + 14, fy(y0, -14), 1, 18); x.fillStyle = R() < 0.5 ? home : away; x.fillRect(fx + 15, fy(y0, -14), 9, 6); }
      if (flash) { x.fillStyle = '#ffffff'; x.fillRect(fx + 6, fy(y0, 0), 3, 3); x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(fx + 5, fy(y0, -1), 5, 5); }
    }
  }
  // roof shadow over the top rows
  const sh = x.createLinearGradient(0, 0, 0, 90);
  sh.addColorStop(0, 'rgba(8,6,24,0.5)'); sh.addColorStop(1, 'rgba(8,6,24,0)');
  x.fillStyle = sh; x.fillRect(0, 0, 1024, 90);
  return c;
}
const fy = (y0, d) => y0 + d;

function windowStrip() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 16;
  const x = c.getContext('2d'); const r = lcg(5);
  x.fillStyle = '#14122a'; x.fillRect(0, 0, 64, 16);
  for (let i = 0; i < 64; i += 4) { x.fillStyle = r() < 0.8 ? '#ffd98a' : '#4a3a62'; x.fillRect(i + 1, 4, 2, 8); }
  const t = nearestTex(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,248,220,1)'); g.addColorStop(0.18, 'rgba(255,226,160,0.55)'); g.addColorStop(1, 'rgba(255,200,120,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(255,240,200,0.5)'; x.fillRect(0, 62, 128, 4); x.fillRect(62, 0, 4, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function netTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.strokeStyle = 'rgba(255,255,255,0.55)';
  x.lineWidth = 2;
  for (let i = 0; i <= 128; i += 16) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke();
    x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 4);
  return t;
}

function boardTexture() {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 64;
  const x = c.getContext('2d');
  const ads = [['LUMEN', '#0b1b2b', '#5ef2c4'], ['COASTAL PREMIER', '#16213a', '#ffffff'], ['FERRO LAGER', '#7a1020', '#ffd76a'], ['QUAYSIDE BANK', '#0d3b66', '#f4f4f4'], ['TIDEWAY AIR', '#ffffff', '#0d3b66'], ['NORTHWIND', '#111111', '#ff7a1a']];
  const w = 2048 / ads.length;
  ads.forEach(([t, bg, fg], i) => {
    x.fillStyle = bg; x.fillRect(i * w, 0, w, 64);
    // LED dot grid
    x.fillStyle = 'rgba(0,0,0,0.25)';
    for (let yy = 0; yy < 64; yy += 4) x.fillRect(i * w, yy + 3, w, 1);
    x.fillStyle = fg; x.font = '700 32px Silkscreen, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(t, i * w + w / 2, 34);
    x.fillStyle = fg; x.fillRect(i * w, 0, w, 3); x.fillRect(i * w, 61, w, 3);
  });
  const t = nearest(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}
