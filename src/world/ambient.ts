import * as THREE from 'three';
import { SHARED, WIND, paint } from './ghibli';
import { SmokeRenderer, PuffSlot, swirl } from '../smoke';
import { mulberry } from './sky';

// Floating life (ART-GUIDE 1.6): pollen motes drifting in the light, white butterflies over the flowers,
// dandelion seeds carried on the wind, and a thin thread of chimney smoke so Moth's smoke feels at home.

export class Ambient {
  group = new THREE.Group();
  private butterflies: { o: THREE.Group; wings: THREE.Mesh[]; c: THREE.Vector3; r: number; ph: number; sp: number }[] = [];
  private chimney: SmokeRenderer;
  private chimPuffs: (PuffSlot & { age: number; life: number })[] = [];
  private chimFree: (PuffSlot & { age: number; life: number })[] = [];
  private chimAcc = 0;
  private v = new THREE.Vector3();
  private seeds: { o: THREE.Mesh; p: THREE.Vector3; ph: number }[] = [];

  constructor(private chimneyAt: THREE.Vector3, flowerSpots: THREE.Vector3[], phone: boolean, heightAt: (x: number, z: number) => number) {
    const r = mulberry(31);
    // pollen: points that drift in a loop, animated entirely in the vertex shader
    const n = phone ? 120 : 260;
    const base = new Float32Array(n * 3), ph = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = -9 + r() * 28, z = -27 + r() * 34;
      base.set([x, heightAt(x, z) + 0.3 + r() * 2.6, z], i * 3); ph[i] = r() * 100;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(base, 3));
    g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
    const pm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: SHARED.uTime, uWindDir: SHARED.uWindDir, uScale: { value: 300 } },
      vertexShader: /* glsl */ `
        attribute float phase; uniform float uTime; uniform vec2 uWindDir; uniform float uScale; varying float vA;
        void main(){
          float t = uTime * 0.12 + phase;
          vec3 p = position;
          p.x += sin(t * 1.3) * 0.8 + uWindDir.x * fract(t * 0.05) * 3.0;
          p.z += cos(t * 1.1) * 0.8 + uWindDir.y * fract(t * 0.05) * 3.0;
          p.y += sin(t * 0.7) * 0.4 + fract(t * 0.05) * 1.2;
          vA = sin(fract(t * 0.05) * 3.14159) * (0.5 + 0.5 * sin(uTime * 2.0 + phase * 7.0));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uScale * 0.025 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = 1.0 - smoothstep(0.0, 0.5, d); gl_FragColor = vec4(vec3(1.0, 0.95, 0.78) * a * vA * 0.55, 1.0); }`,
    });
    const pts = new THREE.Points(g, pm); pts.frustumCulled = false; this.group.add(pts);
    this.pollenMat = pm;

    // butterflies: two little wings flapping on a lazy figure-eight around a flower spot
    const wingGeo = new THREE.CircleGeometry(0.05, 10).translate(0.045, 0, 0);
    const wingMat = paint(new THREE.MeshLambertMaterial({ color: '#FBF7EC', side: THREE.DoubleSide, emissive: '#3a3830' }));
    const nb = phone ? 5 : 10;
    for (let i = 0; i < nb; i++) {
      const c = flowerSpots[Math.floor(r() * flowerSpots.length)].clone();
      const o = new THREE.Group();
      const wings = [new THREE.Mesh(wingGeo, wingMat), new THREE.Mesh(wingGeo, wingMat)];
      wings[1].scale.x = -1; o.add(...wings);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.04, 2, 4), paint(new THREE.MeshLambertMaterial({ color: '#4B3A40' })));
      body.rotation.x = Math.PI / 2; o.add(body);
      this.group.add(o);
      this.butterflies.push({ o, wings, c, r: 0.8 + r() * 1.4, ph: r() * 10, sp: 0.4 + r() * 0.3 });
    }

    // dandelion seeds: tiny white stars floating on the wind
    const seedGeo = new THREE.PlaneGeometry(0.06, 0.06);
    const seedMat = new THREE.MeshBasicMaterial({ map: seedTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < (phone ? 12 : 28); i++) {
      const o = new THREE.Mesh(seedGeo, seedMat);
      const p = new THREE.Vector3(-9 + r() * 28, 0, -27 + r() * 34); p.y = heightAt(p.x, p.z) + 0.5 + r() * 2.5;
      this.group.add(o); this.seeds.push({ o, p, ph: r() * 10 });
    }

    // chimney smoke: the same smoke as Moth, but pale and thin
    this.chimney = new SmokeRenderer(70);
    const u = this.chimney.material.uniforms;
    u.uShadow.value.set('#A9A3C4'); u.uBase.value.set('#D2CDE2'); u.uLit.value.set('#F3F0F7'); u.uPale.value.set('#F6F4FA');
    this.group.add(this.chimney.mesh);
  }
  private pollenMat: THREE.ShaderMaterial;

  setScale(h: number) { this.pollenMat.uniforms.uScale.value = h; }

  update(dt: number, t: number, cam: THREE.Camera, sunDir: THREE.Vector3, cat: THREE.Vector3) {
    for (const b of this.butterflies) {
      const a = t * b.sp + b.ph;
      const p = this.v.set(b.c.x + Math.sin(a) * b.r, b.c.y + 0.5 + Math.sin(a * 2.3) * 0.25 + Math.sin(a * 0.7) * 0.2, b.c.z + Math.sin(a * 2) * b.r * 0.5);
      // flutter away from the cat
      const d = p.distanceTo(cat);
      if (d < 1.2) p.y += (1.2 - d) * 1.2;
      b.o.position.lerp(p, Math.min(1, dt * 4));
      b.o.rotation.y = Math.atan2(Math.cos(a) * b.r, Math.cos(a * 2) * b.r);
      const f = Math.sin(t * 22 + b.ph) * 0.9;
      b.wings[0].rotation.y = f; b.wings[1].rotation.y = -f;
    }
    for (const s of this.seeds) {
      s.p.x += (WIND.dir.x * (0.25 + WIND.gust * 0.8) + Math.sin(t * 0.7 + s.ph) * 0.1) * dt;
      s.p.z += (WIND.dir.y * (0.25 + WIND.gust * 0.8) + Math.cos(t * 0.6 + s.ph) * 0.1) * dt;
      s.p.y += Math.sin(t * 0.9 + s.ph) * 0.08 * dt;
      // wrap around the garden
      if (s.p.x < -12) s.p.x += 32; if (s.p.x > 22) s.p.x -= 32;
      if (s.p.z < -29) s.p.z += 38; if (s.p.z > 9) s.p.z -= 38;
      s.o.position.copy(s.p); s.o.quaternion.copy(cam.quaternion); s.o.rotateZ(t * 0.5 + s.ph);
    }
    // chimney
    this.chimAcc += dt * 6;
    while (this.chimAcc > 1) {
      this.chimAcc -= 1;
      if (this.chimPuffs.length > 60) break;
      // puffs are reused from a small pool, so the chimney makes no garbage
      const p = this.chimFree.pop() ?? { pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 0, alpha: 0, seed: 0, erode: 0, light: 0.3, stretch: 0.05, age: 0, life: 0 };
      p.pos.copy(this.chimneyAt); p.vel.set(0, 0.5, 0); p.size = 0.12; p.alpha = 0; p.seed = Math.random(); p.erode = 0.4; p.age = 0; p.life = 4 + Math.random() * 2;
      this.chimPuffs.push(p);
    }
    for (let i = this.chimPuffs.length - 1; i >= 0; i--) {
      const p = this.chimPuffs[i];
      p.age += dt; const k = p.age / p.life;
      if (k >= 1) { this.chimFree.push(p); this.chimPuffs[i] = this.chimPuffs[this.chimPuffs.length - 1]; this.chimPuffs.pop(); continue; }
      swirl(this.v, p.pos.x * 1.5, p.pos.y * 1.5, p.pos.z * 1.5, t * 0.6 + p.seed * 5);
      p.vel.addScaledVector(this.v, dt * 0.25);
      p.vel.x += WIND.dir.x * (0.4 + WIND.gust) * dt * 0.6; p.vel.z += WIND.dir.y * (0.4 + WIND.gust) * dt * 0.6;
      p.vel.y = Math.max(0.15, p.vel.y - dt * 0.05);
      p.vel.multiplyScalar(Math.exp(-0.3 * dt));
      p.pos.addScaledVector(p.vel, dt);
      p.size = 0.12 + Math.sqrt(k) * 0.9;
      p.alpha = 0.5 * Math.min(1, k * 6) * (1 - k) * (1 - k);
      p.erode = 0.35 + k * 0.6;
    }
    this.chimney.setSun(sunDir, cam);
    this.chimney.write(this.chimPuffs, cam, t);
  }
}

function seedTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1;
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; g.beginPath(); g.moveTo(16, 16); g.lineTo(16 + Math.cos(a) * 14, 16 + Math.sin(a) * 14); g.stroke(); }
  g.fillStyle = '#fff'; g.beginPath(); g.arc(16, 16, 2.5, 0, 7); g.fill();
  return new THREE.CanvasTexture(c);
}
