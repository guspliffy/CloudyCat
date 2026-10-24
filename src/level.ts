import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PAL, pmat, pmatVC, paint, SHARED, WIND } from './world/ghibli';
import { Foliage } from './world/foliage';
import { Meadow, Tuft, Flower } from './world/meadow';
import { Kit, G } from './world/kit';
import { stoneTex, tileTex, plankTex, plasterTex, flagTex, boxUV } from './world/textures';
import { mulberry } from './world/sky';

// Mill Terrace (docs/ART-GUIDE.md section 3). World: X east, -Z north, Y up, metres.
// The cottage garden is a terrace raised 1.6 m. From the start you look over its low parapet, through the
// gate, down the steps to the court where the hearth spirit sleeps beside three cold lanterns, with the
// river, the waterwheel and the mill beyond. Steps and a grassy bank both lead back up, so nothing is one-way.

export type Surface = 'grass' | 'stone' | 'wood';
export const TERRACE_Y = 1.6;

export interface Pot { body: RAPIER.RigidBody; mesh: THREE.Object3D; seed: number | null; spawn: THREE.Vector3; prevV: THREE.Vector3; broken: boolean }

type Seg = [number, number, number, number];
const TERRACE = { x0: -10, x1: 9.3, z0: -9.5, z1: 7.8 };
const RAMP = { x0: -9.8, x1: -7.2, z0: -16, z1: -10 };
const RIVER = { x0: 9.5, x1: 13.5, bed: -1.2, water: -0.35 };
const PLAY = { x0: -10.4, x1: 21.4, z0: -27.6, z1: 8 };

