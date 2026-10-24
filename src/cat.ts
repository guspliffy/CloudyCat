import * as THREE from 'three';
import { SmokeRenderer, PuffSlot, swirl, SMOKE_COLORS } from './smoke';

// Moth, the smoke cat. A clear, cute cat shape (round head, big eyes, four legs) whose body is smoke:
// - a dark core with slow smoke flowing through it, so the silhouette always reads as a cat
// - soft puffs on the surface, each on a spring, so the rear and the back lag and smear when Moth moves
//   and spill forward when Moth stops
// - a long buoyant tail that floats up like rising smoke and streams behind at speed
// - wisps that peel off the back, the tail tip and the ears, curl in the air and dissolve: the trail
// Units in the design below are head radii (HU); the cat is scaled to metres by HU. Facing +Z, feet at y = 0.
export const HU = 0.16;

export const PALETTE = {
  base: '#3D3860', shadow: '#24203A', rim: '#FFD9A0', glow: '#8E7FB8',
  irisInner: '#FFE3A3', irisOuter: '#F7A94C', pupil: '#1A1226', nose: '#E08F98', blush: '#E79AA6', thin: '#9A94B8', innerEar: '#8C6A8E',
};

type V3 = [number, number, number];
const lin = (h: string) => new THREE.Color(h);

function bodyMaterial() {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uBase: { value: lin(PALETTE.base) }, uShadow: { value: lin(PALETTE.shadow) }, uLit: { value: SMOKE_COLORS.lit },
      uRim: { value: lin(PALETTE.rim) }, uGlow: { value: lin(PALETTE.glow) }, uPale: { value: SMOKE_COLORS.pale },
      uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.3).normalize() },
      uSunCol: { value: new THREE.Color(1.0, 0.9, 0.75) }, uSkyCol: { value: new THREE.Color(0.6, 0.68, 0.9) },
      uTime: { value: 0 }, uDrift: { value: new THREE.Vector3() }, uRoot: { value: new THREE.Vector3() },
      uFace: { value: new THREE.Vector3() }, uPale01: { value: 0 },
    }]),
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase, uShadow, uLit, uRim, uGlow, uPale, uSunDir, uSunCol, uSkyCol, uDrift, uRoot, uFace;
      uniform float uTime, uPale01;
      varying vec3 vN; varying vec3 vW;
      #include <fog_pars_fragment>
      float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW);
        // smoke flowing through the body: slow rising swirls, streaming back when Moth moves
        vec3 lp = (vW - uRoot) * 9.0 + uDrift;
        lp.y -= uTime * 0.5;
        float w = n3(lp + vec3(n3(lp * 0.5 + uTime * 0.2) * 2.0));
        float w2 = n3(lp * 2.1 + 7.0);
        float flow = w * 0.7 + w2 * 0.3;
        float calm = smoothstep(0.07, 0.13, distance(vW, uFace)); // keep the face clean
        float wrap = clamp((dot(n, uSunDir) + 0.55) / 1.55, 0.0, 1.0);
        vec3 base = mix(uShadow, uBase, smoothstep(0.22, 0.42, wrap));
        base = mix(base, uLit, smoothstep(0.7, 0.85, wrap) * 0.35);
        base *= 1.0 + (flow - 0.5) * 0.55 * calm;
        base = mix(base, uPale, uPale01 * 0.7);
        float sky = 0.5 + 0.5 * n.y;
        vec3 c = base * (0.75 + uSkyCol * sky * 0.35 + uSunCol * wrap * 0.35);
        float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.4);
        float back = pow(clamp(dot(-v, uSunDir), 0.0, 1.0), 2.0);
        c += uRim * fres * (0.06 + 0.35 * wrap * wrap + 1.4 * back) * (0.7 + 0.6 * flow);
        c += uGlow * fres * 0.18;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

function eyeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uInner: { value: lin(PALETTE.irisInner) }, uOuter: { value: lin(PALETTE.irisOuter) }, uPupil: { value: lin(PALETTE.pupil) },
      uLid: { value: 0 }, uLidCol: { value: lin(PALETTE.shadow) }, uPupilW: { value: 0.5 }, uHappy: { value: 0 }, uLook: { value: new THREE.Vector2() },
    },
    vertexShader: /* glsl */ `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uInner, uOuter, uPupil, uLidCol; uniform float uLid, uPupilW, uHappy; uniform vec2 uLook;
      varying vec3 vP;
      void main(){
        vec3 q = normalize(vP);
        vec2 uv = q.xy / 0.8;
        float ir = length(uv);
        vec3 c = mix(uInner, uOuter, smoothstep(0.05, 1.0, ir));
        c *= 1.0 - 0.4 * smoothstep(0.8, 1.0, ir);
        vec2 pu = uv - uLook * 0.12;
        float pup = smoothstep(1.0, 0.86, length(pu / vec2(uPupilW, 0.7)));
        c = mix(c, uPupil, pup);
        float cl = smoothstep(0.34, 0.2, length(uv - vec2(-0.38, 0.42))) + smoothstep(0.16, 0.08, length(uv - vec2(0.42, -0.36)));
        c += vec3(1.0) * cl * 1.4;
        c *= 1.3;
        float lidLine = mix(1.05, -1.25, uLid);
        float arc = 0.15 - 0.85 * uv.x * uv.x;
        float lineY = mix(lidLine, arc, uHappy);
        float covered = mix(step(lineY, uv.y), 1.0, uHappy);
        float edge = 1.0 - smoothstep(0.0, 0.12, abs(uv.y - lineY));
        c = mix(c, uLidCol, covered);
        c = mix(c, uInner * 0.9, edge * uHappy * step(abs(uv.x), 0.95));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// --- the design ---
const PIV = {
  body: [0, 1.45, -0.15] as V3,
  head: [0, 1.85, 0.75] as V3,
  legs: [[0.42, 1.12, 0.6], [-0.42, 1.12, 0.6], [0.47, 1.12, -0.85], [-0.47, 1.12, -0.85]] as V3[], // FL FR BL BR
  tailRoot: [0, 1.65, -1.05] as V3,
};
const BODY: { c: V3; r: V3 }[] = [
  { c: [0, 1.45, -0.15], r: [0.56, 0.54, 0.95] },
  { c: [0, 1.65, 0.55], r: [0.5, 0.52, 0.44] },
  { c: [0.38, 1.27, -0.8], r: [0.3, 0.4, 0.42] },
  { c: [-0.38, 1.27, -0.8], r: [0.3, 0.4, 0.42] },
];
const HEAD_C: V3 = [0, 2.55, 1.05];
const HEAD: { c: V3; r: V3 }[] = [
  { c: HEAD_C, r: [1.0, 0.93, 0.94] },
  { c: [0.6, 2.3, 1.25], r: [0.42, 0.4, 0.42] },
  { c: [-0.6, 2.3, 1.25], r: [0.42, 0.4, 0.42] },
  { c: [0, 2.28, 1.78], r: [0.34, 0.24, 0.28] },
];
const EARS: [V3, V3][] = [[[0.5, 3.15, 0.95], [0.82, 3.95, 0.85]], [[-0.5, 3.15, 0.95], [-0.8, 3.97, 0.83]]];
const EYES: V3[] = [[0.42, 2.56, 1.83], [-0.42, 2.56, 1.83]];
const NOSE: V3 = [0, 2.33, 2.08];
const BLUSH: V3[] = [[0.63, 2.26, 1.72], [-0.63, 2.26, 1.72]];
const FACE: V3 = [0, 2.42, 1.95];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

interface Puff extends PuffSlot {
  bone: THREE.Object3D; local: THREE.Vector3; target: THREE.Vector3; prevTarget: THREE.Vector3;
  k: number; lag: number; maxOff: number; baseSize: number; baseAlpha: number; rear: number; halo: number;
}
interface Wisp extends PuffSlot { age: number; life: number; size0: number; size1: number; alpha0: number; buoy: number; drag: number; turb: number }

const TAIL_N = 10;
const TAIL_SEG = 0.075;
// rest shape of the tail in cat space: up and back, then the tip curls forward
const TAIL_DIRS: V3[] = Array.from({ length: TAIL_N - 1 }, (_, i) => {
  const a = -0.35 + (i / (TAIL_N - 2)) * 2.6; // angle from straight back, rising over the top
  return [0, Math.sin(a) * 1.0 + 0.25, -Math.cos(a)];
});

export class Cat {
  /** Posed by main: position and yaw of the cat. */
  root = new THREE.Group();
  /** World-space parts: smoke, tail tip, carry anchor, ground shadow. Add to the scene. */
  world = new THREE.Group();
  smoke = new SmokeRenderer(520);
  tailTip = new THREE.Object3D();
  carryAnchor = new THREE.Object3D();
  blob: THREE.Mesh;
  thin = 0;
  float = 0;

  private scaleGroup = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private ears: THREE.Group[] = [];
  private legs: THREE.Group[] = [];
  private mat = bodyMaterial();
  private eyeMats: THREE.ShaderMaterial[] = [];
  private puffs: Puff[] = [];
  private wisps: Wisp[] = [];
  private wispPool: Wisp[] = [];
  private tail: THREE.Vector3[] = []; private tailPrev: THREE.Vector3[] = [];
  private tailPuffs: Puff[] = [];
  private tailRoot = new THREE.Object3D();
  private earTips: THREE.Object3D[] = [];
  private pawPts: THREE.Object3D[] = [];
  private slots: PuffSlot[] = [];
  private t = 0;
  private gait = 0; private lastGait = 0;
  private squash = 0; private squashV = 0;
  private blinkT = -1; private nextBlink = 2;
  private earT = -1; private nextEar = 5;
  private idle = 0;
  private bapT = -1;
  private vel = new THREE.Vector3();
  private speed01 = 0;
  private drift = new THREE.Vector3();
  private acc = { tail: 0, back: 0, ear: 0 };
  private rand = rng(7);
  private v1 = new THREE.Vector3(); private v2 = new THREE.Vector3(); private v3 = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private started = false;

  constructor() {
    this.root.add(this.scaleGroup);
    this.scaleGroup.scale.setScalar(HU);
    this.scaleGroup.add(this.body);
    this.body.position.set(...PIV.body);
    this.build();
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    this.world.add(this.smoke.mesh, this.tailTip, this.carryAnchor);
    const blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, color: '#2A2440', opacity: 0.55 });
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75), blobMat);
    this.blob.rotation.x = -Math.PI / 2; this.blob.renderOrder = 1;
    this.world.add(this.blob);
    for (let i = 0; i < 360; i++) this.wispPool.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 0, alpha: 0, seed: 0, erode: 0, light: 0, stretch: 0, age: 0, life: 1, size0: 0, size1: 0, alpha0: 0, buoy: 0, drag: 0, turb: 0 });
  }

  get material() { return this.mat; }

  private ellipsoid(group: THREE.Group, pivot: V3, c: V3, r: V3, mat: THREE.Material = this.mat) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), mat);
    m.scale.set(...r); m.position.set(...sub(c, pivot)); group.add(m); return m;
  }
  private segment(group: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, r: number, cone = false, mat: THREE.Material = this.mat) {
    const len = a.distanceTo(b);
    const geo = cone ? new THREE.ConeGeometry(r, len, 20, 1) : new THREE.CapsuleGeometry(r, len, 6, 14);
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    group.add(m); return m;
  }

  /** Scatter puffs over an ellipsoid, skipping the face, the belly and points hidden inside other shapes. */
  private scatter(bone: THREE.Object3D, pivot: V3, c: V3, r: V3, count: number, size: [number, number], spring: { k: number; lag: number; maxOff: number }, seed: number, keep: (p: V3, n: V3) => boolean, halo = 0) {
    const rand = rng(seed);
    let made = 0, tries = 0;
    while (made < count && tries++ < count * 60) {
      const u = rand() * 2 - 1, th = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const d: V3 = [s * Math.cos(th), u, s * Math.sin(th)];
      const p: V3 = [c[0] + d[0] * r[0], c[1] + d[1] * r[1], c[2] + d[2] * r[2]];
      const nn = new THREE.Vector3(d[0] / r[0], d[1] / r[1], d[2] / r[2]).normalize();
      const n: V3 = [nn.x, nn.y, nn.z];
      if (!keep(p, n)) continue;
      const sz = (size[0] + (size[1] - size[0]) * rand()) * HU;
      // sit the puff a little inside the surface so it softens the edge without bloating the shape
      const inset = (sz / HU) * (halo ? -0.05 : 0.2);
      const local = new THREE.Vector3(p[0] - n[0] * inset, p[1] - n[1] * inset, p[2] - n[2] * inset).sub(new THREE.Vector3(...pivot));
      const rear = THREE.MathUtils.clamp((-p[2] + 0.3) / 1.4, 0, 1);
      this.puffs.push({
        bone, local, target: new THREE.Vector3(), prevTarget: new THREE.Vector3(), pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        size: sz, baseSize: sz, alpha: halo ? 0.4 : 0.9, baseAlpha: halo ? 0.4 : 0.9, seed: rand(), erode: halo ? 0.45 + rand() * 0.2 : 0.2 + rand() * 0.2,
        light: halo ? 0.3 : 0, stretch: halo ? 0.08 : 0.035, halo,
        k: spring.k * (1 - rear * 0.45) * (halo ? 0.5 : 1), lag: spring.lag * (1 + rear * 1.5) * (halo ? 2 : 1), maxOff: spring.maxOff * (1 + rear) * (halo ? 2.2 : 1), rear,
      });
      made++;
    }
  }

  private build() {
    // body core
    for (const b of BODY) this.ellipsoid(this.body, PIV.body, b.c, b.r);
    const keepBody = (p: V3, n: V3) => !(n[1] < -0.35 && p[1] < 1.3) && !(p[2] > 0.5 && p[1] > 1.8 && n[2] > 0.2);
    this.scatter(this.body, PIV.body, BODY[0].c, [0.6, 0.58, 0.98], 46, [0.4, 0.6], { k: 170, lag: 0.03, maxOff: 0.09 }, 11, keepBody);
    this.scatter(this.body, PIV.body, BODY[1].c, [0.52, 0.55, 0.46], 16, [0.32, 0.46], { k: 260, lag: 0.015, maxOff: 0.05 }, 12, keepBody);
    this.scatter(this.body, PIV.body, BODY[2].c, BODY[2].r, 8, [0.32, 0.46], { k: 140, lag: 0.035, maxOff: 0.1 }, 13, keepBody);
    this.scatter(this.body, PIV.body, BODY[3].c, BODY[3].r, 8, [0.32, 0.46], { k: 140, lag: 0.035, maxOff: 0.1 }, 14, keepBody);
    // a soft outer halo of thinner smoke: the cloud around the cat, which lags most
    const keepHalo = (p: V3, n: V3) => keepBody(p, n) && n[1] > -0.2 && p[2] < 0.7;
    this.scatter(this.body, PIV.body, BODY[0].c, [0.66, 0.64, 1.05], 26, [0.55, 0.8], { k: 120, lag: 0.04, maxOff: 0.1 }, 15, keepHalo, 1);

    // head: smooth face, puffs only around the back, top and cheeks
    this.head.position.set(...sub(PIV.head, PIV.body));
    this.body.add(this.head);
    for (const h of HEAD) this.ellipsoid(this.head, PIV.head, h.c, h.r);
    const keepHead = (p: V3, n: V3) => {
      const f = sub(p, FACE);
      const onFace = Math.hypot(f[0] * 0.95, f[1] * 1.1, f[2] * 0.7) < 1.05 && n[2] > 0.05;
      return !onFace && !(n[1] < -0.5);
    };
    this.scatter(this.head, PIV.head, HEAD_C, [1.0, 0.93, 0.94], 24, [0.28, 0.42], { k: 420, lag: 0.006, maxOff: 0.03 }, 21, keepHead);
    this.scatter(this.head, PIV.head, HEAD[1].c, HEAD[1].r, 3, [0.24, 0.32], { k: 420, lag: 0.006, maxOff: 0.03 }, 22, keepHead);
    this.scatter(this.head, PIV.head, HEAD[2].c, HEAD[2].r, 3, [0.24, 0.32], { k: 420, lag: 0.006, maxOff: 0.03 }, 23, keepHead);

    const innerEar = new THREE.MeshBasicMaterial({ color: lin(PALETTE.innerEar) });
    for (const [a, b] of EARS) {
      const g = new THREE.Group(); g.position.set(...sub(a, PIV.head)); this.head.add(g);
      const va = new THREE.Vector3(0, 0, 0), vb = new THREE.Vector3(...sub(b, a));
      const ear = this.segment(g, va, vb, 0.4, true);
      ear.scale.z = 0.62;
      // soft inner ear
      const inner = this.segment(g, va.clone().add(new THREE.Vector3(0, 0.06, 0.15)), vb.clone().multiplyScalar(0.78).add(new THREE.Vector3(0, 0, 0.12)), 0.24, true, innerEar);
      inner.scale.z = 0.3;
      const et = new THREE.Object3D(); et.position.copy(vb); g.add(et); this.earTips.push(et);
      this.ears.push(g);
    }
    for (const e of EYES) {
      const m = eyeMaterial(); this.eyeMats.push(m);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.35, 28, 20), m);
      eye.position.set(...sub(e, PIV.head)); eye.rotation.y = Math.sign(e[0]) * 0.3;
      eye.scale.z = 0.7;
      this.head.add(eye);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: lin(PALETTE.nose) }));
    nose.scale.set(0.09, 0.062, 0.05); nose.position.set(...sub(NOSE, PIV.head)); this.head.add(nose);
    const blushMat = new THREE.MeshBasicMaterial({ color: lin(PALETTE.blush), transparent: true, opacity: 0.5, depthWrite: false });
    for (const b of BLUSH) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), blushMat);
      m.scale.set(0.2, 0.12, 0.04); m.position.set(...sub(b, PIV.head));
      m.lookAt(m.position.clone().sub(new THREE.Vector3(...sub(HEAD_C, PIV.head))).multiplyScalar(3));
      this.head.add(m);
    }

    // four legs, each a soft column with a round paw, set wide enough to read from behind
    PIV.legs.forEach((hip, i) => {
      const g = new THREE.Group(); g.position.set(...sub(hip, PIV.body)); this.body.add(g);
      const splay = Math.sign(hip[0]) * 0.05;
      const foot = new THREE.Vector3(splay, 0.22 - hip[1], 0.04);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, -foot.y, 16, 1), this.mat);
      leg.position.set(splay / 2, foot.y / 2, 0.02); leg.rotation.z = -splay / foot.y; g.add(leg);
      this.ellipsoid(g, [0, 0, 0], [0, 0, 0], [0.26, 0.2, 0.26]);
      const paw = this.ellipsoid(g, [0, 0, 0], [splay, 0.16 - hip[1], 0.1], [0.26, 0.17, 0.31]);
      paw.name = 'paw';
      const pp = new THREE.Object3D(); pp.position.set(splay, 0.05 - hip[1], 0.12); g.add(pp); this.pawPts.push(pp);
      this.legs.push(g);
      // smoke on the upper leg only, so the paws stay crisp
      const keep = (p: V3) => p[1] > -0.62;
      this.scatter(g, [0, 0, 0], [0, -0.3, 0], [0.25, 0.45, 0.25], 6, [0.24, 0.32], { k: 220, lag: 0.02, maxOff: 0.04 }, 30 + i, keep);
    });

    // tail root: the chain itself lives in world space
    this.tailRoot.position.set(...sub(PIV.tailRoot, PIV.body));
    this.body.add(this.tailRoot);
    for (let i = 0; i < TAIL_N; i++) { this.tail.push(new THREE.Vector3()); this.tailPrev.push(new THREE.Vector3()); }
    // two puffs per link, thinning out to the tip
    for (let i = 0; i < (TAIL_N - 1) * 3; i++) {
      const k = i / ((TAIL_N - 1) * 3 - 1);
      const sz = THREE.MathUtils.lerp(0.085, 0.06, k) * (1 + Math.sin(i * 2.3) * 0.18);
      this.tailPuffs.push({
        bone: this.tailRoot, local: new THREE.Vector3(), target: new THREE.Vector3(), prevTarget: new THREE.Vector3(),
        pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: sz, baseSize: sz, alpha: 0.85 - k * 0.3, baseAlpha: 0.85 - k * 0.3,
        seed: this.rand(), erode: 0.3 + k * 0.45, light: 0, stretch: 0.05, k: 300, lag: 0, maxOff: 0.04, rear: 1, halo: 0,
      });
    }
  }

  setLight(sunDir: THREE.Vector3, sunCol: THREE.Color, sky: THREE.Color, _ground?: THREE.Color) {
    const u = this.mat.uniforms;
    u.uSunDir.value.copy(sunDir); u.uSunCol.value.copy(sunCol).multiplyScalar(0.5); u.uSkyCol.value.copy(sky);
    this.sunDir.copy(sunDir);
    this.smoke.material.uniforms.uSkyCol.value.copy(sky);
  }
  private sunDir = new THREE.Vector3(0.5, 0.6, 0.3).normalize();

  kick(kind: 'jump' | 'double' | 'land' | 'bap', strength = 1) {
    if (kind === 'jump') { this.squashV += 5; this.puffRing(0.06, 8, 0.6, 0.05, 0.35); }
    if (kind === 'double') { this.squashV += 7; this.puffRing(0.12, 16, 1.6, 0.08, 0.6); this.shove(0, 1.4, 0); }
    if (kind === 'land') { this.squashV -= 4 + 5 * strength; if (strength > 0.15) { this.puffRing(0.03, 10 + Math.round(strength * 10), 0.8 + strength * 1.5, 0.06, 0.4); this.shove(0, -1.5 * strength, 0); } }
    if (kind === 'bap') { this.bapT = 0; }
    this.idle = 0;
  }

  /** Give every surface puff a push: they overshoot and settle, like smoke that got bumped. */
  private shove(x: number, y: number, z: number) {
    for (const p of this.puffs) p.vel.x += x * (0.5 + p.rear), p.vel.y += y * (0.5 + p.rear), p.vel.z += z * (0.5 + p.rear);
  }

  private puffRing(height: number, n: number, speed: number, size: number, alpha: number) {
    const c = this.root.position;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rand() * 0.4;
      const w = this.spawnWisp(); if (!w) return;
      w.pos.set(c.x + Math.cos(a) * 0.12, c.y + height, c.z + Math.sin(a) * 0.12);
      w.vel.set(Math.cos(a) * speed, 0.15 + this.rand() * 0.3, Math.sin(a) * speed);
      w.size0 = size; w.size1 = size * 2.6; w.life = 0.8 + this.rand() * 0.5; w.alpha0 = alpha; w.buoy = 0.5; w.drag = 3.5; w.turb = 0.6; w.light = 0.25;
    }
  }

  private spawnWisp(): Wisp | null {
    const w = this.wispPool.pop();
    if (!w) return null;
    w.age = 0; w.seed = this.rand(); w.stretch = 0.12; w.erode = 0.3; w.light = 0;
    this.wisps.push(w);
    return w;
  }

  /** speed01: ground speed as 0..1 of run speed. vel: world velocity of the cat. */
  update(dt: number, speed01: number, grounded: boolean, vel: THREE.Vector3) {
    this.t += dt;
    const t = this.t;
    this.vel.copy(vel);
    this.speed01 = speed01;
    if (speed01 > 0.05 || !grounded) this.idle = 0; else this.idle += dt;
    const vy = vel.y;

    // squash and stretch spring
    this.squashV += (-this.squash * 120 - this.squashV * 12) * dt;
    this.squash += this.squashV * dt;
    const air = grounded ? 0 : THREE.MathUtils.clamp(vy * 0.03, -0.12, 0.15);
    const s = THREE.MathUtils.clamp(this.squash * 0.06 + air, -0.25, 0.25);
    const fl = this.float;
    this.scaleGroup.scale.set(HU * (1 - s * 0.5 + fl * 0.1), HU * (1 + s - fl * 0.15), HU * (1 - s * 0.5 + fl * 0.1));

    // trot: diagonal pairs (FL with BR, FR with BL), paws lift on the forward swing
    this.lastGait = this.gait;
    this.gait += dt * (4 + speed01 * 9) * (speed01 > 0.03 && grounded ? 1 : 0);
    const amp = grounded ? Math.min(1, speed01 * 1.6) : 0;
    const tuck = grounded ? 0 : 0.6;
    const phases = [0, Math.PI, Math.PI, 0];
    const loaf = THREE.MathUtils.smoothstep(this.idle, 9, 11);
    this.legs.forEach((l, i) => {
      const ph = this.gait + phases[i];
      const front = i < 2;
      l.rotation.x = Math.sin(ph) * 0.65 * amp + (front ? -tuck * 0.5 : tuck * 0.6);
      const lift = Math.max(0, Math.cos(ph)) * 0.22 * amp;
      l.position.y = PIV.legs[i][1] - PIV.body[1] + lift + loaf * 0.4;
      l.scale.setScalar(1 - fl * 0.5);
      // a little smoke where a paw comes down
      if (amp > 0.2 && Math.cos(this.lastGait + phases[i]) > 0 && Math.cos(ph) <= 0) this.pawPuff(i);
    });

    // body bob, breathing, lean, idle loaf and stretch
    const breath = Math.sin(t * 1.6) * 0.02;
    this.body.position.y = PIV.body[1] + Math.abs(Math.sin(this.gait)) * 0.1 * amp - loaf * 0.5;
    this.body.scale.set(1 + breath * 0.5, 1 + breath, 1 + breath * 0.5);
    const stretchPhase = this.idle > 4 && this.idle < 6 ? Math.sin(((this.idle - 4) / 2) * Math.PI) : 0;
    this.body.rotation.x = -speed01 * 0.07 * (grounded ? 1 : 0) + (grounded ? 0 : -THREE.MathUtils.clamp(vy * 0.03, -0.25, 0.25)) + stretchPhase * 0.18;

    // head: look around when idle, bap nod
    let bap = 0;
    if (this.bapT >= 0) { this.bapT += dt; bap = Math.sin(Math.min(1, this.bapT / 0.28) * Math.PI); if (this.bapT > 0.28) this.bapT = -1; }
    const lookY = Math.sin(t * 0.31) * 0.18 * (1 - amp);
    this.head.rotation.set(Math.sin(t * 0.5) * 0.05 + bap * 0.22 - stretchPhase * 0.3 + speed01 * 0.05, lookY, Math.sin(t * 0.37) * 0.06);
    this.legs[0].rotation.x -= bap * 1.5;
    this.legs[0].position.y += bap * 0.3;

    // ears twitch
    this.nextEar -= dt;
    if (this.nextEar < 0) { this.earT = 0; this.nextEar = 3 + Math.random() * 6; }
    let tw = 0;
    if (this.earT >= 0) { this.earT += dt; tw = Math.sin(Math.min(1, this.earT / 0.3) * Math.PI * 2) * 0.35 * (1 - this.earT / 0.3); if (this.earT > 0.3) this.earT = -1; }
    this.ears[0].rotation.z = -tw - speed01 * 0.15; this.ears[1].rotation.z = tw * 0.3 + speed01 * 0.15;
    this.ears[0].rotation.x = this.ears[1].rotation.x = -speed01 * 0.25;

    // blink, sleepy when idle long
    this.nextBlink -= dt;
    if (this.nextBlink < 0) { this.blinkT = 0; this.nextBlink = 2.5 + Math.random() * 3.5; }
    let lid = 0;
    if (this.blinkT >= 0) { this.blinkT += dt; lid = Math.sin(Math.min(1, this.blinkT / 0.2) * Math.PI); if (this.blinkT > 0.2) this.blinkT = -1; }
    const sleepy = THREE.MathUtils.smoothstep(this.idle, 14, 17);
    for (const m of this.eyeMats) {
      m.uniforms.uLid.value = Math.max(lid, sleepy * 0.85); m.uniforms.uPupilW.value = 0.5 + this.thin * 0.12;
      m.uniforms.uLook.value.set(lookY * 2.5, 0);
    }

    this.root.updateMatrixWorld(true);
    this.updatePuffs(dt);
    this.updateTail(dt);
    this.emit(dt);
    this.updateWisps(dt);

    const u = this.mat.uniforms;
    u.uTime.value = t;
    this.drift.addScaledVector(vel, -dt * 6);
    u.uDrift.value.copy(this.drift);
    u.uRoot.value.copy(this.root.position);
    this.head.localToWorld(u.uFace.value.set(...sub(FACE, PIV.head)));
    u.uPale01.value = Math.max(this.thin, fl * 0.6);
    this.started = true;
  }

  private updatePuffs(dt: number) {
    const sp = this.speed01, fl = this.float;
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (const p of this.puffs) {
      p.prevTarget.copy(p.target);
      p.target.copy(p.local).applyMatrix4(p.bone.matrixWorld);
      if (!this.started) { p.pos.copy(p.target); p.prevTarget.copy(p.target); continue; }
      // boil: the smoke never sits still, more of it when moving
      const tv = this.v1.copy(p.target).sub(p.prevTarget).divideScalar(Math.max(dt, 1e-4));
      swirl(this.v2, p.target.x * 6 + p.seed * 9, p.target.y * 6, p.target.z * 6, this.t * 1.3 + p.seed * 10);
      const k = p.k * (1 - fl * 0.6), cRel = 2 * Math.sqrt(k) * 0.55, cAir = p.lag * k;
      const turb = 0.15 + sp * 0.9 * p.rear;
      // substeps keep the springs stable on slow devices; the target moves linearly across them
      for (let j = 1; j <= n; j++) {
        const f = j / n - 1;
        const tx = p.target.x + tv.x * f * dt, ty = p.target.y + tv.y * f * dt, tz = p.target.z + tv.z * f * dt;
        const ax = k * (tx - p.pos.x) - cRel * (p.vel.x - tv.x) - cAir * p.vel.x + this.v2.x * turb;
        const ay = k * (ty - p.pos.y) - cRel * (p.vel.y - tv.y) - cAir * p.vel.y + this.v2.y * turb + p.rear * sp * 0.6;
        const az = k * (tz - p.pos.z) - cRel * (p.vel.z - tv.z) - cAir * p.vel.z + this.v2.z * turb;
        p.vel.x += ax * h; p.vel.y += ay * h; p.vel.z += az * h;
        p.pos.x += p.vel.x * h; p.pos.y += p.vel.y * h; p.pos.z += p.vel.z * h;
      }
      // keep the cat readable: a puff never wanders far from its place
      const off = this.v3.copy(p.pos).sub(p.target);
      const max = p.maxOff * (1 + fl * 2);
      if (off.length() > max) { off.setLength(max); p.pos.copy(p.target).add(off); }
      p.size = p.baseSize * (1 + Math.sin(this.t * 1.4 + p.seed * 20) * 0.07 + fl * 0.5 + this.thin * 0.15 + sp * p.rear * 0.15);
      p.alpha = p.baseAlpha * (1 - this.thin * 0.35);
      p.light = Math.max(this.thin * 0.8, fl * 0.5, p.halo * 0.3);
      p.erode = (p.halo ? 0.45 : 0.2) + p.seed * 0.2 + sp * p.rear * 0.35 + fl * 0.3;
    }
  }

  private updateTail(dt: number) {
    const root = this.tailRoot.getWorldPosition(this.v1);
    this.root.getWorldQuaternion(this.q);
    if (!this.started) {
      let p = root.clone();
      for (let i = 0; i < TAIL_N; i++) {
        if (i > 0) p.add(this.v2.set(...TAIL_DIRS[i - 1]).normalize().multiplyScalar(TAIL_SEG).applyQuaternion(this.q));
        this.tail[i].copy(p); this.tailPrev[i].copy(p);
      }
    }
    this.tail[0].copy(root); this.tailPrev[0].copy(root);
    const sp = this.speed01, fl = this.float;
    const rest = this.v3.copy(root);
    for (let i = 1; i < TAIL_N; i++) {
      const k = i / (TAIL_N - 1);
      const dir = this.v2.set(...TAIL_DIRS[i - 1]).normalize();
      // a lazy side-to-side sway, bigger at the tip
      dir.x += Math.sin(this.t * 1.4 - i * 0.55) * (0.25 + 0.35 * k);
      dir.normalize().multiplyScalar(TAIL_SEG).applyQuaternion(this.q);
      rest.add(dir);
      const p = this.tail[i], pp = this.tailPrev[i];
      const vx = (p.x - pp.x), vy = (p.y - pp.y), vz = (p.z - pp.z);
      pp.copy(p);
      const keep = 0.9 - k * 0.04; // air drag: the tip trails more
      const shape = (60 - k * 38) * (1 - fl * 0.5);
      swirl(this.v2, p.x * 5, p.y * 5, p.z * 5, this.t * 1.5 + i * 0.3);
      const turb = 0.4 + sp * 2.5 * k;
      p.x += vx * keep + ((rest.x - p.x) * shape + this.v2.x * turb) * dt * dt;
      p.y += vy * keep + ((rest.y - p.y) * shape + this.v2.y * turb + 0.8 * k) * dt * dt;
      p.z += vz * keep + ((rest.z - p.z) * shape + this.v2.z * turb) * dt * dt;
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < TAIL_N; i++) {
        const a = this.tail[i - 1], b = this.tail[i];
        const d = this.v2.copy(b).sub(a); const L = d.length() || 1e-5;
        const len = TAIL_SEG * (1 + sp * 0.25 + fl * 0.3);
        b.copy(a).addScaledVector(d, len / L);
      }
    }
    // puffs ride the chain
    const n = this.tailPuffs.length;
    for (let j = 0; j < n; j++) {
      const f = (j / (n - 1)) * (TAIL_N - 1);
      const i = Math.min(TAIL_N - 2, Math.floor(f)), w = f - i;
      const tp = this.tailPuffs[j];
      const prev = this.v2.copy(tp.pos);
      tp.pos.lerpVectors(this.tail[i], this.tail[i + 1], w);
      tp.vel.copy(tp.pos).sub(prev).divideScalar(Math.max(dt, 1e-4));
      const k = j / (n - 1);
      tp.size = tp.baseSize * (1 + Math.sin(this.t * 2.1 + j) * 0.08 + fl * 0.4 + this.thin * 0.15);
      tp.alpha = tp.baseAlpha * (1 - this.thin * 0.35);
      tp.light = Math.max(this.thin * 0.8, fl * 0.5, k * 0.12);
      tp.erode = 0.15 + k * 0.45 + sp * 0.2;
    }
    this.tailTip.position.copy(this.tail[TAIL_N - 1]);
    this.carryAnchor.position.copy(this.tail[TAIL_N - 3]).add(this.v2.set(0, 0.09, 0));
  }

  private pawPuff(i: number) {
    const at = this.pawPts[i].getWorldPosition(this.v1);
    for (let k = 0; k < 2; k++) {
      const w = this.spawnWisp(); if (!w) return;
      w.pos.copy(at).add(this.v2.set((this.rand() - 0.5) * 0.05, 0.02, (this.rand() - 0.5) * 0.05));
      w.vel.set((this.rand() - 0.5) * 0.3, 0.12 + this.rand() * 0.1, (this.rand() - 0.5) * 0.3).addScaledVector(this.vel, -0.1);
      w.size0 = 0.03; w.size1 = 0.085; w.life = 0.7 + this.rand() * 0.4; w.alpha0 = 0.32; w.buoy = 0.25; w.drag = 3; w.turb = 0.4; w.light = 0.15;
    }
  }

  private emit(dt: number) {
    const sp = this.speed01, fl = this.float, th = this.thin;
    // the tail tip always smokes a little, like a snuffed candle; streams when running
    this.acc.tail += dt * (7 + sp * 26 + fl * 30 + th * 20);
    while (this.acc.tail > 1) {
      this.acc.tail -= 1;
      const w = this.spawnWisp(); if (!w) break;
      const a = this.tail[TAIL_N - 1], b = this.tail[TAIL_N - 2];
      w.pos.lerpVectors(b, a, this.rand()).add(this.v1.set((this.rand() - 0.5) * 0.03, 0, (this.rand() - 0.5) * 0.03));
      w.vel.copy(this.vel).multiplyScalar(0.25).add(this.v1.set((this.rand() - 0.5) * 0.12, 0.12 + this.rand() * 0.12, (this.rand() - 0.5) * 0.12));
      w.size0 = 0.04 + this.rand() * 0.02; w.size1 = 0.11 + this.rand() * 0.05; w.life = 1.3 + this.rand() * 0.9;
      w.alpha0 = 0.5; w.buoy = 0.35; w.drag = 1.6; w.turb = 0.55; w.light = 0.1 + th * 0.5;
    }
    // the back and rump shed wisps when moving: the trail
    this.acc.back += dt * (sp * sp * 55 + fl * 25);
    while (this.acc.back > 1) {
      this.acc.back -= 1;
      const src = this.puffs[Math.floor(this.rand() * this.puffs.length)];
      if (src.rear < 0.35 && this.rand() < 0.75) continue;
      const w = this.spawnWisp(); if (!w) break;
      w.pos.copy(src.pos);
      w.vel.copy(this.vel).multiplyScalar(0.18).add(this.v1.set((this.rand() - 0.5) * 0.3, 0.1 + this.rand() * 0.25, (this.rand() - 0.5) * 0.3));
      w.size0 = src.size * 0.8; w.size1 = src.size * 2.2; w.life = 0.9 + this.rand() * 0.8;
      w.alpha0 = 0.42; w.buoy = 0.3; w.drag = 2.2; w.turb = 0.9; w.light = 0.05 + th * 0.5;
    }
    // a faint curl off each ear tip now and then
    this.acc.ear += dt * 1.4;
    while (this.acc.ear > 1) {
      this.acc.ear -= 1;
      const w = this.spawnWisp(); if (!w) break;
      this.earTips[this.rand() < 0.5 ? 0 : 1].getWorldPosition(w.pos);
      w.vel.set((this.rand() - 0.5) * 0.05, 0.14, (this.rand() - 0.5) * 0.05).addScaledVector(this.vel, 0.2);
      w.size0 = 0.018; w.size1 = 0.06; w.life = 1.1; w.alpha0 = 0.28; w.buoy = 0.3; w.drag = 1.5; w.turb = 0.5; w.light = 0.2;
    }
  }

  private updateWisps(dt: number) {
    for (let i = this.wisps.length - 1; i >= 0; i--) {
      const w = this.wisps[i];
      w.age += dt;
      const k = w.age / w.life;
      if (k >= 1) { this.wisps[i] = this.wisps[this.wisps.length - 1]; this.wisps.pop(); this.wispPool.push(w); continue; }
      swirl(this.v1, w.pos.x * 4 + w.seed * 5, w.pos.y * 4, w.pos.z * 4, this.t * 1.1 + w.seed * 6);
      w.vel.addScaledVector(this.v1, w.turb * dt);
      w.vel.y += w.buoy * dt;
      w.vel.multiplyScalar(Math.exp(-w.drag * dt));
      w.pos.addScaledVector(w.vel, dt);
      const e = 1 - (1 - k) * (1 - k);
      w.size = w.size0 + (w.size1 - w.size0) * e;
      w.alpha = w.alpha0 * Math.min(1, k * 8) * (1 - k) * (1 - k * 0.3);
      w.erode = 0.3 + k * 0.65;
      w.light = Math.min(1, w.light + dt * 0.25);
    }
  }

  /** Call after the camera moved, before rendering. */
  renderSmoke(camera: THREE.Camera, time: number) {
    this.slots.length = 0;
    for (const w of this.wisps) this.slots.push(w);
    for (const p of this.puffs) this.slots.push(p);
    for (const p of this.tailPuffs) this.slots.push(p);
    this.smoke.setSun(this.sunDir, camera);
    this.smoke.write(this.slots, camera, time);
  }

  /** Puff count for debugging. */
  get puffCount() { return this.puffs.length + this.tailPuffs.length + this.wisps.length; }
}

function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!; const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
