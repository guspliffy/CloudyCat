import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, pmat, pmatVC } from '../world/ghibli';
import { plankTex } from '../world/textures';
import { move, initialState, snapshot, type Board, type Dir, type State, DIRS } from './rules';

// The spark yard: a 6 by 6 flagstone yard where Spark Trail's rule holds for a little living spark.
// Kettle walks around freely and baps the spark; it zips until something stops it. The yard owns the
// board, the undo stack and every piece on the stones (obstacles, embers, the ember bowl, a crate, gates
// and the bell stone), keeps solid colliders under them so Kettle can walk round and climb on them,
// animates the zip, and reports what happened as events. main.ts decides what the camera, the HUD and
// the sound do with them.

/** Where the court lies in Mill Terrace (the east lawn of the lower court, below the terrace wall). */
export const COURT = { cx: 6.05, cz: -13.7, tile: 0.9, n: 6, y: 0.16 };
export const COURT_RECT = {
  x0: COURT.cx - (COURT.n / 2) * COURT.tile - 0.25, x1: COURT.cx + (COURT.n / 2) * COURT.tile + 0.25,
  z0: COURT.cz - (COURT.n / 2) * COURT.tile - 0.25, z1: COURT.cz + (COURT.n / 2) * COURT.tile + 0.25,
};

export type CourtEvent =
  | { type: 'drift'; tiles: number }
  | { type: 'key'; index: number; count: number }
  | { type: 'switch' }
  | { type: 'push' }
  | { type: 'stop'; strength: number }
  | { type: 'bump' }
  | { type: 'ready' }
  | { type: 'won' };

interface Piece { obj: THREE.Object3D; base: THREE.Vector3; lift: number; want: number; delay: number }