function hash2(x: number, z: number) { const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
const smooth = THREE.MathUtils.smoothstep;

/** Ground height everywhere (the terrace top, the ramp, the court, the river channel, the hills beyond). */
export function heightAt(x: number, z: number) {
  let h = 0;
  const inTerraceX = x >= TERRACE.x0 && x <= TERRACE.x1;
  if (inTerraceX && z >= TERRACE.z0) h = TERRACE_Y;
  // the grassy bank up the west side of the court
  if (x >= RAMP.x0 - 0.01 && x <= RAMP.x1 + 1.0 && z >= RAMP.z0 && z <= TERRACE.z0) {
    const ry = TERRACE_Y * THREE.MathUtils.clamp((z - RAMP.z0) / (RAMP.z1 - RAMP.z0), 0, 1);
    const side = x <= RAMP.x1 ? 1 : 1 - (x - RAMP.x1) / 1.0;
    h = Math.max(h, ry * side);
  }
  // hills beyond the play area
  const dx = Math.max(PLAY.x0 - x, 0, x - PLAY.x1), dz = Math.max(PLAY.z0 - z, 0, z - PLAY.z1);
  const d = Math.hypot(dx, dz);
  if (d > 0) {
    const valley = smooth(Math.abs(x - 11.5), 3, 18);
    const hill = (vnoise(x * 0.035, z * 0.035) * 9 + vnoise(x * 0.09 + 3, z * 0.09) * 3 + d * 0.06) * smooth(d, 2, 30) * valley;
    h += hill;
  }
  // the river channel runs the whole valley north to south
  const inRiver = smooth(x, RIVER.x0 - 0.2, RIVER.x0 + 0.3) * (1 - smooth(x, RIVER.x1 - 0.3, RIVER.x1 + 0.2));
  h = h * (1 - inRiver) + RIVER.bed * inRiver;
  return h;
}

export class Level {
  group = new THREE.Group();
  surfaces = new Map<number, Surface>();
  camBlock = new Set<number>();
  pots: Pot[] = [];
  crates: { body: RAPIER.RigidBody; mesh: THREE.Object3D; spawn: THREE.Vector3 }[] = [];
  seeds: THREE.Vector3[] = [];
  spirit = new THREE.Vector3(2, 0.45, -18.5);
  wheel!: THREE.Group;
  lanterns: { glass: THREE.Mesh; halo: THREE.Sprite; pos: THREE.Vector3 }[] = [];
  gateLantern!: { glass: THREE.Mesh; halo: THREE.Sprite };
  keepsake = new THREE.Vector3(0, 4.55, -9.7);
  fireflies: THREE.Vector3[] = [];
  anchors = {
    start: new THREE.Vector3(1.8, TERRACE_Y, 3.0),
    wall: new THREE.Vector3(3.2, TERRACE_Y + 1.5, -3.0),
    pot: new THREE.Vector3(4.2, TERRACE_Y + 1.5, -3.0),
    gate: new THREE.Vector3(0, TERRACE_Y + 1.6, -9.7),
    steps: new THREE.Vector3(0, 0.6, -12.8),
    barrel: new THREE.Vector3(6.2, TERRACE_Y + 2.9, -7.0),
    hearth: new THREE.Vector3(2, 2.4, -18.5),
  };
  spiritMesh!: THREE.Group;
  spiritGlow!: THREE.Mesh;
  spiritEyes: THREE.Object3D[] = [];
  spiritOpenEyes: THREE.Object3D[] = [];
  sunShafts: THREE.Mesh[] = [];
  chimney = new THREE.Vector3(7.4, 5.6, 5.6);
  gate!: { leaves: THREE.Group[]; collider: RAPIER.Collider; open: number; opening: boolean; centre: THREE.Vector3 };
  anim: ((t: number, dt: number) => void)[] = [];
  sparrows: { obj: THREE.Group; home: THREE.Vector3; t: number; away: boolean }[] = [];
  inWater = (p: THREE.Vector3) => p.x > RIVER.x0 - 0.05 && p.x < RIVER.x1 + 0.05 && p.y < -0.1;

  private kit = new Kit();
  foliage = new Foliage();
  private meadow = new Meadow();
  private clearRects: [number, number, number, number][] = [];
  private paths: Seg[] = [];
  private rand = mulberry(2024);
  private T = {
    stone: stoneTex(), tile: tileTex(), plank: plankTex(), plaster: plasterTex(), flag: flagTex(),
  };
  private M!: Record<string, THREE.Material>;

  constructor(private world: RAPIER.World, private phone = false) {}

  // ---------- physics helpers ----------
  private collBox(cx: number, cy: number, cz: number, w: number, h: number, d: number, surface: Surface, rotY = 0, block = false) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0));
    const col = this.world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(cx, cy, cz).setRotation(q));
    this.surfaces.set(col.handle, surface);
    if (block) this.camBlock.add(col.handle);
    return col;
  }
  private collCyl(cx: number, cy: number, cz: number, r: number, h: number, surface: Surface, block = false) {
    const col = this.world.createCollider(RAPIER.ColliderDesc.cylinder(h / 2, r).setTranslation(cx, cy, cz));
    this.surfaces.set(col.handle, surface);
    if (block) this.camBlock.add(col.handle);
    return col;
  }
  /**
   * A clean pitched roof: two tiled slabs with an overhang, a rounded ridge cap, plaster gable ends
   * filling the triangle under it, dark barge boards on the gable edges and a fascia along the eaves.
   * The ridge runs along local X (length `len`); `span` is the wall depth across it; `rotY` turns it.
   */
  private roof(cx: number, cy: number, cz: number, len: number, span: number, rise: number, over: number, rotY = 0) {
    const M = this.M;
    const o = new THREE.Group(); o.position.set(cx, cy, cz); o.rotation.y = rotY;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, p: [number, number, number], rx = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(rx, 0, rz); o.add(m);
    };
    const a = Math.atan2(rise, span / 2), run = span / 2 + over, L = run / Math.cos(a), th = 0.09, full = len + over * 2;
    for (const s of [-1, 1]) {
      const nY = Math.cos(a), nZ = s * Math.sin(a);
      const mz = (s * run) / 2, my = rise - Math.tan(a) * (run / 2);
      add(boxUV(G.box(full, th, L), full, th, L, 1), M.tile, [0, my + (nY * th) / 2, mz + (nZ * th) / 2], s * a);
      // barge boards under the slab edge at both gable ends
      for (const e of [-1, 1]) add(G.box(0.07, 0.18, L - 0.02), M.woodDark, [e * (full / 2 + 0.006 + (s + 1) * 0.004), my - nY * 0.09, mz - nZ * 0.09], s * a);
      // fascia board along the eave
      const ey = rise - Math.tan(a) * run;
      add(G.box(full, 0.14, 0.06), M.woodDark, [0, ey - 0.05, s * (run - 0.03)]);
    }
    // ridge cap
    add(G.cyl(0.085, 0.085, full + 0.06, 10), M.ridge, [0, rise + th * 0.75, 0], 0, Math.PI / 2);
    // plaster gable triangle under the roof, with a tie beam hiding the seam to the wall below
    add(G.gable(len, span - 0.04, rise - 0.08), M.plaster, [0, 0, 0]);
    for (const e of [-1, 1]) add(G.box(0.1, 0.13, span + 0.12), M.woodDark, [e * (len / 2 + 0.03), 0.0, 0]);
    this.kit.addObject(o);
  }

  private clear(x0: number, z0: number, x1: number, z1: number) { this.clearRects.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]); }
  private isClear(x: number, z: number) {
    for (const [a, b, c, d] of this.clearRects) if (x > a && x < c && z > b && z < d) return false;
    return true;
  }
  private pathDist(x: number, z: number) {
    let best = 99;
    for (const [ax, az, bx, bz] of this.paths) {
      const vx = bx - ax, vz = bz - az, wx = x - ax, wz = z - az;
      const t = THREE.MathUtils.clamp((wx * vx + wz * vz) / (vx * vx + vz * vz), 0, 1);
      best = Math.min(best, Math.hypot(wx - vx * t, wz - vz * t));
    }
    return best;
  }

  /** A textured box baked into the kit, with an optional collider. */
  private box(cx: number, cy: number, cz: number, w: number, h: number, d: number, mat: THREE.Material, surface?: Surface, opts: { rotY?: number; unit?: number; block?: boolean } = {}) {
    const g = boxUV(G.box(w, h, d), w, h, d, opts.unit ?? 1);
    this.kit.add(g, mat, { x: cx, y: cy, z: cz }, [0, opts.rotY ?? 0, 0]);
    if (surface) return this.collBox(cx, cy, cz, w, h, d, surface, opts.rotY ?? 0, opts.block);
    return null;
  }

  build() {
    const T = this.T;
    this.M = {
      stone: pmat(PAL.wall, { map: T.stone }),
      stoneDark: pmat('#C9BFA9', { map: T.stone }),
      plaster: pmat(PAL.plaster, { map: T.plaster }),
      tile: pmat(PAL.roof, { map: T.tile }),
      ridge: pmat('#A65E4A'),
      plank: pmat(PAL.wood, { map: T.plank }),
      plankDark: pmat(PAL.woodDark, { map: T.plank }),
      wood: pmat(PAL.wood), woodDark: pmat(PAL.woodDark), clay: pmat(PAL.clay), moss: pmat(PAL.moss),
      flag: pmat('#E4D6BC', { map: T.flag }), iron: pmat('#5C5468'), cloth: pmat('#F3EEE2'), straw: pmat('#E2C27A'),
      leaf: pmat(PAL.leafMid), glassDark: pmat('#53648A'), white: pmat('#FBF7EC'), pebble: pmat('#BDB6C4'),
    };
    this.layoutPaths();
    this.terrain();
    this.terraceStructure();
    this.cottage();
    this.garden();
    this.court();
    this.riverSide();
    this.boundaries();
    this.scenery();
    this.planting();
    this.group.add(this.kit.build(), this.foliage.build(), this.meadow.group);
  }

  // ---------- paths ----------
  private layoutPaths() {
    const line = (pts: number[][]) => { for (let i = 0; i < pts.length - 1; i++) this.paths.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]); };
    // terrace: from the stoop, past the garden wall, to the gate
    line([[3.4, 5.0], [2.2, 3.0], [1.0, 0.8], [0.3, -1.6], [-0.4, -4.2], [-0.5, -6.6], [0, -9.4]]);
    line([[0.3, -1.6], [2.0, -4.6], [4.4, -5.8]]); // to the barrels
    line([[-0.4, -4.2], [-3.5, -6.8], [-7.0, -8.6], [-8.5, -10.2]]); // west, to the bank
    // court: from the steps to the hearth, the shed, the bridge; the bank back up
    line([[0, -12.5], [0.5, -14.6], [1.6, -16.5]]);
    line([[0.5, -14.6], [-1.8, -16.2], [-3.4, -17.4]]);
    line([[2.6, -16.6], [5.0, -18.8], [7.4, -22.4], [9.2, -24.5]]);
    line([[-8.5, -10.2], [-8.5, -16.2], [-6.0, -15.8], [-1.8, -16.2]]);
    line([[14.0, -24.5], [15.6, -22.0], [15.6, -21.6]]); // far bank to the mill door
  }

  // ---------- ground ----------
  private terrain() {
    const inner = { x0: -12, x1: 24, z0: -30, z1: 10, step: 0.5 };
    const nx = Math.round((inner.x1 - inner.x0) / inner.step) + 1, nz = Math.round((inner.z1 - inner.z0) / inner.step) + 1;
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const c = new THREE.Color();
    const root = new THREE.Color(PAL.grassRoot), mid = new THREE.Color(PAL.grassMid), earth = new THREE.Color(PAL.path), wet = new THREE.Color('#8E8496');
    const colorAt = (x: number, z: number, y: number, out: THREE.Color) => {
      const n = vnoise(x * 0.4, z * 0.4) * 0.6 + vnoise(x * 1.3, z * 1.3) * 0.4;
      out.copy(root).lerp(mid, 0.35 + n * 0.45);
      const pd = this.pathDist(x, z) + (vnoise(x * 3, z * 3) - 0.5) * 0.35;
      const onPath = 1 - smooth(pd, 0.45, 0.85);
      out.lerp(earth, onPath * 0.9);
      if (y < -0.2) out.lerp(wet, smooth(-y, 0.2, 0.8));
      return out;
    };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = inner.x0 + i * inner.step, z = inner.z0 + j * inner.step, y = heightAt(x, z);
      pos.push(x, y, z);
      colorAt(x, z, y, c); col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const groundMat = pmatVC();
    const mesh = new THREE.Mesh(g, groundMat); mesh.receiveShadow = true;
    this.group.add(mesh);
    const tri = this.world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(pos), new Uint32Array(idx)));
    this.surfaces.set(tri.handle, 'grass');

    // the far land, coarse
    const outer = { x0: -160, x1: 170, z0: -180, z1: 140, step: 5 };
    const ox = Math.round((outer.x1 - outer.x0) / outer.step) + 1, oz = Math.round((outer.z1 - outer.z0) / outer.step) + 1;
    const p2: number[] = [], c2: number[] = [], i2: number[] = [];
    const far = new THREE.Color('#8FB06A');
    for (let j = 0; j < oz; j++) for (let i = 0; i < ox; i++) {
      const x = outer.x0 + i * outer.step, z = outer.z0 + j * outer.step;
      const y = heightAt(x, z) - 0.04;
      p2.push(x, y, z);
      colorAt(x, z, y, c).lerp(far, smooth(Math.hypot(x, z + 10), 30, 120) * 0.5 + vnoise(x * 0.05, z * 0.05) * 0.2);
      c2.push(c.r, c.g, c.b);
    }
    const inside = (x: number, z: number) => x > inner.x0 + 0.6 && x < inner.x1 - 0.6 && z > inner.z0 + 0.6 && z < inner.z1 - 0.6;
    for (let j = 0; j < oz - 1; j++) for (let i = 0; i < ox - 1; i++) {
      const x = outer.x0 + i * outer.step, z = outer.z0 + j * outer.step;
      if (inside(x, z) && inside(x + outer.step, z) && inside(x, z + outer.step) && inside(x + outer.step, z + outer.step)) continue;
      const a = j * ox + i, b = a + 1, d = a + ox, e = d + 1;
      i2.push(a, d, b, b, d, e);
    }
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3));
    g2.setAttribute('color', new THREE.Float32BufferAttribute(c2, 3));
    g2.setIndex(i2); g2.computeVertexNormals();
    const m2 = new THREE.Mesh(g2, groundMat); m2.receiveShadow = true;
    this.group.add(m2);

    // the river
    const water = new THREE.Mesh(new THREE.PlaneGeometry(RIVER.x1 - RIVER.x0 + 0.8, 320, 1, 1), waterMaterial());
    water.rotation.x = -Math.PI / 2; water.position.set((RIVER.x0 + RIVER.x1) / 2, RIVER.water, -20);
    this.group.add(water);
  }

  // ---------- the terrace: wall, parapet, gate, steps ----------
  private terraceStructure() {
    const M = this.M, Y = TERRACE_Y;
    // retaining wall along the north edge (gap for the steps, ends at the bank)
    for (const [x0, x1] of [[RAMP.x1, -1.15], [1.15, TERRACE.x1]]) {
      const w = x1 - x0, cx = (x0 + x1) / 2;
      this.box(cx, Y / 2, -9.75, w, Y, 0.5, M.stone, 'stone', { block: true, unit: 1.2 });
      this.box(cx, Y + 0.25, -9.65, w, 0.5, 0.4, M.stone, 'stone', { unit: 1.2 });
      this.box(cx, Y + 0.53, -9.65, w + 0.06, 0.08, 0.48, M.stoneDark, undefined, { unit: 1.2 });
      this.clear(x0 - 0.2, -10.2, x1 + 0.2, -9.3);
    }
    // east end of the terrace drops to the river: a wall
    this.box(9.15, Y / 2 - 0.3, -1.0, 0.4, Y + 0.6, 17.6, M.stone, 'stone', { unit: 1.2 });
    // landing and five steps down to the court, with stone cheeks
    this.box(0, Y / 2, -9.7, 2.3, Y, 0.6, M.stone, 'stone', { unit: 1.2 });
    for (let i = 0; i < 5; i++) {
      const top = Y - (Y / 6) * (i + 1);
      const z = -10.0 - 0.5 * i - 0.25;
      this.box(0, top / 2, z, 2.0, top, 0.5, M.stoneDark, 'stone', { unit: 0.8 });
      this.kit.add(G.box(1.9, 0.04, 0.12), M.moss, { x: 0, y: top + 0.01, z: z + 0.2 });
      for (const s of [-1, 1]) this.box(s * 1.15, (top + 0.35) / 2, z, 0.3, top + 0.35, 0.5, M.stone, 'stone', { unit: 1.2 });
    }
    this.clear(-1.4, -12.6, 1.4, -9.3);
    // a rope rail on the east cheek
    for (let i = 0; i < 4; i++) this.kit.add(G.cyl(0.035, 0.035, 0.7, 6), M.woodDark, { x: 1.15, y: Y - 0.3 * i + 0.55, z: -10.1 - i * 0.8 });
    const rope = new THREE.CatmullRomCurve3([0, 1, 2, 3].map((i) => new THREE.Vector3(1.15, Y - 0.3 * i + 0.86, -10.1 - i * 0.8)));
    this.kit.add(new THREE.TubeGeometry(rope, 20, 0.02, 5), M.straw, { x: 0, y: 0, z: 0 });

    // the gate: two posts, a small tiled roof, a half-height wooden gate that swings open
    const gz = -9.65;
    for (const s of [-1, 1]) {
      this.box(s * 1.2, Y + 1.2, gz, 0.26, 2.4, 0.3, M.plankDark, 'wood', { unit: 0.6 });
      this.kit.add(G.sph(0.09), M.woodDark, { x: s * 1.2, y: Y + 2.45, z: gz });
    }
    this.box(0, Y + 2.35, gz, 2.9, 0.18, 0.34, M.plankDark, 'wood', { unit: 0.6 });
    this.roof(0, Y + 2.44, gz, 2.7, 0.34, 0.42, 0.32);
    this.collBox(0, Y + 2.6, gz, 3.3, 0.4, 1.0, 'wood');
    // ivy on the west post
    for (let i = 0; i < 14; i++) {
      const y = Y + 0.2 + i * 0.16, a = i * 1.7;
      this.kit.add(G.ico(0.09 + this.rand() * 0.05, 0), M.leaf, { x: -1.2 + Math.sin(a) * 0.15, y, z: gz + Math.cos(a) * 0.17 });
    }
    // the hanging lantern under the beam (lights when the mill wakes)
    this.gateLantern = this.lanternHead(new THREE.Vector3(0.6, Y + 1.95, gz), true);
    // the two leaves
    const leaves: THREE.Group[] = [];
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group(); hinge.position.set(s * 1.07, Y, gz);
      const leaf = new THREE.Group(); leaf.position.x = -s * 0.53; hinge.add(leaf);
      for (let k = 0; k < 5; k++) {
        const slat = new THREE.Mesh(G.box(0.15, 1.0 - Math.abs(k - 2) * 0.04, 0.05), M.plank);
        slat.position.set(-0.4 + k * 0.2, 0.6, 0); slat.castShadow = true; leaf.add(slat);
      }
      for (const y of [0.35, 0.95]) { const rail = new THREE.Mesh(G.box(1.0, 0.08, 0.06), M.plankDark); rail.position.set(0, y, 0.03); rail.castShadow = true; leaf.add(rail); }
      const ring = new THREE.Mesh(G.torus(0.06, 0.012, 6, 12), M.iron); ring.position.set(s * 0.42, 0.7, 0.07); leaf.add(ring);
      this.group.add(hinge); leaves.push(hinge);
    }
    const gcol = this.collBox(0, Y + 0.6, gz, 2.1, 1.2, 0.12, 'wood');
    this.gate = { leaves, collider: gcol, open: 0, opening: false, centre: new THREE.Vector3(0, Y + 0.5, gz) };
    // light shafts: the sun comes over the court through the gate
    const shaftMat = new THREE.MeshBasicMaterial({ color: '#FFE6B8', map: shaftTexture(), transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3.0), shaftMat.clone());
      s.position.set(-0.8 + i * 0.4, Y + 1.05, -9.0); s.rotation.set(-0.75, 0.15, 0);
      this.group.add(s); this.sunShafts.push(s);
    }
    // flower pots along the parapet, a few tipped over
    const potsAt = [-6.5, -5.2, -3.6, -2.4, 2.4, 3.5, 5.0, 7.6];
    potsAt.forEach((x, i) => {
      const tipped = i === 2 || i === 6;
      this.flowerPot(new THREE.Vector3(x + (this.rand() - 0.5) * 0.3, Y + 0.57, -9.65), tipped, [PAL.poppy, PAL.hollyhock, PAL.lavender, PAL.buttercup][i % 4]);
    });
    // fireflies from the parapet up to the gate roof: the keepsake route
    for (let i = 0; i <= 6; i++) {
      const k = i / 6;
      this.fireflies.push(new THREE.Vector3(3.2 - 3.2 * k, Y + 0.9 + Math.sin(k * Math.PI) * 0.6 + k * 1.9, -9.6));
    }
    this.keepsakeBow();
  }

  lanternHead(at: THREE.Vector3, hanging = false) {
    const M = this.M;
    const g = new THREE.Group(); g.position.copy(at);
    const glass = new THREE.Mesh(G.box(0.2, 0.26, 0.2), new THREE.MeshBasicMaterial({ color: PAL.coldGlass }));
    g.add(glass);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = new THREE.Mesh(G.box(0.03, 0.3, 0.03), M.woodDark); p.position.set(x * 0.1, 0, z * 0.1); g.add(p); }
    const cap = new THREE.Mesh(G.cone(0.2, 0.14, 4), M.woodDark); cap.position.y = 0.2; cap.rotation.y = Math.PI / 4; g.add(cap);
    const base = new THREE.Mesh(G.box(0.24, 0.04, 0.24), M.woodDark); base.position.y = -0.15; g.add(base);
    if (hanging) { const ch = new THREE.Mesh(G.cyl(0.01, 0.01, 0.3, 4), M.iron); ch.position.y = 0.4; g.add(ch); }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: PAL.ember, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    halo.scale.setScalar(1.6); g.add(halo);
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    this.group.add(g);
    return { glass, halo };
  }

  private flowerPot(at: THREE.Vector3, tipped: boolean, flower: string) {
    const M = this.M;
    const o = new THREE.Group(); o.position.copy(at);
    const body = new THREE.Mesh(G.cyl(0.11, 0.15, 0.24, 12), M.clay); body.position.y = 0.12; o.add(body);
    const rim = new THREE.Mesh(G.torus(0.15, 0.025, 6, 14), M.clay); rim.rotation.x = Math.PI / 2; rim.position.y = 0.24; o.add(rim);
    if (tipped) {
      o.rotation.set((Math.PI / 2) * 0.95, this.rand() * 6, 0); o.position.y += 0.12;
      this.kit.add(G.sph(0.12, 8, 6), pmat('#7A5E52'), { x: at.x + 0.25, y: at.y + 0.02, z: at.z }, [0, 0, 0], [1.4, 0.3, 1]);
    } else {
      const soil = new THREE.Mesh(G.cyl(0.14, 0.14, 0.02, 10), pmat('#6E5448')); soil.position.y = 0.245; o.add(soil);
      const fm = pmat(flower);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.3, r = 0.06;
        const st = new THREE.Mesh(G.cyl(0.008, 0.008, 0.28, 4), M.leaf); st.position.set(Math.cos(a) * r, 0.36, Math.sin(a) * r); o.add(st);
        const head = new THREE.Mesh(G.ico(0.05, 0), fm); head.scale.y = 0.6; head.position.set(Math.cos(a) * r, 0.5 + (i % 2) * 0.05, Math.sin(a) * r); o.add(head);
        const lf = new THREE.Mesh(G.sph(0.04, 6, 4), M.leaf); lf.scale.set(1.6, 0.3, 0.8); lf.position.set(Math.cos(a) * 0.09, 0.28, Math.sin(a) * 0.09); o.add(lf);
      }
    }
    this.kit.addObject(o);
  }

  private keepsakeBow() {
    const bow = new THREE.Group();
    const ribbon = pmat('#E77B8C');
    for (const s of [-1, 1]) { const l = new THREE.Mesh(G.sph(0.16, 12, 8), ribbon); l.scale.set(1.3, 0.8, 0.5); l.position.x = s * 0.17; bow.add(l); }
    for (const s of [-1, 1]) { const t = new THREE.Mesh(G.box(0.06, 0.22, 0.02), ribbon); t.position.set(s * 0.07, -0.15, 0); t.rotation.z = s * 0.3; bow.add(t); }
    bow.add(new THREE.Mesh(G.sph(0.07, 10, 8), ribbon));
    bow.position.copy(this.keepsake); bow.name = 'keepsake'; this.group.add(bow);
  }

  // ---------- the cottage where Moth starts ----------
  private cottage() {
    const M = this.M, Y = TERRACE_Y;
    const cx = 6.6, cz = 5.2, w = 4.2, d = 3.4, h = 2.6;
    this.box(cx, Y + h / 2, cz, w, h, d, M.plaster, 'stone', { block: true, unit: 2.5 });
    this.box(cx, Y + 0.18, cz, w + 0.12, 0.36, d + 0.12, M.stone, undefined, { unit: 1.2 });
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.kit.add(G.box(0.16, h, 0.16), M.woodDark, { x: cx + (x * w) / 2, y: Y + h / 2, z: cz + (z * d) / 2 });
    this.kit.add(G.box(w + 0.1, 0.14, 0.14), M.woodDark, { x: cx, y: Y + h - 0.05, z: cz - d / 2 - 0.02 });
    this.kit.add(G.box(0.14, 0.14, d + 0.1), M.woodDark, { x: cx - w / 2 - 0.02, y: Y + h - 0.05, z: cz });
    this.roof(cx, Y + h, cz, w, d, 1.5, 0.45);
    this.collBox(cx, Y + h + 0.6, cz, w + 0.6, 1.2, d + 0.6, 'stone', 0, true);
    // chimney (main adds the smoke)
    this.box(7.4, Y + h + 1.3, 5.6, 0.55, 2.0, 0.55, M.stone, undefined, { unit: 1.2 });
    this.kit.add(G.box(0.68, 0.12, 0.68), M.stoneDark, { x: 7.4, y: Y + h + 2.32, z: 5.6 });
    // the door on the west face, with a cat flap and a brass knob
    const dx = cx - w / 2;
    this.kit.add(boxUV(G.box(0.1, 1.68, 0.95), 0.1, 1.68, 0.95, 1), M.plankDark, { x: dx - 0.03, y: Y + 0.37 + 0.84, z: cz });
    this.kit.add(G.box(0.12, 0.09, 1.15), M.woodDark, { x: dx - 0.05, y: Y + 2.1, z: cz });
    for (const s of [-1, 1]) this.kit.add(G.box(0.12, 1.74, 0.08), M.woodDark, { x: dx - 0.05, y: Y + 0.37 + 0.84, z: cz + s * 0.535 });
    this.kit.add(G.box(0.04, 0.3, 0.28), M.woodDark, { x: dx - 0.1, y: Y + 0.58, z: cz + 0.15 });
    this.kit.add(G.sph(0.04), pmat('#C9A35A'), { x: dx - 0.12, y: Y + 1.25, z: cz - 0.33 });
    // the stoop: a flat stone with a teapot and two cups
    this.box(cx - w / 2 - 0.5, Y + 0.08, cz, 0.9, 0.16, 1.3, M.stoneDark, 'stone', { unit: 0.8 });
    const tp = new THREE.Vector3(cx - w / 2 - 0.4, Y + 0.16, cz + 0.42);
    const teaM = pmat('#7FA3B8');
    this.kit.add(G.sph(0.09, 12, 10), teaM, { x: tp.x, y: tp.y + 0.08, z: tp.z }, [0, 0, 0], [1, 0.85, 1]);
    this.kit.add(G.cyl(0.015, 0.012, 0.12, 6), teaM, { x: tp.x + 0.1, y: tp.y + 0.1, z: tp.z }, [0, 0, -1.0]);
    this.kit.add(G.torus(0.05, 0.012, 6, 10), teaM, { x: tp.x - 0.09, y: tp.y + 0.1, z: tp.z });
    this.kit.add(G.sph(0.02), teaM, { x: tp.x, y: tp.y + 0.17, z: tp.z });
    for (const k of [0, 1]) this.kit.add(G.cyl(0.03, 0.035, 0.05, 10), M.white, { x: tp.x - 0.05 + k * 0.12, y: tp.y + 0.025, z: tp.z - 0.22 - k * 0.05 });
    // windows: frame, dark glass with a cross, a curtain, a flower box of hollyhocks
    const windows: [number, number, number][] = [[cx - 1.0, cz - d / 2, 0], [cx + 0.9, cz - d / 2, 0], [cx - w / 2, cz + 1.0, Math.PI / 2]];
    for (const [x, z, ry] of windows) {
      const o = new THREE.Group(); o.position.set(x, Y + 1.45, z); o.rotation.y = ry;
      const add = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); o.add(m); };
      add(G.box(0.8, 0.85, 0.06), M.glassDark, 0, 0, -0.01);
      add(G.box(0.92, 0.08, 0.1), M.woodDark, 0, 0.45, -0.03); add(G.box(0.92, 0.08, 0.14), M.woodDark, 0, -0.45, -0.05);
      add(G.box(0.08, 0.92, 0.1), M.woodDark, -0.44, 0, -0.03); add(G.box(0.08, 0.92, 0.1), M.woodDark, 0.44, 0, -0.03);
      add(G.box(0.05, 0.85, 0.06), M.woodDark, 0, 0, -0.04); add(G.box(0.8, 0.05, 0.06), M.woodDark, 0, 0, -0.04);
      add(G.box(0.3, 0.7, 0.02), pmat('#E9D8C0'), -0.22, 0.02, -0.05);
      add(G.box(0.95, 0.2, 0.22), M.plank, 0, -0.62, -0.16);
      for (let i = 0; i < 7; i++) {
        add(G.ico(0.06, 0), pmat(i % 2 ? PAL.hollyhock : PAL.daisy), -0.38 + i * 0.125, -0.42 + (i % 3) * 0.04, -0.16);
        add(G.sph(0.06, 6, 4), M.leaf, -0.35 + i * 0.12, -0.5, -0.12);
      }
      this.kit.addObject(o);
    }
    // the wind chime under the eave (animated)
    const chime = new THREE.Group(); chime.position.set(cx - w / 2 - 0.3, Y + h - 0.5, cz - d / 2 - 0.3);
    chime.add(new THREE.Mesh(G.cyl(0.1, 0.1, 0.02, 10), M.woodDark));
    const tubes: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const tube = new THREE.Mesh(G.cyl(0.014, 0.014, 0.22 + i * 0.03, 6), M.clay);
      tube.geometry.translate(0, -(0.11 + i * 0.015) - 0.05, 0);
      tube.position.set(Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07); chime.add(tube); tubes.push(tube);
    }
    this.group.add(chime);
    this.anim.push((t) => tubes.forEach((tb, i) => { const s = (0.05 + 0.3 * WIND.gust) * Math.sin(t * (3 + i * 0.7) + i); tb.rotation.set(s, 0, s * 0.6); }));
    // laundry line from the cottage corner to a post, four cloths swinging in the wind
    const a = new THREE.Vector3(cx - w / 2 - 0.1, Y + 2.2, cz - d / 2 - 0.1), b = new THREE.Vector3(6.8, Y + 2.0, -0.6);
    this.kit.add(G.cyl(0.05, 0.04, 2.2, 8), M.woodDark, { x: b.x, y: Y + 1.1, z: b.z });
    this.collCyl(b.x, Y + 1.1, b.z, 0.06, 2.2, 'wood');
    const sag = (k: number) => a.clone().lerp(b, k).add(new THREE.Vector3(0, -Math.sin(k * Math.PI) * 0.25, 0));
    this.kit.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([0, 0.25, 0.5, 0.75, 1].map(sag)), 16, 0.008, 4), M.straw, { x: 0, y: 0, z: 0 });
    const clothCols = ['#F3EEE2', '#B9C8E0', '#F2C9C2', '#F3EEE2'];
    const clothMat = (c: string) => paint(new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }), {
      vertex: `float hh = clamp(-position.y / 0.6, 0.0, 1.0);
        transformed.z += (sin(uTime * 2.2 + wpos0.x * 2.0) * 0.06 + 0.12 * uGust + 0.04) * hh;
        transformed.x += sin(uTime * 3.1 + wpos0.x) * 0.02 * hh;`,
    });
    const along = b.clone().sub(a).setY(0).normalize();
    for (let i = 0; i < 4; i++) {
      const k = 0.18 + i * 0.2, p = sag(k);
      const wdt = i === 1 ? 0.5 : 0.38, hgt = i === 2 ? 0.34 : 0.5;
      const geo = new THREE.PlaneGeometry(wdt, hgt, 4, 4).translate(0, -hgt / 2, 0);
      const cloth = new THREE.Mesh(geo, clothMat(clothCols[i]));
      cloth.position.copy(p); cloth.rotation.y = Math.atan2(along.x, along.z) + Math.PI / 2;
      cloth.castShadow = true; this.group.add(cloth);
      for (const s of [-1, 1]) this.kit.add(G.box(0.02, 0.06, 0.02), M.wood, p.clone().addScaledVector(along, s * wdt * 0.35));
    }
    this.clear(cx - w / 2 - 1.0, cz - d / 2 - 0.3, cx + w / 2 + 0.3, cz + d / 2 + 0.3);
  }

  // ---------- the terrace garden: wall with the seed pot, barrels, vegetables, bird bath, bench ----------
  private garden() {
    const M = this.M, Y = TERRACE_Y;
    // low garden wall, beside the path
    this.box(3.2, Y + 0.425, -3.0, 4.0, 0.85, 0.6, M.stone, 'stone', { unit: 1.0 });
    this.kit.add(G.box(4.06, 0.06, 0.66), M.stoneDark, { x: 3.2, y: Y + 0.88, z: -3.0 });
    for (let i = 0; i < 6; i++) this.kit.add(G.ico(0.1 + this.rand() * 0.08, 1), M.moss, { x: 1.4 + i * 0.7, y: Y + 0.88, z: -2.75 + this.rand() * 0.1 }, [0, 0, 0], [1.5, 0.35, 1]);
    this.clear(1.0, -3.4, 5.4, -2.6);
    this.addPot(4.2, Y + 0.91 + 0.22, -3.0, 0);
    this.addPot(2.1, Y + 0.91 + 0.22, -3.0, null);
    // a sleeping frog at the wall's west end
    const frog = new THREE.Group(); frog.position.set(1.45, Y + 0.91, -3.0); frog.rotation.y = -0.6;
    const fm = pmat('#8DB360');
    const fb = new THREE.Mesh(G.sph(0.09, 12, 10), fm); fb.scale.set(1, 0.7, 1.1); fb.position.y = 0.06; frog.add(fb);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(G.sph(0.035, 8, 6), fm); e.position.set(s * 0.05, 0.12, 0.05); frog.add(e);
      const lid = new THREE.Mesh(G.box(0.04, 0.008, 0.01), pmat('#3E5A3A')); lid.position.set(s * 0.05, 0.125, 0.083); frog.add(lid);
      const leg = new THREE.Mesh(G.sph(0.04, 8, 6), fm); leg.scale.set(0.8, 0.5, 1.3); leg.position.set(s * 0.08, 0.025, -0.04); frog.add(leg);
    }
    this.group.add(frog);
    this.anim.push((t) => { fb.scale.y = 0.7 + Math.sin(t * 1.8) * 0.04; });
    // a broom leaning on the wall
    this.kit.add(G.cyl(0.015, 0.015, 1.2, 6), M.wood, { x: 5.35, y: Y + 0.6, z: -2.6 }, [0.25, 0, 0.2]);
    this.kit.add(G.cone(0.1, 0.3, 8), M.straw, { x: 5.48, y: Y + 0.12, z: -2.44 }, [Math.PI + 0.25, 0, 0.2]);

    // barrel stack: a crate as a step, a tall barrel with the second seed, a small barrel, a wheelbarrow of hay
    this.addCrate(4.7, Y + 0.31, -5.6);
    this.box(5.2, Y + 0.5, -6.6, 1.0, 1.0, 1.0, M.plank, 'wood', { unit: 0.5 });
    this.barrel(6.2, Y, -7.0, 0.5, 2.0, true);
    this.barrel(7.3, Y, -6.3, 0.42, 1.2, true);
    this.seeds.push(new THREE.Vector3(6.2, Y + 2.0 + 0.35, -7.0));
    this.kit.add(G.torus(0.14, 0.05, 6, 12), M.straw, { x: 7.3, y: Y + 1.25, z: -6.3 }, [Math.PI / 2, 0, 0]);
    this.kit.add(G.cyl(0.13, 0.16, 0.24, 10), M.plankDark, { x: 7.75, y: Y + 0.12, z: -5.6 });
    this.wheelbarrow(4.0, Y, -7.9, 0.4);
    this.clear(3.4, -8.6, 8.0, -5.0);

    // vegetable patch with a bean tepee and a paper windmill
    const vx = -5.6, vz = -3.6;
    this.box(vx, Y + 0.06, vz, 3.2, 0.12, 2.6, pmat('#8C6A55'));
    for (const s of [-1, 1]) this.kit.add(G.box(3.3, 0.18, 0.08), M.plank, { x: vx, y: Y + 0.09, z: vz + s * 1.32 });
    for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) {
      const x = vx - 1.3 + i * 0.52, z = vz - 0.95 + r * 0.62;
      this.kit.add(G.ico(0.16, 1), pmat(r % 2 ? '#A7CB6A' : '#8DBB5E'), { x, y: Y + 0.2, z }, [0, i, 0], [1, 0.75, 1]);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      this.kit.add(G.cyl(0.015, 0.015, 1.7, 5), M.wood, { x: vx + 1.9 + Math.cos(a) * 0.18, y: Y + 0.8, z: vz - 0.3 + Math.sin(a) * 0.18 }, [Math.sin(a) * -0.12, 0, Math.cos(a) * 0.12]);
      for (let k = 0; k < 6; k++) this.kit.add(G.ico(0.06, 0), M.leaf, { x: vx + 1.9 + Math.cos(a) * (0.17 - k * 0.025), y: Y + 0.25 + k * 0.24, z: vz - 0.3 + Math.sin(a) * (0.17 - k * 0.025) });
    }
    this.collCyl(vx + 1.9, Y + 0.85, vz - 0.3, 0.22, 1.7, 'wood');
    this.clear(vx - 1.7, vz - 1.4, vx + 2.2, vz + 1.4);
    const wm = new THREE.Group(); wm.position.set(vx - 1.1, Y + 0.9, vz + 0.6);
    this.kit.add(G.cyl(0.012, 0.012, 0.9, 5), M.wood, { x: wm.position.x, y: Y + 0.45, z: wm.position.z });
    const blades = new THREE.Group(); wm.add(blades);
    ['#E0624F', '#F2CF5B', '#B9C8E0', '#E8A1B4'].forEach((c, i) => {
      const bl = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.14).translate(0.07, 0.07, 0), paint(new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide })));
      bl.rotation.z = (i * Math.PI) / 2; blades.add(bl);
    });
    this.group.add(wm);
    this.anim.push((_t, dt) => { blades.rotation.z -= dt * (2 + WIND.gust * 9); wm.rotation.y = Math.atan2(WIND.dir.x, WIND.dir.y); });

    // bird bath with two sparrows
    const bb = new THREE.Vector3(-3.2, Y, 1.4);
    this.kit.add(G.cyl(0.12, 0.09, 0.7, 10), M.stone, { x: bb.x, y: Y + 0.35, z: bb.z });
    this.kit.add(G.cyl(0.38, 0.24, 0.12, 16), M.stone, { x: bb.x, y: Y + 0.76, z: bb.z });
    this.kit.add(G.cyl(0.32, 0.32, 0.02, 16), pmat(PAL.water), { x: bb.x, y: Y + 0.82, z: bb.z });
    this.collCyl(bb.x, Y + 0.41, bb.z, 0.36, 0.82, 'stone');
    this.clear(bb.x - 0.5, bb.z - 0.5, bb.x + 0.5, bb.z + 0.5);
    this.sparrow(new THREE.Vector3(bb.x + 0.3, Y + 0.84, bb.z), 0.4);
    this.sparrow(new THREE.Vector3(bb.x - 0.28, Y + 0.84, bb.z + 0.1), 2.6);

    // watering can left by the path
    const wc = new THREE.Vector3(-1.3, Y, -1.0), canM = pmat('#7FA08E');
    this.kit.add(G.cyl(0.11, 0.12, 0.24, 12), canM, { x: wc.x, y: Y + 0.12, z: wc.z });
    this.kit.add(G.cyl(0.015, 0.025, 0.3, 6), canM, { x: wc.x + 0.16, y: Y + 0.2, z: wc.z }, [0, 0, -0.9]);
    this.kit.add(G.torus(0.08, 0.012, 6, 12), canM, { x: wc.x - 0.02, y: Y + 0.28, z: wc.z });

    // the big west tree with a bench, a cushion and a book
    this.tree(-7.6, Y, 2.6, 1.25);
    this.box(-6.6, Y + 0.25, 1.2, 1.4, 0.08, 0.45, M.plank, 'wood', { rotY: 0.4, unit: 0.6 });
    for (const s of [-1, 1]) this.kit.add(G.box(0.08, 0.25, 0.4), M.plankDark, { x: -6.6 + Math.cos(0.4) * s * 0.55, y: Y + 0.12, z: 1.2 - Math.sin(0.4) * s * 0.55 }, [0, 0.4, 0]);
    this.kit.add(G.box(0.35, 0.06, 0.32), pmat('#C98A9A'), { x: -6.95, y: Y + 0.32, z: 1.35 }, [0, 0.4, 0]);
    this.kit.add(G.box(0.18, 0.03, 0.24), pmat('#6C7FB0'), { x: -6.35, y: Y + 0.3, z: 1.05 }, [0, 0.9, 0]);
    this.clear(-7.4, 0.8, -5.8, 1.6);
    this.tree(-2.0, Y, 6.4, 0.85, 0.02);
    this.tree(-6.0, Y, -7.6, 0.9);
    // light shafts under the west tree
    const shaftMat = new THREE.MeshBasicMaterial({ color: '#FFE6B8', map: shaftTexture(), transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 4.5), shaftMat.clone());
      s.position.set(-7.0 + i * 0.6, Y + 1.8, 1.8 + i * 0.3); s.rotation.set(-0.6, 0.6, 0.2);
      this.group.add(s); this.sunShafts.push(s);
    }
    // sun patch for the start
    const patch = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32), new THREE.MeshBasicMaterial({ color: '#FFE6B0', transparent: true, opacity: 0.18, depthWrite: false, fog: false }));
    patch.rotation.x = -Math.PI / 2; patch.position.set(this.anchors.start.x, Y + 0.02, this.anchors.start.z); patch.scale.set(1, 1.3, 1); this.group.add(patch);
    this.steppingStones(1.0);
  }

  private steppingStones(spacing: number) {
    const placed: [number, number, number][] = [];
    for (const [ax, az, bx, bz] of this.paths) {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.floor(len / spacing);
      for (let i = 0; i <= n; i++) {
        const k = n ? i / n : 0;
        const x = ax + (bx - ax) * k + (this.rand() - 0.5) * 0.2, z = az + (bz - az) * k + (this.rand() - 0.5) * 0.2;
        if (Math.abs(x) < 1.5 && z < -9 && z > -12.8) continue; // not on the steps
        if (x < RAMP.x1 + 0.3 && z < -9.6 && z > RAMP.z0) continue; // not on the slope
        const y = heightAt(x, z);
        if (y < -0.1) continue;
        if (this.rand() < 0.25) continue;
        const r = 0.17 + this.rand() * 0.09;
        // stones that would overlap another (where paths meet) would flicker, so leave a gap instead
        if (placed.some(([px, pz, pr]) => Math.hypot(px - x, pz - z) < (pr + r) * 1.3 + 0.06)) continue;
        placed.push([x, z, r]);
        const g = new THREE.CylinderGeometry(r, r * 1.08, 0.07, 8);
        const pos = g.getAttribute('position') as THREE.BufferAttribute;
        const seed = this.rand() * 10;
        for (let v = 0; v < pos.count; v++) {
          const px = pos.getX(v), pz = pos.getZ(v), a = Math.atan2(pz, px);
          const k = 1 + Math.sin(a * 3 + seed) * 0.12 + Math.sin(a * 5 + seed * 2) * 0.06;
          pos.setXYZ(v, px * k, pos.getY(v), pz * k);
        }
        g.computeVertexNormals();
        this.kit.add(g, this.M.flag, { x, y: y + 0.0, z }, [0, this.rand() * 3, 0], [1, 1, 0.8 + this.rand() * 0.3]);
      }
    }
  }

  private barrel(x: number, y: number, z: number, r: number, h: number, collide: boolean) {
    const M = this.M;
    const g = new THREE.LatheGeometry(Array.from({ length: 9 }, (_, i) => { const k = i / 8; return new THREE.Vector2(r * (0.88 + 0.12 * Math.sin(k * Math.PI)), k * h); }), 16);
    this.kit.add(g, M.plank, { x, y, z });
    for (const k of [0.12, 0.88, 0.5]) this.kit.add(G.torus(r * (0.9 + 0.1 * Math.sin(k * Math.PI)) + 0.01, 0.025, 6, 20), M.iron, { x, y: y + k * h, z }, [Math.PI / 2, 0, 0]);
    this.kit.add(G.cyl(r * 0.88, r * 0.88, 0.02, 16), M.plankDark, { x, y: y + h, z });
    if (collide) this.collCyl(x, y + h / 2, z, r * 0.95, h, 'wood');
  }

  private wheelbarrow(x: number, y: number, z: number, ry: number) {
    const M = this.M;
    const o = new THREE.Group(); o.position.set(x, y, z); o.rotation.y = ry;
    const tub = new THREE.Mesh(G.box(0.7, 0.32, 0.5), M.plank); tub.position.set(0, 0.45, 0); o.add(tub);
    const hay = new THREE.Mesh(G.ico(0.32, 1), M.straw); hay.scale.set(1.1, 0.45, 0.8); hay.position.set(0, 0.62, 0); o.add(hay);
    const wheel = new THREE.Mesh(G.torus(0.16, 0.04, 6, 14), M.woodDark); wheel.position.set(0.5, 0.18, 0); o.add(wheel);
    for (const s of [-1, 1]) { const h = new THREE.Mesh(G.cyl(0.025, 0.025, 0.8, 5), M.wood); h.rotation.z = Math.PI / 2 - 0.25; h.position.set(-0.55, 0.45, s * 0.2); o.add(h); }
    this.kit.addObject(o);
    this.collBox(x, y + 0.4, z, 0.9, 0.8, 0.6, 'wood', ry);
  }

  private sparrow(at: THREE.Vector3, facing: number) {
    const o = new THREE.Group(); o.position.copy(at); o.rotation.y = facing;
    const brown = pmat('#9C7A62'), cream = pmat('#EADBC4'), dark = pmat('#4B3A40');
    const b = new THREE.Mesh(G.sph(0.045, 10, 8), brown); b.scale.set(1, 0.9, 1.3); b.position.y = 0.04; o.add(b);
    const belly = new THREE.Mesh(G.sph(0.04, 8, 6), cream); belly.position.set(0, 0.03, 0.01); o.add(belly);
    const h = new THREE.Mesh(G.sph(0.03, 8, 6), brown); h.position.set(0, 0.085, 0.04); o.add(h);
    const beak = new THREE.Mesh(G.cone(0.01, 0.025, 5), dark); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.085, 0.075); o.add(beak);
    const tail = new THREE.Mesh(G.box(0.03, 0.01, 0.05), dark); tail.position.set(0, 0.06, -0.07); tail.rotation.x = -0.4; o.add(tail);
    this.group.add(o);
    this.sparrows.push({ obj: o, home: at.clone(), t: Math.random() * 5, away: false });
  }

  // ---------- the court: hearth and spirit, lanterns, shed, cart ----------
  private court() {
    const M = this.M;
    const sp = this.spirit;
    // hearth: a raised ring of stones with an ash bed and offerings
    this.collCyl(sp.x, 0.22, sp.z, 1.8, 0.45, 'stone');
    this.kit.add(cylUV(new THREE.CylinderGeometry(1.8, 1.9, 0.45, 28, 1, true)), M.stone, { x: sp.x, y: 0.22, z: sp.z });
    this.kit.add(G.cyl(1.8, 1.8, 0.04, 28), pmat('#CFC3B6'), { x: sp.x, y: 0.44, z: sp.z });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.kit.add(G.ico(0.2 + this.rand() * 0.06, 1), M.stoneDark, { x: sp.x + Math.cos(a) * 1.75, y: 0.46, z: sp.z + Math.sin(a) * 1.75 }, [this.rand(), this.rand(), 0], [1.3, 0.55, 1]);
      if (i % 3 === 0) this.kit.add(G.ico(0.12, 1), M.moss, { x: sp.x + Math.cos(a) * 1.8, y: 0.55, z: sp.z + Math.sin(a) * 1.8 }, [0, 0, 0], [1.4, 0.4, 1]);
    }
    const off = new THREE.Vector3(sp.x - 0.9, 0.46, sp.z + 1.0);
    this.kit.add(G.sph(0.14, 12, 8), pmat('#D9B98F'), { x: off.x, y: off.y + 0.04, z: off.z }, [0, 0, 0], [1, 0.45, 1]);
    for (let i = 0; i < 3; i++) this.kit.add(G.ico(0.05, 0), M.pebble, { x: off.x + 0.3 + i * 0.1, y: off.y + 0.03, z: off.z - 0.1 + (i % 2) * 0.08 });
    this.clear(sp.x - 2.1, sp.z - 2.1, sp.x + 2.1, sp.z + 2.1);
    this.buildSpirit();
    // three lanterns on posts at the three approaches
    const lampAt: [number, number][] = [[-1.0, -15.4], [-1.2, -20.2], [4.8, -17.2]];
    for (const [x, z] of lampAt) {
      this.kit.add(G.box(0.12, 1.3, 0.12), M.woodDark, { x, y: 0.65, z });
      this.kit.add(G.box(0.4, 0.06, 0.08), M.woodDark, { x: x + 0.15, y: 1.28, z });
      this.collBox(x, 0.65, z, 0.14, 1.3, 0.14, 'wood');
      const p = new THREE.Vector3(x + 0.3, 1.05, z);
      this.lanterns.push({ ...this.lanternHead(p, true), pos: p });
    }
    // milestone at the bottom of the steps
    this.kit.add(G.box(0.35, 0.6, 0.22), M.stoneDark, { x: 1.7, y: 0.3, z: -13.0 }, [0, 0.3, 0]);
    this.kit.add(G.sph(0.18, 10, 6), M.stoneDark, { x: 1.7, y: 0.6, z: -13.0 }, [0, 0.3, 0], [1, 0.6, 0.62]);
    this.collBox(1.7, 0.35, -13.0, 0.36, 0.7, 0.24, 'stone', 0.3);

    // the shed with the third seed on its roof, firewood, a rain barrel, a swallow nest
    const sx = -6.2, sz = -19.2, sw = 3.2, sd = 2.6, sh = 1.9;
    this.box(sx, sh / 2, sz, sw, sh, sd, M.plaster, 'stone', { block: true, unit: 2.5 });
    this.box(sx, 0.15, sz, sw + 0.1, 0.3, sd + 0.1, M.stone, undefined, { unit: 1.2 });
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.kit.add(G.box(0.14, sh, 0.14), M.woodDark, { x: sx + (x * sw) / 2, y: sh / 2, z: sz + (z * sd) / 2 });
    this.kit.add(boxUV(G.box(sw + 0.6, 0.16, sd + 0.6), sw + 0.6, 0.16, sd + 0.6, 1), M.tile, { x: sx, y: sh + 0.25, z: sz }, [0.12, 0, 0]);
    this.collBox(sx, sh + 0.2, sz, sw + 0.6, 0.3, sd + 0.6, 'wood', 0, true);
    this.seeds.push(new THREE.Vector3(sx - 0.2, sh + 0.75, sz - 0.1));
    this.kit.add(boxUV(G.box(0.9, 1.4, 0.08), 0.9, 1.4, 0.08, 1), M.plankDark, { x: sx + 0.6, y: 0.31 + 0.7, z: sz + sd / 2 + 0.04 });
    this.kit.add(G.box(0.6, 0.6, 0.06), M.glassDark, { x: sx - 0.7, y: 1.15, z: sz + sd / 2 + 0.02 });
    this.kit.add(G.box(0.32, 0.64, 0.05), M.plank, { x: sx - 1.15, y: 1.15, z: sz + sd / 2 + 0.15 }, [0, -0.9, 0]);
    for (let r = 0; r < 4; r++) for (let i = 0; i < 6 - r; i++) {
      this.kit.add(G.cyl(0.085, 0.085, 0.42 + ((i * 7 + r * 3) % 5) * 0.02, 8), pmat(i % 2 ? '#B08A68' : '#9C7658'), { x: sx + sw / 2 + 0.27 + (((i * 3 + r * 5) % 4) - 1.5) * 0.015, y: 0.1 + r * 0.165, z: sz - 0.5 + i * 0.19 + r * 0.095 }, [i * 0.7, 0, Math.PI / 2]);
    }
    this.collBox(sx + sw / 2 + 0.25, 0.4, sz, 0.5, 0.8, 1.3, 'wood');
    this.kit.add(G.cyl(0.28, 0.32, 0.5, 12), pmat('#9C7658'), { x: sx + sw / 2 + 0.55, y: 0.25, z: sz + 1.1 });
    this.kit.add(G.box(0.05, 0.3, 0.1), M.iron, { x: sx + sw / 2 + 0.55, y: 0.55, z: sz + 1.1 }, [0, 0, 0.4]);
    this.collCyl(sx + sw / 2 + 0.55, 0.25, sz + 1.1, 0.3, 0.5, 'wood');
    this.barrel(sx - sw / 2 - 0.4, 0, sz + 1.0, 0.36, 0.9, true);
    this.kit.add(G.cyl(0.32, 0.32, 0.02, 14), pmat(PAL.water), { x: sx - sw / 2 - 0.4, y: 0.86, z: sz + 1.0 });
    const nest = new THREE.Vector3(sx + 0.9, sh - 0.1, sz + sd / 2 + 0.12);
    this.kit.add(G.sph(0.14, 10, 8), pmat('#9C8468'), { x: nest.x, y: nest.y, z: nest.z }, [0, 0, 0], [1, 0.6, 0.7]);
    for (const s of [-1, 1]) this.kit.add(G.sph(0.045, 8, 6), pmat('#3E3A5A'), { x: nest.x + s * 0.05, y: nest.y + 0.08, z: nest.z + 0.03 });
    this.clear(sx - sw / 2 - 0.8, sz - sd / 2 - 0.4, sx + sw / 2 + 0.9, sz + sd / 2 + 0.4);
    // the cart as a step up to the roof, with a sack and spilled grain
    const cx = -3.9, cz = -17.7;
    this.box(cx, 0.55, cz, 1.5, 0.12, 1.0, M.plank, 'wood', { unit: 0.6 });
    this.collBox(cx, 0.3, cz, 1.5, 0.6, 1.0, 'wood');
    for (const s of [-1, 1]) {
      this.kit.add(G.torus(0.3, 0.05, 6, 14), M.woodDark, { x: cx - 0.1, y: 0.32, z: cz + s * 0.55 });
      this.kit.add(G.box(1.5, 0.22, 0.05), M.plankDark, { x: cx, y: 0.72, z: cz + s * 0.5 });
    }
    this.kit.add(G.cyl(0.03, 0.03, 1.2, 5), M.wood, { x: cx + 1.2, y: 0.35, z: cz }, [0, 0, Math.PI / 2 - 0.3]);
    this.kit.add(G.sph(0.28, 10, 8), pmat('#D8C3A0'), { x: cx - 0.3, y: 0.83, z: cz }, [0, 0, 0], [1, 0.8, 0.8]);
    this.kit.add(G.sph(0.25, 10, 6), pmat('#E2C27A'), { x: cx + 0.9, y: 0.0, z: cz + 0.6 }, [0, 0, 0], [1.4, 0.12, 1]);
    this.clear(cx - 0.9, cz - 0.7, cx + 1.5, cz + 0.9);
    // the north trees and a hammock between them
    const t1 = this.tree(-8.6, 0, -23.6, 1.15), t2 = this.tree(-5.0, 0, -25.4, 1.0, -0.02);
    const ha = new THREE.Vector3(t1.x, 1.3, t1.z), hb = new THREE.Vector3(t2.x, 1.3, t2.z);
    const hm = new THREE.CatmullRomCurve3([0, 0.25, 0.5, 0.75, 1].map((k) => ha.clone().lerp(hb, k).add(new THREE.Vector3(0, -Math.sin(k * Math.PI) * 0.5, 0))));
    const hammock = new THREE.Mesh(new THREE.TubeGeometry(hm, 20, 0.22, 8), paint(new THREE.MeshLambertMaterial({ color: '#E9C9A0', side: THREE.DoubleSide })));
    hammock.scale.set(1, 0.35, 1); hammock.position.y = 0.6; hammock.castShadow = true;
    const hg = new THREE.Group(); hg.add(hammock); this.group.add(hg);
    this.anim.push((t) => { hg.rotation.z = Math.sin(t * 0.8) * 0.02; });
    this.tree(6.4, 0, -26.0, 1.05);
    this.tree(-11.4, 0, -14.2, 0.8, 0.03);
  }

  private buildSpirit() {
    // The hearth spirit: a round, sleepy, kiln-fired pot with a lid hat, moss shawl and a sprout. Original to this game.
    const g = new THREE.Group();
    const clay = pmat(PAL.clay), clayDark = pmat('#B07658'), moss = pmat(PAL.moss);
    const body = new THREE.Mesh(G.sph(0.78, 32, 22), clay); body.scale.set(1, 0.88, 1); body.position.y = 0.72; g.add(body);
    const band = new THREE.Mesh(G.torus(0.74, 0.035, 8, 32), clayDark); band.rotation.x = Math.PI / 2; band.position.y = 0.9; g.add(band);
    const neck = new THREE.Mesh(G.cyl(0.42, 0.34, 0.24, 24), clay); neck.position.y = 1.4; g.add(neck);
    const lid = new THREE.Mesh(G.sph(0.46, 24, 12), clayDark); lid.scale.set(1, 0.38, 1); lid.position.y = 1.55; g.add(lid);
    const knob = new THREE.Mesh(G.sph(0.1, 12, 10), clayDark); knob.position.y = 1.75; g.add(knob);
    const sprout = new THREE.Group(); sprout.position.set(0.05, 1.8, 0);
    const stem = new THREE.Mesh(G.cyl(0.012, 0.012, 0.18, 5), moss); stem.position.y = 0.06; sprout.add(stem);
    for (const s of [-1, 1]) { const l = new THREE.Mesh(G.sph(0.05, 8, 6), moss); l.scale.set(1.6, 0.35, 0.8); l.position.set(s * 0.06, 0.15, 0); l.rotation.z = s * 0.4; sprout.add(l); }
    g.add(sprout);
    for (const [x, y, z, r] of [[0.55, 1.1, 0.2, 0.2], [0.35, 1.25, -0.4, 0.17], [-0.58, 1.02, -0.2, 0.2], [-0.3, 1.25, 0.45, 0.13]] as const) {
      const m = new THREE.Mesh(G.ico(r, 1), moss); m.scale.set(1.3, 0.6, 1.1); m.position.set(x, y, z); g.add(m);
    }
    // sleeping eyes: two soft arcs; awake eyes: dark ovals with a catchlight
    const lineMat = new THREE.MeshBasicMaterial({ color: '#4A2E22' });
    for (const s of [-1, 1]) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 6, 16, Math.PI), lineMat);
      arc.position.set(s * 0.3, 0.86, 0.73); arc.rotation.set(0.25, s * 0.42, Math.PI); g.add(arc); this.spiritEyes.push(arc);
      const open = new THREE.Group(); open.position.set(s * 0.3, 0.88, 0.71); open.rotation.y = s * 0.42;
      const eye = new THREE.Mesh(G.sph(0.14, 16, 12), new THREE.MeshBasicMaterial({ color: '#3A2420' })); eye.scale.set(0.85, 1.1, 0.4); open.add(eye);
      const hl = new THREE.Mesh(G.sph(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: '#FFFFFF' })); hl.position.set(-0.04, 0.06, 0.05); open.add(hl);
      open.visible = false; g.add(open); this.spiritOpenEyes.push(open);
      const cheek = new THREE.Mesh(G.sph(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: '#E8907E', transparent: true, opacity: 0.55 })); cheek.scale.set(1.2, 0.6, 0.3);
      cheek.position.set(s * 0.5, 0.68, 0.63); cheek.rotation.y = s * 0.75; g.add(cheek);
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 6, 12, Math.PI), lineMat); mouth.position.set(0, 0.66, 0.79); mouth.rotation.set(0.3, 0, Math.PI); g.add(mouth);
    // the ember inside, seen through the open top and little vent holes
    this.spiritGlow = new THREE.Mesh(G.sph(0.3, 16, 12), new THREE.MeshBasicMaterial({ color: '#5A3E2C' }));
    this.spiritGlow.position.y = 1.32; g.add(this.spiritGlow);
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material instanceof THREE.MeshLambertMaterial) o.castShadow = true; });
    g.position.set(this.spirit.x, 0.45, this.spirit.z);
    g.rotation.y = 0.15;
    this.group.add(g); this.spiritMesh = g;
    this.world.createCollider(RAPIER.ColliderDesc.ball(0.75).setTranslation(this.spirit.x, 1.15, this.spirit.z));
  }

  // ---------- the river side: banks, wheel, mill, bridge, a stone lantern, ducks ----------
  private riverSide() {
    const M = this.M;
    for (const x of [RIVER.x0 - 0.15, RIVER.x1 + 0.15]) {
      for (let z = -27.5; z < (x < 11 ? -10 : -8); z += 0.7) {
        this.kit.add(G.ico(0.28 + this.rand() * 0.1, 1), M.stoneDark, { x: x + (this.rand() - 0.5) * 0.15, y: -0.05, z: z + this.rand() * 0.2 }, [this.rand(), this.rand(), 0], [1, 0.6, 1.2]);
      }
    }
    // the waterwheel beside the mill
    this.wheel = new THREE.Group();
    const rim = new THREE.Mesh(G.torus(1.6, 0.08, 6, 32), M.woodDark); rim.rotation.y = Math.PI / 2;
    const rim2 = rim.clone(); rim.position.x = -0.3; rim2.position.x = 0.3; this.wheel.add(rim, rim2);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const paddle = new THREE.Mesh(G.box(0.7, 0.05, 0.45), M.plank); paddle.position.set(0, Math.sin(a) * 1.5, Math.cos(a) * 1.5); paddle.rotation.x = -a; this.wheel.add(paddle);
      const spoke = new THREE.Mesh(G.box(0.05, 0.05, 1.6), M.woodDark); spoke.position.set(0, Math.sin(a) * 0.75, Math.cos(a) * 0.75); spoke.rotation.x = -a; this.wheel.add(spoke);
    }
    const hub = new THREE.Mesh(G.cyl(0.18, 0.18, 0.8, 10), M.woodDark); hub.rotation.z = Math.PI / 2; this.wheel.add(hub);
    this.wheel.position.set(12.4, 0.55, -19.2);
    this.wheel.traverse((o) => { o.castShadow = true; });
    this.group.add(this.wheel);
    // the mill house across the river
    const mx = 16.4, mz = -19.2, mw = 4.6, md = 5.2, mh = 3.6;
    this.box(mx, mh / 2, mz, mw, mh, md, M.plaster, 'stone', { block: true, unit: 2.5 });
    this.box(mx, 0.3, mz, mw + 0.15, 0.6, md + 0.15, M.stone, undefined, { unit: 1.2 });
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.kit.add(G.box(0.18, mh, 0.18), M.woodDark, { x: mx + (x * mw) / 2, y: mh / 2, z: mz + (z * md) / 2 });
    this.kit.add(G.box(0.16, 0.16, md + 0.1), M.woodDark, { x: mx - mw / 2 - 0.02, y: mh * 0.55, z: mz });
    for (let i = -2; i <= 2; i++) this.kit.add(G.box(0.12, mh * 0.45, 0.12), M.woodDark, { x: mx - mw / 2 - 0.02, y: mh * 0.78, z: mz + i * 1.0 }, [i * 0.25, 0, 0]);
    this.roof(mx, mh, mz, md, mw, 1.9, 0.5, Math.PI / 2);
    this.box(mx + 1.0, mh + 1.6, mz - 1.5, 0.6, 2.2, 0.6, M.stone, undefined, { unit: 1.2 });
    this.kit.add(boxUV(G.box(1.0, 1.75, 0.1), 1.0, 1.75, 0.1, 1), M.plankDark, { x: mx - 0.8, y: 0.61 + 0.875, z: mz + md / 2 + 0.03 });
    this.kit.add(G.box(1.2, 0.1, 0.14), M.woodDark, { x: mx - 0.8, y: 0.61 + 1.8, z: mz + md / 2 + 0.05 });
    this.box(mx - 0.8, 0.3, mz + md / 2 + 0.35, 1.3, 0.6, 0.5, M.stoneDark, 'stone', { unit: 0.8 });
    this.kit.add(G.box(0.06, 0.7, 0.7), M.glassDark, { x: mx - mw / 2 - 0.02, y: 2.2, z: mz - 1.3 });
    this.kit.add(G.cyl(0.1, 0.1, 2.0, 8), M.woodDark, { x: 13.4, y: 0.55, z: -19.2 }, [0, 0, Math.PI / 2]);
    for (const s of [-1, 1]) this.kit.add(G.box(0.06, 2.6, 0.06), M.wood, { x: mx + mw / 2 + 0.25, y: 1.25, z: mz + 1.4 + s * 0.22 }, [0, 0, -0.18]);
    for (let i = 0; i < 7; i++) this.kit.add(G.box(0.04, 0.04, 0.44), M.wood, { x: mx + mw / 2 + 0.47 - i * 0.055, y: 0.2 + i * 0.36, z: mz + 1.4 });
    this.clear(mx - mw / 2 - 0.4, mz - md / 2 - 0.4, mx + mw / 2 + 0.8, mz + md / 2 + 0.4);
    // footbridge, one plank missing, with a hanging basket
    const bz = -24.5;
    for (let i = 0; i < 12; i++) {
      if (i === 7) continue;
      this.kit.add(G.box(0.36, 0.06, 1.3), M.plank, { x: 9.0 + i * 0.42, y: 0.28 + Math.sin((i / 11) * Math.PI) * 0.18, z: bz });
    }
    for (let i = 0; i < 5; i++) {
      const x = 9.0 + i * 1.15;
      for (const s of [-1, 1]) this.kit.add(G.cyl(0.04, 0.04, 1.0, 6), M.woodDark, { x, y: 0.6 + Math.sin((i / 4) * Math.PI) * 0.18, z: bz + s * 0.62 });
    }
    for (const s of [-1, 1]) {
      const rail = new THREE.CatmullRomCurve3([0, 1, 2, 3, 4].map((i) => new THREE.Vector3(9.0 + i * 1.15, 1.05 + Math.sin((i / 4) * Math.PI) * 0.18, bz + s * 0.62)));
      this.kit.add(new THREE.TubeGeometry(rail, 20, 0.035, 5), M.wood, { x: 0, y: 0, z: 0 });
    }
    for (let i = 0; i < 6; i++) {
      const x = 9.2 + i * 0.85; const k = (x - 9.0) / (11 * 0.42);
      this.collBox(x, 0.18 + Math.sin(k * Math.PI) * 0.18, bz, 0.9, 0.24, 1.3, 'wood');
    }
    this.collBox(11.3, 0.9, bz - 0.68, 5.6, 1.2, 0.08, 'wood');
    this.collBox(11.3, 0.9, bz + 0.68, 5.6, 1.2, 0.08, 'wood');
    const basket = new THREE.Vector3(11.3, 0.95, bz + 0.72);
    this.kit.add(G.sph(0.16, 10, 6), M.straw, { x: basket.x, y: basket.y, z: basket.z }, [0, 0, 0], [1, 0.7, 1]);
    for (let i = 0; i < 6; i++) this.kit.add(G.ico(0.05, 0), pmat(i % 2 ? PAL.poppy : PAL.daisy), { x: basket.x + Math.cos(i) * 0.12, y: basket.y + 0.1, z: basket.z + Math.sin(i) * 0.12 });
    // a stone lantern on the river path
    const sl = new THREE.Vector3(7.6, 0, -14.6);
    this.kit.add(G.cyl(0.3, 0.32, 0.2, 6), M.stoneDark, { x: sl.x, y: 0.1, z: sl.z });
    this.kit.add(G.cyl(0.1, 0.12, 0.7, 6), M.stoneDark, { x: sl.x, y: 0.55, z: sl.z });
    this.kit.add(G.box(0.36, 0.3, 0.36), M.stoneDark, { x: sl.x, y: 1.05, z: sl.z });
    this.kit.add(G.cone(0.42, 0.3, 6), M.stoneDark, { x: sl.x, y: 1.35, z: sl.z });
    this.kit.add(G.ico(0.1, 1), M.moss, { x: sl.x + 0.1, y: 1.45, z: sl.z }, [0, 0, 0], [2, 0.6, 2]);
    this.collCyl(sl.x, 0.75, sl.z, 0.3, 1.5, 'stone');
    // fisherman's stool and rod on the bank
    this.kit.add(G.cyl(0.18, 0.18, 0.05, 10), M.wood, { x: 8.6, y: 0.38, z: -22.3 });
    for (let i = 0; i < 3; i++) this.kit.add(G.cyl(0.02, 0.02, 0.4, 4), M.woodDark, { x: 8.6 + Math.cos(i * 2.1) * 0.12, y: 0.18, z: -22.3 + Math.sin(i * 2.1) * 0.12 });
    this.kit.add(G.cyl(0.012, 0.006, 2.4, 4), M.woodDark, { x: 9.4, y: 0.9, z: -22.0 }, [0, 0, -1.0]);
    this.collCyl(8.6, 0.2, -22.3, 0.2, 0.4, 'wood');
    for (let i = 0; i < 3; i++) this.duck(new THREE.Vector3(10.6 + i * 0.5, RIVER.water, -13.5 - i * 0.7), i === 0 ? 1 : 0.65);
    this.tree(19.6, 0, -12.0, 1.0);
    this.tree(19.2, 0, -26.0, 0.9, 0.02);
  }

  private duck(at: THREE.Vector3, size: number) {
    const o = new THREE.Group(); o.position.copy(at); o.scale.setScalar(size);
    const w = pmat('#F6F1E6'), bill = pmat('#F2B04A');
    const b = new THREE.Mesh(G.sph(0.14, 12, 8), w); b.scale.set(0.9, 0.6, 1.3); b.position.y = 0.04; o.add(b);
    const h = new THREE.Mesh(G.sph(0.08, 10, 8), w); h.position.set(0, 0.17, 0.13); o.add(h);
    const bk = new THREE.Mesh(G.sph(0.04, 8, 6), bill); bk.scale.set(1, 0.5, 1.4); bk.position.set(0, 0.15, 0.21); o.add(bk);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(G.sph(0.012, 6, 4), new THREE.MeshBasicMaterial({ color: '#2A2030' })); e.position.set(s * 0.05, 0.19, 0.18); o.add(e); }
    const tail = new THREE.Mesh(G.cone(0.05, 0.1, 6), w); tail.rotation.x = -2.2; tail.position.set(0, 0.1, -0.18); o.add(tail);
    this.group.add(o);
    const base = at.clone(); const ph = Math.random() * 6;
    this.anim.push((t) => {
      const a = t * 0.12 + ph;
      o.position.set(base.x + Math.sin(a) * 0.6, base.y + Math.sin(t * 2 + ph) * 0.01, base.z + Math.cos(a * 0.7) * 1.2);
      o.rotation.y = Math.atan2(Math.cos(a) * 0.6, -Math.sin(a * 0.7) * 0.84);
    });
  }

  // ---------- edges: hedges, invisible walls ----------
  private boundaries() {
    const H = this.foliage, Y = TERRACE_Y;
    H.hedge(-9.9, 7.4, 4.0, 7.4, Y, 1.5, 0.9, PAL.hollyhock);
    H.hedge(-9.9, 7.4, -9.9, -9.0, Y, 1.5, 0.9);
    H.hedge(8.9, -9.2, 8.9, 3.0, Y, 1.2, 0.8, PAL.daisy);
    H.hedge(-10.1, -10.5, -10.1, -27.2, 0, 1.9, 1.0);
    H.hedge(-10.1, -27.3, 9.2, -27.3, 0, 1.9, 1.0, PAL.lavender);
    H.hedge(14.2, -27.3, 21.2, -27.3, 0, 1.7, 1.0);
    H.hedge(21.2, -27.3, 21.2, -8.2, 0, 1.7, 1.0, PAL.hollyhock);
    H.hedge(14.2, -8.2, 21.2, -8.2, 0, 1.7, 1.0);
    for (const [x0, z0, x1, z1] of [[-10.6, 7.0, 4.4, 8.0], [-10.6, -9.4, -9.3, 7.8], [8.4, -9.6, 9.6, 3.4], [-10.7, -27.8, -9.5, -10], [-10.7, -27.9, 9.6, -26.7], [13.8, -27.9, 21.8, -26.7], [20.6, -27.9, 21.8, -7.6], [13.8, -8.8, 21.8, -7.6]] as const) this.clear(x0, z0, x1, z1);
    // invisible walls a little outside the hedges; they also keep the camera out of the leaves
    const wall = (x0: number, z0: number, x1: number, z1: number) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = Math.max(0.3, Math.abs(x1 - x0)), d = Math.max(0.3, Math.abs(z1 - z0));
      this.collBox(cx, 4, cz, w, 10, d, 'grass', 0, true);
    };
    wall(-10.5, 7.9, 9.5, 8.2);
    wall(-10.6, -27.8, -10.3, 8.2);
    wall(9.25, -9.4, 9.55, 8.2);
    wall(-10.6, -27.9, 22, -27.6);
    wall(21.6, -27.9, 21.9, -7.8);
    wall(13.6, -7.8, 21.9, -7.5);
  }

  /** Trees beyond the edges, so the garden sits in a wooded valley. */
  private scenery() {
    const r = this.rand;
    for (let i = 0; i < (this.phone ? 26 : 48); i++) {
      const side = i % 4;
      let x = 0, z = 0;
      if (side === 0) { x = -16 + r() * 44; z = -31 - r() * 14; }
      if (side === 1) { x = -14 - r() * 14; z = -30 + r() * 40; }
      if (side === 2) { x = -16 + r() * 26; z = 11 + r() * 14; }
      if (side === 3) { x = 24 + r() * 14; z = -32 + r() * 34; }
      this.tree(x, heightAt(x, z), z, 0.9 + r() * 0.6, (r() - 0.5) * 0.04, false);
    }
  }

  private tree(x: number, y: number, z: number, size = 1, tint = 0, collide = true) {
    const t = this.foliage.tree(x, y, z, size, tint);
    if (collide) this.collCyl(x, y + 1.2 * size, z, t.r + 0.05, 2.4 * size, 'wood');
    this.clear(x - 0.5, z - 0.5, x + 0.5, z + 0.5);
    return t;
  }

  // ---------- grass and flowers last, so they skip everything above ----------
  private planting() {
    const F = this.foliage, Y = TERRACE_Y;
    const bushes: [number, number, number, number, string?][] = [
      [-8.6, Y, 6.4, 1.1, PAL.hollyhock], [-9.0, Y, -1.0, 0.9], [-9.0, Y, -6.5, 1.0, PAL.daisy], [0.8, Y, 6.6, 0.9], [3.6, Y, 6.8, 0.8, PAL.hollyhock],
      [8.3, Y, -1.8, 0.9, PAL.daisy], [8.2, Y, 1.6, 0.8], [-3.6, Y, -8.6, 0.8, PAL.poppy], [3.6, Y, -8.7, 0.75],
      [-2.0, 0, -11.0, 0.9, PAL.lavender], [2.8, 0, -11.2, 0.9], [-5.0, 0, -11.0, 1.0, PAL.daisy], [6.0, 0, -11.0, 0.9, PAL.hollyhock],
      [-9.0, 0, -18.0, 1.0], [-2.0, 0, -26.2, 1.0, PAL.poppy], [3.0, 0, -26.4, 1.1], [8.4, 0, -26.0, 0.9, PAL.lavender],
      [-6.0, 0, -12.2, 0.8], [8.6, 0, -11.5, 0.7], [15.0, 0, -9.2, 0.9, PAL.daisy], [20.2, 0, -16.0, 1.0], [14.8, 0, -26.4, 0.9, PAL.hollyhock],
      [-7.0, Y, 4.4, 0.7, PAL.lavender], [4.6, Y, 2.2, 0.6, PAL.buttercup],
    ];
    for (const [x, y, z, s, f] of bushes) { F.bush(x, y, z, s, f); this.clear(x - 0.45 * s, z - 0.45 * s, x + 0.45 * s, z + 0.45 * s); }

    const tufts: Tuft[] = [], flowers: Flower[] = [];
    const r = mulberry(77);
    const want = this.phone ? 9000 : 26000;
    const area = { x0: -11, x1: 22, z0: -28.5, z1: 9 };
    let tries = 0;
    const flowerCols = [PAL.daisy, PAL.daisy, PAL.buttercup, PAL.buttercup, PAL.poppy, PAL.lavender, PAL.hollyhock];
    while (tufts.length < want && tries++ < want * 4) {
      const x = area.x0 + r() * (area.x1 - area.x0), z = area.z0 + r() * (area.z1 - area.z0);
      if (x > RIVER.x0 - 0.5 && x < RIVER.x1 + 0.4) continue;
      if (!this.isClear(x, z)) continue;
      const pd = this.pathDist(x, z);
      if (pd < 0.5 + vnoise(x * 2, z * 2) * 0.25) continue;
      const y = heightAt(x, z);
      if (Math.abs(z + 9.75) < 0.4 && x > RAMP.x1) continue;
      const n = vnoise(x * 0.5, z * 0.5);
      const s = (0.2 + n * 0.16 + r() * 0.06) * (pd < 1.2 ? 0.75 : 1);
      tufts.push({ x, y, z, s, tint: (vnoise(x * 0.25 + 9, z * 0.25) - 0.5) * 2 });
      if (r() < 0.06 * (0.4 + n)) flowers.push({ x: x + 0.05, y, z, color: flowerCols[Math.floor(r() * flowerCols.length)], s: 0.25 + r() * 0.2 });
    }
    const outerWant = this.phone ? 2000 : 7000;
    for (let i = 0; i < outerWant; i++) {
      const a = r() * Math.PI * 2, d = 2 + r() * 14;
      const x = 5.5 + Math.cos(a) * (17 + d), z = -10 + Math.sin(a) * (20 + d);
      if (x > RIVER.x0 - 0.5 && x < RIVER.x1 + 0.4) continue;
      tufts.push({ x, y: heightAt(x, z), z, s: 0.3 + r() * 0.2, tint: 0.3 });
    }
    for (let i = 0; i < 70; i++) {
      const z = RAMP.z0 + r() * (RAMP.z1 - RAMP.z0), x = RAMP.x1 + 0.2 + r() * 0.6;
      flowers.push({ x, y: heightAt(x, z), z, color: r() < 0.5 ? PAL.poppy : PAL.lavender, s: 0.3 + r() * 0.15 });
    }
    this.meadow.grass(tufts);
    this.meadow.flowers(flowers);
  }

  // ---------- dynamic things ----------
  addPot(x: number, y: number, z: number, seed: number | null) {
    const M = this.M;
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(G.cyl(0.15, 0.2, 0.44, 16), M.clay));
    const rim = new THREE.Mesh(G.torus(0.19, 0.04, 8, 16), M.clay); rim.rotation.x = Math.PI / 2; rim.position.y = 0.22; mesh.add(rim);
    const band = new THREE.Mesh(G.torus(0.18, 0.015, 6, 16), pmat('#E8D3B0')); band.rotation.x = Math.PI / 2; band.position.y = 0.05; mesh.add(band);
    mesh.traverse((o) => { o.castShadow = true; });
    this.group.add(mesh);
    const rb = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.2).setAngularDamping(0.4));
    this.world.createCollider(RAPIER.ColliderDesc.cylinder(0.22, 0.19).setDensity(0.6).setFriction(0.7).setRestitution(0.1), rb);
    let seedIndex: number | null = null;
    if (seed !== null) { this.seeds.unshift(new THREE.Vector3(x, y, z)); seedIndex = 0; }
    this.pots.push({ body: rb, mesh, seed: seedIndex, spawn: new THREE.Vector3(x, y, z), prevV: new THREE.Vector3(), broken: false });
  }

  addCrate(x: number, y: number, z: number) {
    const M = this.M;
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(boxUV(G.box(0.6, 0.6, 0.6), 0.6, 0.6, 0.6, 0.6), M.plank));
    for (const s of [-1, 1]) { const e = new THREE.Mesh(G.box(0.62, 0.08, 0.62), M.plankDark); e.position.y = s * 0.26; mesh.add(e); }
    mesh.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.group.add(mesh);
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.6).setAngularDamping(0.8));
    const col = this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 0.3, 0.3).setDensity(0.5).setFriction(0.8), body);
    this.surfaces.set(col.handle, 'wood');
    this.crates.push({ body, mesh, spawn: new THREE.Vector3(x, y, z) });
  }

  openGate() {
    if (this.gate.opening) return;
    this.gate.opening = true;
    this.world.removeCollider(this.gate.collider, false);
  }

  update(t: number, dt: number) {
    for (const f of this.anim) f(t, dt);
    if (this.gate.opening && this.gate.open < 1) {
      this.gate.open = Math.min(1, this.gate.open + dt * 1.4);
      const e = 1 - Math.pow(1 - this.gate.open, 3);
      const ang = e * 1.75 + Math.sin(this.gate.open * Math.PI) * 0.05;
      this.gate.leaves[0].rotation.y = ang; this.gate.leaves[1].rotation.y = -ang;
    }
  }

  syncDynamics() {
    for (const p of this.pots) {
      if (p.broken) continue;
      const tr = p.body.translation(), r = p.body.rotation();
      p.mesh.position.set(tr.x, tr.y, tr.z); p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
    for (const c of this.crates) {
      let tr = c.body.translation();
      // a crate pushed into the river or off the edge comes quietly back, so no step is ever lost
      if (tr.y < -0.5) {
        c.body.setTranslation({ x: c.spawn.x, y: c.spawn.y + 0.4, z: c.spawn.z }, true);
        c.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        c.body.setLinvel({ x: 0, y: 0, z: 0 }, true); c.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        tr = c.body.translation();
      }
      const r = c.body.rotation();
      c.mesh.position.set(tr.x, tr.y, tr.z); c.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }
}

function cylUV(g: THREE.CylinderGeometry) {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 9, uv.getY(i) * 0.4);
  return g;
}

