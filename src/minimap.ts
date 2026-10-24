import * as THREE from 'three';

// A small round map in the corner. The level is photographed once from straight above, softened into a
// painted paper look, then drawn turned with the camera so "up" on the map is always where the camera faces.
// Only three marks: Moth in the middle, a warm pulse on the next thing to do, and the sleeping spirit.

const AREA = { x0: -13, x1: 24, z0: -53, z1: 11 }; // metres covered by the photo
const PX_PER_M = 14;
const RANGE = 13; // metres from Moth to the edge of the map

export class Minimap {
  el: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private paper: HTMLCanvasElement | null = null;
  private size = 0;
  private acc = 1;
  private t = 0;

  constructor() {
    this.el = document.createElement('canvas');
    this.el.id = 'map';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.g = this.el.getContext('2d')!;
  }

  /** Photograph the level from above. Everything but `keep` and the lights is hidden for the shot. */
  capture(renderer: THREE.WebGLRenderer, scene: THREE.Scene, keep: THREE.Object3D[]) {
    const w = Math.round((AREA.x1 - AREA.x0) * PX_PER_M), h = Math.round((AREA.z1 - AREA.z0) * PX_PER_M);
    const cam = new THREE.OrthographicCamera(AREA.x0, AREA.x1, -AREA.z0, -AREA.z1, 1, 200);
    cam.position.set(0, 100, 0);
    cam.up.set(0, 0, -1); // north (-z) at the top of the photo
    cam.lookAt(0, 0, 0);
    // after lookAt with up -z, screen right is +x and screen up is -z, so left/right/top/bottom are x and -z
    cam.left = AREA.x0; cam.right = AREA.x1; cam.top = -AREA.z0; cam.bottom = -AREA.z1;
    cam.updateProjectionMatrix();
    const hidden: THREE.Object3D[] = [];
    for (const o of scene.children) if (!keep.includes(o) && !(o as THREE.Light).isLight && o.visible) { o.visible = false; hidden.push(o); }
    const fog = scene.fog; scene.fog = null;
    const rt = new THREE.WebGLRenderTarget(w, h, { colorSpace: THREE.SRGBColorSpace });
    const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor('#9DB36A', 1);
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    const px = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
    renderer.setRenderTarget(null);
    renderer.setClearColor(prevClear, prevAlpha);
    rt.dispose();
    scene.fog = fog;
    for (const o of hidden) o.visible = true;

    // paper: rows flipped (GL reads bottom up), colours softened toward warm parchment
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    const img = g.createImageData(w, h);
    const pr = 236, pg = 226, pb = 202;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = ((h - 1 - y) * w + x) * 4, d = (y * w + x) * 4;
      const r = px[s], gg = px[s + 1], b = px[s + 2];
      const l = (r * 0.3 + gg * 0.59 + b * 0.11);
      // a little less saturated, a little lighter, a wash of paper
      const k = 0.78;
      img.data[d] = (r * k + l * (1 - k)) * 0.8 + pr * 0.2;
      img.data[d + 1] = (gg * k + l * (1 - k)) * 0.8 + pg * 0.2;
      img.data[d + 2] = (b * k + l * (1 - k)) * 0.8 + pb * 0.2;
      img.data[d + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.paper = c;
  }

  /**
   * Redraw (about 20 times a second). yaw: camera yaw. facing: Moth's facing. goal: the next thing to do, or null.
   */
  update(dt: number, me: THREE.Vector3, facing: number, yaw: number, goal: THREE.Vector3 | null, spirit: THREE.Vector3) {
    if (!this.paper) return;
    this.t += dt;
    this.acc += dt;
    if (this.acc < 0.05) return;
    this.acc = 0;
    const css = this.el.clientWidth;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const size = Math.round(css * dpr);
    if (size !== this.size) { this.el.width = this.el.height = size; this.size = size; }
    if (!size) return;
    const g = this.g, R = size / 2, scale = R / (RANGE * PX_PER_M);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, size, size);
    g.save();
    g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2); g.clip();
    // the paper, turned so the camera's forward points up, centred on Moth
    g.translate(R, R);
    g.rotate(yaw);
    g.scale(scale, scale);
    const mx = (me.x - AREA.x0) * PX_PER_M, mz = (me.z - AREA.z0) * PX_PER_M;
    g.drawImage(this.paper, -mx, -mz);
    g.restore();

