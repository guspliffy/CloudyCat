import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { T } from './tuning';

// Gentle third-person camera: lags behind, slowly swings behind the cat while it moves,
// can be dragged to look around, and pulls in rather than clipping through hedges.
export class FollowCamera {
  cam: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = T.camPitch;
  private focus = new THREE.Vector3();
  private dist = T.camDistance;
  private sinceManual = 99;
  /** tree canopies the camera pulls in front of instead of sitting inside the leaves */
  soft: { c: THREE.Vector3; r: number }[] = [];

  constructor(aspect: number, private world: RAPIER.World, private exclude: RAPIER.Collider, private blocks: Set<number>) {
    this.cam = new THREE.PerspectiveCamera(55, aspect, 0.05, 200);
  }

  snap(target: THREE.Vector3, facing: number) {
    this.yaw = facing + Math.PI;
    this.focus.copy(target).add(new THREE.Vector3(0, T.camHeight, 0));
    this.place(1);
  }

  update(dt: number, target: THREE.Vector3, vel: THREE.Vector3, look: number[]) {
    if (look[0] || look[1]) {
      this.yaw -= look[0] * T.camDragSpeed; this.pitch = THREE.MathUtils.clamp(this.pitch + look[1] * T.camDragSpeed, -0.05, 1.1);
      this.sinceManual = 0;
    } else this.sinceManual += dt;

    // swing slowly behind the direction of travel
    const hs = Math.hypot(vel.x, vel.z);
    if (this.sinceManual > T.camIdleBeforeAuto && hs > 0.8) {
      const behind = Math.atan2(-vel.x, -vel.z);
      let d = behind - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      // do not swing hard when running straight at the camera
      const k = Math.abs(d) > 2.6 ? 0.15 : 1;
      this.yaw += d * Math.min(1, T.camAutoYaw * dt * (hs / 5) * k);
      this.pitch = THREE.MathUtils.damp(this.pitch, T.camPitch, 0.8, dt);
    }

    const goal = target.clone().add(new THREE.Vector3(0, T.camHeight, 0));
    this.focus.x = THREE.MathUtils.damp(this.focus.x, goal.x, T.camLag, dt);
    this.focus.z = THREE.MathUtils.damp(this.focus.z, goal.z, T.camLag, dt);
    this.focus.y = THREE.MathUtils.damp(this.focus.y, goal.y, T.camLag * 0.6, dt);
    this.place(dt);
  }

  private place(dt: number) {
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    let want = T.camDistance;
    const hit = this.world.castRay(new RAPIER.Ray(this.focus, dir), T.camDistance, true, undefined, undefined, this.exclude,
      undefined, (c) => this.blocks.has(c.handle));
    if (hit) want = Math.max(1.2, hit.timeOfImpact - 0.3);
    for (const { c, r } of this.soft) {
      // first entry of the ray into the sphere; skip when the cat itself stands inside it
      const ox = this.focus.x - c.x, oy = this.focus.y - c.y, oz = this.focus.z - c.z;
      const cc = ox * ox + oy * oy + oz * oz - r * r;
      if (cc < 0) continue;
      const b = ox * dir.x + oy * dir.y + oz * dir.z;
      const disc = b * b - cc;
      if (b > 0 || disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t < want) want = Math.max(1.2, t - 0.2);
    }
    this.dist = want < this.dist ? want : THREE.MathUtils.damp(this.dist, want, 2.5, dt);
    this.cam.position.copy(this.focus).addScaledVector(dir, this.dist);
    this.cam.lookAt(this.focus);
  }
}