let glowTex: THREE.Texture | null = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!; const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.25, 'rgba(255,200,120,0.5)'); gr.addColorStop(1, 'rgba(255,170,80,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c); glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

function waterMaterial() {
  const m = new THREE.ShaderMaterial({
    fog: true, transparent: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uDeep: { value: new THREE.Color('#4A7596') }, uWater: { value: new THREE.Color(PAL.water) },
      uSky: { value: new THREE.Color(PAL.skyMid) }, uSparkle: { value: new THREE.Color(PAL.sparkle) },
    }]),
    vertexShader: /* glsl */ `
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uDeep, uWater, uSky, uSparkle;
      varying vec3 vW;
      #include <fog_pars_fragment>
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vW.xz * vec2(1.6, 0.4) + vec2(0.0, -uTime * 0.7);
        float n = n2(p) * 0.6 + n2(p * 2.3 + 7.0) * 0.4;
        float streak = smoothstep(0.6, 0.66, n) * (1.0 - smoothstep(0.7, 0.8, n));
        float edge = min(vW.x - ${RIVER.x0.toFixed(1)}, ${RIVER.x1.toFixed(1)} - vW.x);
        vec3 c = mix(uWater, uDeep, smoothstep(0.2, 1.8, edge) * 0.7);
        vec3 v = normalize(cameraPosition - vW);
        c = mix(c, uSky, pow(1.0 - v.y, 3.0) * 0.5);
        c = mix(c, uSparkle, streak * 0.45);
        float foam = (1.0 - smoothstep(0.0, 0.55, edge)) * n2(vW.xz * 4.0 + vec2(0.0, -uTime * 1.2));
        c = mix(c, uSparkle, foam * 0.7);
        float sp = step(0.94, n2(vW.xz * 7.0 + vec2(uTime * 0.3, -uTime * 1.5))) * step(0.5, n);
        c += uSparkle * sp * 0.6;
        gl_FragColor = vec4(c, 0.92);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  m.uniforms.uTime = SHARED.uTime;
  return m;
}

/** A soft beam: brightest down the middle, fading to nothing at the sides and both ends. */
let shaftTex: THREE.CanvasTexture | null = null;
function shaftTexture() {
  if (shaftTex) return shaftTex;
  const c = document.createElement('canvas'); c.width = 32; c.height = 128;
  const g = c.getContext('2d')!; const img = g.createImageData(32, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 32; x++) {
    const u = (x + 0.5) / 32 - 0.5, v = (y + 0.5) / 128;
    const a = Math.exp(-u * u * 22) * Math.min(1, v * 4) * Math.min(1, (1 - v) * 2.5);
    const i = (y * 32 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * a); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  shaftTex = new THREE.CanvasTexture(c);
  return shaftTex;
}
