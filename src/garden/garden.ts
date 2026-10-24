import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Level } from '../level';
import type { Player } from '../player';
import { G, Kit } from '../world/kit';
import { PAL, pmat } from '../world/ghibli';
import { boxUV } from '../world/textures';
import {
  GARDEN, ARCH, ROOM1, CELLS, DIVIDE, PLATE, CRATE_HOME, PLINTH, POND, ROCK, STONES, YARD,
  CHIMNEY_OUT, CHIMNEY_IN, BELL, EMBER_C, DAIS,
} from './layout';

// The spirit garden: Spark Trail's tools turned into things Kettle walks onto, pushes, baps and travels
// through, in a garden many times the size of a puzzle board. Three embers wait behind a chain of small
// riddles; carried to the spirit lantern at the north end, they wake the mill.
//
//   room 1  a brass plate opens the lattice gate only while something holds it down. The crate can hold it,
//           and the same crate is the only step up to the first ember on the stone stack.
//   room 2  a chimney takes Kettle, as smoke, into the walled bell yard (the second ember). The bell raises
//           three stones out of the pond up to the rock with the third ember, and opens the yard's door.
//
// The crate slides one flagstone per push, like Spark Trail's crate. A crate pushed against the outer
// hedge can never come back, so it puffs home after a moment: nothing is ever lost.

export type Family = 'plate' | 'crate' | 'chimney' | 'bell' | 'stones' | 'step' | 'lantern';
export type GardenEvent =
  | { type: 'plate'; on: boolean } | { type: 'gate'; open: boolean } | { type: 'push' } | { type: 'bump' }
  | { type: 'crateHome'; from: THREE.Vector3 } | { type: 'ember'; count: number; at: THREE.Vector3 }
  | { type: 'warp'; from: THREE.Vector3; to: THREE.Vector3 } | { type: 'bell'; first: boolean } | { type: 'rise' }
  | { type: 'door' } | { type: 'deliver'; count: number; at: THREE.Vector3 } | { type: 'lit' };

export interface GardenSave { found: boolean[]; delivered: number; rung: boolean; lit: boolean }

type EmberState = 'home' | 'carried' | 'flying' | 'placed';
interface Ember {
  home: THREE.Vector3; pos: THREE.Vector3; state: EmberState; obj: THREE.Group; glow: THREE.Sprite;
  from: THREE.Vector3; to: THREE.Vector3; t: number; socket: number;
}

const BRASS = '#D4A94F';
const tmp = new THREE.Vector3();

/** Bake a little built object into one mesh per material, so a moving part costs a draw call or two. */
function merged(o: THREE.Object3D, shadows = true) {
  const k = new Kit(); k.addObject(o);
  const g = k.build(shadows);
  return g;
}

export class Garden {
  group = new THREE.Group();
  /** what happened since the game last read them (main clears the list) */
  events: GardenEvent[] = [];
  /** progress */
  found = [false, false, false];
  delivered = 0;
  rung = false;
  lit = false;
  gateEverOpen = false;
  crateHeldGate = false;
  pushedOnce = false;
  warpedOnce = false;
  steppedOffPlate = false;
  /** places the coach and the hints point at */
  readonly plateAt = new THREE.Vector3(PLATE.x, ROOM1.floor, PLATE.z);
  readonly plinthTop = new THREE.Vector3(PLINTH.x, PLINTH.h, PLINTH.z);
  readonly chimneyTop = new THREE.Vector3(CHIMNEY_OUT.x, CHIMNEY_OUT.h, CHIMNEY_OUT.z);
  readonly bellAt = new THREE.Vector3(BELL.x, 1.3, BELL.z);
  readonly rockTop = new THREE.Vector3(ROCK.x, ROCK.h, ROCK.z);
  readonly lanternAt = new THREE.Vector3(DAIS.x, DAIS.h, DAIS.z);
  readonly gateAt = new THREE.Vector3(0, 0, DIVIDE.z);
  readonly archAt = new THREE.Vector3(ARCH.x, 0, ARCH.z);
  readonly chimneyTops = [new THREE.Vector3(CHIMNEY_OUT.x, CHIMNEY_OUT.h, CHIMNEY_OUT.z), new THREE.Vector3(CHIMNEY_IN.x, CHIMNEY_IN.h, CHIMNEY_IN.z)];

  private world: RAPIER.World;
  private mats = new Map<string, THREE.Material>();
  /** one painted material per colour, so the merged decor stays a few draw calls */
  private mat(c: string) { let m = this.mats.get(c); if (!m) { m = pmat(c); this.mats.set(c, m); } return m; }
  private crate!: { body: RAPIER.RigidBody; mesh: THREE.Group; cx: number; cz: number; from: THREE.Vector3; to: THREE.Vector3; t: number; pushT: number; edgeT: number; poof: number };
  private gate!: { leaves: THREE.Group[]; collider: RAPIER.Collider; open01: number; open: boolean; closeT: number };
  private door!: { leaf: THREE.Group; collider: RAPIER.Collider; open01: number };
  private bell!: { pivot: THREE.Group; swing: number; t: number };
  private stones: { body: RAPIER.RigidBody; mesh: THREE.Group; h: number; top: number; at: number }[] = [];
  private plateMesh!: THREE.Group;
  private plateDown = 0;
  private pressed = false;
  private embers: Ember[] = [];
  private sockets: THREE.Vector3[] = [];
  private lantern!: { glass: THREE.Mesh; halo: THREE.Sprite; light: THREE.PointLight; inner: THREE.Mesh };
  private armed = true;
  private riseAt = -1;
  private time = 0;
  private litT = 0;

  constructor(private L: Level, glowTex: THREE.Texture) {
    this.world = L.world;
    this.buildStatic();
    this.buildDynamic(glowTex);
  }

