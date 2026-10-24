import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { T } from './tuning';
import type { Input } from './input';

// Kinematic character: smooth acceleration, coyote time, jump buffer, a floaty apex, a double jump puff.
// Falls never hurt: off an edge or into the river, Moth puffs into a cloud and drifts back.
export const RADIUS = 0.24;
export const HALF = 0.1;

export type PlayerEvent =
  | { type: 'jump' } | { type: 'double' } | { type: 'land'; strength: number } | { type: 'step' }
  | { type: 'bap'; hit: boolean } | { type: 'thin'; on: boolean } | { type: 'float' } | { type: 'floatEnd' };

export class Player {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  ctrl: RAPIER.KinematicCharacterController;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  facing = 0; // yaw, 0 = +Z
  grounded = false;
  groundHandle = -1;
  thinning = false;
  thin01 = 0;
  floating = false;
  float01 = 0;
  usedDouble = false;
  jumpedThisFrame = false;
  events: PlayerEvent[] = [];
  private coyote = 0;
  private buffer = 0;
  private pawHeldFor = 0;
  private bapCd = 0;
  private stepAcc = 0;
  private lastSafe = new THREE.Vector3();
  private safeTimer = 0;
  private floatFrom = new THREE.Vector3();
  private floatT = 0;
  private airTime = 0;
  private minVy = 0;

