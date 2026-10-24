import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { T } from './tuning';

// Third-person camera: stays right behind Moth whenever it walks, calm while it turns on the spot,
// can be dragged to look around, and pulls in rather than clipping through hedges.
export class FollowCamera {
  cam: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = T.camPitch;
  /** 0 to 1: a little higher and further back, to look over a puzzle yard */
  overview = 0;
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

  update(dt: number, target: THREE.Vector3, vel: THREE.Vector3, facing: number, look: number[]) {
    const dragging = !!(look[0] || look[1]);
    if (dragging) {
      this.yaw -= look[0] * T.camDragSpeed; this.pitch = THREE.MathUtils.clamp(this.pitch + look[1] * T.camDragSpeed, -0.05, 1.1);
      this.sinceManual = 0;
    } else this.sinceManual += dt;

    // walking: stay right behind Moth's back, round every corner, like a classic third-person view.
    // Turning on the spot (no speed yet) leaves the camera calm; a drag takes over while it lasts.
    const hs = Math.hypot(vel.x, vel.z);
    const walk = this.sinceManual > T.camDragGrace ? THREE.MathUtils.smoothstep(hs, 0.4, 1.6) : 0;
    if (walk > 0) {
      let d = facing + Math.PI - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      // turning right round toward the camera swings it a little slower, so the view never whips
      const k = Math.abs(d) > 2.3 ? 0.5 : 1;
      this.yaw += d * (1 - Math.exp(-T.camAutoYaw * walk * k * dt));
      this.pitch = THREE.MathUtils.damp(this.pitch, T.camPitch + this.overview * 0.3, 1.5 * walk, dt);
    } else if (this.overview > 0.01 && this.sinceManual > 2) this.pitch = THREE.MathUtils.damp(this.pitch, T.camPitch + this.overview * 0.3, 1.2, dt);

    const goal = this.tmp.copy(target); goal.y += T.camHeight;
    this.focus.x = THREE.MathUtils.damp(this.focus.x, goal.x, T.camLag, dt);
    this.focus.z = THREE.MathUtils.damp(this.focus.z, goal.z, T.camLag, dt);
    // height follows slowly, so jumps and steps do not bob the whole view
    this.focus.y = THREE.MathUtils.damp(this.focus.y, goal.y, T.camLag * 0.4, dt);
    this.place(dt);
  }

  private place(dt: number) {
    const dir = this.dir.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const far = T.camDistance + this.overview * 1.1;
    let want = far, hard = far;
    const hit = this.world.castRay(this.ray, far, true, undefined, undefined, this.exclude, undefined, this.blocking);
    if (hit) hard = want = Math.max(1.2, hit.timeOfImpact - 0.3);
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
    // walls pull the camera in at once (it must never see through them); leaves and coming back out ease
    this.dist = THREE.MathUtils.damp(this.dist, want, want < this.dist ? 9 : 1.6, dt);
    this.dist = Math.min(this.dist, hard);
    this.cam.position.copy(this.focus).addScaledVector(dir, this.dist);
    this.cam.lookAt(this.focus);
  }
}
