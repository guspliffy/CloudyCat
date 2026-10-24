import * as THREE from 'three';

// Soft smoke puffs drawn as camera-facing quads. Each puff is a little sphere of smoke:
// a noise-eroded disc, lit as if round (warm sun side, indigo shadow side, a bright rim when backlit),
// smeared along its own velocity so fast smoke streaks and slow smoke stays round.
// Puffs are sorted back to front every frame so the dark smoke layers read correctly.

export interface PuffSlot {
  pos: THREE.Vector3; vel: THREE.Vector3;
  size: number; alpha: number; seed: number;
  erode: number; // 0 round and dense, 1 torn into wisps
  light: number; // 0 smoke colour, 1 pale (thinned in the sun or dissolving)
  stretch: number; // how much velocity smears it
}

export const SMOKE_COLORS = {
  shadow: new THREE.Color('#1F1B33'),
  base: new THREE.Color('#3D3860'),
  lit: new THREE.Color('#8A7FB5'),
  pale: new THREE.Color('#B8B0D6'),
  rim: new THREE.Color('#FFD9A0'),
};

const ATTRS = ['iPos', 'iVel', 'iData', 'iLook'];

export class SmokeRenderer {
  mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private aPos: Float32Array; private aVel: Float32Array; private aData: Float32Array; private aLook: Float32Array;
  private order: number[] = [];
  private depth: Float32Array;
  private byDepth = (a: number, b: number) => this.depth[a] - this.depth[b];
  material: THREE.ShaderMaterial;