  constructor(private world: RAPIER.World, start: THREE.Vector3, private gateHandle: number, private nearGate: (p: THREE.Vector3) => boolean, private inWater: (p: THREE.Vector3) => boolean, private bappables: () => RAPIER.RigidBody[]) {
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, start.y + HALF + RADIUS, start.z));
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(HALF, RADIUS).setFriction(0), this.body);
    this.ctrl = world.createCharacterController(0.02);
    this.ctrl.enableAutostep(0.32, 0.15, false);
    this.ctrl.enableSnapToGround(0.25);
    this.ctrl.setMaxSlopeClimbAngle((55 * Math.PI) / 180);
    this.ctrl.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    this.ctrl.setApplyImpulsesToDynamicBodies(true);
    this.ctrl.setCharacterMass(3);
    this.pos.copy(start);
    this.lastSafe.copy(start);
  }

  update(dt: number, input: Input, camYaw: number) {
    this.events.length = 0;
    this.jumpedThisFrame = false;
    const jumpPressed = input.takeJump();
    const pawPressed = input.takePaw();

    if (this.floating) { this.updateFloat(dt); return; }

    // movement relative to the camera
    const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = right.multiplyScalar(input.moveX).add(fwd.multiplyScalar(input.moveY));
    const mag = Math.min(1, wish.length());
    if (mag > 0.001) wish.normalize();
    const speedTarget = mag < 0.35 ? THREE.MathUtils.lerp(0, T.walkSpeed, mag / 0.35)
      : mag < 0.75 ? THREE.MathUtils.lerp(T.walkSpeed, T.trotSpeed, (mag - 0.35) / 0.4)
      : THREE.MathUtils.lerp(T.trotSpeed, T.runSpeed, (mag - 0.75) / 0.25);
    const thinMul = this.thinning ? T.thinSpeedMul : 1;
    const target = wish.multiplyScalar(speedTarget * thinMul);
    const hv = new THREE.Vector3(this.vel.x, 0, this.vel.z);
    const accel = this.grounded ? (mag > 0.01 ? T.accel : T.decel) : T.airAccel;
    const diff = target.clone().sub(hv);
    const maxStep = accel * dt;
    if (diff.length() > maxStep) diff.setLength(maxStep);
    hv.add(diff);
    this.vel.x = hv.x; this.vel.z = hv.z;

    // face where we move
    if (hv.lengthSq() > 0.04) {
      const want = Math.atan2(hv.x, hv.z);
      let d = want - this.facing; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, T.turnRate * dt);
    }

    // jumping
    if (jumpPressed) this.buffer = T.jumpBuffer; else this.buffer -= dt;
    this.coyote = this.grounded ? T.coyoteTime : this.coyote - dt;
    if (this.buffer > 0 && this.coyote > 0) {
      this.vel.y = T.jumpVel; this.buffer = 0; this.coyote = 0; this.grounded = false;
      this.jumpedThisFrame = true; this.events.push({ type: 'jump' });
    } else if (jumpPressed && !this.grounded && !this.usedDouble && this.coyote <= 0) {
      this.vel.y = T.doubleJumpVel; this.usedDouble = true; this.buffer = 0;
      this.jumpedThisFrame = true; this.events.push({ type: 'double' });
    }

    // gravity: floaty near the apex while held, a little heavier on the way down
    let g = T.gravity;
    if (!this.grounded) {
      if (Math.abs(this.vel.y) < T.apexBand && input.jumpHeld) g *= T.apexGravityMul;
      else if (this.vel.y < 0) g *= T.fallGravityMul;
      else if (!input.jumpHeld) g *= T.jumpCutMul;
    }
    this.vel.y = Math.max(-T.maxFall, this.vel.y - g * dt);

    // paw: tap to bap, hold near the sunlit gate to thin
    if (input.pawHeld) this.pawHeldFor += dt; else this.pawHeldFor = 0;
    this.bapCd -= dt;
    if (pawPressed && this.bapCd <= 0) { this.bapCd = T.bapCooldown; this.bap(); }
    const wantThin = this.pawHeldFor > T.thinHoldTime && this.nearGate(this.pos);
    const keepThin = this.thinning && input.pawHeld && this.insideGate();
    const nowThin = wantThin || keepThin;
    if (nowThin !== this.thinning) { this.thinning = nowThin; this.events.push({ type: 'thin', on: nowThin }); }
    this.thin01 = THREE.MathUtils.damp(this.thin01, this.thinning ? 1 : 0, 8, dt);

    // move through the world
    const desired = new RAPIER.Vector3(this.vel.x * dt, this.vel.y * dt, this.vel.z * dt);
    this.ctrl.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined,
      (c) => !(this.thinning && c.handle === this.gateHandle));
    const mv = this.ctrl.computedMovement();
    const wasGrounded = this.grounded;
    this.grounded = this.ctrl.computedGrounded();
    const t = this.body.translation();
    const next = new RAPIER.Vector3(t.x + mv.x, t.y + mv.y, t.z + mv.z);
    this.body.setNextKinematicTranslation(next);
    // velocity that actually happened (so walls stop us and ceilings cut jumps)
    if (dt > 0) {
      if (Math.abs(mv.x - desired.x) > 1e-4) this.vel.x = mv.x / dt;
      if (Math.abs(mv.z - desired.z) > 1e-4) this.vel.z = mv.z / dt;
      if (this.vel.y > 0 && mv.y < desired.y * 0.5) this.vel.y = 0;
    }
    this.groundHandle = -1;
    for (let i = 0; i < this.ctrl.numComputedCollisions(); i++) {
      const c = this.ctrl.computedCollision(i);
      if (c && c.normal1 && c.normal1.y > 0.6 && c.collider) this.groundHandle = c.collider.handle;
    }
    this.pos.set(next.x, next.y - HALF - RADIUS, next.z);

    if (this.grounded) {
      if (!wasGrounded && this.airTime > 0.08) this.events.push({ type: 'land', strength: THREE.MathUtils.clamp(-this.minVy / 14, 0, 1) });
      if (this.vel.y < 0) this.vel.y = 0;
      this.usedDouble = false; this.airTime = 0; this.minVy = 0;
      // steps
      const sp = Math.hypot(this.vel.x, this.vel.z);
      this.stepAcc += sp * dt;
      if (sp > 0.4 && this.stepAcc > 0.45) { this.stepAcc = 0; this.events.push({ type: 'step' }); }
      // remember safe ground on static things
      this.safeTimer -= dt;
      if (this.safeTimer < 0 && !this.thinning) { this.safeTimer = 0.25; if (this.isSafeHere()) this.lastSafe.copy(this.pos); }
    } else {
      this.airTime += dt; this.minVy = Math.min(this.minVy, this.vel.y);
    }

    if (this.pos.y < -2.5 || this.inWater(this.pos)) this.startFloat();
  }

  private isSafeHere() {
    // only static ground counts, and only if there is ground a little in every direction
    const body = this.groundHandle >= 0 ? this.world.getCollider(this.groundHandle)?.parent() : null;
    if (body && !body.isFixed()) return false;
    for (const [dx, dz] of [[0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35]]) {
      const hit = this.world.castRay(new RAPIER.Ray({ x: this.pos.x + dx, y: this.pos.y + 0.3, z: this.pos.z + dz }, { x: 0, y: -1, z: 0 }), 0.6, true,
        undefined, undefined, this.collider);
      if (!hit) return false;
    }
    return !this.inWater(this.pos);
  }

  private insideGate() {
    const p = this.pos;
    return Math.abs(p.x) < 1.3 && Math.abs(p.z + 10) < 0.75;
  }

  private bap() {
    const f = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    const c = this.pos.clone().add(f.clone().multiplyScalar(T.bapReach)).add(new THREE.Vector3(0, 0.3, 0));
    let hit = false;
    for (const b of this.bappables()) {
      const t = b.translation();
      if (Math.hypot(t.x - c.x, t.y - c.y, t.z - c.z) > T.bapRadius + 0.22) continue;
      const m = b.mass();
      b.applyImpulse({ x: f.x * T.bapImpulse * m * 2.2, y: T.bapLift * m * 2.2, z: f.z * T.bapImpulse * m * 2.2 }, true);
      b.applyTorqueImpulse({ x: (Math.random() - 0.5) * 0.05 * m, y: (Math.random() - 0.5) * 0.05 * m, z: (Math.random() - 0.5) * 0.05 * m }, true);
      hit = true;
    }
    this.events.push({ type: 'bap', hit });
  }

  startFloat() {
    if (this.floating) return;
    this.floating = true; this.floatT = 0; this.floatFrom.copy(this.pos);
    this.vel.set(0, 0, 0); this.thinning = false;
    this.events.push({ type: 'float' });
  }
  private updateFloat(dt: number) {
    this.floatT += dt / T.floatBackTime;
    const k = Math.min(1, this.floatT);
    const e = k * k * (3 - 2 * k);
    const p = this.floatFrom.clone().lerp(this.lastSafe, e);
    p.y += Math.sin(k * Math.PI) * 2.2 + (1 - e) * 0.6;
    this.float01 = k < 0.85 ? Math.min(1, k * 5) : Math.max(0, 1 - (k - 0.85) / 0.15);
    this.pos.copy(p);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + HALF + RADIUS, z: p.z });
    if (k >= 1) { this.floating = false; this.float01 = 0; this.grounded = false; this.events.push({ type: 'floatEnd' }); }
  }
}
