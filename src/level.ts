import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// Mill Terrace, greybox. Start in the south garden facing north (-Z).
// South garden: low wall with a pot, a barrel stack. Hedge with a sunlit gate (Thin through it).
// North court: sleeping spirit, a shed with a seed on the roof, the river and the stopped waterwheel to the east.

export type Surface = 'grass' | 'stone' | 'wood';

export const COLORS = {
  grass: '#8FB573', grassDeep: '#7AA363', hedge: '#5C8A72', stone: '#BDB2A0', wood: '#A5815C', woodDark: '#7E6045',
  cream: '#F2E3C6', roof: '#D77A61', water: '#7FA8C9', clay: '#C98B6B', moss: '#7FA05A', bark: '#7A5E48', leaf: '#6E9A5E',
};

export interface Pot { body: RAPIER.RigidBody; mesh: THREE.Mesh; seed: number | null; spawn: THREE.Vector3; prevV: THREE.Vector3; broken: boolean }

export class Level {
  group = new THREE.Group();
  surfaces = new Map<number, Surface>(); // collider handle -> surface
  gateHandle = -1;
  camBlock = new Set<number>(); // colliders the camera pulls in front of
  pots: Pot[] = [];
  crates: { body: RAPIER.RigidBody; mesh: THREE.Mesh }[] = [];
  seeds: THREE.Vector3[] = [];
  spirit = new THREE.Vector3(2, 0.3, -18);
  wheel!: THREE.Group;
  lanterns: THREE.Mesh[] = [];
  keepsake = new THREE.Vector3(8.9, 3.35, -9.4);
  fireflies: THREE.Vector3[] = [];
  anchors = {
    start: new THREE.Vector3(0, 0, 1.2),
    wall: new THREE.Vector3(0, 1.5, -4),
    pot: new THREE.Vector3(1.6, 1.8, -4),
    gate: new THREE.Vector3(0, 2.2, -9.4),
    barrel: new THREE.Vector3(6, 3.0, -7.5),
  };
  spiritMesh!: THREE.Group;
  spiritGlow!: THREE.Mesh;
  spiritEyes: THREE.Mesh[] = [];
  sunShafts: THREE.Mesh[] = [];
  waterX = 9.2;

  private mats = new Map<string, THREE.Material>();
  constructor(private world: RAPIER.World) {}

  private mat(color: string) {
    let m = this.mats.get(color);
    if (!m) { m = new THREE.MeshLambertMaterial({ color }); this.mats.set(color, m); }
    return m;
  }