    // marks, in map space around the centre
    const toMap = (p: THREE.Vector3) => {
      const dx = (p.x - me.x) * PX_PER_M * scale, dz = (p.z - me.z) * PX_PER_M * scale;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      return [R + dx * c - dz * s, R + dx * s + dz * c] as const;
    };
    const inside = (x: number, y: number, r: number) => Math.hypot(x - R, y - R) < R - r;
    const clampRim = (x: number, y: number, r: number) => {
      const a = Math.atan2(y - R, x - R), d = Math.min(Math.hypot(x - R, y - R), R - r);
      return [R + Math.cos(a) * d, R + Math.sin(a) * d] as const;
    };
    // the spirit: a little clay pot
    {
      let [x, y] = toMap(spirit);
      if (!inside(x, y, 9 * dpr)) [x, y] = clampRim(x, y, 9 * dpr);
      g.fillStyle = '#C88D69'; g.strokeStyle = 'rgba(60,40,40,0.55)'; g.lineWidth = 1.5 * dpr;
      g.beginPath(); g.ellipse(x, y + 1 * dpr, 5.5 * dpr, 5 * dpr, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#A9704F'; g.fillRect(x - 3 * dpr, y - 6 * dpr, 6 * dpr, 2.5 * dpr);
    }
    // the next thing to do: a warm pulse, or an arrow on the rim when it is out of range
    if (goal) {
      const [gx, gy] = toMap(goal);
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 4);
      if (inside(gx, gy, 8 * dpr)) {
        g.fillStyle = `rgba(255, 196, 107, ${0.25 + 0.25 * pulse})`;
        g.beginPath(); g.arc(gx, gy, (7 + pulse * 4) * dpr, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#FFC46B'; g.strokeStyle = 'rgba(120,70,20,0.8)'; g.lineWidth = 1.5 * dpr;
        g.beginPath(); g.arc(gx, gy, 4.5 * dpr, 0, Math.PI * 2); g.fill(); g.stroke();
      } else {
        const a = Math.atan2(gy - R, gx - R), r = R - 7 * dpr;
        const x = R + Math.cos(a) * r, y = R + Math.sin(a) * r;
        g.save(); g.translate(x, y); g.rotate(a);
        g.fillStyle = `rgba(255, 196, 107, ${0.75 + 0.25 * pulse})`; g.strokeStyle = 'rgba(120,70,20,0.8)'; g.lineWidth = 1.5 * dpr;
        g.beginPath(); g.moveTo(6 * dpr, 0); g.lineTo(-4 * dpr, -5 * dpr); g.lineTo(-4 * dpr, 5 * dpr); g.closePath(); g.fill(); g.stroke();
        g.restore();
      }
    }
    // Moth: a soft violet drop pointing where it faces
    {
      // facing as a map direction, turned like the paper; the drop is drawn pointing up, then rotated onto it
      const dx = Math.sin(facing), dz = Math.cos(facing), c = Math.cos(yaw), s = Math.sin(yaw);
      const vx = dx * c - dz * s, vy = dx * s + dz * c;
      g.save(); g.translate(R, R); g.rotate(Math.atan2(vx, -vy));
      g.fillStyle = '#5B5490'; g.strokeStyle = '#F7EFE0'; g.lineWidth = 2 * dpr;
      g.beginPath(); g.moveTo(0, -8 * dpr); g.quadraticCurveTo(6.5 * dpr, 2 * dpr, 0, 5.5 * dpr); g.quadraticCurveTo(-6.5 * dpr, 2 * dpr, 0, -8 * dpr);
      g.fill(); g.stroke();
      g.restore();
    }
    // rim
    g.strokeStyle = 'rgba(247, 239, 224, 0.95)'; g.lineWidth = 3 * dpr;
    g.beginPath(); g.arc(R, R, R - 1.5 * dpr, 0, Math.PI * 2); g.stroke();
  }
}
