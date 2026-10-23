import * as THREE from 'three';

// Moth, "Lantern, cuter" design (docs/CHARACTER.md), in a standing pose for play.
// Soft smooth shapes with a warm rim light; cloud puffs only on the chest, cheeks and tail tip, so it reads cute first.
// Units below are head radii (HU); the whole cat is scaled to metres by HU.
export const HU = 0.16;

export const PALETTE = {
  base: '#3D3860', shadow: '#24203A', rim: '#FFD9A0', glow: '#8E7FB8',
  irisInner: '#FFE3A3', irisOuter: '#F7A94C', pupil: '#1A1226', nose: '#D88A92', blush: '#E79AA6', thin: '#9A94B8',
};

type V3 = [number, number, number];
type Prim =
  | { t: 'ell'; c: V3; r: V3; puffs?: number; pr?: [number, number] }
  | { t: 'cap'; a: V3; b: V3; r: number; puffs?: number; pr?: [number, number] }
  | { t: 'cone'; a: V3; b: V3; r: number };

const lin = (h: string) => new THREE.Color(h);

function cloudMaterial() {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uBase: { value: lin(PALETTE.base) }, uShadow: { value: lin(PALETTE.shadow) },
        uRim: { value: lin(PALETTE.rim) }, uGlow: { value: lin(PALETTE.glow) }, uThinCol: { value: lin(PALETTE.thin) },
        uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.3).normalize() },
        uSunCol: { value: new THREE.Color(1.0, 0.86, 0.68).multiplyScalar(2.0) },
        uSkyCol: { value: new THREE.Color(0.55, 0.65, 0.85) },
        uGroundCol: { value: new THREE.Color(0.45, 0.55, 0.32) },
        uThin: { value: 0 }, uFloat: { value: 0 },
      },
    ]),
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){
        vec4 local = vec4(position, 1.0); vec3 n = normal;
        #ifdef USE_INSTANCING
          local = instanceMatrix * local; n = mat3(instanceMatrix) * n;
        #endif
        vec4 wp = modelMatrix * local;
        vW = wp.xyz; vN = normalize(mat3(modelMatrix) * n);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase, uShadow, uRim, uGlow, uThinCol, uSunDir, uSunCol, uSkyCol, uGroundCol;
      uniform float uThin, uFloat;
      varying vec3 vN; varying vec3 vW;
      #include <fog_pars_fragment>
      void main(){
        vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW);
        float wrap = clamp((dot(n, uSunDir) + 0.5) / 1.5, 0.0, 1.0);
        float sky = 0.5 + 0.5 * n.y;
        vec3 base = mix(uShadow, uBase, wrap);
        base = mix(base, uThinCol, uThin * 0.75 + uFloat * 0.4);
        vec3 c = base * (uSkyCol * sky * 1.0 + uGroundCol * (1.0 - sky) * 0.5 + uSunCol * wrap * 0.8);
        float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.2);
        float lit = clamp(dot(n, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
        float back = pow(clamp(dot(-v, uSunDir), 0.0, 1.0), 2.0);
        c += uRim * fres * (0.25 + 1.3 * lit * lit + 2.6 * back) * (1.0 + uThin);
        c += uGlow * fres * 0.35;
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
      uLid: { value: 0 }, uLidCol: { value: lin(PALETTE.shadow) }, uPupilW: { value: 0.46 }, uHappy: { value: 0 },
    },
    vertexShader: /* glsl */ `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uInner, uOuter, uPupil, uLidCol; uniform float uLid, uPupilW, uHappy;
      varying vec3 vP;
      void main(){
        vec3 q = normalize(vP);
        vec2 uv = q.xy / 0.8;
        float ir = length(uv);
        vec3 c = mix(uInner, uOuter, smoothstep(0.1, 1.0, ir));
        c *= 1.0 - 0.35 * smoothstep(0.82, 1.0, ir);
        float pup = smoothstep(1.0, 0.88, length(uv / vec2(uPupilW, 0.66)));
        c = mix(c, uPupil, pup);
        float cl = smoothstep(0.32, 0.18, length(uv - vec2(-0.4, 0.45))) + smoothstep(0.15, 0.08, length(uv - vec2(0.45, -0.4)));
        c += vec3(1.0) * cl * 1.3;
        c *= 1.25;
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

// --- the design, standing pose, facing +Z, feet at y = 0 ---
const PIV = {
  body: [0, 1.3, -0.25] as V3,
  head: [0, 1.75, 0.8] as V3,
  legFL: [0.36, 1.05, 0.62] as V3, legFR: [-0.36, 1.05, 0.62] as V3,
  legBL: [0.4, 1.05, -0.95] as V3, legBR: [-0.4, 1.05, -0.95] as V3,
};
const TAIL: [number, number, number, number][] = [
  [0, 1.45, -1.3, 0.2], [0, 1.75, -1.75, 0.19], [0, 2.25, -2.0, 0.18], [0, 2.8, -2.0, 0.17], [0, 3.2, -1.75, 0.15], [0, 3.35, -1.4, 0.12],
];

const BODY: Prim[] = [
  { t: 'ell', c: [0, 1.3, -0.25], r: [0.72, 0.7, 1.15] },
  { t: 'ell', c: [0, 1.55, 0.6], r: [0.55, 0.55, 0.45], puffs: 7, pr: [0.22, 0.32] },
  { t: 'ell', c: [0.45, 1.05, -0.95], r: [0.36, 0.46, 0.52] },
  { t: 'ell', c: [-0.45, 1.05, -0.95], r: [0.36, 0.46, 0.52] },
];
const HEAD: Prim[] = [
  { t: 'ell', c: [0, 2.45, 1.05], r: [1, 0.97, 0.96] },
  { t: 'ell', c: [0.62, 2.2, 1.27], r: [0.42, 0.42, 0.42], puffs: 3, pr: [0.18, 0.24] },
  { t: 'ell', c: [-0.62, 2.2, 1.27], r: [0.42, 0.42, 0.42], puffs: 3, pr: [0.18, 0.24] },
  { t: 'ell', c: [0, 2.18, 1.8], r: [0.36, 0.25, 0.3] },
];
const EARS: [V3, V3][] = [[[0.52, 3.12, 0.92], [0.78, 3.92, 0.8]], [[-0.52, 3.12, 0.92], [-0.74, 3.95, 0.78]]];
const EYES: V3[] = [[0.42, 2.44, 1.82], [-0.42, 2.44, 1.82]];
const NOSE: V3 = [0, 2.23, 2.09];
const BLUSH: V3[] = [[0.6, 2.17, 1.73], [-0.6, 2.17, 1.73]];
const FACE_C: V3 = [0, 2.3, 1.85];

function legPrims(p: V3): Prim[] {
  const x = p[0], z = p[2];
  return [
    { t: 'cap', a: [x, 1.05, z], b: [x, 0.24, z + 0.05], r: 0.2 },
    { t: 'ell', c: [x, 0.16, z + 0.14], r: [0.26, 0.16, 0.32] },
  ];
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
function sdEll(p: V3, c: V3, r: V3) {
  const q = sub(p, c); const k0 = Math.hypot(q[0] / r[0], q[1] / r[1], q[2] / r[2]);
  const k1 = Math.hypot(q[0] / (r[0] * r[0]), q[1] / (r[1] * r[1]), q[2] / (r[2] * r[2]));
  return (k0 * (k0 - 1)) / k1;
}
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

interface PuffSet { mesh: THREE.InstancedMesh; base: THREE.Matrix4[]; phase: number[]; scale: number[] }

export class Cat {
  root = new THREE.Group();
  private scaleGroup = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private ears: THREE.Group[] = [];
  private legs: THREE.Group[] = [];
  private tail: THREE.Group[] = [];
  private puffSets: PuffSet[] = [];
  private mat = cloudMaterial();
  private eyeMats: THREE.ShaderMaterial[] = [];
  private t = 0;
  private gait = 0;
  private squash = 0; // + stretch, - squash
  private squashV = 0;
  private blinkT = -1; private nextBlink = 2;
  private earT = -1; private nextEar = 5;
  private idle = 0;
  tailTip = new THREE.Object3D();
  carryAnchor = new THREE.Object3D();
  thin = 0;
  float = 0;

  constructor() {
    this.root.add(this.scaleGroup);
    this.scaleGroup.scale.setScalar(HU);
    this.scaleGroup.add(this.body);
    this.body.position.set(...PIV.body);
    this.build();
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; } });
  }

  get material() { return this.mat; }

  private allPrims(): Prim[] {
    const tailCaps: Prim[] = [];
    for (let i = 0; i < TAIL.length - 1; i++) tailCaps.push({ t: 'cap', a: TAIL[i].slice(0, 3) as V3, b: TAIL[i + 1].slice(0, 3) as V3, r: TAIL[i][3] });
    return [...BODY, ...HEAD, ...tailCaps];
  }
  private unionSd(p: V3) {
    let d = 1e9;
    for (const pr of this.allPrims()) {
      if (pr.t === 'ell') d = Math.min(d, sdEll(p, pr.c, pr.r));
      else if (pr.t === 'cap') {
        const ab = sub(pr.b, pr.a), ap = sub(p, pr.a);
        const h = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
        d = Math.min(d, Math.hypot(ap[0] - ab[0] * h, ap[1] - ab[1] * h, ap[2] - ab[2] * h) - pr.r);
      }
    }
    return d;
  }

  private addCore(group: THREE.Group, pivot: V3, prims: Prim[]) {
    for (const pr of prims) {
      let m: THREE.Mesh;
      if (pr.t === 'ell') {
        m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), this.mat);
        m.scale.set(...pr.r); m.position.set(...sub(pr.c, pivot));
      } else {
        const a = new THREE.Vector3(...sub(pr.a, pivot)), b = new THREE.Vector3(...sub(pr.b, pivot));
        const len = a.distanceTo(b);
        const geo = pr.t === 'cap' ? new THREE.CapsuleGeometry(pr.r, len, 6, 14) : new THREE.ConeGeometry(pr.r, len, 18, 1);
        m = new THREE.Mesh(geo, this.mat);
        m.position.copy(a).add(b).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      }
      group.add(m);
    }
  }

  private addPuffs(group: THREE.Group, pivot: V3, prims: Prim[], seed: number, extra?: (p: V3, n: V3) => boolean) {
    const r = rng(seed);
    const mats: THREE.Matrix4[] = [];
    for (const pr of prims) {
      if (pr.t !== 'ell' && pr.t !== 'cap') continue;
      const count = pr.puffs ?? 0; let tries = 0, made = 0;
      while (made < count && tries++ < count * 40) {
        let p: V3, n: V3;
        if (pr.t === 'ell') {
          const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
          const d: V3 = [s * Math.cos(th), u, s * Math.sin(th)];
          p = [pr.c[0] + d[0] * pr.r[0], pr.c[1] + d[1] * pr.r[1], pr.c[2] + d[2] * pr.r[2]];
          const nn = new THREE.Vector3(d[0] / pr.r[0], d[1] / pr.r[1], d[2] / pr.r[2]).normalize(); n = [nn.x, nn.y, nn.z];
        } else {
          const h = r(), th = r() * Math.PI * 2;
          const a = new THREE.Vector3(...pr.a), b = new THREE.Vector3(...pr.b), ax = b.clone().sub(a).normalize();
          const t1 = new THREE.Vector3(1, 0, 0).cross(ax); if (t1.lengthSq() < 0.01) t1.set(0, 0, 1).cross(ax); t1.normalize();
          const t2 = ax.clone().cross(t1);
          const nn = t1.multiplyScalar(Math.cos(th)).add(t2.multiplyScalar(Math.sin(th)));
          const c = a.lerp(b, h).add(nn.clone().multiplyScalar(pr.r));
          p = [c.x, c.y, c.z]; n = [nn.x, nn.y, nn.z];
        }
        if (this.unionSd(p) < -0.12) continue; // buried inside another shape
        if (n[1] < -0.6 && p[1] < 1.0) continue; // nothing under the belly
        if (extra && !extra(p, n)) continue;
        const [lo, hi] = pr.pr ?? [0.3, 0.45];
        const rad = lo + (hi - lo) * r();
        const c = new THREE.Vector3(p[0] - n[0] * rad * 0.55, p[1] - n[1] * rad * 0.55, p[2] - n[2] * rad * 0.55).sub(new THREE.Vector3(...pivot));
        mats.push(new THREE.Matrix4().compose(c, new THREE.Quaternion(), new THREE.Vector3(rad, rad, rad)));
        made++;
      }
    }
    if (!mats.length) return;
    const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), this.mat, mats.length);
    mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = true;
    group.add(mesh);
    this.puffSets.push({ mesh, base: mats, phase: mats.map(() => r() * Math.PI * 2), scale: mats.map(() => 1) });
  }

  private build() {
    // body, chest ruff, haunches
    this.addCore(this.body, PIV.body, BODY);
    this.addPuffs(this.body, PIV.body, BODY, 11);

    // head with smooth face
    this.head.position.set(...sub(PIV.head, PIV.body));
    this.body.add(this.head);
    this.addCore(this.head, PIV.head, HEAD);
    this.addPuffs(this.head, PIV.head, HEAD, 23, (p, n) => {
      const f = sub(p, FACE_C);
      return !(Math.hypot(f[0], f[1] * 1.15, f[2] * 0.8) < 1.0 && n[2] > 0.15);
    });
    for (const [a, b] of EARS) {
      const g = new THREE.Group(); g.position.set(...sub(a, PIV.head)); this.head.add(g);
      this.addCore(g, a, [{ t: 'cone', a, b, r: 0.34 }]);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), this.mat); tip.position.set(...sub(b, a)); g.add(tip);
      this.ears.push(g);
    }
    for (const e of EYES) {
      const m = eyeMaterial(); this.eyeMats.push(m);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.33, 28, 20), m);
      eye.position.set(...sub(e, PIV.head));
      eye.rotation.y = Math.sign(e[0]) * 0.32;
      this.head.add(eye);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: lin(PALETTE.nose) }));
    nose.scale.set(0.085, 0.06, 0.05); nose.position.set(...sub(NOSE, PIV.head)); this.head.add(nose);
    const blushMat = new THREE.MeshBasicMaterial({ color: lin(PALETTE.blush), transparent: true, opacity: 0.55, depthWrite: false });
    for (const b of BLUSH) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), blushMat);
      m.scale.set(0.2, 0.12, 0.04); m.position.set(...sub(b, PIV.head));
      m.lookAt(new THREE.Vector3(...sub(b, PIV.head)).sub(new THREE.Vector3(...sub([0, 2.45, 1.05], PIV.head))).multiplyScalar(3));
      this.head.add(m);
    }

    // legs: smooth, so paws read clearly
    for (const k of ['legFL', 'legFR', 'legBL', 'legBR'] as const) {
      const g = new THREE.Group(); g.position.set(...sub(PIV[k], PIV.body)); this.body.add(g);
      this.addCore(g, PIV[k], legPrims(PIV[k]));
      this.legs.push(g);
    }

    // tail: a chain of groups, each one link
    let parent: THREE.Object3D = this.body, parentPivot = PIV.body;
    for (let i = 0; i < TAIL.length - 1; i++) {
      const a = TAIL[i].slice(0, 3) as V3, b = TAIL[i + 1].slice(0, 3) as V3;
      const g = new THREE.Group(); g.position.set(...sub(a, parentPivot)); parent.add(g);
      const prim: Prim = { t: 'cap', a, b, r: TAIL[i][3], puffs: i >= TAIL.length - 3 ? 3 : 0, pr: [0.13, 0.19] };
      this.addCore(g, a, [prim]);
      this.addPuffs(g, a, [prim], 40 + i);
      this.tail.push(g); parent = g; parentPivot = a;
    }
    const last = TAIL[TAIL.length - 1];
    this.tailTip.position.set(...sub(last.slice(0, 3) as V3, TAIL[TAIL.length - 2].slice(0, 3) as V3));
    parent.add(this.tailTip);
    this.carryAnchor.position.set(0, 1.4, 0);
    this.tailTip.add(this.carryAnchor);
  }

  setLight(sunDir: THREE.Vector3, sunCol: THREE.Color, sky: THREE.Color, ground: THREE.Color) {
    const u = this.mat.uniforms;
    u.uSunDir.value.copy(sunDir); u.uSunCol.value.copy(sunCol); u.uSkyCol.value.copy(sky); u.uGroundCol.value.copy(ground);
  }

  kick(kind: 'jump' | 'double' | 'land' | 'bap', strength = 1) {
    if (kind === 'jump') this.squashV += 5;
    if (kind === 'double') this.squashV += 7;
    if (kind === 'land') this.squashV -= 4 + 5 * strength;
    if (kind === 'bap') this.bapT = 0;
    this.idle = 0;
  }
  private bapT = -1;

  /** speed01: ground speed as 0..1 of run speed. */
  update(dt: number, speed01: number, grounded: boolean, vy: number) {
    this.t += dt;
    const t = this.t;
    if (speed01 > 0.05 || !grounded) this.idle = 0; else this.idle += dt;

    // spring for squash and stretch
    this.squashV += (-this.squash * 120 - this.squashV * 12) * dt;
    this.squash += this.squashV * dt;
    const air = grounded ? 0 : THREE.MathUtils.clamp(vy * 0.03, -0.12, 0.15);
    const s = THREE.MathUtils.clamp(this.squash * 0.06 + air, -0.25, 0.25);
    const fl = this.float;
    this.scaleGroup.scale.set(HU * (1 - s * 0.5 + fl * 0.1), HU * (1 + s - fl * 0.15), HU * (1 - s * 0.5 + fl * 0.1));
    const thinS = 1 - this.thin * 0.12;
    this.scaleGroup.scale.multiplyScalar(thinS);

    // gait: trot with diagonal pairs
    this.gait += dt * (4 + speed01 * 10) * (speed01 > 0.03 && grounded ? 1 : 0);
    const amp = grounded ? Math.min(1, speed01 * 1.6) : 0;
    const swing = Math.sin(this.gait) * 0.7 * amp;
    const tuck = grounded ? 0 : 0.7;
    this.legs[0].rotation.x = swing - tuck * 0.4; this.legs[3].rotation.x = swing + tuck * 0.5;
    this.legs[1].rotation.x = -swing - tuck * 0.4; this.legs[2].rotation.x = -swing + tuck * 0.5;
    for (const l of this.legs) l.scale.setScalar(1 - fl * 0.6);

    // body bob, breathing, idle loaf
    const breath = Math.sin(t * 1.6) * 0.02;
    const loaf = THREE.MathUtils.smoothstep(this.idle, 9, 11);
    this.body.position.y = PIV.body[1] + Math.abs(Math.sin(this.gait)) * 0.12 * amp - loaf * 0.45;
    this.body.scale.set(1 + breath * 0.5, 1 + breath, 1 + breath * 0.5);
    this.body.rotation.x = -speed01 * 0.08 * (grounded ? 1 : 0) + (grounded ? 0 : -THREE.MathUtils.clamp(vy * 0.03, -0.25, 0.25));
    for (let i = 0; i < 4; i++) this.legs[i].position.y = PIV.legFL[1] - PIV.body[1] + loaf * 0.35;

    // stretch after 4 s still
    const stretchPhase = this.idle > 4 && this.idle < 6 ? Math.sin(((this.idle - 4) / 2) * Math.PI) : 0;
    this.body.rotation.x += stretchPhase * 0.18;

    // head: gentle look-around, bap nod
    let bap = 0;
    if (this.bapT >= 0) { this.bapT += dt; bap = Math.sin(Math.min(1, this.bapT / 0.25) * Math.PI); if (this.bapT > 0.25) this.bapT = -1; }
    this.head.rotation.set(Math.sin(t * 0.5) * 0.05 + bap * 0.25 - stretchPhase * 0.3, Math.sin(t * 0.31) * 0.15 * (1 - amp), Math.sin(t * 0.37) * 0.06);
    this.legs[0].rotation.x -= bap * 1.4;

    // tail sway, lifted when running
    this.tail.forEach((g, i) => {
      const k = i / (this.tail.length - 1);
      g.rotation.z = Math.sin(t * 1.3 - i * 0.6) * (0.06 + 0.1 * k) * (1 + amp);
      g.rotation.x = Math.sin(t * 0.9 - i * 0.5) * 0.05 * k - amp * 0.05 * (1 - k) + loaf * 0.25 * (1 - k);
    });

    // ears: occasional twitch
    this.nextEar -= dt;
    if (this.nextEar < 0) { this.earT = 0; this.nextEar = 3 + Math.random() * 6; }
    let tw = 0;
    if (this.earT >= 0) { this.earT += dt; tw = Math.sin(Math.min(1, this.earT / 0.3) * Math.PI * 2) * 0.35 * (1 - this.earT / 0.3); if (this.earT > 0.3) this.earT = -1; }
    this.ears[0].rotation.z = -tw; this.ears[1].rotation.z = tw * 0.3;

    // blink
    this.nextBlink -= dt;
    if (this.nextBlink < 0) { this.blinkT = 0; this.nextBlink = 2.5 + Math.random() * 3.5; }
    let lid = 0;
    if (this.blinkT >= 0) { this.blinkT += dt; lid = Math.sin(Math.min(1, this.blinkT / 0.2) * Math.PI); if (this.blinkT > 0.2) this.blinkT = -1; }
    const sleepy = THREE.MathUtils.smoothstep(this.idle, 14, 17);
    for (const m of this.eyeMats) { m.uniforms.uLid.value = Math.max(lid, sleepy * 0.85); m.uniforms.uPupilW.value = 0.46 + this.thin * 0.15; }

    // cloud churn: puffs breathe a little out of step
    for (const ps of this.puffSets) {
      const tmp = new THREE.Matrix4(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), q = new THREE.Quaternion();
      ps.base.forEach((m, i) => {
        m.decompose(pos, q, sc);
        const k = 1 + Math.sin(t * 0.9 + ps.phase[i]) * 0.06 + fl * 0.25 + this.thin * 0.1;
        tmp.compose(pos, q, sc.multiplyScalar(k));
        ps.mesh.setMatrixAt(i, tmp);
      });
      ps.mesh.instanceMatrix.needsUpdate = true;
    }
    this.mat.uniforms.uThin.value = this.thin;
    this.mat.uniforms.uFloat.value = fl;
  }
}
