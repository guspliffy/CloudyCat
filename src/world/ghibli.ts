import * as THREE from 'three';

// The shared look for everything in the world (docs/ART-GUIDE.md section 1).
// Lambert lighting from three.js (so shadows, fog and lights just work), then the result is re-painted:
// the light level is split into two soft bands like a background painting, lit colours lean warm,
// and shade is the base colour darkened and pulled toward violet, never grey.
// Wind is one object every moving thing reads.

export const WIND = {
  dir: new THREE.Vector2(-0.8, -0.6).normalize(),
  base: 0.35,
  gust: 0,
  time: 0,
};

export const SHARED = {
  uTime: { value: 0 },
  uGust: { value: 0 },
  uWindDir: { value: WIND.dir.clone() },
  uShadeL: { value: 0.3 }, // light level in full shade, as a fraction of full sun
  uFullLit: { value: 1.2 },
  uSunTint: { value: new THREE.Color('#FFF4E0') },
  uShadeTint: { value: new THREE.Color('#4C4878') },
  uPlayer: { value: new THREE.Vector3(0, -99, 0) },
  uPlayerVel: { value: new THREE.Vector3() },
};

let gustT = 0, gustNext = 4, gustPhase = -1;
export function updateWind(dt: number) {
  WIND.time += dt;
  SHARED.uTime.value = WIND.time;
  // a gust rises over 1.2 s every 7 to 11 s, holds 1.5 s, falls over 2 s
  gustNext -= dt;
  if (gustNext < 0 && gustPhase < 0) { gustPhase = 0; gustT = 0; }
  if (gustPhase >= 0) {
    gustT += dt;
    WIND.gust = gustT < 1.2 ? THREE.MathUtils.smoothstep(gustT, 0, 1.2) : gustT < 2.7 ? 1 : 1 - THREE.MathUtils.smoothstep(gustT, 2.7, 4.7);
    if (gustT > 4.7) { gustPhase = -1; gustNext = 7 + Math.random() * 4; WIND.gust = 0; }
  }
  SHARED.uGust.value = WIND.gust;
}

/** Lights tell the paint pass what "full sun" and "full shade" mean. */
export function setLightLevels(sunIntensity: number, hemiIntensity: number) {
  SHARED.uFullLit.value = (sunIntensity + hemiIntensity) / Math.PI;
  SHARED.uShadeL.value = hemiIntensity / (sunIntensity + hemiIntensity);
}

const PAINT_PARS = /* glsl */ `
uniform float uShadeL; uniform float uFullLit; uniform vec3 uSunTint; uniform vec3 uShadeTint;
uniform float uTime; uniform float uGust; uniform vec2 uWindDir;
`;
const PAINT = /* glsl */ `
{
  vec3 baseC = max(diffuseColor.rgb, vec3(0.002));
  vec3 irr = (outgoingLight - totalEmissiveRadiance) / baseC;
  float L = dot(irr, vec3(0.299, 0.587, 0.114)) / uFullLit;
  float w = clamp((L - uShadeL * 0.85) / (1.0 - uShadeL * 0.85), 0.0, 1.2);
  float band = smoothstep(0.06, 0.2, w) * 0.55 + smoothstep(0.48, 0.62, w) * 0.45;
  band = mix(band, clamp(w, 0.0, 1.0), 0.25);
  float lum = dot(baseC, vec3(0.299, 0.587, 0.114));
  vec3 shade = mix(baseC * 0.55, uShadeTint * lum * 1.6, 0.35);
  vec3 lit = baseC * uSunTint * (1.0 + max(w - 1.0, 0.0));
  outgoingLight = mix(shade, lit, band) + totalEmissiveRadiance;
}
`;

export interface PaintOpts {
  /** vertex code run on `transformed` (object space) after begin_vertex; can use uTime, uGust, uWindDir, and `vec3 wpos0` (world position before displacement). */
  vertex?: string;
  vertexPars?: string;
  /** extra uniforms */
  uniforms?: Record<string, THREE.IUniform>;
}

/** Patch a Lambert (or any lit built-in) material to the painted look. */
export function paint<M extends THREE.Material>(m: M, opts: PaintOpts = {}): M {
  const key = (opts.vertex ?? '') + (opts.vertexPars ?? '');
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SHARED, opts.uniforms ?? {});
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PAINT_PARS)
      .replace('#include <opaque_fragment>', PAINT + '\n#include <opaque_fragment>');
    if (opts.vertex) {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + PAINT_PARS + (opts.vertexPars ?? '') + '\nuniform vec3 uPlayer; uniform vec3 uPlayerVel;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 wposI = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wposI = instanceMatrix * wposI;
          #endif
          vec3 wpos0 = (modelMatrix * wposI).xyz;
          ${opts.vertex}`);
    }
  };
  m.customProgramCacheKey = () => 'paint:' + key;
  return m;
}

const matCache = new Map<string, THREE.MeshLambertMaterial>();
/** A painted Lambert material in a palette colour, shared by colour. */
export function pmat(color: string, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) {
  const k = color + JSON.stringify(Object.keys(extra).length ? extra : '');
  let m = matCache.get(k);
  if (!m) { m = paint(new THREE.MeshLambertMaterial({ color, ...extra })); matCache.set(k, m); }
  return m;
}

/** Vertex colour variant, for merged props and the ground. */
export function pmatVC(extra: Partial<THREE.MeshLambertMaterialParameters> = {}, opts: PaintOpts = {}) {
  return paint(new THREE.MeshLambertMaterial({ vertexColors: true, ...extra }), opts);
}

export const PAL = {
  zenith: '#4C7FC4', skyMid: '#8EB8E0', horizon: '#E9E6DC',
  cloudTop: '#FFFDF6', cloudBody: '#F4F0F2', cloudUnder: '#B3AED3', cloudDeep: '#8B88B4',
  hill1: '#7F99BE', hill2: '#9DB1CE', hill3: '#BCC8DE',
  grassTip: '#A9C867', grassMid: '#7DA651', grassRoot: '#4E7A55', grassShade: '#3E6356',
  leaf: '#8FBE5C', leafMid: '#6A9E55', leafShade: '#38664F', leafDeep: '#294B4A',
  bark: '#7A5E4A', path: '#CDB78F', pathStone: '#DCD2BC', wall: '#D8CDB6', plaster: '#F5E9D3',
  roof: '#C8775A', clay: '#C88D69', wood: '#A98462', woodDark: '#6E5445',
  water: '#6FA6C8', sparkle: '#E6F4F9', moss: '#86A65A', lichen: '#B9C49A',
  hollyhock: '#E8A1B4', poppy: '#E0624F', buttercup: '#F2CF5B', daisy: '#FBF7EC', lavender: '#A89CD2',
  ember: '#FFC46B', emberCore: '#FFE8B8', coldGlass: '#8A94A8', fog: '#C9D4E8',
};
