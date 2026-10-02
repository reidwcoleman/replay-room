// Footballer meshes driven straight from the kinematics joints: capsule limbs between joints,
// kit colours per team, numbers on the back.
import * as THREE from 'three';
import { DIM } from '../sim/kinematics.js';

const UP = new THREE.Vector3(0, 1, 0);
const SKINS = [0xf1c7a5, 0xd9a47c, 0xb57c55, 0x8a5636, 0x5e3a24, 0xe8b894];
const HAIR = [0x1a1410, 0x3b2a1e, 0x6b4a2b, 0xc9a35a, 0x0f0f0f, 0x8c3b1d];

const cyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
const sph = new THREE.SphereGeometry(1, 14, 10);
const matCache = new Map();
const mat = (hex, r = 0.75) => {
  const k = hex + ':' + r;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: hex, roughness: r }));
  return matCache.get(k);
};

export function setGhost(on) {
  for (const m of matCache.values()) { m.transparent = on; m.opacity = on ? 0.28 : 1; m.depthWrite = !on; m.needsUpdate = true; }
}

export class PlayerMesh {
  constructor(actor, kit) {
    this.actor = actor;
    const gk = actor.keeper;
    const shirt = gk ? kit.gk : kit.shirt;
    const skin = SKINS[(actor.num * 7 + actor.id * 3) % SKINS.length];
    const hair = HAIR[(actor.num * 5 + actor.id) % HAIR.length];
    this.group = new THREE.Group();
    this.parts = [];
    const limb = (a, b, r, color, rough) => {
      const m = new THREE.Mesh(cyl, mat(color, rough));
      m.castShadow = true;
      this.group.add(m);
      this.parts.push({ m, a, b, r, kind: 'limb' });
    };
    const ball = (a, r, color, sy = 1) => {
      const m = new THREE.Mesh(sph, mat(color));
      m.castShadow = true;
      m.scale.set(r, r * sy, r);
      this.group.add(m);
      this.parts.push({ m, a, kind: 'ball' });
      return m;
    };
    // torso: wide capsule
    const sock = kit.socks, shorts = gk ? 0x222222 : kit.shorts, boot = 0x151515;
    limb('pelvis', 'chest', 0.19, shirt, 0.7);
    this.torso = this.parts[this.parts.length - 1];
    ball('pelvis', 0.19, shorts);
    ball('chest', 0.21, shirt, 0.8);
    limb('chest', 'neck', 0.06, skin);
    const head = ball('head', DIM.headR, skin, 1.1);
    const hairM = ball('head', DIM.headR * 1.04, hair, 0.75);
    this.hair = hairM;
    for (const s of ['L', 'R']) {
      limb('sh' + s, 'el' + s, 0.062, shirt);
      limb('el' + s, 'ha' + s, 0.048, gk ? shirt : skin);
      ball('ha' + s, gk ? 0.065 : 0.05, gk ? 0x7cd36b : skin);
      ball('sh' + s, 0.07, shirt);
      limb('hip' + s, 'kn' + s, 0.085, shorts);
      limb('kn' + s, 'an' + s, 0.062, sock);
      ball('kn' + s, 0.066, sock);
      limb('an' + s, 'to' + s, 0.055, boot, 0.4);
    }
    // number on the back + shorts number
    this.num = numberPlane(actor.num, kit.num ?? 0xffffff, gk);
    this.group.add(this.num);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.group.add(this.ring);
    this.a = new THREE.Vector3();
    this.b = new THREE.Vector3();
  }

  update(j) {
    for (const p of this.parts) {
      if (p.kind === 'ball') { p.m.position.set(...j[p.a]); continue; }
      this.a.set(...j[p.a]); this.b.set(...j[p.b]);
      const d = this.b.clone().sub(this.a);
      const len = d.length();
      p.m.position.copy(this.a).addScaledVector(d, 0.5);
      p.m.quaternion.setFromUnitVectors(UP, d.divideScalar(len || 1));
      p.m.scale.set(p.r, len, p.r);
    }
    // hair cap sits slightly up and back on the head
    const up = new THREE.Vector3(...j.head).sub(new THREE.Vector3(...j.neck)).normalize();
    this.hair.position.set(...j.head).addScaledVector(up, 0.025);
    this.hair.quaternion.setFromUnitVectors(UP, up);
    // back number: behind the chest, facing backwards
    const chest = new THREE.Vector3(...j.chest), pel = new THREE.Vector3(...j.pelvis);
    const spine = chest.clone().sub(pel).normalize();
    const side = new THREE.Vector3(...j.shR).sub(new THREE.Vector3(...j.shL)).normalize();
    const fwd = new THREE.Vector3().crossVectors(side, spine).normalize();
    this.num.position.copy(pel).lerp(chest, 0.62).addScaledVector(fwd, -0.205);
    const m = new THREE.Matrix4().makeBasis(side.clone().negate(), spine, fwd.clone().negate());
    this.num.quaternion.setFromRotationMatrix(m);
    this.ring.position.set(pel.x, 0.02, pel.z);
  }
}

const numCache = new Map();
function numberPlane(n, color, gk) {
  const key = n + ':' + color;
  let tex = numCache.get(key);
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#' + new THREE.Color(color).getHexString();
    x.font = '800 96px "Space Grotesk", system-ui, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(n), 64, 70);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    numCache.set(key, tex);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.renderOrder = 2;
  return m;
}
