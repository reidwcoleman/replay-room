// Pitch, goals, stands, crowd, boards and floodlights. Line positions are exact (FIFA dimensions).
import * as THREE from 'three';
import { GOAL_X, HALF_W, GOAL_HALF_W, GOAL_H } from '../sim/clip.js';
import { toon } from './toon.js';

const LINE = 0.12;

export function buildStadium(scene, home) {
  const g = new THREE.Group();
  scene.add(g);

  // ---- pitch ----
  const W = 2048, H = 1366; // texture covers 120 x 80 m (with run-off)
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const sx = W / 120, sz = H / 80;
  const px = (m) => (m + 60) * sx, pz = (m) => (m + 40) * sz;
  x.fillStyle = '#3f9439'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 20; i++) {
    x.fillStyle = i % 2 ? '#4ca845' : '#3a8a35';
    x.fillRect(px(-52.5 + i * 5.25), pz(-34), 5.25 * sx + 1, 68 * sz);
  }
  // grain
  for (let i = 0; i < 14000; i++) {
    x.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,40,0,0.05)';
    x.fillRect(Math.random() * W, Math.random() * H, 4, 4);
  }
  x.strokeStyle = 'rgba(255,255,255,0.92)';
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

  // ---- surrounds ----
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(170, 130), toon(0x3f8f35));
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.08;
  g.add(apron);

  // ad boards
  const boards = boardTexture();
  const boardMat = new THREE.MeshBasicMaterial({ map: boards });
  for (const [px0, pz0, rot, len] of [[0, -38.5, 0, 112], [0, 38.5, Math.PI, 112], [-58, 0, Math.PI / 2, 74], [58, 0, -Math.PI / 2, 74]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.12), [boardMat, boardMat, new THREE.MeshBasicMaterial({ color: 0x111111 }), new THREE.MeshBasicMaterial({ color: 0x111111 }), boardMat, boardMat]);
    b.position.set(px0, 0.45, pz0);
    b.rotation.y = rot;
    g.add(b);
  }

  // stands: tiers + instanced crowd
  const standMat = toon(0x40465a);
  const seatColors = [0x55607a, 0x4a546c];
  const crowdGeo = new THREE.PlaneGeometry(0.55, 0.8);
  const crowdMat = new THREE.MeshToonMaterial({ side: THREE.DoubleSide });
  const people = [];
  const homeHex = home ? home.shirt : 0x1d3a8a;
  const palette = [homeHex, homeHex, 0xf2f2f2, 0x2a2a2a, 0xe0b48e, 0x9b6a4c, 0x4a7fd5, 0xe04848, homeHex, 0xf2d84b, 0x50c8a0];
  const addStand = (cx, cz, rot, len) => {
    const stand = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(len, 0.55, 0.9), toon(seatColors[i % 2]));
      step.position.set(0, 1.4 + i * 0.55, -i * 0.9);
      stand.add(step);
      for (let k = -len / 2 + 0.4; k < len / 2 - 0.4; k += 0.62) {
        if (Math.random() < 0.13) continue;
        people.push({ group: stand, x: k + (Math.random() - 0.5) * 0.15, y: 2.05 + i * 0.55, z: -i * 0.9 - 0.1, color: palette[Math.floor(Math.random() * palette.length)] });
      }
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(len, 12, 1), standMat);
    back.position.set(0, 6, -13.2);
    stand.add(back);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 2, 0.5, 16), toon(0x2a3040));
    roof.position.set(0, 13, -6);
    stand.add(roof);
    stand.position.set(cx, 0, cz);
    stand.rotation.y = rot;
    g.add(stand);
    return stand;
  };
  const stands = [addStand(0, -41, 0, 118), addStand(0, 41, Math.PI, 118), addStand(-61, 0, Math.PI / 2, 80), addStand(61, 0, -Math.PI / 2, 80)];
  // crowd as one instanced mesh per stand (billboards that face the pitch)
  for (const st of stands) {
    const mine = people.filter((p) => p.group === st);
    const m = new THREE.InstancedMesh(crowdGeo, crowdMat, mine.length);
    const M = new THREE.Matrix4(), col = new THREE.Color();
    mine.forEach((p, i) => {
      M.makeTranslation(p.x, p.y, p.z);
      m.setMatrixAt(i, M);
      m.setColorAt(i, col.set(p.color).multiplyScalar(0.75 + Math.random() * 0.3));
    });
    m.userData.base = mine;
    st.add(m);
    st.userData.crowd = m;
  }
  g.userData.stands = stands;

  // floodlights
  for (const [fx, fz] of [[-58, -44], [58, -44], [-58, 44], [58, 44]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 34, 10), toon(0xb8bec8));
    pole.position.set(fx, 17, fz);
    g.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.6), new THREE.MeshBasicMaterial({ color: 0xfff8e0 }));
    lamp.position.set(fx * 0.97, 34, fz * 0.97);
    lamp.lookAt(0, 0, 0);
    g.add(lamp);
  }

  // lights
  scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x3a5a30, 1.6));
  const sun = new THREE.DirectionalLight(0xfff4e2, 2.1);
  sun.position.set(-30, 60, -25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -62; sc.right = 62; sc.top = 42; sc.bottom = -42; sc.near = 10; sc.far = 160;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  scene.background = new THREE.Color(0x7fb6e0);
  scene.fog = new THREE.Fog(0x9cc6e6, 140, 300);

  let t = 0;
  return {
    group: g,
    goals,
    // crowd bob, scaled by the pressure meter
    update(dt, excite = 0.3) {
      t += dt;
      for (const st of stands) {
        const m = st.userData.crowd, base = m.userData.base, M = new THREE.Matrix4();
        for (let i = 0; i < base.length; i += 1) {
          const p = base[i];
          const bob = Math.max(0, Math.sin(t * (4 + (i % 7)) + i)) * 0.12 * excite;
          M.makeTranslation(p.x, p.y + bob, p.z);
          m.setMatrixAt(i, M);
        }
        m.instanceMatrix.needsUpdate = true;
      }
    },
  };
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
    x.fillStyle = fg; x.font = '900 34px Nunito, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(t, i * w + w / 2, 34);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}