  /** Static box with collider. Centre position, full sizes. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: string, surface: Surface, rotY = 0, visible = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color));
    mesh.position.set(x, y, z); mesh.rotation.y = rotY;
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.visible = visible;
    this.group.add(mesh);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0));
    const col = this.world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y, z).setRotation(q));
    this.surfaces.set(col.handle, surface);
    return { mesh, col };
  }
  cylinder(x: number, y: number, z: number, r: number, h: number, color: string, surface: Surface, seg = 20) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), this.mat(color));
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    this.group.add(mesh);
    const col = this.world.createCollider(RAPIER.ColliderDesc.cylinder(h / 2, r).setTranslation(x, y, z));
    this.surfaces.set(col.handle, surface);
    return { mesh, col };
  }
  private deco(mesh: THREE.Mesh, x: number, y: number, z: number) {
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; this.group.add(mesh); return mesh;
  }

  build() {
    const C = COLORS;
    // ground: garden and court share one meadow; far bank across the river
    const ground = this.box(0, -0.5, -9, 18, 1, 32, C.grass, 'grass');
    ground.mesh.castShadow = false;
    this.box(18.5, -0.5, -12, 11, 1, 40, C.grassDeep, 'grass').mesh.castShadow = false;
    // river: bed below the water line, water surface visual only
    this.box(11, -1.6, -12, 4, 1, 40, C.stone, 'stone').mesh.castShadow = false;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(4, 40), new THREE.MeshLambertMaterial({ color: C.water, transparent: true, opacity: 0.88 }));
    water.rotation.x = -Math.PI / 2; water.position.set(11, -0.35, -12); water.receiveShadow = true; this.group.add(water);
    // low stone edge along the river
    this.box(8.85, 0.12, -17, 0.3, 0.24, 14, C.stone, 'stone');

    // hedges (height 3)
    const H = 3;
    this.block(this.box(-9.6, H / 2, -9, 1.2, H, 32, C.hedge, 'grass')); // west
    this.block(this.box(0, H / 2, 6.6, 20.4, H, 1.2, C.hedge, 'grass')); // south
    this.block(this.box(9.0, H / 2, -2, 1.2, H, 16, C.hedge, 'grass')); // east of garden
    this.block(this.box(0, H / 2, -24.6, 20.4, H, 1.2, C.hedge, 'grass')); // north
    // dividing hedge with a gate gap at x -0.9..0.9
    this.block(this.box(-5.0, H / 2, -10, 8.2, H, 1.2, C.hedge, 'grass'));
    this.block(this.box(5.0, H / 2, -10, 8.2, H, 1.2, C.hedge, 'grass'));

    // the gate: arch, slats, light through them. One collider the cat can thin through.
    this.box(-1.0, 1.7, -10, 0.25, 3.4, 0.4, C.woodDark, 'wood');
    this.box(1.0, 1.7, -10, 0.25, 3.4, 0.4, C.woodDark, 'wood');
    this.box(0, 3.3, -10, 2.4, 0.3, 0.5, C.woodDark, 'wood');
    for (let i = 0; i < 7; i++) {
      const x = -0.75 + i * 0.25;
      this.deco(new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.9, 0.08), this.mat(C.wood)), x, 1.5, -10);
    }
    const gate = this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.9, 1.5, 0.2).setTranslation(0, 1.5, -10));
    this.gateHandle = gate.handle; this.surfaces.set(gate.handle, 'wood');
    // light shafts through the slats (sun is behind the hedge, to the north-east)
    const shaftMat = new THREE.MeshBasicMaterial({ color: '#FFE2A8', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 4.2), shaftMat);
      s.position.set(-0.62 + i * 0.25, 1.2, -8.6); s.rotation.set(-0.55, 0, 0);
      this.group.add(s); this.sunShafts.push(s);
    }
    const patch = new THREE.Mesh(new THREE.CircleGeometry(1.4, 32), new THREE.MeshBasicMaterial({ color: '#FFE6B0', transparent: true, opacity: 0.35, depthWrite: false }));
    patch.rotation.x = -Math.PI / 2; patch.position.set(0, 0.012, -8.4); patch.scale.set(1, 1.4, 1); this.group.add(patch);

    // start sun patch
    const start = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), new THREE.MeshBasicMaterial({ color: '#FFE6B0', transparent: true, opacity: 0.4, depthWrite: false }));
    start.rotation.x = -Math.PI / 2; start.position.set(0, 0.012, 1.2); this.group.add(start);

    // low stone wall with the seed pot near its edge
    this.box(0, 0.45, -4, 5, 0.9, 0.7, C.stone, 'stone');
    this.addPot(1.7, 0.9 + 0.22, -4, 0);
    this.addPot(-1.6, 0.9 + 0.22, -4, null);

    // barrel stack: crate, then a tall barrel with a seed on top
    this.box(4.6, 0.5, -6.6, 1, 1, 1, C.wood, 'wood');
    this.cylinder(6.0, 1.1, -7.5, 0.5, 2.2, C.woodDark, 'wood');
    this.seeds.push(new THREE.Vector3(6.0, 2.55, -7.5));
    // high route: fireflies from barrel to the hedge corner, keepsake on top
    for (let i = 0; i <= 6; i++) this.fireflies.push(new THREE.Vector3(6.0 + (8.9 - 6.0) * (i / 6), 2.9 + Math.sin((i / 6) * Math.PI) * 0.9 + 0.2, -7.5 + (-9.4 + 7.5) * (i / 6)));

    // pushable crates for play
    this.addCrate(-4.5, 0.3, -2.5);
    this.addCrate(-5.2, 0.3, -6.5);
    this.addPot(-6.5, 0.22, 1.5, null);
    this.addPot(-7.2, 0.22, 0.8, null);

    // trees for framing (trunks collide, canopies do not)
    this.tree(-6.8, 3.6);
    this.tree(6.6, 2.4);
    this.tree(-7.0, -21.5);
    this.tree(14.5, -6);
    this.tree(16, -22);

    // north court: shed with a seed on the roof, a cart as the step up
    this.block(this.box(-5.6, 0.9, -17.5, 3.2, 1.8, 2.6, C.cream, 'stone'));
    this.box(-5.6, 1.95, -17.5, 3.6, 0.3, 3.0, C.roof, 'wood');
    this.box(-3.4, 0.4, -16.2, 1.4, 0.8, 1.0, C.wood, 'wood');
    this.seeds.push(new THREE.Vector3(-6.2, 2.45, -17.8));
    this.addPot(-3.0, 0.8 + 0.22, -16.0, null);

    // the spirit's stone ring and lanterns
    this.cylinder(this.spirit.x, 0.15, this.spirit.z, 1.7, 0.3, C.stone, 'stone', 32);
    this.buildSpirit();
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i - 1) * 1.15 + Math.PI;
      const x = this.spirit.x + Math.cos(a) * 2.6, z = this.spirit.z + Math.sin(a) * 2.6;
      this.cylinder(x, 0.6, z, 0.08, 1.2, C.woodDark, 'wood', 8);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshBasicMaterial({ color: '#6B5F55' }));
      lamp.position.set(x, 1.35, z); this.group.add(lamp); this.lanterns.push(lamp);
    }

    // waterwheel on the river and the mill across it
    this.wheel = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.1, 8, 28), this.mat(C.woodDark));
    rim.rotation.y = Math.PI / 2; this.wheel.add(rim);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.6), this.mat(C.wood));
      paddle.position.set(0, Math.sin(a) * 1.5, Math.cos(a) * 1.5); paddle.rotation.x = -a; this.wheel.add(paddle);
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.6), this.mat(C.woodDark));
      spoke.position.set(0, Math.sin(a) * 0.75, Math.cos(a) * 0.75); spoke.rotation.x = -a; this.wheel.add(spoke);
    }
    this.wheel.position.set(10.4, 0.6, -18); this.group.add(this.wheel);
    this.wheel.traverse((o) => { o.castShadow = true; });
    this.block(this.box(14.2, 1.6, -18, 4, 3.2, 4.4, C.cream, 'stone'));
    const roof = this.deco(new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.8, 4), this.mat(C.roof)), 14.2, 4.1, -18);
    roof.rotation.y = Math.PI / 4;

    // keepsake: a ribbon bow on the hedge corner
    const bow = new THREE.Group();
    const ribbon = new THREE.MeshLambertMaterial({ color: '#E77B8C' });
    for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), ribbon); l.scale.set(1.3, 0.8, 0.5); l.position.x = s * 0.17; bow.add(l); }
    bow.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), ribbon));
    bow.position.copy(this.keepsake); bow.name = 'keepsake'; this.group.add(bow);
  }

  private block<R extends { col: RAPIER.Collider }>(r: R) { this.camBlock.add(r.col.handle); return r; }

  private tree(x: number, z: number) {
    this.cylinder(x, 1.2, z, 0.3, 2.4, COLORS.bark, 'wood', 10);
    const blobs: [number, number, number, number][] = [[0, 3.1, 0, 1.5], [0.9, 2.7, 0.3, 1.0], [-0.8, 2.8, -0.2, 1.1], [0.2, 3.9, -0.3, 1.0]];
    for (const [dx, y, dz, r] of blobs) this.deco(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), this.mat(COLORS.leaf)), x + dx, y, z + dz);
  }

  private addPot(x: number, y: number, z: number, seed: number | null) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.44, 16), this.mat(COLORS.clay));
    mesh.castShadow = true; this.group.add(mesh);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.04, 8, 16), this.mat(COLORS.clay));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.22; mesh.add(rim);
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.2).setAngularDamping(0.4));
    this.world.createCollider(RAPIER.ColliderDesc.cylinder(0.22, 0.19).setDensity(0.6).setFriction(0.7).setRestitution(0.1), body);
    let seedIndex: number | null = null;
    if (seed !== null) { this.seeds.unshift(new THREE.Vector3(x, y, z)); seedIndex = 0; }
    this.pots.push({ body, mesh, seed: seedIndex, spawn: new THREE.Vector3(x, y, z), prevV: new THREE.Vector3(), broken: false });
  }
  private addCrate(x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), this.mat(COLORS.wood));
    mesh.castShadow = true; mesh.receiveShadow = true; this.group.add(mesh);
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.6).setAngularDamping(0.8));
    const col = this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 0.3, 0.3).setDensity(0.5).setFriction(0.8), body);
    this.surfaces.set(col.handle, 'wood');
    this.crates.push({ body, mesh });
  }

  private buildSpirit() {
    // A sleeping hearth spirit: a round kiln-fired pot figure with moss, original to this game.
    const g = new THREE.Group();
    const clay = new THREE.MeshLambertMaterial({ color: COLORS.clay });
    const bodyM = new THREE.Mesh(new THREE.SphereGeometry(0.75, 28, 20), clay); bodyM.scale.set(1, 0.9, 1); bodyM.position.y = 0.75; g.add(bodyM);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.3, 20), clay); neck.position.y = 1.45; g.add(neck);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.07, 10, 20), clay); lip.rotation.x = Math.PI / 2; lip.position.y = 1.6; g.add(lip);
    const moss = new THREE.MeshLambertMaterial({ color: COLORS.moss });
    for (const [x, y, z, r] of [[0.5, 1.15, 0.2, 0.22], [0.35, 1.3, -0.35, 0.17], [-0.55, 1.05, -0.25, 0.2]] as const) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), moss); m.position.set(x, y, z); g.add(m);
    }
    // the ember inside: glows brighter with each seed
    this.spiritGlow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshBasicMaterial({ color: '#5A3E2C' }));
    this.spiritGlow.position.y = 1.55; g.add(this.spiritGlow);
    // closed eyes as soft lines, opened on waking
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.16, 4, 8), new THREE.MeshBasicMaterial({ color: '#4A2E22' }));
      e.rotation.z = Math.PI / 2; e.position.set(s * 0.24, 0.95, 0.66); g.add(e); this.spiritEyes.push(e);
    }
    g.traverse((o) => { o.castShadow = true; });
    g.position.set(this.spirit.x, 0.3, this.spirit.z);
    g.rotation.y = 0.35;
    this.group.add(g); this.spiritMesh = g;
    this.world.createCollider(RAPIER.ColliderDesc.ball(0.75).setTranslation(this.spirit.x, 1.05, this.spirit.z));
  }

  syncDynamics() {
    for (const p of this.pots) {
      if (p.broken) continue;
      const t = p.body.translation(), r = p.body.rotation();
      p.mesh.position.set(t.x, t.y, t.z); p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
    for (const c of this.crates) {
      const t = c.body.translation(), r = c.body.rotation();
      c.mesh.position.set(t.x, t.y, t.z); c.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }
}