  constructor(private max: number) {
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(2, 2);
    g.index = quad.index; g.setAttribute('position', quad.getAttribute('position'));
    this.aPos = new Float32Array(max * 3); this.aVel = new Float32Array(max * 4);
    this.aData = new Float32Array(max * 4); this.aLook = new Float32Array(max * 2);
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.aPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iVel', new THREE.InstancedBufferAttribute(this.aVel, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iData', new THREE.InstancedBufferAttribute(this.aData, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iLook', new THREE.InstancedBufferAttribute(this.aLook, 2).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    this.geo = g;
    this.depth = new Float32Array(max);
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 },
        uSunV: { value: new THREE.Vector3(0, 1, 0) }, // sun direction in view space
        uShadow: { value: SMOKE_COLORS.shadow }, uBase: { value: SMOKE_COLORS.base }, uLit: { value: SMOKE_COLORS.lit },
        uPale: { value: SMOKE_COLORS.pale }, uRim: { value: SMOKE_COLORS.rim },
        uSunCol: { value: new THREE.Color(1, 0.9, 0.75) }, uSkyCol: { value: new THREE.Color(0.75, 0.8, 0.95) },
      }]),
      vertexShader: /* glsl */ `
        attribute vec3 iPos; attribute vec4 iVel; attribute vec4 iData; attribute vec2 iLook;
        varying vec2 vUv; varying vec4 vData; varying vec2 vLook; varying float vStretch;
        #include <fog_pars_vertex>
        void main(){
          vec4 mvPosition = viewMatrix * vec4(iPos, 1.0);
          float size = iData.x;
          vec2 sv = (viewMatrix * vec4(iVel.xyz, 0.0)).xy;
          float sl = length(sv);
          vec2 dir = sl > 1e-4 ? sv / sl : vec2(1.0, 0.0);
          vec2 perp = vec2(-dir.y, dir.x);
          float st = 1.0 + min(sl * iVel.w, 1.6);
          vec2 q = position.xy;
          vec2 off = dir * dot(q, dir) * st + perp * dot(q, perp) / sqrt(st);
          off -= dir * (st - 1.0) * 0.6; // the smear trails behind
          mvPosition.xy += off * size;
          gl_Position = projectionMatrix * mvPosition;
          float a = iData.z * 6.2831;
          vUv = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
          vData = iData; vLook = iLook; vStretch = st;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uSunV, uShadow, uBase, uLit, uPale, uRim, uSunCol, uSkyCol;
        varying vec2 vUv; varying vec4 vData; varying vec2 vLook; varying float vStretch;
        #include <fog_pars_fragment>
        float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),
                     mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z); }
        void main(){
          float r = length(vUv);
          if (r > 1.0) discard;
          float seed = vData.z * 37.0; float erode = vData.w;
          vec3 np = vec3(vUv * 1.7 + seed, uTime * 0.35 + seed * 0.5);
          float n = n3(np) * 0.62 + n3(np * 2.3 + 4.1) * 0.38;
          float dens = 1.0 - smoothstep(0.25 + 0.2 * erode, 1.0, r);
          dens -= (1.0 - n) * (0.35 + 0.9 * erode) * (0.35 + 0.65 * r);
          dens = clamp(dens * (1.7 - 0.5 * erode), 0.0, 1.0);
          if (dens < 0.01) discard;
          // lit like a soft sphere
          vec3 nrm = normalize(vec3(vUv * 0.85, sqrt(max(0.0, 1.0 - r * r * 0.72))));
          float sun = dot(nrm, uSunV);
          float wrap = clamp(sun * 0.55 + 0.45, 0.0, 1.0);
          vec3 c = mix(uShadow, uBase, smoothstep(0.0, 0.55, wrap));
          c = mix(c, uLit, smoothstep(0.55, 1.0, wrap) * 0.55);
          c += uSkyCol * 0.06 * (0.5 + 0.5 * nrm.y);
          float light = vLook.x;
          c = mix(c, uPale * mix(0.8, 1.05, wrap), light * 0.8);
          // warm rim where the sun is behind, cool silver edge otherwise
          float edge = smoothstep(0.45, 1.0, r) * dens;
          float back = clamp(-uSunV.z * 0.5 + 0.5, 0.0, 1.0);
          c += uRim * edge * (0.12 + 0.55 * back * back) * (0.6 + 0.4 * wrap) * vLook.y;
          gl_FragColor = vec4(c, dens * vData.y);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  /** Upload puffs, sorted back to front for this camera. */
  write(slots: PuffSlot[], camera: THREE.Camera, time: number) {
    const n = Math.min(slots.length, this.max);
    const vm = camera.matrixWorldInverse.elements;
    this.order.length = n;
    for (let i = 0; i < n; i++) {
      const p = slots[i].pos;
      this.depth[i] = vm[2] * p.x + vm[6] * p.y + vm[10] * p.z + vm[14];
      this.order[i] = i;
    }
    this.order.sort(this.byDepth);
    for (let k = 0; k < n; k++) {
      const s = slots[this.order[k]];
      this.aPos[k * 3] = s.pos.x; this.aPos[k * 3 + 1] = s.pos.y; this.aPos[k * 3 + 2] = s.pos.z;
      this.aVel[k * 4] = s.vel.x; this.aVel[k * 4 + 1] = s.vel.y; this.aVel[k * 4 + 2] = s.vel.z; this.aVel[k * 4 + 3] = s.stretch;
      this.aData[k * 4] = s.size; this.aData[k * 4 + 1] = s.alpha; this.aData[k * 4 + 2] = s.seed; this.aData[k * 4 + 3] = s.erode;
      this.aLook[k * 2] = s.light; this.aLook[k * 2 + 1] = 1;
    }
    this.geo.instanceCount = n;
    for (const name of ATTRS) (this.geo.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
    this.material.uniforms.uTime.value = time;
  }

  setSun(sunWorld: THREE.Vector3, camera: THREE.Camera) {
    this.material.uniforms.uSunV.value.copy(sunWorld).transformDirection(camera.matrixWorldInverse);
  }
}

// A cheap divergence-free-looking swirl field for drifting smoke (sum of rotated sines).
export function swirl(out: THREE.Vector3, x: number, y: number, z: number, t: number) {
  const a = Math.sin(y * 3.1 + t * 0.9) + Math.cos(z * 2.3 - t * 0.7);
  const b = Math.sin(z * 2.7 + t * 0.8) + Math.cos(x * 3.3 + t * 0.6);
  const c = Math.sin(x * 2.9 - t * 0.5) + Math.cos(y * 2.1 + t * 1.1);
  return out.set(a, c * 0.6, b).multiplyScalar(0.5);
}