  // ---------- static parts, baked into the level's merged meshes ----------
  private buildStatic() {
    const L = this.L, F = L.foliage;
    // tall clipped hedges all round, taller than a double jump; invisible walls above them stop any hop over
    const H = 3.2;
    F.hedge(GARDEN.x0, GARDEN.z1 - 0.3, GARDEN.x0, GARDEN.z0, 0, H, 1.0);
    F.hedge(GARDEN.x0, GARDEN.z0, GARDEN.x1, GARDEN.z0, 0, H, 1.0, PAL.daisy);
    F.hedge(GARDEN.x1, GARDEN.z0, GARDEN.x1, YARD.z0 - 0.2, 0, H, 1.0);
    F.hedge(GARDEN.x1, YARD.z1 + 0.2, GARDEN.x1, GARDEN.z1 - 0.3, 0, H, 1.0, PAL.hollyhock);
    const wall = (x0: number, z0: number, x1: number, z1: number) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = Math.max(0.3, Math.abs(x1 - x0)), d = Math.max(0.3, Math.abs(z1 - z0));
      L.collBox(cx, 4, cz, w, 10, d, 'grass', 0, true);
    };
    wall(GARDEN.x0 - 0.5, GARDEN.z0 - 0.5, GARDEN.x0 + 0.4, GARDEN.z1);
    wall(GARDEN.x0 - 0.5, GARDEN.z0 - 0.5, GARDEN.x1 + 0.5, GARDEN.z0 + 0.4);
    wall(GARDEN.x1 - 0.4, GARDEN.z0 - 0.5, GARDEN.x1 + 0.5, GARDEN.z1);
    L.clear(GARDEN.x0 - 0.7, GARDEN.z0 - 0.7, GARDEN.x0 + 0.7, GARDEN.z1);
    L.clear(GARDEN.x0, GARDEN.z0 - 0.7, GARDEN.x1, GARDEN.z0 + 0.7);
    L.clear(GARDEN.x1 - 0.7, GARDEN.z0, GARDEN.x1 + 0.7, GARDEN.z1);

