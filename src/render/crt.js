// Shaders: ink outlines (office + replay), the pixel/OSD composite for the replay feed, and the
// CRT tube material every monitor screen uses.
import * as THREE from 'three';

// Screen-space edge detection on depth + normals. Depth is tested with the Laplacian of 1/z, which
// is zero across any flat surface no matter how steep, so floors never get false lines.
const EDGE_GLSL = /* glsl */`
  float invZ(float d) { float z = cameraNear * cameraFar / (cameraFar - d * (cameraFar - cameraNear)); return 1.0 / z; }
  float edgeAt(vec2 uv, vec2 px, float depthK, float normK) {
    float c = invZ(texture2D(tDepth, uv).r);
    float l = invZ(texture2D(tDepth, uv - vec2(px.x, 0.)).r), r = invZ(texture2D(tDepth, uv + vec2(px.x, 0.)).r);
    float u = invZ(texture2D(tDepth, uv + vec2(0., px.y)).r), d = invZ(texture2D(tDepth, uv - vec2(0., px.y)).r);
    float lap = abs(l + r + u + d - 4.0 * c) / max(c, 1e-6);
    float de = smoothstep(depthK, depthK * 2.0, lap);
    vec3 n = texture2D(tNormal, uv).rgb * 2. - 1.;
    float nd = 0.;
    nd = max(nd, 1. - dot(n, texture2D(tNormal, uv - vec2(px.x, 0.)).rgb * 2. - 1.));
    nd = max(nd, 1. - dot(n, texture2D(tNormal, uv + vec2(px.x, 0.)).rgb * 2. - 1.));
    nd = max(nd, 1. - dot(n, texture2D(tNormal, uv + vec2(0., px.y)).rgb * 2. - 1.));
    nd = max(nd, 1. - dot(n, texture2D(tNormal, uv - vec2(0., px.y)).rgb * 2. - 1.));
    float ne = smoothstep(normK, normK * 1.6, nd);
    return max(de, ne);
  }
`;

