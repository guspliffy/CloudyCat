import * as THREE from 'three';
const _v = new THREE.Vector3();

// Soft round particles: cloud wisps, petals, firefly sparks.
const MAX = 600;

export class Particles {
  points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 4);
  private size = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private grow = new Float32Array(MAX);
  private drag = new Float32Array(MAX);
  private alpha0 = new Float32Array(MAX);
  private next = 0;

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 400 } },
      vertexShader: /* glsl */ `
        attribute float size; attribute vec4 color; varying vec4 vC; uniform float uScale;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        varying vec4 vC;
        void main(){
          vec2 d = gl_PointCoord - 0.5; float a = 1.0 - smoothstep(0.0, 0.5, length(d));
          gl_FragColor = vec4(vC.rgb, vC.a * a * a);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.life.fill(0);
  }

  setScale(h: number) { (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = h * 0.9; }

  emit(p: THREE.Vector3, v: THREE.Vector3, size: number, life: number, color: THREE.Color, alpha: number, grow = 1, drag = 1.5) {
    const i = this.next; this.next = (this.next + 1) % MAX;
    const i3 = i * 3, i4 = i * 4;
    this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
    this.vel[i3] = v.x; this.vel[i3 + 1] = v.y; this.vel[i3 + 2] = v.z;
    this.col[i4] = color.r; this.col[i4 + 1] = color.g; this.col[i4 + 2] = color.b; this.col[i4 + 3] = alpha;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.grow[i] = grow; this.drag[i] = drag; this.alpha0[i] = alpha;
  }

  /** A ring of cloud puffs, for the double jump and landings. */
  burst(p: THREE.Vector3, n: number, speed: number, size: number, color: THREE.Color, alpha: number, up = 0.4) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.3;
      this.emit(p, _v.set(Math.cos(a) * speed, up * speed * (0.5 + Math.random()), Math.sin(a) * speed), size * (0.8 + Math.random() * 0.4), 0.7 + Math.random() * 0.4, color, alpha, 1.6, 3);
    }
  }

  update(dt: number) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const dr = Math.exp(-this.drag[i] * dt);
      for (let j = 0; j < 3; j++) { this.vel[i * 3 + j] *= dr; this.pos[i * 3 + j] += this.vel[i * 3 + j] * dt; }
      this.size[i] *= 1 + (this.grow[i] - 1) * dt;
      this.col[i * 4 + 3] = this.alpha0[i] * Math.min(1, k * 1.5) * Math.min(1, (1 - k) * 8 + 0.2);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
  }
}
