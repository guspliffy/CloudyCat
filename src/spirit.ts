import * as THREE from 'three';
import { SmokeRenderer, PuffSlot, swirl, SMOKE_COLORS } from './smoke';

// Moth, the little hearth spirit (docs/SPIRIT.md, "Kettle"): a stray puff of the hearth's own smoke.
// - a round dusk-violet core (head on a round belly) with slow smoke flowing through it, a clean face
// - two nub feet it waddles on and two mitten hands, so jumps and landings read on the ground
// - soft puffs on the surface, each on a spring, so the back lags and smears when Moth moves
// - a plume of smoke rising from the crown like steam from a spout, streaming back when it runs
// - wisps that peel off the plume and the lower back, curl in the air and dissolve: the trail
// The design is in metres at knee height; S scales it to the game. Facing +Z, feet at y = 0.
export const S = 1.3;

export const PALETTE = {
  base: '#3D3860', shadow: '#24203A', rim: '#FFD9A0', glow: '#8E7FB8',
  irisInner: '#FFD27A', irisOuter: '#E8862E', pupil: '#1A1226', blush: '#E79AA6', mouth: '#1A1226', ember: '#FFC46B',
};

type V3 = [number, number, number];
const col = (h: string) => new THREE.Color(h);

function bodyMaterial() {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uBase: { value: col(PALETTE.base) }, uShadow: { value: col(PALETTE.shadow) }, uLit: { value: SMOKE_COLORS.lit },
      uRim: { value: col(PALETTE.rim) }, uGlow: { value: col(PALETTE.glow) }, uPale: { value: SMOKE_COLORS.pale },
      uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.3).normalize() },
      uSunCol: { value: new THREE.Color(1.0, 0.9, 0.75) }, uSkyCol: { value: new THREE.Color(0.6, 0.68, 0.9) },
      uTime: { value: 0 }, uDrift: { value: new THREE.Vector3() }, uRoot: { value: new THREE.Vector3() },
      uFace: { value: new THREE.Vector3() }, uPale01: { value: 0 },
      uEmberPos: { value: new THREE.Vector3() }, uEmber: { value: 0 }, uEmberCol: { value: col(PALETTE.ember) },
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
      uniform vec3 uBase, uShadow, uLit, uRim, uGlow, uPale, uSunDir, uSunCol, uSkyCol, uDrift, uRoot, uFace, uEmberPos, uEmberCol;
      uniform float uTime, uPale01, uEmber;
      varying vec3 vN; varying vec3 vW;
      #include <fog_pars_fragment>
      float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW);
        // smoke flowing through the body: slow rising swirls, streaming back when Moth moves
        vec3 lp = (vW - uRoot) * 14.0 + uDrift;
        lp.y -= uTime * 0.6;
        float w = n3(lp + vec3(n3(lp * 0.5 + uTime * 0.2) * 2.0));
        float w2 = n3(lp * 2.1 + 7.0);
        float flow = w * 0.7 + w2 * 0.3;
        float calm = smoothstep(0.07, 0.15, distance(vW, uFace)); // keep the face clean
        float wrap = clamp((dot(n, uSunDir) + 0.55) / 1.55, 0.0, 1.0);
        vec3 base = mix(uShadow, uBase, smoothstep(0.22, 0.42, wrap));
        base = mix(base, uLit, smoothstep(0.7, 0.85, wrap) * 0.35);
        base *= 1.0 + (flow - 0.5) * 0.5 * calm;
        base = mix(base, uPale, uPale01 * 0.7);
        float sky = 0.5 + 0.5 * n.y;
        vec3 c = base * (0.75 + uSkyCol * sky * 0.35 + uSunCol * wrap * 0.35);
        // the carried ember lights the belly, cheeks and under the eyes
        vec3 toE = uEmberPos - vW;
        float eL = uEmber * pow(clamp(1.0 - length(toE) / 0.24, 0.0, 1.0), 2.0) * clamp(dot(n, normalize(toE)), 0.0, 1.0);
        c += uEmberCol * eL * 0.35;
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
      uInner: { value: col(PALETTE.irisInner) }, uOuter: { value: col(PALETTE.irisOuter) }, uPupil: { value: col(PALETTE.pupil) },
      uLid: { value: 0 }, uLidCol: { value: col(PALETTE.shadow) }, uPupilW: { value: 0.52 }, uHappy: { value: 0 }, uLook: { value: new THREE.Vector2() },
    },
    vertexShader: /* glsl */ `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uInner, uOuter, uPupil, uLidCol; uniform float uLid, uPupilW, uHappy; uniform vec2 uLook;
      varying vec3 vP;
      void main(){
        vec3 q = normalize(vP);
        vec2 uv = q.xy / 0.8;
        float ir = length(uv);
        vec3 c = mix(uInner, uOuter, smoothstep(0.0, 0.75, ir));
        c *= 1.0 - 0.4 * smoothstep(0.8, 1.0, ir);
        vec2 pu = uv - uLook * 0.12;
        float pup = 1.0 - smoothstep(0.86, 1.0, length(pu / vec2(uPupilW, 0.58)));
        c = mix(c, uPupil, pup);
        float cl = (1.0 - smoothstep(0.2, 0.34, length(uv - vec2(-0.38, 0.42)))) + (1.0 - smoothstep(0.08, 0.16, length(uv - vec2(0.42, -0.36))));
        c += vec3(1.0) * cl * 1.4;
        c *= 1.08;
        float lidLine = mix(1.05, -1.25, uLid);
        float arc = 0.15 - 0.85 * uv.x * uv.x;
        float lineY = mix(lidLine, arc, uHappy);
        float covered = mix(step(lineY, uv.y), 1.0, uHappy);
        float edge = 1.0 - smoothstep(0.0, 0.12, abs(uv.y - lineY));
        c = mix(c, uLidCol, covered);
        c = mix(c, uInner * 0.9, edge * uHappy * step(abs(uv.x), 0.95));
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// --- the designs (metres, before S; docs/SPIRIT.md) ---
export type DesignId = 'kettle' | 'wimble' | 'sorrel';
interface Design {
  bodyC: V3; bodyR: V3 | null; // the belly; Wimble's egg is all head, Sorrel has smoke instead
  headC: V3; headR: V3;
  extra: [V3, V3][]; // more core shapes (head space): cheeks, Sorrel's crown lobe
  eye: { r: number; x: number; y: number }; // eye size and offset from the head centre
  blush: { r: number; x: number; y: number };
  mouthY: number;
  mittens: V3[]; mittenR: number;
  feet: V3[];
  carry: V3; // where the ember is held
  hover: number; // floats this high, bobbing
  mantle: { r: V3; count: number; size: [number, number] } | null;
  headPuffs: number; collar: boolean; cushion: boolean;
  plume: { root: V3; dirs: V3[]; seg: number; puffs: number; size: [number, number]; alpha: [number, number]; light: [number, number]; buoy: number; run: V3; tipRate: number };
  colors: { base: string; shadow: string; rim: string; glow: string; mouth: string };
  smoke?: { shadow: string; base: string; lit: string; pale: string };
}

const chain = (n: number, f: (k: number, i: number) => V3) => Array.from({ length: n - 1 }, (_, i) => f(i / (n - 2), i));

export const DESIGNS: Record<DesignId, Design> = {
  // a tubby dusk-violet spirit on nub feet; smoke rises from its crown like steam from a spout
  kettle: {
    bodyC: [0, 0.165, 0], bodyR: [0.145, 0.15, 0.135],
    headC: [0, 0.35, 0.02], headR: [0.14, 0.136, 0.136],
    extra: [[[0.088, -0.038, 0.05], [0.05, 0.046, 0.045]], [[-0.088, -0.038, 0.05], [0.052, 0.048, 0.047]]],
    eye: { r: 0.04, x: 0.054, y: 0.015 }, blush: { r: 0.024, x: 0.092, y: -0.035 }, mouthY: -0.028,
    mittens: [[0.155, 0.19, 0.05], [-0.155, 0.19, 0.05]], mittenR: 0.036,
    feet: [[0.065, 0.025, 0.03], [-0.065, 0.025, 0.03]],
    carry: [0, 0.2, 0.15], hover: 0,
    mantle: { r: [0.15, 0.155, 0.14], count: 40, size: [0.05, 0.08] }, headPuffs: 14, collar: true, cushion: false,
    plume: {
      root: [0, 0.47, -0.04], seg: 0.045, puffs: 16, size: [0.085, 0.045], alpha: [0.7, 0.22], light: [0.4, 0.8], buoy: 1.1, run: [0, 0.5, -0.87], tipRate: 5,
      dirs: chain(8, (_k, i) => (i < 3 ? [0, 1, -0.12 - i * 0.05] : [0.18 + (i - 3) * 0.05, Math.cos(0.35 + ((i - 3) / 3) * 1.5), -Math.sin(0.35 + ((i - 3) / 3) * 1.5)])),
    },
    colors: { base: '#3D3860', shadow: '#24203A', rim: '#FFD9A0', glow: '#8E7FB8', mouth: '#1A1226' },
  },
  // a pale cloud egg, all face, floating on its own cushion of cloud and trailing a soft comma
  wimble: {
    bodyC: [0, 0.25, 0], bodyR: null,
    headC: [0, 0.25, 0], headR: [0.15, 0.17, 0.145],
    extra: [[[0, -0.06, 0], [0.152, 0.11, 0.142]]],
    eye: { r: 0.045, x: 0.065, y: 0.04 }, blush: { r: 0.028, x: 0.1, y: -0.005 }, mouthY: 0.0,
    mittens: [[0.148, 0.2, 0.04], [-0.148, 0.2, 0.04]], mittenR: 0.035,
    feet: [],
    carry: [0, 0.1, 0.13], hover: 0.08,
    mantle: null, headPuffs: 18, collar: false, cushion: true,
    plume: {
      root: [0, 0.17, -0.13], seg: 0.042, puffs: 10, size: [0.06, 0.03], alpha: [0.5, 0.15], light: [0.35, 0.75], buoy: 0.5, run: [0, 0.25, -1], tipRate: 3,
      dirs: chain(7, (k) => [-0.45 * k, -0.2 + 1.6 * k, -1 + 0.7 * k]),
    },
    colors: { base: '#EFE9F0', shadow: '#B3AED3', rim: '#FFFDF6', glow: '#C9C2E0', mouth: '#5A4A6A' },
    smoke: { shadow: '#8B88B4', base: '#B3AED3', lit: '#EFE9F0', pale: '#FFFDF6' },
  },
  // a deep-dusk round head with a brush-stroke of smoke for a body, swimming through the air
  sorrel: {
    bodyC: [0, 0.42, 0], bodyR: null,
    headC: [0, 0.42, 0], headR: [0.15, 0.147, 0.147],
    extra: [[[0.05, 0.135, -0.03], [0.045, 0.04, 0.045]]],
    eye: { r: 0.048, x: 0.07, y: 0.012 }, blush: { r: 0.03, x: 0.1, y: -0.045 }, mouthY: -0.04,
    mittens: [[0.1, 0.29, 0.08], [-0.1, 0.29, 0.08]], mittenR: 0.04,
    feet: [],
    carry: [0, 0.27, 0.06], hover: 0.06,
    mantle: null, headPuffs: 12, collar: false, cushion: false,
    plume: {
      root: [0, 0.32, -0.02], seg: 0.04, puffs: 24, size: [0.1, 0.03], alpha: [0.85, 0.3], light: [0.1, 0.45], buoy: 0.15, run: [0, -0.15, -1], tipRate: 4,
      dirs: chain(10, (k) => [-0.5 * k * k, -1 + 1.1 * k, -0.35 - 0.5 * k]),
    },
    colors: { base: '#363B4A', shadow: '#24203A', rim: '#D9E2EA', glow: '#8E9AB8', mouth: '#1A1226' },
  },
};
const FACE_N = new THREE.Vector3(0, -0.1, 1).normalize();

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

interface Puff extends PuffSlot {
  bone: THREE.Object3D; local: THREE.Vector3; target: THREE.Vector3; prevTarget: THREE.Vector3;
  k: number; lag: number; maxOff: number; baseSize: number; baseAlpha: number; rear: number; halo: number;
}
interface Wisp extends PuffSlot { age: number; life: number; size0: number; size1: number; alpha0: number; buoy: number; drag: number; turb: number; ring?: THREE.Vector3 }

export class Spirit {
  /** Posed by main: position and yaw. */
  root = new THREE.Group();
  /** World-space parts: smoke, plume tip, carry anchor, ground shadow. Add to the scene. */
  world = new THREE.Group();
  smoke = new SmokeRenderer(420);
  tailTip = new THREE.Object3D();
  carryAnchor = new THREE.Object3D();
  blob: THREE.Mesh;
  thin = 0;
  float = 0;
  /** Set by main while an ember is held: the mittens hug it and it lights the belly. */
  carrying = false;

  private scaleGroup = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private feet: THREE.Group[] = [];
  private mittens: THREE.Group[] = [];
  private mittenOff = [new THREE.Vector3(), new THREE.Vector3()];
  private mittenRest: THREE.Vector3[] = [];
  private carryInBody = new THREE.Vector3();
  private headInBody = new THREE.Vector3();
  private mittenVel = [new THREE.Vector3(), new THREE.Vector3()];
  private crown = new THREE.Object3D();
  private carryLocal = new THREE.Object3D();
  private mouthDash!: THREE.Mesh; private mouthSmile!: THREE.Mesh;
  private blushMat!: THREE.MeshBasicMaterial;
  private mat = bodyMaterial();
  private eyeMats: THREE.ShaderMaterial[] = [];
  private puffs: Puff[] = [];
  private wisps: Wisp[] = [];
  private wispPool: Wisp[] = [];
  private plume: THREE.Vector3[] = []; private plumePrev: THREE.Vector3[] = [];
  private plumePuffs: Puff[] = [];
  private plumeRoot = new THREE.Object3D();
  private wakePts: THREE.Object3D[] = [];
  private slots: PuffSlot[] = [];
  private t = 0;
  private gait = 0; private lastGait = 0;
  private squash = 0; private squashV = 0;
  private blinkT = -1; private nextBlink = 2;
  private idle = 0;
  private bapT = -1;
  private happyT = 0;
  private sighT = 7; private sighPhase = -1;
  private glanceT = 4; private glance = 0; private glanceGoal = 0;
  private vel = new THREE.Vector3();
  private speed01 = 0;
  private drift = new THREE.Vector3();
  private acc = { tip: 0, wake: 0, thin: 0 };
  private rand = rng(7);
  private v1 = new THREE.Vector3(); private v2 = new THREE.Vector3(); private v3 = new THREE.Vector3();
  private q = new THREE.Quaternion(); private qi = new THREE.Quaternion();
  private started = false;

  private d: Design;
  private faceC = new THREE.Vector3();

  constructor(public design: DesignId = 'kettle') {
    this.d = DESIGNS[design];
    const c = this.d.colors, u = this.mat.uniforms;
    u.uBase.value.set(c.base); u.uShadow.value.set(c.shadow); u.uRim.value.set(c.rim); u.uGlow.value.set(c.glow);
    if (this.d.smoke) {
      const su = this.smoke.material.uniforms, sm = this.d.smoke;
      su.uShadow.value.set(sm.shadow); su.uBase.value.set(sm.base); su.uLit.value.set(sm.lit); su.uPale.value.set(sm.pale);
      u.uLit.value = new THREE.Color(sm.lit); u.uPale.value = new THREE.Color(sm.pale);
    }
    this.root.add(this.scaleGroup);
    this.scaleGroup.scale.setScalar(S);
    this.build();
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.userData.shadow !== false) o.castShadow = true; });
    this.world.add(this.smoke.mesh, this.tailTip, this.carryAnchor);
    const blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, color: '#2A2440', opacity: 0.55 });
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), blobMat);
    this.blob.rotation.x = -Math.PI / 2; this.blob.renderOrder = 1;
    this.world.add(this.blob);
    for (let i = 0; i < 260; i++) this.wispPool.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 0, alpha: 0, seed: 0, erode: 0, light: 0, stretch: 0, age: 0, life: 1, size0: 0, size1: 0, alpha0: 0, buoy: 0, drag: 0, turb: 0 });
  }

  get material() { return this.mat; }

  private ellipsoid(group: THREE.Object3D, pivot: V3, c: V3, r: V3, mat: THREE.Material = this.mat, seg = 32) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)), mat);
    m.scale.set(...r); m.position.set(...sub(c, pivot)); group.add(m); return m;
  }

  /** Scatter puffs over an ellipsoid (metres), keeping the ones `keep` allows. */
  private scatter(bone: THREE.Object3D, pivot: V3, c: V3, r: V3, count: number, size: [number, number], spring: { k: number; lag: number; maxOff: number }, seed: number, keep: (p: V3, n: V3) => boolean, halo = 0) {
    const rand = rng(seed);
    let made = 0, tries = 0;
    while (made < count && tries++ < count * 80) {
      const u = rand() * 2 - 1, th = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const d: V3 = [s * Math.cos(th), u, s * Math.sin(th)];
      const p: V3 = [c[0] + d[0] * r[0], c[1] + d[1] * r[1], c[2] + d[2] * r[2]];
      const nn = new THREE.Vector3(d[0] / r[0], d[1] / r[1], d[2] / r[2]).normalize();
      const n: V3 = [nn.x, nn.y, nn.z];
      if (!keep(p, n)) continue;
      const sz = size[0] + (size[1] - size[0]) * rand();
      // sit the puff a little inside the surface so it softens the edge without bloating the shape
      const inset = sz * (halo ? -0.05 : 0.25);
      const local = new THREE.Vector3(p[0] - n[0] * inset, p[1] - n[1] * inset, p[2] - n[2] * inset).sub(new THREE.Vector3(...pivot));
      const rear = THREE.MathUtils.clamp((-p[2] + 0.02) / 0.15, 0, 1);
      this.puffs.push({
        bone, local, target: new THREE.Vector3(), prevTarget: new THREE.Vector3(), pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        size: sz * S, baseSize: sz * S, alpha: halo ? 0.18 : 0.55, baseAlpha: halo ? 0.18 : 0.55, seed: rand(),
        erode: halo ? 0.45 + rand() * 0.2 : 0.2 + rand() * 0.2, light: halo ? 0.3 : 0.15, stretch: halo ? 0.08 : 0.035, halo,
        k: spring.k * (1 - rear * 0.45), lag: spring.lag * (1 + rear * 1.5), maxOff: spring.maxOff * S * (1 + rear), rear,
      });
      made++;
    }
  }

  private build() {
    const d = this.d, B = d.bodyC, H = d.headC;
    // body: the belly (or just a pivot), rolling and bobbing with the waddle
    this.body.position.set(...B);
    this.scaleGroup.add(this.body);
    if (d.bodyR) this.ellipsoid(this.body, B, B, d.bodyR);
    // the smoke mantle: over the back and sides of the belly, never on the front where the ember sits or underneath
    const keepBelly = (_p: V3, n: V3) => n[1] > -0.45 && !(n[2] > 0.45 && Math.abs(n[0]) < 0.6);
    if (d.mantle) {
      const r = d.mantle.r;
      this.scatter(this.body, B, B, r, d.mantle.count, d.mantle.size, { k: 170, lag: 0.03, maxOff: 0.015 }, 11, keepBelly);
      this.scatter(this.body, B, B, [r[0] * 1.07, r[1] * 1.07, r[2] * 1.07], 16, [d.mantle.size[1] * 1.05, d.mantle.size[1] * 1.5], { k: 120, lag: 0.04, maxOff: 0.03 }, 15, (p, n) => keepBelly(p, n) && n[2] < 0.2, 1);
    }
    // collar: a ring of puffs hiding where the head meets the belly
    if (d.collar) for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      if (Math.cos(a) > 0.75) continue; // keep the chin clear
      this.addPuff(this.body, sub([Math.sin(a) * 0.135, 0.25, Math.cos(a) * 0.12], B), 0.045 + (i % 3) * 0.0075, 0.55, 260, 0.015, 0.012, Math.max(0, -Math.cos(a)));
    }
    // cushion: a flat ring of cloud under a floating spirit, lagging most
    if (d.cushion) for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.addPuff(this.body, sub([Math.sin(a) * 0.11, 0.05, Math.cos(a) * 0.1], B), 0.06 + (i % 2) * 0.012, 0.5, 90, 0.05, 0.04, 0.6);
    }

    // feet: flattened domes on the ground, outside the body so they stay planted while it rolls
    for (const f of d.feet) {
      const g = new THREE.Group(); g.position.set(...f); this.scaleGroup.add(g);
      this.ellipsoid(g, [0, 0, 0], [0, 0, 0], [0.055, 0.03, 0.065], this.mat, 20);
      this.feet.push(g);
    }
    // mittens: little round hands
    for (const m of d.mittens) {
      const g = new THREE.Group(); g.position.set(...sub(m, B)); this.body.add(g);
      const r = d.mittenR;
      this.ellipsoid(g, [0, 0, 0], [0, 0, 0], [r, r * 0.94, r], this.mat, 18);
      this.mittenOff[this.mittens.length].set(...sub(m, B));
      this.mittenRest.push(new THREE.Vector3(...sub(m, B)));
      this.mittens.push(g);
    }
    // wake points on the lower back: where the trail peels off when running
    for (const s of [-1, 1]) { const o = new THREE.Object3D(); o.position.set(...sub([s * 0.06, Math.max(0.12, B[1] - 0.03), -0.14], B)); this.body.add(o); this.wakePts.push(o); }
    this.carryLocal.position.set(...sub(d.carry, B)); this.body.add(this.carryLocal);
    this.carryInBody.set(...sub(d.carry, B)); this.headInBody.set(...sub(d.headC, B));

    // head: a smooth dome of a face, a little puff smoke on the back and top only
    this.head.position.set(...sub(H, B));
    this.body.add(this.head);
    this.ellipsoid(this.head, H, H, d.headR);
    for (const [c, r] of d.extra) this.ellipsoid(this.head, [0, 0, 0], c, r, this.mat, 22);
    const keepHead = (_p: V3, n: V3) => new THREE.Vector3(...n).dot(FACE_N) < 0.2 && n[1] > -0.3;
    const hr = d.headR;
    this.scatter(this.head, H, H, hr, d.headPuffs, [0.04, 0.06], { k: 420, lag: 0.006, maxOff: 0.005 }, 21, keepHead);

    // a point on the head surface, `inset` below it, in head space
    const onHead = (x: number, y: number, inset: number) => {
      const z = hr[2] * Math.sqrt(Math.max(0.05, 1 - (x / hr[0]) ** 2 - (y / hr[1]) ** 2));
      const n = new THREE.Vector3(x / hr[0] ** 2, y / hr[1] ** 2, z / hr[2] ** 2).normalize();
      return { p: new THREE.Vector3(x, y, z).addScaledVector(n, -inset), n };
    };
    for (const side of [1, -1]) {
      const m = eyeMaterial(); this.eyeMats.push(m);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(d.eye.r, 28, 20), m);
      const { p, n } = onHead(side * d.eye.x, d.eye.y, 0.016);
      eye.position.copy(p);
      // look mostly forward, turned a touch outward with the head's curve
      eye.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n.lerp(new THREE.Vector3(0, 0, 1), 0.55).normalize());
      eye.scale.z = 0.7;
      eye.userData.shadow = false;
      this.head.add(eye);
    }
    this.blushMat = new THREE.MeshBasicMaterial({ color: col(PALETTE.blush), transparent: true, opacity: 0.55, depthWrite: false });
    for (const side of [1, -1]) {
      const { p, n } = onHead(side * d.blush.x, d.blush.y, -0.006);
      // on a cheek shape when there is one in front of the head surface
      for (const [c, r] of d.extra) {
        const cc = new THREE.Vector3(...c);
        if (Math.sign(cc.x) !== side || cc.y > 0.05) continue;
        const dir = new THREE.Vector3(side * 0.35, -0.05, 1).normalize();
        p.copy(cc).addScaledVector(dir, r[2] * 1.02); n.copy(dir);
      }
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), this.blushMat);
      m.scale.set(d.blush.r, d.blush.r * 0.66, 0.005);
      m.position.copy(p);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      m.userData.shadow = false;
      this.head.add(m);
    }
    const mouthMat = new THREE.MeshBasicMaterial({ color: col(d.colors.mouth) });
    this.mouthDash = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mouthMat);
    this.mouthDash.scale.set(0.013, 0.0045, 0.004);
    this.mouthSmile = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.004, 6, 14, Math.PI), mouthMat);
    this.mouthSmile.rotation.z = Math.PI;
    const mouth = onHead(0, d.mouthY, -0.001).p;
    for (const m of [this.mouthDash, this.mouthSmile]) {
      m.position.copy(mouth);
      m.userData.shadow = false;
      this.head.add(m);
    }
    this.mouthSmile.position.y += 0.008;
    this.mouthSmile.visible = false;
    this.faceC.copy(onHead(0, 0, 0).p);

    // plume root; the chain itself lives in world space
    this.plumeRoot.position.set(...sub(d.plume.root, H));
    this.head.add(this.plumeRoot);
    this.crown.position.copy(onHead(hr[0] * 0.55, hr[1] * 0.75, 0).p);
    this.head.add(this.crown);
    const N = d.plume.dirs.length + 1;
    for (let i = 0; i < N; i++) { this.plume.push(new THREE.Vector3()); this.plumePrev.push(new THREE.Vector3()); }
    const np = d.plume.puffs;
    for (let i = 0; i < np; i++) {
      const k = i / (np - 1);
      const sz = THREE.MathUtils.lerp(d.plume.size[0], d.plume.size[1], k) * S * (1 + Math.sin(i * 2.3) * 0.12);
      const al = THREE.MathUtils.lerp(d.plume.alpha[0], d.plume.alpha[1], k);
      this.plumePuffs.push({
        bone: this.plumeRoot, local: new THREE.Vector3(), target: new THREE.Vector3(), prevTarget: new THREE.Vector3(),
        pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: sz, baseSize: sz, alpha: al, baseAlpha: al,
        seed: this.rand(), erode: 0.3 + k * 0.45, light: 0.2, stretch: 0.05, k: 0, lag: 0, maxOff: 0, rear: 1, halo: 0,
      });
    }
  }

  private addPuff(bone: THREE.Object3D, local: V3, size: number, alpha: number, k: number, lag: number, maxOff: number, rear: number) {
    this.puffs.push({
      bone, local: new THREE.Vector3(...local), target: new THREE.Vector3(), prevTarget: new THREE.Vector3(),
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: size * S, baseSize: size * S, alpha, baseAlpha: alpha, seed: this.rand(),
      erode: 0.25, light: 0.15, stretch: 0.035, halo: 0, k, lag, maxOff: maxOff * S, rear,
    });
  }

  setLight(sunDir: THREE.Vector3, sunCol: THREE.Color, sky: THREE.Color) {
    const u = this.mat.uniforms;
    u.uSunDir.value.copy(sunDir); u.uSunCol.value.copy(sunCol).multiplyScalar(0.5); u.uSkyCol.value.copy(sky);
    this.sunDir.copy(sunDir);
    this.smoke.material.uniforms.uSkyCol.value.copy(sky);
  }
  private sunDir = new THREE.Vector3(0.5, 0.6, 0.3).normalize();

  /** Put the keepsake ribbon on the side of the head. */
  wear(o: THREE.Object3D) { this.crown.add(o); o.position.set(0, 0, 0); o.rotation.set(0, 0, -0.4); o.scale.setScalar(0.32 / S); }

  kick(kind: 'jump' | 'double' | 'land' | 'bap' | 'happy', strength = 1) {
    if (kind === 'jump') { this.squashV += 5; this.puffRing(0.03, 8, 0.5, 0.07 * S * 0.6, 0.35); this.shovePlume(0, -0.6, 0); }
    if (kind === 'double') {
      this.squashV += 7; this.puffRing(0.17 * S, 14, 1.4, 0.065 * S, 0.45, true); this.shove(0, 1.2, 0);
      for (let i = 0; i < 6; i++) this.burst(this.v1.set(0, 0.12 * S, 0), this.v2.set((this.rand() - 0.5) * 0.6, -1.0 - this.rand() * 0.5, (this.rand() - 0.5) * 0.6), 0.05 * S, 0.4);
    }
    if (kind === 'land') {
      this.squashV -= 4 + 5 * strength;
      if (strength > 0.15) { this.puffRing(0.02, 8 + Math.round(strength * 10), 0.6 + strength * 1.4, 0.06 * S, 0.4 * Math.min(1, 0.4 + strength)); this.shove(0, -1.2 * strength, 0); this.shovePlume(0, -1.2 * strength, 0.6); }
      for (const v of this.mittenVel) v.y += 0.9 * strength;
    }
    if (kind === 'bap') {
      this.bapT = 0; this.happyT = 0.15; this.shovePlume(0, 0.4, -1.2);
      const fwd = this.v3.set(0, 0, 1).applyQuaternion(this.root.quaternion);
      for (let i = 0; i < 6; i++) this.burst(this.v1.set(0, 0.2 * S, 0.17 * S), this.v2.copy(fwd).multiplyScalar(0.8).add(this.v1.set((this.rand() - 0.5) * 0.4, this.rand() * 0.3, (this.rand() - 0.5) * 0.4)), 0.04 * S, 0.35);
    }
    if (kind === 'happy') this.happyT = 0.9;
    this.idle = 0;
  }

  /** Give every surface puff a push: they overshoot and settle, like smoke that got bumped. */
  private shove(x: number, y: number, z: number) {
    for (const p of this.puffs) p.vel.x += x * (0.5 + p.rear), p.vel.y += y * (0.5 + p.rear), p.vel.z += z * (0.5 + p.rear);
  }
  /** Push the plume in Moth's own frame (z forward). */
  private shovePlume(x: number, y: number, z: number) {
    const d = this.v3.set(x, y, z).applyQuaternion(this.root.quaternion).multiplyScalar(0.016);
    const N = this.plume.length;
    for (let i = 1; i < N; i++) this.plumePrev[i].addScaledVector(d, -(i / N));
  }

  /** A wisp at a point in Moth's yaw frame (offset from the feet), with a world velocity. */
  private burst(off: THREE.Vector3, vel: THREE.Vector3, size: number, alpha: number) {
    const w = this.spawnWisp(); if (!w) return;
    w.pos.copy(off).applyQuaternion(this.root.quaternion).add(this.root.position);
    w.vel.copy(vel);
    w.size0 = size; w.size1 = size * 2.4; w.life = 0.6 + this.rand() * 0.3; w.alpha0 = alpha; w.buoy = 0.3; w.drag = 3.2; w.turb = 0.5; w.light = 0.45;
  }

  private puffRing(height: number, n: number, speed: number, size: number, alpha: number, pale = false) {
    const c = this.root.position;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rand() * 0.4;
      const w = this.spawnWisp(); if (!w) return;
      w.pos.set(c.x + Math.cos(a) * 0.1, c.y + height, c.z + Math.sin(a) * 0.1);
      w.vel.set(Math.cos(a) * speed, 0.12 + this.rand() * 0.25, Math.sin(a) * speed);
      w.size0 = size; w.size1 = size * 2.6; w.life = 0.8 + this.rand() * 0.4; w.alpha0 = alpha; w.buoy = 0.45; w.drag = 3.5; w.turb = 0.6; w.light = pale ? 0.6 : 0.25;
    }
  }

  private spawnWisp(): Wisp | null {
    const w = this.wispPool.pop();
    if (!w) return null;
    w.age = 0; w.seed = this.rand(); w.stretch = 0.12; w.erode = 0.3; w.light = 0; w.ring = undefined;
    this.wisps.push(w);
    return w;
  }

  /** speed01: ground speed as 0..1 of run speed. vel: world velocity. */
  update(dt: number, speed01: number, grounded: boolean, vel: THREE.Vector3) {
    this.t += dt;
    const t = this.t;
    this.vel.copy(vel);
    this.speed01 = speed01;
    if (speed01 > 0.05 || !grounded) this.idle = 0; else this.idle += dt;
    const vy = vel.y;
    const fl = this.float;

    // squash and stretch spring, stretched upward in the air
    this.squashV += (-this.squash * 120 - this.squashV * 12) * dt;
    this.squash += this.squashV * dt;
    const air = grounded ? 0 : THREE.MathUtils.clamp(vy * 0.03, -0.12, 0.15);
    const s = THREE.MathUtils.clamp(this.squash * 0.06 + air, -0.25, 0.25);
    // the kettle breath: a slow inhale every few seconds, then a sigh ring out of the crown
    this.sighT -= dt;
    if (this.sighT < 0 && this.sighPhase < 0 && grounded && speed01 < 0.05) { this.sighPhase = 0; }
    let inhale = 0;
    if (this.sighPhase >= 0) {
      this.sighPhase += dt;
      inhale = Math.sin(Math.min(1, this.sighPhase / 1.4) * Math.PI) * (this.sighPhase < 0.9 ? 1 : 0.6);
      if (this.sighPhase > 0.9 && this.sighPhase - dt <= 0.9) this.sighRing();
      if (this.sighPhase > 1.4) { this.sighPhase = -1; this.sighT = 6 + Math.random() * 3; }
    }
    const breath = Math.sin(t * 1.6) * 0.015 + inhale * 0.05;
    this.scaleGroup.scale.set(S * (1 - s * 0.5 + fl * 0.1), S * (1 + s - fl * 0.12), S * (1 - s * 0.5 + fl * 0.1));

    // waddle: feet alternate, lifting and swinging forward; the belly rolls and bobs
    this.lastGait = this.gait;
    const moving = speed01 > 0.03 && grounded;
    this.gait += dt * Math.PI * 2 * (2.4 + speed01 * 1.2) * (moving ? 1 : 0);
    const amp = grounded ? Math.min(1, speed01 * 1.8) : 0;
    const settle = THREE.MathUtils.smoothstep(this.idle, 4, 5.5);
    for (let i = 0; i < this.feet.length; i++) {
      const f = this.feet[i];
      const ph = this.gait + i * Math.PI;
      const lift = Math.max(0, Math.sin(ph)) * 0.025 * amp + (grounded ? 0 : 0.012);
      const F = this.d.feet[i];
      f.position.set(F[0], F[1] + lift, F[2] + Math.cos(ph) * 0.03 * amp + (grounded ? 0 : 0.015));
      f.rotation.x = grounded ? -Math.sin(ph) * 0.3 * amp : -0.35;
      // a little smoke where a foot comes down
      if (amp > 0.25 && Math.sin(this.lastGait + i * Math.PI) > 0 && Math.sin(ph) <= 0) this.footPuff(f);
    }
    const roll = Math.sin(this.gait) * 0.07 * amp;
    const B = this.d.bodyC, hov = this.d.hover;
    // floaters bob gently on their cushion of air; walkers bob with each step
    const bob = hov ? hov + Math.sin(t * 2.5) * 0.012 + Math.sin(this.gait * 0.5) * 0.01 * amp : Math.abs(Math.cos(this.gait)) * 0.008 * amp - settle * 0.015;
    this.body.position.set(B[0], B[1] + bob - (hov ? hov : 0), B[2]);
    this.body.rotation.set(-speed01 * 0.12 * (grounded ? 1 : 0) + (grounded ? 0 : -THREE.MathUtils.clamp(vy * 0.02, -0.15, 0.15)), 0, roll);
    this.body.scale.set(1 + breath * 0.5, 1 + breath, 1 + breath * 0.5);

    // head: counter-roll, look about when idle, a nod on bap
    let bap = 0;
    if (this.bapT >= 0) { this.bapT += dt; bap = Math.sin(Math.min(1, this.bapT / 0.28) * Math.PI); if (this.bapT > 0.28) this.bapT = -1; }
    this.glanceT -= dt;
    if (this.glanceT < 0) { this.glanceGoal = this.idle > 1 ? (Math.random() - 0.5) * 0.9 : 0; this.glanceT = 2.5 + Math.random() * 3; }
    this.glance = THREE.MathUtils.damp(this.glance, this.glanceGoal * (1 - amp), 3, dt);
    const tilt = Math.abs(this.glance) > 0.2 ? Math.sign(this.glance) * 0.14 : 0;
    this.head.rotation.set(Math.sin(t * 0.5) * 0.03 + bap * 0.18 + settle * 0.06, this.glance * 0.5, -roll * 0.35 + Math.sin(t * 0.37) * 0.04 + tilt * (1 - amp));

    // mittens: swing with the steps, reach forward on bap, hug the ember; a soft spring makes them flap
    // (rest, carry and cheek spots are body-space points worked out once in the constructor)
    for (let i = 0; i < this.mittens.length; i++) {
      const m = this.mittens[i];
      const side = i === 0 ? 1 : -1;
      const goal = this.v1.copy(this.mittenRest[i]);
      if (this.carrying) goal.copy(this.carryInBody).add(this.v2.set(side * 0.055, 0.01, -0.02));
      goal.z += Math.sin(this.gait + i * Math.PI) * 0.02 * amp;
      goal.y += grounded ? 0 : 0.025;
      if (bap > 0) goal.lerp(this.v2.copy(this.carryInBody).add(this.v3.set(side * 0.075, 0, 0.07 * bap - 0.03)), bap);
      // cheek touch during a long glance
      if (!this.carrying && this.idle > 1.5 && side * this.glanceGoal < -0.25) goal.lerp(this.v2.copy(this.headInBody).add(this.v3.set(side * 0.1, -0.05, 0.09)), 0.6);
      const o = this.mittenOff[i], v = this.mittenVel[i];
      v.addScaledVector(this.v2.copy(goal).sub(o), 180 * dt).multiplyScalar(Math.exp(-14 * dt));
      o.addScaledVector(v, dt);
      m.position.copy(o);
    }

    // eyes: blink, sleepy after settling, happy squeeze on bap and delivery
    this.nextBlink -= dt;
    if (this.nextBlink < 0) { this.blinkT = 0; this.nextBlink = 3 + Math.random() * 3; if (Math.random() < 0.2) this.nextBlink = 0.25; }
    let lid = 0;
    if (this.blinkT >= 0) { this.blinkT += dt; lid = Math.sin(Math.min(1, this.blinkT / 0.18) * Math.PI); if (this.blinkT > 0.18) this.blinkT = -1; }
    const sleepy = THREE.MathUtils.smoothstep(this.idle, 14, 17);
    this.happyT = Math.max(0, this.happyT - dt);
    const happy = this.happyT > 0 ? 1 : 0;
    for (const m of this.eyeMats) {
      m.uniforms.uLid.value = Math.max(settle * 0.08, lid, sleepy * 0.85);
      m.uniforms.uHappy.value = THREE.MathUtils.damp(m.uniforms.uHappy.value, happy, 18, dt);
      m.uniforms.uPupilW.value = 0.52 + this.thin * 0.08;
      m.uniforms.uLook.value.set(this.glance * 1.6, 0);
    }
    this.mouthSmile.visible = happy > 0 || this.carrying;
    this.mouthDash.visible = !this.mouthSmile.visible;
    this.blushMat.opacity = this.carrying || happy ? 0.85 : 0.55;

    this.root.updateMatrixWorld(true);
    this.updatePuffs(dt);
    this.updatePlume(dt);
    this.carryLocal.getWorldPosition(this.carryAnchor.position);
    this.emit(dt);
    this.updateWisps(dt);

    const u = this.mat.uniforms;
    u.uTime.value = t;
    this.drift.addScaledVector(vel, -dt * 9);
    u.uDrift.value.copy(this.drift);
    u.uRoot.value.copy(this.root.position);
    this.head.localToWorld(u.uFace.value.copy(this.faceC));
    u.uPale01.value = Math.max(this.thin, fl * 0.6);
    u.uEmber.value = THREE.MathUtils.damp(u.uEmber.value, this.carrying ? 1 : 0, 6, dt);
    u.uEmberPos.value.copy(this.carryAnchor.position);
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
      swirl(this.v2, p.target.x * 9 + p.seed * 9, p.target.y * 9, p.target.z * 9, this.t * 1.3 + p.seed * 10);
      const k = p.k * (1 - fl * 0.6), cRel = 2 * Math.sqrt(k) * 0.55, cAir = p.lag * k;
      const turb = 0.12 + sp * 0.7 * p.rear;
      // substeps keep the springs stable on slow devices; the target moves linearly across them
      for (let j = 1; j <= n; j++) {
        const f = j / n - 1;
        const tx = p.target.x + tv.x * f * dt, ty = p.target.y + tv.y * f * dt, tz = p.target.z + tv.z * f * dt;
        const ax = k * (tx - p.pos.x) - cRel * (p.vel.x - tv.x) - cAir * p.vel.x + this.v2.x * turb;
        const ay = k * (ty - p.pos.y) - cRel * (p.vel.y - tv.y) - cAir * p.vel.y + this.v2.y * turb + p.rear * sp * 0.5;
        const az = k * (tz - p.pos.z) - cRel * (p.vel.z - tv.z) - cAir * p.vel.z + this.v2.z * turb;
        p.vel.x += ax * h; p.vel.y += ay * h; p.vel.z += az * h;
        p.pos.x += p.vel.x * h; p.pos.y += p.vel.y * h; p.pos.z += p.vel.z * h;
      }
      // keep the shape readable: a puff never wanders far from its place
      const off = this.v3.copy(p.pos).sub(p.target);
      const max = p.maxOff * (1 + fl * 2) * (1 + sp);
      if (off.length() > max) { off.setLength(max); p.pos.copy(p.target).add(off); }
      p.size = p.baseSize * (1 + Math.sin(this.t * 1.4 + p.seed * 20) * 0.07 + fl * 0.5 + this.thin * 0.15 + sp * p.rear * 0.15);
      p.alpha = p.baseAlpha * (1 - this.thin * 0.35);
      p.light = Math.max(0.15, this.thin * 0.8, fl * 0.5, p.halo * 0.3);
      p.erode = (p.halo ? 0.45 : 0.2) + p.seed * 0.2 + sp * p.rear * 0.35 + fl * 0.3;
    }
  }

  private updatePlume(dt: number) {
    const root = this.plumeRoot.getWorldPosition(this.v1);
    this.root.getWorldQuaternion(this.q);
    this.qi.copy(this.q).invert();
    const P = this.d.plume, N = this.plume.length, SEG = P.seg * S;
    if (!this.started) {
      const p = root.clone();
      for (let i = 0; i < N; i++) {
        if (i > 0) p.add(this.v2.set(...P.dirs[i - 1]).normalize().multiplyScalar(SEG).applyQuaternion(this.q));
        this.plume[i].copy(p); this.plumePrev[i].copy(p);
      }
    }
    this.plume[0].copy(root); this.plumePrev[0].copy(root);
    const sp = this.speed01, fl = this.float;
    const rest = this.v3.copy(root);
    const run = THREE.MathUtils.smoothstep(sp, 0.3, 0.9);
    for (let i = 1; i < N; i++) {
      const k = i / (N - 1);
      const d = P.dirs[i - 1];
      // at a run the whole plume streams back
      const dir = this.v2.set(THREE.MathUtils.lerp(d[0], P.run[0], run), THREE.MathUtils.lerp(d[1], P.run[1], run), THREE.MathUtils.lerp(d[2], P.run[2], run)).normalize();
      dir.x += Math.sin(this.t * 1.1 - i * 0.6) * 0.18 * k; // a slow sway, bigger toward the tip
      dir.y += Math.sin(this.t * 1.9) * 0.05 * k;
      dir.normalize().multiplyScalar(SEG * (1 + run * 0.3)).applyQuaternion(this.q);
      rest.add(dir);
      const p = this.plume[i], pp = this.plumePrev[i];
      const vx = p.x - pp.x, vy = p.y - pp.y, vz = p.z - pp.z;
      pp.copy(p);
      const keep = 0.86; // viscous: the plume always arrives late
      const shape = (55 - k * 40) * (1 - fl * 0.5);
      swirl(this.v2, p.x * 6, p.y * 6, p.z * 6, this.t * 1.2 + i * 0.3);
      const turb = (k > 0.6 ? 0.3 : 0.1) + sp * 1.4 * k;
      p.x += vx * keep + ((rest.x - p.x) * shape + this.v2.x * turb) * dt * dt;
      p.y += vy * keep + ((rest.y - p.y) * shape + this.v2.y * turb + P.buoy * k) * dt * dt;
      p.z += vz * keep + ((rest.z - p.z) * shape + this.v2.z * turb) * dt * dt;
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < N; i++) {
        const a = this.plume[i - 1], b = this.plume[i];
        const d = this.v2.copy(b).sub(a); const L = d.length() || 1e-5;
        b.copy(a).addScaledVector(d, (SEG * (1 + run * 0.3 + fl * 0.3)) / L);
        // never in front of the face: below the crown the plume stays behind the face plane
        const lp = this.v2.copy(b).sub(this.root.position).applyQuaternion(this.qi);
        const crownY = (this.d.headC[1] + this.d.headR[1]) * S;
        if (lp.y < crownY + 0.06 * S && lp.z > 0.04 * S) { lp.z = 0.04 * S; b.copy(lp.applyQuaternion(this.q).add(this.root.position)); }
      }
    }
    // puffs ride the chain, thinning to a dissolving tip
    const n = this.plumePuffs.length;
    for (let j = 0; j < n; j++) {
      const f = (j / (n - 1)) * (N - 1);
      const i = Math.min(N - 2, Math.floor(f)), w = f - i;
      const tp = this.plumePuffs[j];
      const prev = this.v2.copy(tp.pos);
      tp.pos.lerpVectors(this.plume[i], this.plume[i + 1], w);
      tp.vel.copy(tp.pos).sub(prev).divideScalar(Math.max(dt, 1e-4));
      const k = j / (n - 1);
      tp.size = tp.baseSize * (1 + Math.sin(this.t * 2.1 + j) * 0.08 + fl * 0.4 + this.thin * 0.15) * (1 - run * 0.15);
      tp.alpha = tp.baseAlpha * (1 - this.thin * 0.35);
      const L = this.d.plume.light;
      tp.light = Math.max(L[0] + (L[1] - L[0]) * k, this.thin * 0.8, fl * 0.5);
      tp.erode = 0.3 + k * 0.45 + sp * 0.15;
    }
    this.tailTip.position.copy(this.plume[N - 1]);
  }

  private footPuff(f: THREE.Object3D) {
    const at = f.getWorldPosition(this.v1);
    for (let k = 0; k < 2; k++) {
      const w = this.spawnWisp(); if (!w) return;
      w.pos.copy(at).add(this.v2.set((this.rand() - 0.5) * 0.05, 0.01, (this.rand() - 0.5) * 0.05));
      w.vel.set((this.rand() - 0.5) * 0.25, 0.1 + this.rand() * 0.1, (this.rand() - 0.5) * 0.25).addScaledVector(this.vel, -0.1);
      w.size0 = 0.025; w.size1 = 0.07; w.life = 0.6 + this.rand() * 0.3; w.alpha0 = 0.28; w.buoy = 0.25; w.drag = 3; w.turb = 0.4; w.light = 0.3;
    }
  }

  /** One small smoke ring out of the crown, drifting up and away on the wind. */
  private sighRing() {
    const c = this.plumeRoot.getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const w = this.spawnWisp(); if (!w) return;
      w.ring = c.clone();
      w.pos.set(c.x + Math.cos(a) * 0.03, c.y + 0.02, c.z + Math.sin(a) * 0.03);
      w.vel.set(Math.cos(a) * 0.05, 0.25, Math.sin(a) * 0.05);
      w.size0 = 0.03; w.size1 = 0.05; w.life = 1.8; w.alpha0 = 0.3; w.buoy = 0.0; w.drag = 0.6; w.turb = 0.12; w.light = 0.6;
    }
  }

  private emit(dt: number) {
    const sp = this.speed01, fl = this.float, th = this.thin;
    // the plume tip always smokes a little, like steam off a kettle; streams when running
    this.acc.tip += dt * (this.d.plume.tipRate + sp * 9 + fl * 20 + th * 10);
    while (this.acc.tip > 1) {
      this.acc.tip -= 1;
      const w = this.spawnWisp(); if (!w) break;
      const a = this.plume[this.plume.length - 1], b = this.plume[this.plume.length - 2];
      w.pos.lerpVectors(b, a, 0.5 + this.rand() * 0.5).add(this.v1.set((this.rand() - 0.5) * 0.02, 0, (this.rand() - 0.5) * 0.02));
      w.vel.copy(this.vel).multiplyScalar(0.35).add(this.v1.set((this.rand() - 0.5) * 0.1, 0.12 + this.rand() * 0.1, (this.rand() - 0.5) * 0.1));
      w.size0 = 0.035 + this.rand() * 0.015; w.size1 = 0.09 + this.rand() * 0.04; w.life = 1.6 + this.rand() * 0.6;
      w.alpha0 = 0.24; w.buoy = 0.45; w.drag = 2.2; w.turb = 0.5; w.light = 0.55 + th * 0.3;
    }
    // the lower back sheds a wake when moving: the trail, alternating sides
    this.acc.wake += dt * (sp > 0.1 ? 6 + sp * 10 : 0) + dt * fl * 15;
    while (this.acc.wake > 1) {
      this.acc.wake -= 1;
      const w = this.spawnWisp(); if (!w) break;
      this.wakePts[this.rand() < 0.5 ? 0 : 1].getWorldPosition(w.pos);
      w.vel.copy(this.vel).multiplyScalar(0.35).add(this.v1.set((this.rand() - 0.5) * 0.2, 0.08 + this.rand() * 0.15, (this.rand() - 0.5) * 0.2));
      w.size0 = 0.05 + this.rand() * 0.02; w.size1 = 0.13 + this.rand() * 0.04; w.life = 1.1 + this.rand() * 0.5;
      w.alpha0 = 0.38; w.buoy = 0.4; w.drag = 2.2; w.turb = 0.8; w.light = 0.2 + th * 0.5;
    }
    // thinning (the old gate trick): smoke rising off the whole body
    this.acc.thin += dt * th * 40;
    while (this.acc.thin > 1) {
      this.acc.thin -= 1;
      const src = this.puffs[Math.floor(this.rand() * this.puffs.length)];
      const w = this.spawnWisp(); if (!w) break;
      w.pos.copy(src.pos); w.vel.set((this.rand() - 0.5) * 0.1, 0.2, (this.rand() - 0.5) * 0.1);
      w.size0 = 0.06; w.size1 = 0.12; w.life = 1.0; w.alpha0 = 0.35; w.buoy = 0.3; w.drag = 2; w.turb = 0.5; w.light = 0.7;
    }
  }

  private updateWisps(dt: number) {
    for (let i = this.wisps.length - 1; i >= 0; i--) {
      const w = this.wisps[i];
      w.age += dt;
      const k = w.age / w.life;
      if (k >= 1) { this.wisps[i] = this.wisps[this.wisps.length - 1]; this.wisps.pop(); this.wispPool.push(w); continue; }
      if (w.ring) {
        // a smoke ring keeps its shape: it widens slowly as its centre rises and drifts
        w.ring.y += 0.22 * dt; w.ring.x -= 0.04 * dt;
        const a = Math.atan2(w.pos.z - w.ring.z, w.pos.x - w.ring.x), r = 0.03 + k * 0.07;
        w.pos.set(w.ring.x + Math.cos(a) * r, w.ring.y, w.ring.z + Math.sin(a) * r);
      } else {
        swirl(this.v1, w.pos.x * 5 + w.seed * 5, w.pos.y * 5, w.pos.z * 5, this.t * 1.1 + w.seed * 6);
        w.vel.addScaledVector(this.v1, w.turb * dt);
        if (k < 0.6) w.vel.y += w.buoy * dt;
        w.vel.multiplyScalar(Math.exp(-w.drag * dt));
        w.pos.addScaledVector(w.vel, dt);
      }
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
    for (const p of this.plumePuffs) this.slots.push(p);
    this.smoke.setSun(this.sunDir, camera);
    this.smoke.write(this.slots, camera, time);
  }

  get puffCount() { return this.puffs.length + this.plumePuffs.length + this.wisps.length; }
}

function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!; const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