const ease = (x: number) => x * x * (3 - 2 * x);
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Court {
  group = new THREE.Group();
  board: Board | null = null;
  state: State | null = null;
  undoStack: State[] = [];
  moves = 0;
  events: CourtEvent[] = [];
  /** The spark: where it sits on the stones, its velocity and facing (yaw, 0 = +Z). */
  spark = new THREE.Vector3();
  sparkVel = new THREE.Vector3();
  sparkFacing = Math.PI;
  /** where the spark looks while it waits (Kettle, when close) */
  sparkLook: THREE.Vector3 | null = null;
  drifting = false;
  /** pieces are rising or sinking: no input until they settle */
  busy = 0;
  /** counts boards raised, so the game knows when a new one stands */
  placed = 0;

  private obstacles: (Piece & { kind: number })[] = [];
  private obstacleGeos: THREE.BufferGeometry[] = [];
  private embers: (Piece & { core: THREE.Mesh; glow: THREE.Sprite; slot: THREE.Vector3; home: THREE.Vector3; fly: number; flyFrom: THREE.Vector3; taken: boolean })[] = [];
  private bowl!: { group: THREE.Group; glow: THREE.Sprite; flame: THREE.Sprite; column: THREE.Mesh; ready: number };
  private crate!: Piece & { from: THREE.Vector3; to: THREE.Vector3; slide: number };
  private gates: (Piece & { open: number })[] = [];
  private plate!: Piece & { glow: THREE.Sprite; lit: number };
  private marker!: THREE.Mesh;
  private dots: THREE.Mesh[] = [];
  private markerFor = '';
  private sparkObj!: { group: THREE.Group; body: THREE.Group; face: THREE.Group; eyes: THREE.Mesh[]; glow: THREE.Sprite; flame: THREE.Sprite; pop: number; gone: number };
  private solids: { body: RAPIER.RigidBody; piece: Piece; h: number }[] = [];
  private anim: { pts: THREE.Vector3[]; dist: number[]; frames: ReturnType<typeof move> & object; t: number; T: number; ta: number; tb: number; v: number; next: number; crateFrom: number; crateAt: number } | null = null;
  private t = 0;
  private emberMat: THREE.MeshBasicMaterial;

  constructor(glowTex: THREE.Texture, world: RAPIER.World) {
    const mat = pmatVC();
    this.obstacleGeos = [boulder(), flowerPot(), roundBale(), sacks(), barrels(), topiary()];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(this.obstacleGeos[0], mat);
      m.castShadow = true; m.receiveShadow = true; m.visible = false;
      this.group.add(m);
      this.obstacles.push({ obj: m, base: new THREE.Vector3(), lift: 0, want: 0, delay: 0, kind: 0 });
    }

    // embers: Spark Trail's keys. A warm seed with a leaf, glowing; collected ones fly into the bowl.
    this.emberMat = new THREE.MeshBasicMaterial({ color: '#FFD08A' });
    const leafMat = pmat(PAL.leafMid);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), this.emberMat); core.scale.set(1, 1.25, 1); g.add(core);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), leafMat); leaf.scale.set(1, 0.4, 1.8); leaf.position.set(0.045, 0.14, 0); leaf.rotation.z = -0.5; g.add(leaf);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#FFC46B', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.9 }));
      glow.scale.setScalar(0.95); g.add(glow);
      g.visible = false; this.group.add(g);
      this.embers.push({ obj: g, base: new THREE.Vector3(), lift: 0, want: 0, delay: 0, core, glow, slot: new THREE.Vector3(), home: new THREE.Vector3(), fly: 1, flyFrom: new THREE.Vector3(), taken: false });
    }

    // the ember bowl: Spark Trail's chest. A low ring of stones with an ash bed; it fills as embers come in
    // and lights a soft column once all three are there.
    {
      const geos: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        geos.push(vc(new THREE.IcosahedronGeometry(0.1, 1), i % 3 ? '#C9BFA9' : '#B8AE9C', [Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3], [a, a * 2, 0], [1.3, 0.75, 1]));
      }
      geos.push(vc(new THREE.CylinderGeometry(0.27, 0.29, 0.03, 20), '#8E8496', [0, 0.015, 0]));
      geos.push(vc(new THREE.CylinderGeometry(0.25, 0.25, 0.012, 20), '#5A4A58', [0, 0.035, 0]));
      const group = new THREE.Group();
      const m = new THREE.Mesh(mergeGeometries(geos)!, mat); m.castShadow = true; m.receiveShadow = true; group.add(m);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#FFB25A', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.25 }));
      glow.scale.setScalar(0.9); glow.position.y = 0.12; group.add(glow);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#FFE8B8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 }));
      flame.scale.set(0.5, 0.8, 1); flame.position.y = 0.32; group.add(flame);
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 3.2, 14, 1, true), new THREE.MeshBasicMaterial({
        map: columnTexture(), color: '#FFC98A', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, opacity: 0,
      }));
      column.position.y = 1.6; group.add(column);
      group.visible = false; this.group.add(group);
      this.bowl = { group, glow, flame, column, ready: 0 };
    }

    // the crate: pushed one stone at a time, it makes a new place to stop
    {
      const g = new THREE.Group();
      const plank = pmat(PAL.wood, { map: plankTex() }), dark = pmat(PAL.woodDark);
      const s = 0.68;
      const body = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), plank); body.position.y = s / 2; g.add(body);
      const frame = mergeGeometries([
        ...[-1, 1].flatMap((y) => [-1, 1].map((z) => { const b = new THREE.BoxGeometry(s + 0.03, 0.07, 0.07); b.translate(0, s / 2 + y * (s / 2 - 0.035), z * (s / 2 - 0.02)); return b; })),
        ...[-1, 1].flatMap((y) => [-1, 1].map((x) => { const b = new THREE.BoxGeometry(0.07, 0.07, s + 0.03); b.translate(x * (s / 2 - 0.02), s / 2 + y * (s / 2 - 0.035), 0); return b; })),
        ...[-1, 1].flatMap((x) => [-1, 1].map((z) => { const b = new THREE.BoxGeometry(0.07, s - 0.06, 0.07); b.translate(x * (s / 2 - 0.02), s / 2, z * (s / 2 - 0.02)); return b; })),
      ])!;
      const fm = new THREE.Mesh(frame, dark); g.add(fm);
      g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      g.visible = false; this.group.add(g);
      this.crate = { obj: g, base: new THREE.Vector3(), lift: 0, want: 0, delay: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), slide: 1 };
    }

    // gates: a little picket pen that sinks into the stones once the bell stone is crossed
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(picketPen(), mat); m.castShadow = true; m.visible = false; this.group.add(m);
      this.gates.push({ obj: m, base: new THREE.Vector3(), lift: 0, want: 0, delay: 0, open: 0 });
    }
    // the bell stone: Spark Trail's diamond switch, a brass plate with a diamond, set in the flagstone
    {
      const g = new THREE.Group();
      const plate = new THREE.Mesh(mergeGeometries([
        vc(new THREE.CylinderGeometry(0.31, 0.33, 0.035, 24), '#9C7F4E', [0, 0.017, 0]),
        vc(new THREE.CylinderGeometry(0.27, 0.27, 0.012, 24), '#D9B467', [0, 0.04, 0]),
        vc(new THREE.BoxGeometry(0.2, 0.02, 0.2), '#F3DDA0', [0, 0.05, 0], [0, Math.PI / 4, 0]),
      ])!, mat);
      plate.receiveShadow = true; g.add(plate);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#FFF0C8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 }));
      glow.scale.setScalar(0.8); glow.position.y = 0.12; g.add(glow);
      g.visible = false; this.group.add(g);
      this.plate = { obj: g, base: new THREE.Vector3(), lift: 0, want: 0, delay: 0, glow, lit: 0 };
    }
    // aim hint: a soft ring where the spark would stop if bapped now, and small dots along the way
    this.marker = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, opacity: 0, fog: false }));
    this.marker.rotation.x = -Math.PI / 2; this.marker.renderOrder = 2; this.marker.visible = false; this.group.add(this.marker);
    const dotGeo = new THREE.CircleGeometry(0.05, 12);
    for (let i = 0; i < 8; i++) {
      const d = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: '#FFF6E0', transparent: true, depthWrite: false, opacity: 0, fog: false }));
      d.rotation.x = -Math.PI / 2; d.renderOrder = 2; d.visible = false; this.group.add(d); this.dots.push(d);
    }

    // the spark: a small bright ember with big dark eyes and a flame that leans as it zips
    {
      const group = new THREE.Group(), body = new THREE.Group(), face = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), new THREE.MeshBasicMaterial({ color: '#FFF1C9' }));
      body.add(core);
      const eyeMat = new THREE.MeshBasicMaterial({ color: '#3B2B3F' }), shine = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
      const eyes: THREE.Mesh[] = [];
      for (const x of [-0.055, 0.055]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), eyeMat); e.scale.set(0.85, 1.15, 0.5); e.position.set(x, 0.02, 0.138);
        const h = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 4), shine); h.position.set(0.01, 0.014, 0.012); e.add(h);
        face.add(e); eyes.push(e);
      }
      const blush = new THREE.MeshBasicMaterial({ color: '#FFB08A', transparent: true, opacity: 0.8 });
      for (const x of [-0.095, 0.095]) { const b = new THREE.Mesh(new THREE.CircleGeometry(0.022, 10), blush); b.position.set(x, -0.03, 0.128); b.rotation.y = x * 4; face.add(b); }
      body.add(face);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#FFC46B', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.9 }));
      glow.scale.setScalar(1.05);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#FFE2A8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.85 }));
      flame.scale.set(0.3, 0.5, 1); flame.position.y = 0.2;
      group.add(body, glow, flame); group.visible = false; this.group.add(group);
      this.sparkObj = { group, body, face, eyes, glow, flame, pop: 0, gone: 0 };
    }

    // solid pieces: Kettle walks round them and can climb on top (a kinematic box under each one)
    const solid = (piece: Piece, hx: number, h: number, hz: number) => {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -20, 0));
      world.createCollider(RAPIER.ColliderDesc.cuboid(hx, h / 2, hz).setFriction(0.8), body);
      this.solids.push({ body, piece, h });
    };
    for (const o of this.obstacles) solid(o, 0.36, 0.62, 0.36);
    solid(this.crate, 0.34, 0.68, 0.34);
    for (const g of this.gates) solid(g, 0.42, 0.55, 0.42);
  }

  /** Height of each obstacle kind's top, so Kettle stands on the leaves, not in the air above them. */
  private static TOPS = [0.6, 0.78, 0.6, 0.62, 0.66, 0.74];

  cellPos(r: number, c: number, out = new THREE.Vector3()) {
    return out.set(COURT.cx + (c - (COURT.n - 1) / 2) * COURT.tile, COURT.y, COURT.cz + (r - (COURT.n - 1) / 2) * COURT.tile);
  }
  cellOf(i: number, out = new THREE.Vector3()) { return this.cellPos(Math.floor(i / COURT.n), i % COURT.n, out); }
  contains(p: THREE.Vector3, margin = 0) {
    return p.x > COURT_RECT.x0 - margin && p.x < COURT_RECT.x1 + margin && p.z > COURT_RECT.z0 - margin && p.z < COURT_RECT.z1 + margin;
  }
  /** Where the pieces stand, for coach lines and the camera. */
  get crateAt() { return this.crate.obj.visible ? this.crate.obj.position : null; }
  get plateAt() { return this.plate.obj.visible ? this.plate.obj.position : null; }
  get bowlAt() { return this.bowl.group.position; }
  get hasCrate() { return !!this.board && this.state!.crate >= 0; }
  get hasGate() { return !!this.board?.gates?.length; }
  get startPos() { return this.cellPos(this.board!.start[0], this.board!.start[1]); }
  get sparkCell() { return this.state ? this.cellPos(this.state.pos[0], this.state.pos[1]) : this.startPos; }
  /** The cells obstacles, the crate and closed gates stand on, to lift Kettle out of a rising piece. */
  solidTops(out: { p: THREE.Vector3; top: number }[]) {
    out.length = 0;
    for (const s of this.solids) if (s.piece.want > 0) out.push({ p: s.piece.base, top: COURT.y + s.h });
    return out;
  }

  /** Raise a board. Old pieces sink first; new ones rise in a ripple from the start stone. */
  load(board: Board, state: State | null = null, instant = false) {
    const hadBoard = !!this.board;
    this.board = board;
    this.state = state ? snapshot(state) : initialState(board);
    this.undoStack = []; this.moves = 0; this.anim = null; this.drifting = false; this.markerFor = '';
    this.sparkObj.gone = 0;
    for (const p of this.allPieces()) p.want = 0;
    const raise = () => this.place(instant);
    if (hadBoard && !instant) { this.busy = 0.55; setTimeout(raise, 520); }
    else raise();
  }

  private allPieces(): Piece[] { return [...this.obstacles, ...this.embers, this.crate, ...this.gates, this.plate]; }

  private place(instant: boolean) {
    const b = this.board!, s = this.state!;
    const start = this.cellPos(b.start[0], b.start[1]);
    const delayFor = (p: THREE.Vector3) => (instant ? 0 : 0.05 + p.distanceTo(start) * 0.07);
    // obstacles: a kind per cell that looks varied but stays the same for a board
    this.obstacles.forEach((o, i) => {
      const cell = b.walls[i];
      if (cell === undefined) { o.obj.visible = false; o.want = 0; o.lift = 0; return; }
      const kind = hashCell(cell, b.variantId.length + b.par) % this.obstacleGeos.length;
      (o.obj as THREE.Mesh).geometry = this.obstacleGeos[kind]; o.kind = kind;
      this.cellOf(cell, o.base); o.obj.rotation.y = (hashCell(cell, 3) % 8) * 0.785;
      o.obj.visible = true; o.want = 1; o.delay = delayFor(o.base); if (instant) o.lift = 1;
    });
    this.embers.forEach((e, i) => {
      this.cellOf(b.keys[i], e.home); e.base.copy(e.home); e.obj.visible = true; e.want = 1; e.delay = delayFor(e.home) + 0.15; if (instant) e.lift = 1;
      e.taken = false; e.fly = 1;
    });
    this.cellOf(b.exit, this.bowl.group.position); this.bowl.group.visible = true;
    this.embers.forEach((e, i) => { const a = (i / 3) * Math.PI * 2 + 0.5; e.slot.set(this.bowl.group.position.x + Math.cos(a) * 0.13, COURT.y + 0.16, this.bowl.group.position.z + Math.sin(a) * 0.13); });
    if (s.crate >= 0) { this.cellOf(s.crate, this.crate.base); this.crate.obj.visible = true; this.crate.want = 1; this.crate.delay = delayFor(this.crate.base); this.crate.slide = 1; if (instant) this.crate.lift = 1; }
    else { this.crate.obj.visible = false; this.crate.want = 0; }
    this.gates.forEach((g, i) => {
      const cell = b.gates?.[i];
      if (cell === undefined) { g.obj.visible = false; g.want = 0; return; }
      this.cellOf(cell, g.base); g.obj.visible = true; g.want = 1; g.open = s.opened ? 1 : 0; g.delay = delayFor(g.base); if (instant) g.lift = 1;
    });
    if (b.switch !== undefined) { this.cellOf(b.switch, this.plate.base); this.plate.obj.visible = true; this.plate.want = 1; this.plate.delay = delayFor(this.plate.base); this.plate.lit = s.opened ? 1 : 0; if (instant) this.plate.lift = 1; }
    else { this.plate.obj.visible = false; this.plate.want = 0; }
    this.applyMask(true);
    this.busy = instant ? 0 : 1.1;
    this.placed++;
    this.spark.copy(this.sparkCell);
    this.sparkObj.pop = instant ? 1 : -0.6; this.sparkObj.group.visible = true;
    this.obstacles.forEach((o) => { const sd = this.solids.find((x) => x.piece === o)!; sd.h = Court.TOPS[o.kind]; });
  }

  /** Embers already collected sit in the bowl. */
  private applyMask(snap: boolean) {
    const s = this.state!;
    this.embers.forEach((e, i) => {
      const taken = !!(s.mask & (1 << i));
      if (taken !== e.taken) { e.taken = taken; e.fly = snap ? 1 : 0; e.flyFrom.copy(e.obj.position); }
    });
  }

  /** Start a drift. Returns false when nothing happens (blocked, busy or already moving). */
  drift(dir: Dir) {
    if (!this.board || !this.state || this.drifting || this.busy > 0) return false;
    const m = move(this.board, this.state, dir);
    if (!m) { this.events.push({ type: 'bump' }); this.nudge(dir); return false; }
    this.undoStack.push(snapshot(this.state));
    this.moves++;
    // the drift follows the frames as a polyline (currents can turn it); a passage is a jump with no length
    const pts = [this.sparkCell.clone()], dist = [0];
    for (const f of m.frames) {
      const p = this.cellPos(f.pos[0], f.pos[1]);
      dist.push(dist[dist.length - 1] + (f.teleport ? 0 : p.distanceTo(pts[pts.length - 1])));
      pts.push(p);
    }
    const L = dist[dist.length - 1];
    const ta = 0.07, tb = 0.12;
    const T = Math.max(0.24, L / 5.0 + (ta + tb) / 2);
    const v = L / (T - ta / 2 - tb / 2);
    this.anim = { pts, dist, frames: m, t: 0, T, ta, tb, v, next: 0, crateFrom: this.state.crate, crateAt: m.pushed ? m.crate : -1 };
    if (m.pushed) { this.cellOf(this.state.crate, this.crate.from); this.cellOf(m.crate, this.crate.to); this.crate.slide = 0; }
    this.drifting = true;
    this.events.push({ type: 'drift', tiles: m.path.length });
    this.markerFor = '';
    return true;
  }

  private nudgeT = 1; private nudgeDir = new THREE.Vector3();
  private nudge(dir: Dir) { this.nudgeT = 0; this.nudgeDir.set(DIRS[dir][1], 0, DIRS[dir][0]); }

  undo() {
    if (this.drifting || this.busy > 0 || !this.undoStack.length) return false;
    this.state = this.undoStack.pop()!; this.moves = Math.max(0, this.moves - 1);
    this.snapPieces();
    return true;
  }
  restart() {
    if (this.drifting || this.busy > 0 || !this.board) return false;
    this.state = initialState(this.board); this.undoStack = []; this.moves = 0;
    this.snapPieces();
    return true;
  }
  private snapPieces() {
    const s = this.state!;
    this.spark.copy(this.sparkCell); this.sparkVel.set(0, 0, 0); this.sparkObj.gone = 0;
    if (s.crate >= 0) { this.cellOf(s.crate, this.crate.base); this.crate.slide = 1; }
    this.gates.forEach((g) => (g.open = s.opened ? 1 : 0));
    this.plate.lit = s.opened ? 1 : 0;
    this.applyMask(true);
    this.markerFor = '';
  }

  /** The three embers rise out of the bowl and fly to `target`; `done` runs when they arrive. */
  release(target: THREE.Vector3, done: () => void) {
    this.releaseT = 0; this.releaseTo.copy(target); this.releaseDone = done;
    this.embers.forEach((e) => e.flyFrom.copy(e.obj.position));
  }
  private releaseT = -1; private releaseTo = new THREE.Vector3(); private releaseDone: (() => void) | null = null;

  /** Sink everything (the court rests between visits once all rounds are done). */
  rest() { for (const p of this.allPieces()) p.want = 0; this.bowl.group.visible = false; this.board = null; this.state = null; this.markerFor = ''; this.sparkObj.gone = Math.max(this.sparkObj.gone, 0.01); }

  /** The spark sinks into the bowl's flame once it has won. */
  settle() { this.sparkObj.gone = 0.01; }

  update(dt: number, preview: Dir | null) {
    this.t += dt;
    this.events.length = 0;
    if (this.busy > 0) this.busy = Math.max(0, this.busy - dt);

    // rising and sinking pieces
    for (const p of this.allPieces()) {
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.lift = THREE.MathUtils.clamp(p.lift + (p.want > p.lift ? dt * 2.2 : -dt * 2.6), 0, 1);
      if (p.lift === 0 && p.want === 0) p.obj.visible = false;
    }
    for (const o of this.obstacles) if (o.obj.visible) {
      const k = ease(o.lift);
      o.obj.position.set(o.base.x, o.base.y - (1 - k) * 0.95 + Math.sin(Math.min(1, o.lift) * Math.PI) * 0.06, o.base.z);
      o.obj.scale.set(0.85 + 0.15 * k, 0.7 + 0.3 * k, 0.85 + 0.15 * k);
    }
    for (const g of this.gates) if (g.obj.visible) {
      g.open = Math.min(1, g.open + (this.state?.opened && g.open < 1 && this.gateOpening ? dt * 1.6 : 0));
      const k = ease(g.lift) * (1 - ease(g.open));
      g.obj.position.set(g.base.x, g.base.y - (1 - k) * 0.75, g.base.z);
    }
    if (this.plate.obj.visible) {
      this.plate.obj.position.set(this.plate.base.x, this.plate.base.y - (1 - ease(this.plate.lift)) * 0.1, this.plate.base.z);
      this.plate.glow.material.opacity = this.plate.lit * (0.55 + Math.sin(this.t * 2.4) * 0.12) * this.plate.lift;
    }

    this.updateDrift(dt);

    // the crate rises like the rest, and slides when pushed
    if (this.crate.obj.visible) {
      const k = ease(this.crate.lift);
      const pos = this.crate.slide < 1 ? _v.lerpVectors(this.crate.from, this.crate.to, ease(this.crate.slide)) : this.crate.base;
      this.crate.obj.position.set(pos.x, pos.y - (1 - k) * 0.95, pos.z);
    }

    // embers: bob on their stone, fly to the bowl when taken, fly to the spirit when released
    let inBowl = 0;
    this.embers.forEach((e, i) => {
      if (!e.obj.visible) return;
      const s = 0.25 + 0.75 * ease(e.lift);
      if (this.releaseT >= 0) {
        const k = Math.min(1, this.releaseT / 1.3), kk = ease(k);
        e.obj.position.lerpVectors(e.flyFrom, this.releaseTo, kk); e.obj.position.y += Math.sin(k * Math.PI) * (1.6 + i * 0.3);
        e.obj.scale.setScalar(1 - k * 0.5);
        return;
      }
      if (e.taken) {
        inBowl++;
        e.fly = Math.min(1, e.fly + dt * 2.2);
        const k = ease(e.fly);
        e.obj.position.lerpVectors(e.flyFrom, e.slot, k); e.obj.position.y += Math.sin(e.fly * Math.PI) * 0.9;
        e.obj.scale.setScalar(s * (1 - 0.35 * k));
        e.glow.material.opacity = 0.6;
      } else {
        e.obj.position.set(e.home.x, e.home.y + 0.38 + Math.sin(this.t * 2 + i) * 0.05, e.home.z);
        e.obj.scale.setScalar(s);
        e.glow.material.opacity = 0.85 + Math.sin(this.t * 3 + i) * 0.1;
      }
      e.obj.visible = e.lift > 0.01 || e.want > 0;
    });
    if (this.releaseT >= 0) {
      this.releaseT += dt;
      if (this.releaseT > 1.3) { this.releaseT = -1; this.embers.forEach((e) => { e.obj.visible = false; e.want = 0; e.lift = 0; }); const d = this.releaseDone; this.releaseDone = null; d?.(); }
    }

    // the bowl warms with each ember; when all three are in, a soft column says "come here now"
    if (this.bowl.group.visible) {
      const ready = this.state ? (this.state.mask === 7 ? 1 : 0) : 0;
      if (ready && this.bowl.ready < 0.01 && !this.drifting) this.events.push({ type: 'ready' });
      this.bowl.ready = THREE.MathUtils.damp(this.bowl.ready, ready, 4, dt);
      this.bowl.glow.material.opacity = 0.18 + inBowl * 0.16 + this.bowl.ready * 0.25 + Math.sin(this.t * 3) * 0.04;
      this.bowl.flame.material.opacity = this.bowl.ready * (0.75 + Math.sin(this.t * 9) * 0.1);
      // a faint column even before the embers are in, so the bowl is easy to find behind a crate or a pen
      (this.bowl.column.material as THREE.MeshBasicMaterial).opacity = 0.09 + this.bowl.ready * 0.26;
      this.bowl.group.position.y = COURT.y;
      if (!this.board && this.bowl.ready < 0.01) this.bowl.group.visible = false;
    }

    this.updateSpark(dt);
    this.updateSolids();
    this.updateMarkers(dt, !this.drifting && this.busy === 0 && this.sparkObj.gone === 0 ? preview : null);
  }

  private updateSpark(dt: number) {
    const o = this.sparkObj;
    if (!o.group.visible) return;
    o.pop = Math.min(1, o.pop + dt * 2.4);
    if (o.gone > 0) o.gone = Math.min(1, o.gone + dt * 1.6);
    const k = Math.max(0, o.pop), pop = k < 1 ? 1 + Math.sin(k * Math.PI) * 0.25 : 1;
    const size = 1.15 * ease(k) * pop * (1 - ease(o.gone));
    const sp = this.sparkVel.length();
    // a happy little hop while it waits; long and low while it zips
    const hop = this.drifting ? 0 : Math.abs(Math.sin(this.t * 3.2)) * 0.06;
    o.group.position.set(this.spark.x, this.spark.y + 0.28 + hop - o.gone * 0.2, this.spark.z);
    const stretch = Math.min(0.45, sp * 0.07);
    o.body.scale.set(size * (1 - stretch * 0.4), size * (1 - stretch * 0.25 + (hop > 0.05 ? 0.04 : 0)), size * (1 + stretch));
    o.glow.scale.setScalar(1.05 * size + Math.sin(this.t * 7) * 0.03);
    o.glow.material.opacity = 0.85 * size;
    o.flame.scale.set(0.3 * size, (0.5 + Math.sin(this.t * 11) * 0.06) * size, 1);
    o.flame.position.set(-this.sparkVel.x * 0.025, 0.2 * size, -this.sparkVel.z * 0.025);
    o.flame.material.opacity = 0.85 * size;
    // face: along the zip, or toward Kettle while it waits
    let yaw = this.sparkFacing;
    if (!this.drifting && this.sparkLook) yaw = Math.atan2(this.sparkLook.x - this.spark.x, this.sparkLook.z - this.spark.z);
    let d = yaw - o.body.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    o.body.rotation.y += d * Math.min(1, dt * 10);
    // a blink now and then
    const blink = (this.t % 3.7) < 0.12 ? 0.15 : 1;
    for (const e of o.eyes) e.scale.y = 1.15 * blink;
    if (o.gone >= 1) o.group.visible = false;
  }

  /** Each solid follows its piece; a sunk or hidden piece puts its box far below the ground. */
  private updateSolids() {
    for (const s of this.solids) {
      const o = s.piece.obj;
      const up = o.visible && s.piece.lift > 0.5 && !(this.gates.includes(s.piece as Piece & { open: number }) && (s.piece as Piece & { open: number }).open > 0.5);
      const y = up ? o.position.y + s.h / 2 : -20;
      s.body.setNextKinematicTranslation({ x: o.position.x, y, z: o.position.z });
    }
  }

  private gateOpening = false;

  private updateDrift(dt: number) {
    const a = this.anim;
    if (!a) {
      // a blocked push: a small lean toward the way, then back
      if (this.nudgeT < 1) {
        this.nudgeT = Math.min(1, this.nudgeT + dt * 5);
        this.spark.copy(this.sparkCell).addScaledVector(this.nudgeDir, Math.sin(this.nudgeT * Math.PI) * 0.08);
        this.sparkFacing = Math.atan2(this.nudgeDir.x, this.nudgeDir.z);
      }
      this.sparkVel.set(0, 0, 0);
      return;
    }
    a.t = Math.min(a.T, a.t + dt);
    // trapezoid speed: a quick push off, an even glide, a soft stop
    const t = a.t, { ta, tb, T, v } = a;
    let s: number;
    if (t < ta) s = 0.5 * (v / ta) * t * t;
    else if (t < T - tb) s = 0.5 * v * ta + v * (t - ta);
    else { const r = T - t; s = a.dist[a.dist.length - 1] - 0.5 * (v / tb) * r * r; }
    const L = a.dist[a.dist.length - 1];
    s = Math.min(L, s);
    let seg = 1;
    while (seg < a.dist.length - 1 && a.dist[seg] < s) seg++;
    const s0 = a.dist[seg - 1], s1 = a.dist[seg];
    const k = s1 > s0 ? (s - s0) / (s1 - s0) : 1;
    const prev = _w.copy(this.spark);
    this.spark.lerpVectors(a.pts[seg - 1], a.pts[seg], k);
    this.sparkVel.copy(this.spark).sub(prev).divideScalar(Math.max(dt, 1e-4));
    const d = _v.subVectors(a.pts[seg], a.pts[seg - 1]);
    if (d.lengthSq() > 1e-4) this.sparkFacing = Math.atan2(d.x, d.z);

    // what the spark passes on the way: embers and the bell stone count once it is over their stone
    while (a.next < a.frames.frames.length && s >= a.dist[a.next + 1] - COURT.tile * 0.35) {
      const f = a.frames.frames[a.next];
      const before = this.state!;
      const gained = f.mask & ~before.mask;
      this.state = { pos: [f.pos[0], f.pos[1]], mask: f.mask, opened: f.opened, crate: f.crate, raised: f.raised };
      for (let i = 0; i < 3; i++) if (gained & (1 << i)) {
        const e = this.embers[i]; e.taken = true; e.fly = 0; e.flyFrom.copy(e.obj.position);
        this.events.push({ type: 'key', index: i, count: popcount(f.mask) });
      }
      if (f.opened && !before.opened) { this.plate.lit = 1; this.gateOpening = true; this.events.push({ type: 'switch' }); }
      a.next++;
    }
    // a pushed crate moves on contact and arrives with the spark
    if (a.crateAt >= 0) {
      const lastStart = a.dist[a.dist.length - 2];
      this.crate.slide = THREE.MathUtils.clamp((s - lastStart - 0.25) / (COURT.tile - 0.25), 0, 1);
      if (this.crate.slide > 0 && !this.pushed) { this.pushed = true; this.events.push({ type: 'push' }); }
    }
    if (a.t >= T) {
      if (a.crateAt >= 0) { this.cellOf(a.crateAt, this.crate.base); this.crate.slide = 1; }
      const m = a.frames;
      this.state = { pos: [m.pos[0], m.pos[1]], mask: m.mask, opened: m.opened, crate: m.crate, raised: m.raised };
      this.anim = null; this.drifting = false; this.pushed = false;
      this.spark.copy(this.sparkCell); this.sparkVel.set(0, 0, 0);
      this.events.push({ type: 'stop', strength: Math.min(1, L / 4) });
      if (m.won) this.events.push({ type: 'won' });
    }
  }
  private pushed = false;

  private updateMarkers(dt: number, dir: Dir | null) {
    const key = dir && this.state ? `${dir},${this.state.pos},${this.state.mask},${this.state.crate},${this.state.opened}` : '';
    if (key !== this.markerFor) {
      this.markerFor = key;
      const mv = key ? move(this.board!, this.state!, dir!) : null;
      this.marker.userData.want = mv ? 1 : 0;
      if (mv) { this.cellPos(mv.pos[0], mv.pos[1], this.marker.position); this.marker.position.y += 0.012; this.marker.visible = true; }
      // dots on the stones the spark crosses before it stops
      const path = mv ? mv.frames.slice(0, -1).filter((f) => !f.teleport) : [];
      this.dots.forEach((d, i) => {
        const f = path[i];
        d.userData.want = f ? 1 : 0;
        if (f) { this.cellPos(f.pos[0], f.pos[1], d.position); d.position.y += 0.014; d.visible = true; }
      });
    }
    const pulse = 0.42 + Math.sin(this.t * 2.2) * 0.06;
    for (const m of [this.marker, ...this.dots]) {
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.damp(mat.opacity, (m.userData.want ?? 0) * (m === this.marker ? pulse : 0.5), 10, dt);
      if (mat.opacity < 0.01 && !m.userData.want) m.visible = false;
    }
  }
}

