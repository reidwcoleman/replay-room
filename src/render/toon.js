// Cel shading shared by the office and the replay: three flat light bands, no specular.
import * as THREE from 'three';

let grad = null;
export function gradientMap() {
  if (grad) return grad;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  grad = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter;
  grad.generateMipmaps = false;
  grad.needsUpdate = true;
  return grad;
}

const cache = new Map();
export function toon(color, o = {}) {
  const key = color + ':' + JSON.stringify(o);
  if (!o.unique && cache.has(key)) return cache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...stripKeys(o) });
  if (!o.unique) cache.set(key, m);
  return m;
}
function stripKeys(o) { const r = { ...o }; delete r.unique; return r; }