    this.arch();
    this.room1();
    this.divider();
    this.pond();
    this.yard();
    this.dais();
    this.decor();
  }

  /** a timber arch with a little tiled roof where the court's hedge opens into the garden */
  private arch() {
    const L = this.L, M = L.M, x = ARCH.x, z = ARCH.z, w = ARCH.half + 0.15;
    for (const s of [-1, 1]) {
      L.box(x + s * w, 1.35, z, 0.22, 2.7, 0.22, M.woodDark, 'wood');
      L.kit.add(G.box(0.34, 0.12, 0.34), M.stoneDark, { x: x + s * w, y: 0.06, z });
    }
    L.box(x, 2.72, z, 2 * w + 0.6, 0.18, 0.3, M.woodDark);
    L.kit.add(boxUV(G.box(2 * w + 1.0, 0.1, 0.9), 2 * w + 1.0, 0.1, 0.9, 1), M.tile, { x, y: 2.95, z: z - 0.22 }, [-0.35, 0, 0]);
    L.kit.add(boxUV(G.box(2 * w + 1.0, 0.1, 0.9), 2 * w + 1.0, 0.1, 0.9, 1), M.tile, { x, y: 2.95, z: z + 0.22 }, [0.35, 0, 0]);
    L.kit.add(G.cyl(0.07, 0.07, 2 * w + 1.0, 8), this.mat('#A65E4A'), { x, y: 3.12, z }, [0, 0, Math.PI / 2]);
    // a small brass lantern hangs from the beam: it lights with the spirit lantern
    L.kit.add(G.box(0.5, 0.36, 0.05), M.plank, { x: x + 0.7, y: 2.4, z: z + 0.17 });
    L.clear(x - 1.6, z - 0.6, x + 1.6, z + 0.6);
  }

  /** room 1: flagstones on the crate's 1 m grid, the brass plate, the stone stack with the first ember */
  private room1() {
    const L = this.L, M = L.M, R = ROOM1;
    const cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2;
    L.box(cx, R.floor / 2 - 0.1, cz, R.x1 - R.x0, R.floor + 0.2, R.z1 - R.z0, this.mat('#A79C8C'), 'stone');
    const flags = [this.mat('#EAE0CC'), this.mat('#E2D6BE'), this.mat('#D9CCB2')];
    for (let x = CELLS.x0 - 1; x <= CELLS.x1 + 1.01; x++) for (let z = CELLS.z0; z <= CELLS.z1 + 0.01; z++) {
      const h = Math.abs(Math.sin(x * 12.9 + z * 78.2) * 43758.5) % 1;
      L.kit.add(G.box(0.93, 0.05, 0.93), flags[Math.floor(h * 2.999)], { x, y: R.floor - 0.02, z });
      if (h > 0.86) L.kit.add(G.ico(0.05, 0), M.moss, { x: x + 0.43, y: R.floor + 0.005, z: z + 0.43 }, [0, 0, 0], [1.6, 0.35, 1.2]);
    }
    L.clear(R.x0, R.z0, R.x1, R.z1);
    // the stone stack: three dressed drums, moss on the ledges, a cup on top for the ember
    const P = PLINTH;
    L.box(P.x, P.h / 2, P.z, P.half * 2, P.h, P.half * 2, M.stone, 'stone', { unit: 1.2, block: true });
    for (const [y, s] of [[1.05, 1.08], [2.15, 1.04]] as const) L.kit.add(G.box(P.half * 2 * s, 0.1, P.half * 2 * s), M.stoneDark, { x: P.x, y, z: P.z });
    L.kit.add(G.box(P.half * 2 + 0.12, 0.14, P.half * 2 + 0.12), M.stoneDark, { x: P.x, y: P.h - 0.05, z: P.z });
    for (const [dx, dz] of [[0.75, 0.4], [-0.6, 0.78], [0.3, -0.8]]) L.kit.add(G.ico(0.16, 1), M.moss, { x: P.x + dx, y: P.h + 0.02, z: P.z + dz }, [0, 0, 0], [1.6, 0.4, 1.3]);
    L.kit.add(G.cyl(0.2, 0.26, 0.16, 12), M.stoneDark, { x: P.x, y: P.h + 0.08, z: P.z });
    // ivy up the north face, a hint that something waits on top
    for (let i = 0; i < 9; i++) L.kit.add(G.ico(0.13, 1), M.leaf, { x: P.x - 0.5 + (i % 3) * 0.45, y: 0.4 + i * 0.3, z: P.z - P.half - 0.04 }, [0, 0, 0], [1.2, 1, 0.4]);
  }

  /** the hedge between the rooms and the lattice gate the plate opens */
  private divider() {
    const L = this.L, M = L.M, F = L.foliage, z = DIVIDE.z, g = DIVIDE.gateHalf;
    F.hedge(GARDEN.x0 + 0.3, z, -g - 0.45, z, 0, 3.2, 1.0, PAL.lavender);
    F.hedge(g + 0.45, z, GARDEN.x1 - 0.3, z, 0, 3.2, 1.0);
    const block = (x0: number, x1: number) => { L.collBox((x0 + x1) / 2, 4, z, x1 - x0, 10, 1.0, 'grass', 0, true); };
    block(GARDEN.x0, -g - 0.3); block(g + 0.3, GARDEN.x1);
    L.clear(GARDEN.x0, z - 0.7, GARDEN.x1, z + 0.7);
    // stone gate posts with caps, a beam with a small roof
    for (const s of [-1, 1]) {
      L.box(s * (g + 0.2), 1.75, z, 0.5, 3.5, 0.6, M.stone, 'stone', { unit: 1.2, block: true });
      L.kit.add(G.box(0.62, 0.12, 0.72), M.stoneDark, { x: s * (g + 0.2), y: 3.56, z });
      L.collBox(s * (g + 0.2), 7, z, 0.5, 7, 0.6, 'stone');
    }
    L.box(0, 3.45, z, 2 * g + 1.0, 0.2, 0.4, M.woodDark);
    L.collBox(0, 6.5, z, 2 * g, 6, 0.4, 'wood');
    for (const s of [-1, 1]) L.kit.add(boxUV(G.box(2 * g + 1.5, 0.1, 0.8), 2 * g + 1.5, 0.1, 0.8, 1), M.tile, { x: 0, y: 3.72, z: z + s * 0.2 }, [s * 0.4, 0, 0]);
    L.kit.add(G.cyl(0.06, 0.06, 2 * g + 1.5, 8), this.mat('#A65E4A'), { x: 0, y: 3.88, z }, [0, 0, Math.PI / 2]);
  }

  /** room 2: the pond with its rock (stones are dynamic) and reeds round the shore */
  private pond() {
    const L = this.L, M = L.M, P = POND;
    // shore stones, a ring of rounded pebbles where the grass meets the water
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2, r = P.r - 0.05 + Math.sin(i * 3.7) * 0.08;
      L.kit.add(G.ico(0.2 + (i % 3) * 0.05, 1), i % 4 ? M.stoneDark : M.pebble, { x: P.x + Math.cos(a) * r, y: -0.25, z: P.z + Math.sin(a) * r }, [i, i * 2, 0], [1.4, 0.6, 1.1]);
    }
    // the rock: three rough drums narrowing upward, moss on top, an ember cup
    const R = ROCK;
    this.L.collCyl(R.x, (R.h + P.bed) / 2, R.z, R.r, R.h - P.bed, 'stone');
    for (const [y0, y1, r] of [[P.bed, 1.2, R.r + 0.08], [1.2, 2.3, R.r + 0.02], [2.3, R.h, R.r]] as const) {
      L.kit.add(G.cyl(r + 0.04, r, y1 - y0, 12), M.stone, { x: R.x, y: (y0 + y1) / 2, z: R.z }, [0, y0, 0]);
    }
    L.kit.add(G.sph(R.r + 0.02, 14, 6), M.moss, { x: R.x, y: R.h - 0.02, z: R.z }, [0, 0, 0], [1, 0.14, 1]);
    L.kit.add(G.cyl(0.2, 0.26, 0.16, 12), M.stoneDark, { x: R.x, y: R.h + 0.08, z: R.z });
    // lily pads and reeds
    for (const [a, r] of [[0.8, 2.7], [2.1, 2.2], [3.6, 2.9], [4.9, 2.4], [5.8, 1.6]]) L.kit.add(G.cyl(0.22, 0.22, 0.02, 10), this.mat('#7FAE5A'), { x: P.x + Math.cos(a) * r, y: P.water + 0.02, z: P.z + Math.sin(a) * r });
    for (let i = 0; i < 26; i++) {
      const a = 2.6 + (i / 26) * 2.4 + Math.sin(i) * 0.05, r = P.r - 0.3 + (i % 3) * 0.15;
      L.kit.add(G.cyl(0.012, 0.02, 0.8 + (i % 4) * 0.15, 4), this.mat('#6F9A4E'), { x: P.x + Math.cos(a) * r, y: -0.05 + 0.4, z: P.z + Math.sin(a) * r }, [Math.sin(i) * 0.15, 0, Math.cos(i) * 0.15]);
    }
    L.clear(P.x - P.r - 0.4, P.z - P.r - 0.4, P.x + P.r + 0.4, P.z + P.r + 0.4);
  }

  /** the bell yard: four stone walls, a door in the west wall, flagstones, a stand for the ember */
  private yard() {
    const L = this.L, M = L.M, Y = YARD, t = Y.wall;
    const cap = (cx: number, cz: number, w: number, d: number) => L.kit.add(G.box(w + 0.12, 0.12, d + 0.12), M.stoneDark, { x: cx, y: Y.h + 0.06, z: cz });
    const seg = (cx: number, cz: number, w: number, d: number) => {
      L.box(cx, Y.h / 2, cz, w, Y.h, d, M.stone, 'stone', { unit: 1.2, block: true });
      L.collBox(cx, Y.h + 3, cz, w, 6, d, 'stone');
      cap(cx, cz, w, d);
    };
    const cx = (Y.x0 + Y.x1) / 2, cz = (Y.z0 + Y.z1) / 2, W = Y.x1 - Y.x0, D = Y.z1 - Y.z0;
    seg(cx, Y.z1 - t / 2, W, t);
    seg(cx, Y.z0 + t / 2, W, t);
    seg(Y.x1 - t / 2, cz, t, D - 2 * t);
    // west wall: two pieces either side of the door, and a lintel over it
    const dz0 = Y.doorZ - Y.doorHalf, dz1 = Y.doorZ + Y.doorHalf;
    seg(Y.x0 + t / 2, (Y.z0 + t + dz0) / 2, t, dz0 - (Y.z0 + t));
    seg(Y.x0 + t / 2, (dz1 + Y.z1 - t) / 2, t, Y.z1 - t - dz1);
    L.box(Y.x0 + t / 2, (Y.doorH + Y.h) / 2, Y.doorZ, t, Y.h - Y.doorH, 2 * Y.doorHalf, M.stone, 'stone', { unit: 1.2, block: true });
    L.collBox(Y.x0 + t / 2, Y.h + 3, Y.doorZ, t, 6, 2 * Y.doorHalf, 'stone');
    cap(Y.x0 + t / 2, Y.doorZ, t, 2 * Y.doorHalf);
    L.kit.add(G.box(t + 0.1, 0.14, 2 * Y.doorHalf + 0.3), M.woodDark, { x: Y.x0 + t / 2, y: Y.doorH + 0.07, z: Y.doorZ });
    // tiles along the top of the walls
    for (const [x, z, w, d] of [[cx, Y.z1 - t / 2, W, t], [cx, Y.z0 + t / 2, W, t], [Y.x1 - t / 2, cz, t, D], [Y.x0 + t / 2, cz, t, D]] as const) {
      L.kit.add(boxUV(G.box(w + 0.2, 0.08, d + 0.2), w + 0.2, 0.08, d + 0.2, 1), M.tile, { x, y: Y.h + 0.16, z });
    }
    // flagstone floor inside
    const flag = this.mat('#E2D6BE');
    L.kit.add(G.box(W - 2 * t, 0.04, D - 2 * t), this.mat('#A79C8C'), { x: cx, y: -0.005, z: cz });
    for (let x = Y.x0 + t + 0.5; x < Y.x1 - t; x += 1.0) for (let z = Y.z0 + t + 0.5; z < Y.z1 - t; z += 1.0) L.kit.add(G.box(0.93, 0.05, 0.93), flag, { x, y: 0.0, z });
    // the ember stand
    L.box(EMBER_C.x, EMBER_C.stand / 2, EMBER_C.z, 0.6, EMBER_C.stand, 0.6, M.stoneDark, 'stone');
    L.kit.add(G.cyl(0.2, 0.26, 0.14, 12), M.stone, { x: EMBER_C.x, y: EMBER_C.stand + 0.07, z: EMBER_C.z });
    // the bell frame: two posts and a beam (the bell itself swings)
    for (const s of [-1, 1]) L.box(BELL.x + s * 0.55, 1.05, BELL.z, 0.14, 2.1, 0.14, M.woodDark, 'wood');
    L.box(BELL.x, 2.1, BELL.z, 1.4, 0.16, 0.18, M.woodDark);
    L.kit.add(boxUV(G.box(1.7, 0.08, 0.7), 1.7, 0.08, 0.7, 1), M.tile, { x: BELL.x, y: 2.32, z: BELL.z - 0.17 }, [-0.4, 0, 0]);
    L.kit.add(boxUV(G.box(1.7, 0.08, 0.7), 1.7, 0.08, 0.7, 1), M.tile, { x: BELL.x, y: 2.32, z: BELL.z + 0.17 }, [0.4, 0, 0]);
    // chimneys: brick stacks with a stone collar and a dark mouth
    const brick = pmat('#C07D62', { map: L.T.stone }), soot = this.mat('#2E2838');
    for (const c of [CHIMNEY_OUT, CHIMNEY_IN]) {
      L.box(c.x, c.h / 2, c.z, c.half * 2, c.h, c.half * 2, brick, 'stone', { unit: 0.8 });
      L.kit.add(G.box(c.half * 2 + 0.14, 0.14, c.half * 2 + 0.14), M.stoneDark, { x: c.x, y: c.h - 0.04, z: c.z });
      L.kit.add(G.box(c.half * 2 - 0.2, 0.02, c.half * 2 - 0.2), soot, { x: c.x, y: c.h + 0.035, z: c.z });
      L.clear(c.x - 0.7, c.z - 0.7, c.x + 0.7, c.z + 0.7);
    }
    L.clear(Y.x0 - 0.3, Y.z0 - 0.3, Y.x1 + 0.3, Y.z1 + 0.3);
  }

  /** the round dais at the north end, a step up, three ember cups round the spirit lantern */
  private dais() {
    const L = this.L, M = L.M, D = DAIS;
    L.collCyl(D.x, D.h / 2, D.z, D.r, D.h, 'stone');
    L.collCyl(D.x, D.h / 4, D.z, D.r + 0.45, D.h / 2, 'stone');
    L.kit.add(G.cyl(D.r + 0.05, D.r, D.h, 32), M.stone, { x: D.x, y: D.h / 2, z: D.z });
    L.kit.add(G.cyl(D.r + 0.5, D.r + 0.45, D.h / 2, 32), M.stoneDark, { x: D.x, y: D.h / 4, z: D.z });
    L.kit.add(G.cyl(D.r - 0.1, D.r - 0.1, 0.02, 32), this.mat('#E4D6BC'), { x: D.x, y: D.h + 0.005, z: D.z });
    // the spirit lantern: a stone toro, base, shaft, platform, fire box (dynamic glass), roof, finial
    const y0 = D.h;
    L.collCyl(D.x, y0 + 1.1, D.z, 0.45, 2.2, 'stone', true);
    L.kit.add(G.cyl(0.55, 0.5, 0.25, 6), M.stone, { x: D.x, y: y0 + 0.125, z: D.z });
    L.kit.add(G.cyl(0.2, 0.17, 0.8, 10), M.stone, { x: D.x, y: y0 + 0.65, z: D.z });
    L.kit.add(G.cyl(0.5, 0.42, 0.16, 6), M.stone, { x: D.x, y: y0 + 1.13, z: D.z });
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) L.kit.add(G.box(0.1, 0.5, 0.1), M.stone, { x: D.x + dx * 0.25, y: y0 + 1.46, z: D.z + dz * 0.25 });
    L.kit.add(G.cone(0.78, 0.42, 6), M.stoneDark, { x: D.x, y: y0 + 1.92, z: D.z });
    L.kit.add(G.sph(0.12, 10, 8), M.stoneDark, { x: D.x, y: y0 + 2.2, z: D.z });
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + (i / 3) * Math.PI * 2;
      const p = new THREE.Vector3(D.x + Math.cos(a) * 1.25, y0, D.z + Math.sin(a) * 1.25);
      L.kit.add(G.cyl(0.2, 0.26, 0.16, 12), M.stoneDark, { x: p.x, y: p.y + 0.08, z: p.z });
      this.sockets.push(p.setY(p.y + 0.42));
    }
    L.clear(D.x - D.r - 0.7, D.z - D.r - 0.7, D.x + D.r + 0.7, D.z + D.r + 0.7);
  }

  private decor() {
    const L = this.L, F = L.foliage;
    // trees in the far corners, bushes along the hedges, a bench facing the pond
    for (const [x, z, s] of [[-8.3, -48.4, 1.0], [7.6, -48.6, 0.9], [-8.6, -37.6, 0.75]] as const) L.tree(x, 0, z, s);
    for (const [x, z, s, f] of [[-9.0, -28.6, 0.7, PAL.poppy], [8.2, -28.6, 0.7, PAL.buttercup], [-3.6, -49.2, 0.8, PAL.lavender], [4.6, -49.3, 0.8], [8.3, -45.4, 0.7, PAL.hollyhock], [-1.0, -36.8, 0.6, PAL.daisy]] as const) {
      F.bush(x, 0, z, s, f); L.clear(x - 0.45 * s, z - 0.45 * s, x + 0.45 * s, z + 0.45 * s);
    }
    const M = L.M, bx = 0.4, bz = -43.2;
    L.box(bx, 0.42, bz, 1.4, 0.08, 0.45, M.plank, 'wood', { unit: 0.6 });
    for (const s of [-1, 1]) L.box(bx + s * 0.55, 0.2, bz, 0.12, 0.4, 0.4, M.woodDark);
    L.clear(bx - 0.9, bz - 0.4, bx + 0.9, bz + 0.4);
    // two small stone lanterns along the path to the dais
    for (const [x, z] of [[-0.9, -38.4], [3.5, -43.9]] as const) {
      L.box(x, 0.35, z, 0.22, 0.7, 0.22, M.stoneDark, 'stone');
      L.kit.add(G.box(0.34, 0.24, 0.34), M.stone, { x, y: 0.82, z });
      L.kit.add(G.cone(0.3, 0.18, 4), M.stoneDark, { x, y: 1.03, z }, [0, Math.PI / 4, 0]);
      L.clear(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
    }
  }

  // ---------- moving parts: plate, gate, crate, door, bell, stones, embers, the lantern's light ----------
  private buildDynamic(glowTex: THREE.Texture) {
    const M = this.L.M;
    const brass = this.mat(BRASS), wood = M.woodDark, plank = M.plank;
    // the brass plate: a round disc in a stone ring, with a spirit mark
    const pl = new THREE.Group(); pl.position.copy(this.plateAt);
    const ring = new THREE.Mesh(G.cyl(0.56, 0.56, 0.05, 28), M.stoneDark); ring.position.y = 0.0; pl.add(ring);
    const disc = new THREE.Mesh(G.cyl(0.47, 0.47, 0.05, 28), brass); disc.position.y = 0.03; disc.name = 'disc'; pl.add(disc);
    const mark = new THREE.Mesh(G.torus(0.24, 0.03, 6, 24), this.mat('#B98A35')); mark.rotation.x = Math.PI / 2; mark.position.y = 0.03; disc.add(mark);
    pl.traverse((o) => { (o as THREE.Mesh).receiveShadow = true; });
    this.plateMesh = pl; this.group.add(pl);

    // the lattice gate: two leaves hinged on the posts, swinging north into room 2
    const g = DIVIDE.gateHalf, leaves: THREE.Group[] = [];
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group(); hinge.position.set(s * g, 0, DIVIDE.z);
      const leaf = new THREE.Group(); leaf.position.x = -s * g / 2; hinge.add(leaf);
      for (const y of [0.15, 1.2, 2.3]) { const b = new THREE.Mesh(G.box(g, 0.1, 0.08), wood); b.position.y = y; leaf.add(b); }
      for (let i = 0; i < 5; i++) { const v = new THREE.Mesh(G.box(0.06, 2.3, 0.06), plank); v.position.set(-g / 2 + 0.1 + i * ((g - 0.2) / 4), 1.2, 0); leaf.add(v); }
      for (const k of [-1, 1]) { const d = new THREE.Mesh(G.box(0.05, 1.45, 0.05), plank); d.position.set(0, 0.7 + (k > 0 ? 1.05 : 0), 0); d.rotation.z = k * 0.62; leaf.add(d); }
      const knob = new THREE.Mesh(G.sph(0.05, 8, 6), brass); knob.position.set(-s * (g / 2 - 0.12), 1.15, 0.06); leaf.add(knob);
      hinge.remove(leaf); hinge.add(merged(leaf));
      this.group.add(hinge); leaves.push(hinge);
    }
    const gc = this.world.createCollider(RAPIER.ColliderDesc.cuboid(g, 1.75, 0.15).setTranslation(0, 1.75, DIVIDE.z));
    this.L.surfaces.set(gc.handle, 'wood');
    this.gate = { leaves, collider: gc, open01: 0, open: false, closeT: 0 };

    // the crate: a big plank box, twice Kettle's height, banded with brass at the corners
    const cm = new THREE.Group();
    cm.add(new THREE.Mesh(boxUV(G.box(0.98, 0.98, 0.98), 0.98, 0.98, 0.98, 0.7), M.plank));
    for (const y of [-0.42, 0.42]) { const e = new THREE.Mesh(G.box(1.0, 0.12, 1.0), M.plankDark); e.position.y = y; cm.add(e); }
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const c = new THREE.Mesh(G.box(0.1, 1.0, 0.1), brass); c.position.set(x * 0.46, 0, z * 0.46); cm.add(c); }
    const cmm = merged(cm); cm.clear(); cm.add(cmm);
    this.group.add(cm);
    const home = this.cellPos(CRATE_HOME.x, CRATE_HOME.z);
    const cb = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(home.x, home.y, home.z));
    const ccol = this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.49, 0.49, 0.49).setFriction(0.8), cb);
    this.L.surfaces.set(ccol.handle, 'wood');
    cm.position.copy(home);
    this.crate = { body: cb, mesh: cm, cx: CRATE_HOME.x, cz: CRATE_HOME.z, from: home.clone(), to: home.clone(), t: 1, pushT: 0, edgeT: 0, poof: 0 };

    // the yard door: a plank door hinged on the north side of the opening, swinging out into room 2
    const Y = YARD;
    const dh = new THREE.Group();
    const door = new THREE.Mesh(boxUV(G.box(0.08, Y.doorH - 0.05, 2 * Y.doorHalf - 0.04), 0.08, Y.doorH, 2 * Y.doorHalf, 0.6), M.plankDark);
    door.position.set(0, (Y.doorH - 0.05) / 2, Y.doorHalf); door.castShadow = true; dh.add(door);
    for (const y of [0.4, 1.6]) { const b = new THREE.Mesh(G.box(0.1, 0.08, 2 * Y.doorHalf - 0.1), M.iron); b.position.set(-0.03, y, Y.doorHalf); dh.add(b); }
    const ring2 = new THREE.Mesh(G.torus(0.07, 0.015, 6, 12), brass); ring2.position.set(-0.07, 1.05, Y.doorHalf + 0.35); ring2.rotation.y = Math.PI / 2; dh.add(ring2);
    const dm = merged(dh); dh.clear(); dh.add(dm); dh.position.set(Y.x0 - 0.02, 0, Y.doorZ - Y.doorHalf);
    this.group.add(dh);
    const dc = this.world.createCollider(RAPIER.ColliderDesc.cuboid(Y.wall / 2, Y.doorH / 2, Y.doorHalf).setTranslation(Y.x0 + Y.wall / 2, Y.doorH / 2, Y.doorZ));
    this.L.surfaces.set(dc.handle, 'wood'); this.L.camBlock.add(dc.handle);
    this.door = { leaf: dh, collider: dc, open01: 0 };

    // the bell: bronze, with a rope tassel, hung from a pivot under the beam
    const pv = new THREE.Group(); pv.position.set(BELL.x, 2.0, BELL.z);
    const bronze = this.mat('#B9853E');
    const prof = [[0.02, 0], [0.12, -0.02], [0.16, -0.12], [0.19, -0.32], [0.26, -0.46], [0.27, -0.5]].map(([x, y]) => new THREE.Vector2(x, y));
    const bell = new THREE.Mesh(new THREE.LatheGeometry(prof, 18), bronze); bell.castShadow = true; pv.add(bell);
    const lip = new THREE.Mesh(G.torus(0.265, 0.025, 6, 20), bronze); lip.rotation.x = Math.PI / 2; lip.position.y = -0.5; pv.add(lip);
    const tongue = new THREE.Mesh(G.sph(0.06, 8, 6), M.iron); tongue.position.y = -0.46; pv.add(tongue);
    const rope = new THREE.Mesh(G.cyl(0.015, 0.015, 0.45, 5), this.mat('#E8D6B0')); rope.position.y = -0.72; pv.add(rope);
    const tassel = new THREE.Mesh(G.cone(0.05, 0.12, 8), this.mat('#D9574A')); tassel.position.y = -0.98; tassel.rotation.x = Math.PI; pv.add(tassel);
    pv.position.set(0, 0, 0); const bm = merged(pv); pv.clear(); pv.add(bm); pv.position.set(BELL.x, 2.0, BELL.z);
    this.group.add(pv);
    this.bell = { pivot: pv, swing: 0, t: 0 };

    // the three stones that rise from the pond: stone drums with mossy tops, sunk below the water at first
    for (const s of STONES) {
      const h = s.top + 1.6;
      const sm = new THREE.Group();
      const col = new THREE.Mesh(G.cyl(0.5, 0.46, h, 14), M.stone); col.castShadow = true; col.receiveShadow = true; sm.add(col);
      const top = new THREE.Mesh(G.sph(0.46, 14, 6), M.moss); top.scale.set(1, 0.12, 1); top.position.y = h / 2; sm.add(top);
      const smm = merged(sm); sm.clear(); sm.add(smm);
      const b = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(s.x, -0.75 - h / 2, s.z));
      const c = this.world.createCollider(RAPIER.ColliderDesc.cylinder(h / 2, 0.47), b);
      this.L.surfaces.set(c.handle, 'stone');
      sm.position.set(s.x, -0.75 - h / 2, s.z);
      this.group.add(sm);
      this.stones.push({ body: b, mesh: sm, h, top: -0.75, at: -1 });
    }

    // embers: a warm core with a soft glow and a tiny flame; two on high places, one in the bell yard
    const homes = [this.plinthTop.clone().setY(PLINTH.h + 0.42), this.rockTop.clone().setY(ROCK.h + 0.42), new THREE.Vector3(EMBER_C.x, EMBER_C.stand + 0.42, EMBER_C.z)];
    for (const h of homes) {
      const obj = new THREE.Group();
      const core = new THREE.Mesh(G.sph(0.11, 14, 10), new THREE.MeshBasicMaterial({ color: PAL.emberCore })); obj.add(core);
      const flame = new THREE.Mesh(G.cone(0.07, 0.16, 10), new THREE.MeshBasicMaterial({ color: '#FFC46B', transparent: true, opacity: 0.85 })); flame.position.y = 0.12; flame.name = 'flame'; obj.add(flame);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PAL.ember, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.setScalar(0.9); obj.add(glow);
      obj.position.copy(h); this.group.add(obj);
      this.embers.push({ home: h.clone(), pos: h.clone(), state: 'home', obj, glow, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, socket: -1 });
    }

    // the spirit lantern's fire box: cold glass until lit
    const glass = new THREE.Mesh(G.box(0.4, 0.4, 0.4), new THREE.MeshBasicMaterial({ color: PAL.coldGlass }));
    glass.position.set(DAIS.x, DAIS.h + 1.46, DAIS.z); this.group.add(glass);
    const inner = new THREE.Mesh(G.sph(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: '#FFF4D6', transparent: true, opacity: 0 }));
    inner.position.copy(glass.position); this.group.add(inner);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PAL.ember, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    halo.scale.setScalar(3.2); halo.position.copy(glass.position); this.group.add(halo);
    const light = new THREE.PointLight('#FFC27A', 0, 9, 1.6); light.position.copy(glass.position); this.group.add(light);
    this.lantern = { glass, halo, light, inner };
  }

  // ---------- helpers ----------
  private cellPos(x: number, z: number) { return new THREE.Vector3(x, ROOM1.floor + 0.49, z); }
  private freeCell(x: number, z: number, player: Player) {
    if (x < CELLS.x0 - 0.01 || x > CELLS.x1 + 0.01 || z < CELLS.z0 - 0.01 || z > CELLS.z1 + 0.01) return false;
    // the stone stack
    if (Math.abs(x - PLINTH.x) < PLINTH.half + 0.45 && Math.abs(z - PLINTH.z) < PLINTH.half + 0.45) return false;
    // Kettle standing there
    const p = player.pos;
    if (Math.abs(p.x - x) < 0.5 + 0.2 && Math.abs(p.z - z) < 0.5 + 0.2 && p.y < ROOM1.floor + 1.0) return false;
    return true;
  }
  private onEdge() { const c = this.crate; return c.cx <= CELLS.x0 + 0.01 || c.cx >= CELLS.x1 - 0.01 || c.cz <= CELLS.z0 + 0.01 || c.cz >= CELLS.z1 - 0.01; }
  get crateAt() { return this.crate.mesh.position; }
  get crateOnPlate() { const c = this.crate; return c.t >= 1 && Math.abs(c.cx - PLATE.x) < 0.01 && Math.abs(c.cz - PLATE.z) < 0.01; }
  get carried() { return this.embers.filter((e) => e.state === 'carried').length; }
  get foundCount() { return this.found.filter(Boolean).length; }
  inGarden(p: THREE.Vector3) { return p.x > GARDEN.x0 - 0.2 && p.x < GARDEN.x1 + 0.2 && p.z > GARDEN.z0 - 0.2 && p.z < GARDEN.z1 + 0.1; }
  inRoom1(p: THREE.Vector3) { return this.inGarden(p) && p.z > DIVIDE.z; }
  inYard(p: THREE.Vector3) { return p.x > YARD.x0 && p.x < YARD.x1 && p.z > YARD.z0 && p.z < YARD.z1; }
  emberPos(i: number) { return this.embers[i].pos; }

  /** Try to slide the crate one flagstone along (dx, dz). */
  private tryPush(dx: number, dz: number, player: Player) {
    const c = this.crate;
    if (c.t < 1 || c.poof > 0) return false;
    const nx = c.cx + dx, nz = c.cz + dz;
    if (!this.freeCell(nx, nz, player)) { this.events.push({ type: 'bump' }); return false; }
    c.from.copy(this.cellPos(c.cx, c.cz)); c.to.copy(this.cellPos(nx, nz)); c.t = 0;
    c.cx = nx; c.cz = nz; c.edgeT = 0;
    this.pushedOnce = true;
    this.events.push({ type: 'push' });
    return true;
  }

  /** Kettle's paw: rings the bell, or nudges the crate one stone away. */
  bap(player: Player) {
    const p = player.pos;
    if (Math.hypot(p.x - BELL.x, p.z - BELL.z) < 1.35 && p.y < 1.0) { this.ring(); return true; }
    const c = this.crate, dx = c.mesh.position.x - p.x, dz = c.mesh.position.z - p.z;
    if (c.t >= 1 && Math.max(Math.abs(dx), Math.abs(dz)) < 1.05 && Math.min(Math.abs(dx), Math.abs(dz)) < 0.5 && p.y < ROOM1.floor + 0.5) {
      const fx = Math.sin(player.facing), fz = Math.cos(player.facing);
      const ax = Math.abs(dx) > Math.abs(dz);
      const dir = ax ? Math.sign(dx) : Math.sign(dz);
      if ((ax ? fx : fz) * dir > 0.4) return this.tryPush(ax ? dir : 0, ax ? 0 : dir, player) || true;
    }
    return false;
  }

  private ring() {
    const first = !this.rung;
    this.bell.swing = 0.55; this.bell.t = 0;
    this.events.push({ type: 'bell', first });
    if (first) { this.rung = true; this.riseAt = this.time + 0.9; }
  }

  /** Put the garden in a saved state (on load). */
  load(s: GardenSave) {
    s.found.forEach((f, i) => { if (f) this.found[i] = true; });
    if (s.rung) {
      this.rung = true; this.door.open01 = 1; this.door.collider.setEnabled(false);
      this.stones.forEach((st) => { st.top = STONES[this.stones.indexOf(st)].top; st.at = 0; });
    }
    let placed = 0;
    this.embers.forEach((e, i) => {
      if (!this.found[i]) return;
      if (placed < s.delivered) { e.state = 'placed'; e.socket = placed; e.pos.copy(this.sockets[placed]); placed++; } else e.state = 'carried';
    });
    this.delivered = placed;
    if (s.lit) { this.lit = true; this.litT = 10; }
    this.gateEverOpen = this.gateEverOpen || s.rung || this.foundCount > 0;
    this.crateHeldGate = this.crateHeldGate || this.gateEverOpen;
  }
  save(): GardenSave { return { found: [...this.found], delivered: this.delivered, rung: this.rung, lit: this.lit }; }

  /**
   * One frame. `wish` is where the stick points in the world (length 0 to 1), for pushing the crate;
   * `carry` is where carried embers gather (just above Kettle).
   */
  update(dt: number, player: Player, wish: THREE.Vector3, free: boolean) {
    this.time += dt;
    const p = player.pos;
    const c = this.crate;

    // --- the plate: Kettle or the crate holds it down ---
    const kettleOn = player.grounded && Math.hypot(p.x - PLATE.x, p.z - PLATE.z) < 0.55 && p.y < ROOM1.floor + 0.3;
    const pressed = kettleOn || this.crateOnPlate;
    if (pressed !== this.pressed) {
      this.pressed = pressed; this.events.push({ type: 'plate', on: pressed });
      if (!pressed && this.gateEverOpen) this.steppedOffPlate = true;
    }
    this.plateDown = THREE.MathUtils.damp(this.plateDown, pressed ? 1 : 0, 14, dt);
    (this.plateMesh.getObjectByName('disc') as THREE.Mesh).position.y = 0.03 - this.plateDown * 0.03;

    // --- the gate opens while the plate is held; it never closes on Kettle ---
    const inGateway = Math.abs(p.x) < DIVIDE.gateHalf + 0.35 && Math.abs(p.z - DIVIDE.z) < 0.75;
    const g = this.gate;
    if (pressed && !g.open) {
      g.open = true; g.collider.setEnabled(false); this.gateEverOpen = true;
      if (this.crateOnPlate) this.crateHeldGate = true;
      this.events.push({ type: 'gate', open: true });
    }
    if (pressed && this.crateOnPlate) this.crateHeldGate = true;
    if (!pressed && g.open && !inGateway) {
      g.closeT += dt;
      if (g.closeT > 0.35) { g.open = false; g.closeT = 0; g.collider.setEnabled(true); this.events.push({ type: 'gate', open: false }); }
    } else g.closeT = 0;
    g.open01 = THREE.MathUtils.clamp(g.open01 + (g.open ? dt * 1.6 : -dt * 2.2), 0, 1);
    const ge = g.open01 * g.open01 * (3 - 2 * g.open01);
    g.leaves[0].rotation.y = -ge * 1.55; g.leaves[1].rotation.y = ge * 1.55;

    // --- the crate: lean on a face to slide it one stone ---
    if (c.t < 1) {
      c.t = Math.min(1, c.t + dt / 0.3);
      const e = 1 - Math.pow(1 - c.t, 3);
      c.mesh.position.lerpVectors(c.from, c.to, e);
    }
    if (free && c.t >= 1 && c.poof <= 0 && player.grounded && p.y < ROOM1.floor + 0.3 && wish.lengthSq() > 0.25) {
      const dx = c.mesh.position.x - p.x, dz = c.mesh.position.z - p.z;
      const ax = Math.abs(dx) > Math.abs(dz);
      const along = ax ? Math.abs(dx) : Math.abs(dz), side = ax ? Math.abs(dz) : Math.abs(dx);
      const dir = ax ? Math.sign(dx) : Math.sign(dz);
      const w = wish.clone().normalize();
      if (along < 0.95 && side < 0.5 && (ax ? w.x : w.z) * dir > 0.65) {
        c.pushT += dt;
        if (c.pushT > 0.2) { c.pushT = 0; this.tryPush(ax ? dir : 0, ax ? 0 : dir, player); }
      } else c.pushT = 0;
    } else c.pushT = 0;
    // a crate against the outer hedge can never come back out: after a moment it puffs home
    if (c.t >= 1 && c.poof <= 0 && this.onEdge() && Math.hypot(p.x - c.mesh.position.x, p.z - c.mesh.position.z) > 1.3) {
      c.edgeT += dt;
      const hx = CRATE_HOME.x, hz = CRATE_HOME.z;
      if (c.edgeT > 1.6 && this.freeCell(hx, hz, player)) { c.poof = 1; this.events.push({ type: 'crateHome', from: c.mesh.position.clone() }); }
    } else c.edgeT = 0;
    if (c.poof > 0) {
      c.poof -= dt * 2.2;
      c.mesh.scale.setScalar(Math.max(0.01, c.poof));
      if (c.poof <= 0) {
        c.cx = CRATE_HOME.x; c.cz = CRATE_HOME.z; c.edgeT = 0;
        c.mesh.position.copy(this.cellPos(c.cx, c.cz)); c.from.copy(c.mesh.position); c.to.copy(c.mesh.position);
        c.mesh.scale.setScalar(1);
      }
    }
    c.body.setNextKinematicTranslation(c.mesh.position);

    // --- the chimneys: hop onto one and Kettle travels as smoke to the other ---
    let onTop = -1;
    if (player.grounded && !player.floating) {
      for (let i = 0; i < 2; i++) {
        const t = this.chimneyTops[i];
        if (Math.abs(p.x - t.x) < CHIMNEY_OUT.half && Math.abs(p.z - t.z) < CHIMNEY_OUT.half && Math.abs(p.y - t.y) < 0.2) onTop = i;
      }
    }
    if (onTop < 0 && player.grounded) this.armed = true;
    if (onTop >= 0 && this.armed && free) {
      const to = this.chimneyTops[1 - onTop];
      this.armed = false; this.warpedOnce = true;
      player.warpTo(tmp.copy(to).setY(to.y + 0.02), 1.15, 3.4);
      this.events.push({ type: 'warp', from: this.chimneyTops[onTop].clone(), to: to.clone() });
    }

    // --- the bell swings; three stones rise out of the pond after the first ring, and the door opens ---
    const b = this.bell;
    b.t += dt; b.swing *= Math.exp(-dt * 0.9);
    b.pivot.rotation.x = Math.sin(b.t * 5.2) * b.swing;
    if (this.riseAt >= 0 && this.time > this.riseAt) {
      this.riseAt = -1;
      this.stones.forEach((s, i) => { s.at = this.time + i * 0.55; });
      this.door.collider.setEnabled(false);
      this.events.push({ type: 'door' });
    }
    this.stones.forEach((s, i) => {
      if (s.at < 0) return;
      const goal = STONES[i].top;
      if (s.top < goal) {
        if (this.time >= s.at && s.top <= -0.75) this.events.push({ type: 'rise' });
        if (this.time >= s.at) s.top = Math.min(goal, s.top + dt * 1.6);
      }
      s.mesh.position.y = s.top - s.h / 2;
      s.body.setNextKinematicTranslation({ x: s.mesh.position.x, y: s.mesh.position.y, z: s.mesh.position.z });
      // a little wobble as it settles
      s.mesh.rotation.z = s.top < goal ? Math.sin(this.time * 9 + i) * 0.03 : 0;
    });
    if (this.rung) this.door.open01 = Math.min(1, this.door.open01 + dt * 0.9);
    this.door.leaf.rotation.y = -(1 - Math.pow(1 - this.door.open01, 3)) * 1.6;

    // --- embers: picked up by touch, then they bob along beside Kettle ---
    let n = 0;
    for (let i = 0; i < this.embers.length; i++) {
      const e = this.embers[i];
      if (e.state === 'home') {
        e.pos.copy(e.home); e.pos.y += Math.sin(this.time * 2 + i) * 0.05;
        if (Math.hypot(p.x - e.home.x, p.z - e.home.z) < 0.7 && Math.abs(p.y + 0.4 - e.home.y) < 0.9 && !player.floating) {
          e.state = 'carried'; this.found[i] = true;
          this.events.push({ type: 'ember', count: this.foundCount, at: e.pos.clone() });
        }
      } else if (e.state === 'carried') {
        const a = this.time * 1.6 + n * (Math.PI * 2 / 3);
        tmp.set(p.x + Math.cos(a) * 0.42, p.y + 0.9 + Math.sin(this.time * 3 + n) * 0.05, p.z + Math.sin(a) * 0.42);
        e.pos.x = THREE.MathUtils.damp(e.pos.x, tmp.x, 6, dt); e.pos.y = THREE.MathUtils.damp(e.pos.y, tmp.y, 6, dt); e.pos.z = THREE.MathUtils.damp(e.pos.z, tmp.z, 6, dt);
        n++;
      } else if (e.state === 'flying' && e.t < 0) {
        e.t += dt / 0.9; // waiting its turn
      } else if (e.state === 'flying') {
        e.t = Math.min(1, e.t + dt / 0.9);
        const k = e.t * e.t * (3 - 2 * e.t);
        e.pos.lerpVectors(e.from, e.to, k); e.pos.y += Math.sin(e.t * Math.PI) * 1.0;
        if (e.t >= 1) {
          e.state = 'placed'; this.delivered++;
          this.events.push({ type: 'deliver', count: this.delivered, at: e.pos.clone() });
          if (this.delivered === 3 && !this.lit) { this.lit = true; this.litT = 0; this.events.push({ type: 'lit' }); }
        }
      } else e.pos.copy(this.sockets[e.socket]).setY(this.sockets[e.socket].y + Math.sin(this.time * 2 + i) * 0.03);
      e.obj.position.copy(e.pos);
      const f = e.obj.getObjectByName('flame')!;
      f.scale.set(1, 0.85 + Math.sin(this.time * 11 + i * 3) * 0.15, 1);
      e.glow.material.opacity = 0.7 + Math.sin(this.time * 4 + i) * 0.12;
    }
    // carried embers fly into the lantern's cups when Kettle steps onto the dais
    if (Math.hypot(p.x - DAIS.x, p.z - DAIS.z) < DAIS.r + 0.6 && p.y > DAIS.h - 0.15 && !player.floating) {
      let next = this.embers.filter((e) => e.state === 'flying' || e.state === 'placed').length;
      for (const e of this.embers) if (e.state === 'carried') {
        e.state = 'flying'; e.t = -0.4 * (next - this.delivered); e.socket = next;
        e.from.copy(e.pos); e.to.copy(this.sockets[next]); next++;
      }
    }

    // --- the spirit lantern ---
    if (this.lit) this.litT += dt;
    const glowK = this.lit ? Math.min(1, this.litT / 1.4) : this.delivered / 6;
    (this.lantern.glass.material as THREE.MeshBasicMaterial).color.lerpColors(new THREE.Color(PAL.coldGlass), new THREE.Color(PAL.emberCore), glowK);
    this.lantern.halo.material.opacity = this.lit ? glowK * (0.85 + Math.sin(this.time * 2.1) * 0.08) : this.delivered * 0.08;
    (this.lantern.inner.material as THREE.MeshBasicMaterial).opacity = glowK;
    this.lantern.light.intensity = glowK * 6;
  }
}
