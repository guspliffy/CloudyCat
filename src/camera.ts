import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { T } from './tuning';

// Gentle third-person camera: lags behind, swings round behind Moth whenever it walks,
// can be dragged to look around, and pulls in rather than clipping through hedges.
export class FollowCamera {
  cam: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = T.camPitch;
  private focus = new THREE.Vector3();
  private dist = T.camDistance;
  private sinceManual = 99;
  private tmp = new THREE.Vector3();
  private dir = new THREE.Vector3();
  // the ray reads focus and dir directly, so it is made once
  private ray = new RAPIER.Ray(this.focus, this.dir);
  private blocking = (c: RAPIER.Collider) => this.blocks.has(c.handle);
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
    const dragging = !!(look[0] || look[1]);
    if (dragging) {
      this.yaw -= look[0] * T.camDragSpeed; this.pitch = THREE.MathUtils.clamp(this.pitch + look[1] * T.camDragSpeed, -0.05, 1.1);
      this.sinceManual = 0;
    } else this.sinceManual += dt;

    // whenever Moth walks, swing round behind it; a free look only holds while standing (or mid-drag)
    const hs = Math.hypot(vel.x, vel.z);
    if (this.sinceManual > T.camDragGrace && hs > 0.5) {
      const behind = Math.atan2(-vel.x, -vel.z);
      let d = behind - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      // walking straight at the camera turns it round more gently, so the view never whips
      const k = Math.abs(d) > 2.4 ? 0.45 : 1;
      const rate = T.camAutoYaw * THREE.MathUtils.clamp(hs / 3, 0.45, 1.2) * k;
      this.yaw += d * (1 - Math.exp(-rate * dt));
      this.pitch = THREE.MathUtils.damp(this.pitch, T.camPitch, 1.2, dt);
    }

    const goal = this.tmp.copy(target); goal.y += T.camHeight;
    this.focus.x = THREE.MathUtils.damp(this.focus.x, goal.x, T.camLag, dt);
    this.focus.z = THREE.MathUtils.damp(this.focus.z, goal.z, T.camLag, dt);
    this.focus.y = THREE.MathUtils.damp(this.focus.y, goal.y, T.camLag * 0.6, dt);
    this.place(dt);
  }

  private place(dt: number) {
    const dir = this.dir.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    let want = T.camDistance;
    const hit = this.world.castRay(this.ray, T.camDistance, true, undefined, undefined, this.exclude, undefined, this.blocking);
    if (hit) want = Math.max(1.2, hit.timeOfImpact - 0.3);
    for (const { c, r } of this.soft) {
      // first entry of the ray into the sphere; skip when Moth itself stands inside it
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