function popcount(n: number) { let c = 0; while (n) { c += n & 1; n >>= 1; } return c; }
function hashCell(cell: number, salt: number) { const h = Math.sin(cell * 91.7 + salt * 17.3) * 43758.5453; return Math.floor((h - Math.floor(h)) * 1000); }

/** A primitive with its transform baked in and one vertex colour, lightly varied so it reads painted. */
function vc(g: THREE.BufferGeometry, color: string, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale)));
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, col = new Float32Array(n * 3);
  const p = geo.getAttribute('position');
  for (let i = 0; i < n; i++) {
    const v = 0.94 + 0.06 * Math.sin(p.getX(i) * 13.1 + p.getY(i) * 7.7 + p.getZ(i) * 11.3);
    col[i * 3] = c.r * v; col[i * 3 + 1] = c.g * v; col[i * 3 + 2] = c.b * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!geo.getAttribute('uv')) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) geo.deleteAttribute(name);
  return geo;
}
const merge = (list: THREE.BufferGeometry[]) => mergeGeometries(list)!;

// Obstacles: the walls of a Spark Trail board, dressed as things you find in a mill yard.
// Each stands inside a 0.78 m square so the grid always reads, 0.55 to 0.85 m tall.
function boulder() {
  return merge([
    vc(new THREE.IcosahedronGeometry(0.34, 2), '#CFC5AF', [0, 0.27, 0], [0.3, 0.5, 0.2], [1.05, 0.82, 0.95]),
    vc(new THREE.IcosahedronGeometry(0.2, 1), '#BDB39F', [0.22, 0.15, 0.16], [0.9, 0, 0.4], [1, 0.8, 1]),
    vc(new THREE.IcosahedronGeometry(0.22, 1), PAL.moss, [-0.04, 0.52, -0.02], [0, 0, 0], [1.25, 0.32, 1.1]),
    vc(new THREE.IcosahedronGeometry(0.09, 1), PAL.lichen, [0.2, 0.42, 0.14], [0, 0, 0], [1, 0.4, 1]),
  ]);
}
function flowerPot() {
  const parts = [
    vc(new THREE.CylinderGeometry(0.3, 0.24, 0.42, 18), PAL.clay, [0, 0.21, 0]),
    vc(new THREE.TorusGeometry(0.29, 0.045, 8, 20), '#B47A59', [0, 0.42, 0], [Math.PI / 2, 0, 0]),
    vc(new THREE.TorusGeometry(0.27, 0.018, 6, 20), '#E8D3B0', [0, 0.12, 0], [Math.PI / 2, 0, 0]),
    vc(new THREE.IcosahedronGeometry(0.3, 2), PAL.leafMid, [0, 0.62, 0], [0, 0, 0], [1.05, 0.78, 1.05]),
    vc(new THREE.IcosahedronGeometry(0.17, 1), PAL.leaf, [0.12, 0.76, -0.06]),
  ];
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4, h = 0.6 + (i % 3) * 0.07;
    parts.push(vc(new THREE.IcosahedronGeometry(0.045, 0), i % 2 ? PAL.hollyhock : PAL.daisy, [Math.cos(a) * 0.27, h, Math.sin(a) * 0.27]));
  }
  return merge(parts);
}
function roundBale() {
  return merge([
    vc(new THREE.CylinderGeometry(0.3, 0.3, 0.68, 20), '#E2C27A', [0, 0.3, 0], [0, 0, Math.PI / 2]),
    vc(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 16), '#D3B066', [0, 0.3, 0], [0, 0, Math.PI / 2]),
    vc(new THREE.TorusGeometry(0.305, 0.016, 6, 22), '#8A6A48', [-0.16, 0.3, 0], [0, Math.PI / 2, 0]),
    vc(new THREE.TorusGeometry(0.305, 0.016, 6, 22), '#8A6A48', [0.16, 0.3, 0], [0, Math.PI / 2, 0]),
  ]);
}
function sacks() {
  return merge([
    vc(new THREE.SphereGeometry(0.22, 14, 10), '#DCC7A2', [-0.14, 0.17, 0.08], [0, 0.4, 0], [1, 0.78, 1.25]),
    vc(new THREE.SphereGeometry(0.22, 14, 10), '#D2BC95', [0.15, 0.17, -0.08], [0, -0.3, 0], [1, 0.78, 1.25]),
    vc(new THREE.SphereGeometry(0.21, 14, 10), '#E4D2B0', [0.0, 0.45, 0.0], [0, 1.2, 0], [1, 0.8, 1.25]),
    vc(new THREE.SphereGeometry(0.05, 8, 6), '#8A6A48', [0.0, 0.6, 0.22], [0, 0, 0], [1.2, 0.8, 1]),
  ]);
}
function barrels() {
  return merge([
    vc(new THREE.CylinderGeometry(0.24, 0.24, 0.64, 18), PAL.wood, [-0.06, 0.32, 0.04]),
    vc(new THREE.TorusGeometry(0.245, 0.02, 6, 20), '#5C5468', [-0.06, 0.12, 0.04], [Math.PI / 2, 0, 0]),
    vc(new THREE.TorusGeometry(0.245, 0.02, 6, 20), '#5C5468', [-0.06, 0.52, 0.04], [Math.PI / 2, 0, 0]),
    vc(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 18), PAL.woodDark, [-0.06, 0.645, 0.04]),
    vc(new THREE.CylinderGeometry(0.15, 0.15, 0.36, 14), '#B8946E', [0.24, 0.18, -0.16]),
    vc(new THREE.TorusGeometry(0.152, 0.015, 6, 16), '#5C5468', [0.24, 0.3, -0.16], [Math.PI / 2, 0, 0]),
  ]);
}
function topiary() {
  return merge([
    vc(new THREE.BoxGeometry(0.5, 0.12, 0.5), '#C9BFA9', [0, 0.06, 0]),
    vc(new THREE.IcosahedronGeometry(0.33, 2), PAL.leafMid, [0, 0.42, 0], [0, 0, 0], [1, 0.95, 1]),
    vc(new THREE.IcosahedronGeometry(0.22, 1), PAL.leaf, [-0.08, 0.62, 0.08], [0, 0, 0], [1, 0.9, 1]),
    vc(new THREE.IcosahedronGeometry(0.14, 1), PAL.leaf, [0.15, 0.55, -0.12]),
  ]);
}
/** A low picket pen around one stone: a gate that sinks once the bell stone is crossed. */
function picketPen() {
  const parts: THREE.BufferGeometry[] = [];
  const h = 0.5, e = 0.38;
  for (const [sx, sz, rot] of [[0, -1, 0], [0, 1, 0], [-1, 0, Math.PI / 2], [1, 0, Math.PI / 2]] as const) {
    for (let i = -2; i <= 2; i++) {
      const x = sx * e + (sz ? i * 0.17 : 0), z = sz * e + (sx ? i * 0.17 : 0);
      parts.push(vc(new THREE.BoxGeometry(0.07, h, 0.05), i % 2 ? PAL.wood : '#B8946E', [x, h / 2, z], [0, rot, 0]));
      parts.push(vc(new THREE.ConeGeometry(0.05, 0.08, 4), PAL.wood, [x, h + 0.04, z], [0, rot + Math.PI / 4, 0]));
    }
    for (const y of [0.16, 0.38]) parts.push(vc(new THREE.BoxGeometry(e * 2 + 0.06, 0.05, 0.04), PAL.woodDark, [sx * e, y, sz * e], [0, rot, 0]));
  }
  return merge(parts);
}

function ringTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(255,250,236,1)'; g.lineWidth = 9;
  g.beginPath(); g.arc(64, 64, 46, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(255,250,236,0.35)'; g.beginPath(); g.arc(64, 64, 14, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function columnTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128;
  const g = c.getContext('2d')!; const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.4)'); gr.addColorStop(0.95, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