export const InkShader = {
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null }, tNormal: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) }, thickness: { value: 1.5 },
    cameraNear: { value: 0.1 }, cameraFar: { value: 100 }, ink: { value: new THREE.Color(0x10141f) },
    vignette: { value: 0.35 }, time: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tDepth, tNormal; uniform vec2 resolution; uniform float thickness, cameraNear, cameraFar, vignette, time; uniform vec3 ink;
    varying vec2 vUv;
    ${EDGE_GLSL}
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 q = vUv - 0.5;
      float r2 = dot(q, q);
      // lens: a touch of colour fringing toward the corners, like an old camcorder
      vec2 off = q * r2 * 0.012;
      vec4 col = texture2D(tDiffuse, vUv);
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.b = texture2D(tDiffuse, vUv - off).b;
      vec2 px = thickness / resolution;
      float e = edgeAt(vUv, px, 0.012, 0.35);
      // slight wobble in the line weight so it reads hand-inked
      float w = 0.85 + 0.15 * hash(floor(vUv * resolution / 3.0));
      col.rgb = mix(col.rgb, ink, clamp(e * w, 0., 1.) * 0.92);
      // grade: teal shadows, warm highlights, a little extra saturation
      float l = dot(col.rgb, vec3(0.299, 0.587, 0.114));
      col.rgb = max(mix(vec3(l), col.rgb, 1.07), 0.0);
      col.rgb += vec3(-0.006, 0.006, 0.014) * (1.0 - smoothstep(0.0, 0.35, l));
      col.rgb *= mix(vec3(1.0), vec3(1.04, 1.0, 0.94), smoothstep(0.3, 1.0, l));
      col.rgb *= 1.0 - vignette * r2 * 1.8;
      // film grain, stronger in the shadows
      float g = hash(floor(vUv * resolution / 1.5) + fract(time * 7.13) * 100.0) - 0.5;
      col.rgb += g * mix(0.035, 0.012, smoothstep(0.0, 0.5, l));
      gl_FragColor = col;
    }`,
};

// Replay feed composite: chunky-pixel outlines around the players, a touch of posterize, then
// the on-screen display (timecode, labels, readouts) drawn over the top.
export function pixelMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: null }, tDepth: { value: null }, tNormal: { value: null }, tOSD: { value: null },
      resolution: { value: new THREE.Vector2(480, 360) }, cameraNear: { value: 0.3 }, cameraFar: { value: 600 },
      ink: { value: new THREE.Color(0x0d1118) }, ghost: { value: 0 }, levels: { value: 9 },
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tColor, tDepth, tNormal, tOSD; uniform vec2 resolution; uniform float cameraNear, cameraFar, ghost, levels; uniform vec3 ink;
      varying vec2 vUv;
      ${EDGE_GLSL}
      void main() {
        vec4 col = texture2D(tColor, vUv);
        float e = edgeAt(vUv, 1.0 / resolution, 0.05, 0.6) * (1.0 - ghost * 0.7);
        col.rgb = mix(col.rgb, ink, e * 0.85);
        // 16-bit console look: a reduced palette with a 4x4 ordered dither
        vec2 bp = mod(floor(vUv * resolution), 4.0);
        int ix = int(bp.x), iy = int(bp.y);
        float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
        float th = m[iy * 4 + ix] / 16.0 - 0.5;
        vec3 g = pow(max(col.rgb, 0.0), vec3(1.0 / 2.2));
        g = floor(g * levels + 0.5 + th * 0.9) / levels;
        col.rgb = pow(clamp(g, 0.0, 1.0), vec3(2.2));
        vec4 o = texture2D(tOSD, vUv);
        col.rgb = mix(col.rgb, o.rgb, o.a);
        gl_FragColor = vec4(col.rgb, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
}

// Barrel distortion shared with the input mapping in JS (stage.js), so a click lands on the
// replay pixel that is drawn under the cursor.
export const CURVE = 0.065;
export function curveUV(u, v, k = CURVE) {
  const cx = u - 0.5, cy = v - 0.5, d = (cx * cx + cy * cy) * k;
  return [u + cx * (1 + d) * d, v + cy * (1 + d) * d];
}

export function crtMaterial(tex, o = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tScreen: { value: tex }, rows: { value: o.rows ?? 360 }, curve: { value: o.curve ?? CURVE },
      power: { value: 1 }, time: { value: 0 }, mono: { value: o.mono ? 1 : 0 }, gain: { value: o.gain ?? 1.0 },
      tint: { value: new THREE.Color(o.tint ?? 0xe8ffe0) }, noise: { value: 0 }, roll: { value: 0 }, vhs: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tScreen; uniform float rows, curve, power, time, mono, gain, noise, roll, vhs; uniform vec3 tint;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 c = vUv - 0.5; float d = dot(c, c) * curve;
        vec2 uv = vUv + c * (1.0 + d) * d;
        // power on/off: picture collapses to a bright line, then a dot
        float p = clamp(power, 0., 1.);
        float sy = mix(0.004, 1.0, smoothstep(0.0, 0.6, p)), sx = mix(0.02, 1.0, smoothstep(0.0, 0.25, p));
        uv = (uv - 0.5) / vec2(sx, sy) + 0.5;
        uv.y = fract(uv.y + roll);
        // VHS playback: line jitter, a slow tracking band that tears sideways, head-switching at the foot
        float band = 0.0, foot = 0.0;
        if (vhs > 0.001) {
          float rowN = floor(uv.y * rows);
          float jit = hash(vec2(rowN, floor(time * 24.0))) - 0.5;
          float by = fract(time * 0.055 + 0.35);
          band = smoothstep(0.07, 0.0, abs(uv.y - by));
          foot = smoothstep(0.05, 0.0, uv.y);
          uv.x += (jit * 0.0012 + band * sin(uv.y * 90.0 + time * 40.0) * 0.010 + foot * (hash(vec2(rowN, time)) - 0.5) * 0.06) * vhs;
        }
        vec3 col = vec3(0.0);
        if (uv.x > 0. && uv.x < 1. && uv.y > 0. && uv.y < 1.) {
          vec3 s = texture2D(tScreen, uv).rgb;
          // a little horizontal colour bleed like composite video
          vec3 s2 = texture2D(tScreen, uv + vec2(1.5 / (rows * 1.333), 0.)).rgb;
          s = mix(s, vec3(s.r, s2.g, s2.b), 0.35);
          if (vhs > 0.001) {
            float cs = vhs * 0.002;
            s = vec3(texture2D(tScreen, uv + vec2(cs, 0.)).r, s.g, texture2D(tScreen, uv - vec2(cs, 0.)).b);
          }
          // halation: bright phosphor bleeds a soft glow into the glass around it
          vec2 hs = vec2(2.5 / (rows * 1.333), 2.5 / rows);
          vec3 halo = texture2D(tScreen, uv + vec2(hs.x, 0.)).rgb + texture2D(tScreen, uv - vec2(hs.x, 0.)).rgb
                    + texture2D(tScreen, uv + vec2(0., hs.y)).rgb + texture2D(tScreen, uv - vec2(0., hs.y)).rgb;
          s += halo * 0.06;
          if (mono > 0.5) s = vec3(dot(s, vec3(0.3, 0.59, 0.11)));
          float line = 0.7 + 0.3 * pow(abs(sin(uv.y * rows * 3.14159)), 1.4);
          // aperture grille, at the display's pixel pitch so it never beats against the picture
          float k = mod(gl_FragCoord.x, 3.0);
          vec3 mask = k < 1.0 ? vec3(1.12, 0.92, 0.92) : k < 2.0 ? vec3(0.92, 1.12, 0.92) : vec3(0.92, 0.92, 1.12);
          col = s * tint * line * gain * mask;
          col += (hash(uv * 500.0 + time) - 0.5) * (0.03 + noise * 0.4);
          col *= 0.94 + 0.06 * sin(time * 9.0 + uv.y * 4.0);
          col += (band * step(0.985, hash(uv * vec2(300.0, rows) + time)) * 0.8 + foot * hash(uv * 400.0 + time * 3.0) * 0.5) * vhs;
          vec2 q = uv - 0.5;
          col *= 1.0 - dot(q, q) * 1.1;
          if (p < 0.6) col += vec3(0.6, 0.9, 0.8) * (1.0 - smoothstep(0.0, 0.6, p)) * step(0.001, p);
        }
        // inner glass edge falls off into the dark tube
        float edge = smoothstep(0.0, 0.035, min(min(uv.x, 1. - uv.x), min(uv.y, 1. - uv.y)));
        col *= edge * step(0.001, p);
        col += vec3(0.04, 0.05, 0.05) * (1.0 - dot(c, c) * 2.0);
        // the glass: a soft window reflection top-left and a long diagonal sheen
        float hl = smoothstep(0.42, 0.0, length((vUv - vec2(0.24, 0.84)) * vec2(1.0, 1.7)));
        float sheen = exp(-pow((vUv.x * 0.8 + vUv.y - 1.05) * 6.0, 2.0)) * smoothstep(0.2, 0.9, vUv.y);
        col += vec3(0.75, 0.85, 1.0) * (hl * 0.07 + sheen * 0.035);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
