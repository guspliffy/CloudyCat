import * as THREE from 'three';
import { PAL, WIND } from './ghibli';

// Sky: a painted gradient dome, towering sunlit cumulus as billboard cards (flat bases, lavender undersides,
// cauliflower shoulders on the sun side), and three layers of far hills fading into the haze.

function fbm2(x: number, y: number, seed: number, oct = 5) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f + seed * 13.1, y * f - seed * 7.7); a *= 0.5; f *= 2.03; }
  return s;
}
function hash(x: number, y: number) { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Paint one cumulus on a canvas: lumpy top, flat base, sun from the upper left. */
function cumulusTexture(seed: number, tall: number) {
  const W = 512, H = 512;
  const mask = new Float32Array(W * H);
  // a cloud is a pile of round lobes; bigger and higher in the middle
  const lobes: [number, number, number][] = [];
  const r = mulberry(seed);
  const n = 9 + Math.floor(r() * 6);
  for (let i = 0; i < n; i++) {
    const x = 0.18 + r() * 0.64;
    const mid = 1 - Math.abs(x - 0.5) * 2;
    const rad = 0.08 + r() * 0.1 + mid * 0.1 * tall;
    const y = 0.78 - rad * 0.6 - r() * 0.12 * mid * tall - mid * 0.25 * tall;
    lobes.push([x, y, rad]);
  }
  for (let i = 0; i < 6; i++) { const x = 0.2 + r() * 0.6; lobes.push([x, 0.74 - r() * 0.05, 0.07 + r() * 0.05]); }
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const u = px / W, v = py / H;
    let d = 0;
    for (const [x, y, rad] of lobes) { const dd = Math.hypot(u - x, (v - y) * 1.05); d = Math.max(d, 1 - dd / rad); }
    const nse = fbm2(u * 9, v * 9, seed) - 0.5;
    let m = d + nse * 0.35;
    m *= THREE.MathUtils.smoothstep(0.86 - v, -0.02, 0.06); // flat base
    mask[py * W + px] = THREE.MathUtils.clamp((m - 0.02) / 0.12, 0, 1);
  }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const top = new THREE.Color(PAL.cloudTop), body = new THREE.Color(PAL.cloudBody), under = new THREE.Color(PAL.cloudUnder), deep = new THREE.Color(PAL.cloudDeep);
  const col = new THREE.Color();
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : mask[y * W + x]);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const m = mask[py * W + px];
    const i = (py * W + px) * 4;
    if (m <= 0) { img.data[i + 3] = 0; continue; }
    // light from the upper left: if the mask continues toward the sun we are inside, else on the lit shoulder
    const towardSun = at(px - 18, py - 22);
    const below = at(px, py + 22);
    const v = py / H;
    // sunlit where the cloud does not continue toward the sun, mostly on the upper half
    const lit = (1 - towardSun) * (1 - THREE.MathUtils.smoothstep(v, 0.45, 0.75)) * THREE.MathUtils.smoothstep(m, 0.0, 0.6);
    const underK = THREE.MathUtils.smoothstep(v, 0.55, 0.82) * (0.6 + 0.4 * below);
    col.copy(body).lerp(top, 0.45 * (1 - v));
    col.lerp(under, underK * 0.8).lerp(deep, Math.max(0, underK - 0.6) * 0.7);
    col.lerp(top, lit * 0.95);
    // dry-brush texture
    const tex = fbm2(px / 18, py / 18, seed + 3, 3);
    col.multiplyScalar(0.97 + tex * 0.06);
    img.data[i] = Math.min(255, col.r * 255); img.data[i + 1] = Math.min(255, col.g * 255); img.data[i + 2] = Math.min(255, col.b * 255);
    img.data[i + 3] = Math.min(255, m * 255);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function mulberry(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Sky {
  group = new THREE.Group();
  dome: THREE.Mesh;
  private clouds: { mesh: THREE.Mesh; speed: number; angle: number; dist: number; h: number }[] = [];

  constructor(sunDir: THREE.Vector3, phone: boolean) {
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uSun: { value: sunDir.clone() }, uZen: { value: new THREE.Color(PAL.zenith) }, uMid: { value: new THREE.Color(PAL.skyMid) },
        uHor: { value: new THREE.Color(PAL.horizon) },
      },
      vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
      fragmentShader: `
        varying vec3 vD; uniform vec3 uSun, uZen, uMid, uHor;
        void main(){
          vec3 d = normalize(vD);
          float y = max(d.y, 0.0);
          vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.35, y));
          c = mix(c, uZen, smoothstep(0.3, 1.0, y));
          float s = max(dot(d, uSun), 0.0);
          c += vec3(1.0, 0.91, 0.79) * (pow(s, 8.0) * 0.22 + pow(s, 600.0) * 1.5);
          if (d.y < 0.0) c = uHor;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    this.dome.renderOrder = -10;
    this.group.add(this.dome);

    // cumulus: two towers to the north-east behind the mill, smaller ones around
    const specs: [number, number, number, number, number][] = [
      // angle (rad, 0 = north, + east), distance, width, height fraction of width, tallness
      [0.55, 260, 150, 0.8, 1.0], [0.95, 240, 120, 0.85, 1.0], [-0.45, 280, 110, 0.5, 0.4],
      [-1.2, 250, 90, 0.45, 0.3], [1.7, 270, 100, 0.5, 0.45], [2.6, 260, 120, 0.45, 0.35], [-2.3, 280, 100, 0.45, 0.3],
      [0.1, 300, 80, 0.4, 0.2], [-0.8, 300, 70, 0.35, 0.15],
    ];
    const count = phone ? 6 : specs.length;
    specs.slice(0, count).forEach(([angle, dist, w, hf, tall], i) => {
      const tex = cumulusTexture(17 + i * 31, tall);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w * Math.max(hf, 0.5)), mat);
      mesh.renderOrder = -9;
      const h = dist * Math.tan(0.03 + (1 - tall) * 0.08) + w * Math.max(hf, 0.5) * 0.25;
      this.clouds.push({ mesh, speed: 0.0004 / (0.5 + tall), angle, dist, h });
      this.group.add(mesh);
    });

    // far hills: three soft layers, near to far
    const hills: [number, string, number, number][] = [[95, PAL.hill1, 9, 1], [150, PAL.hill2, 14, 2], [220, PAL.hill3, 22, 3]];
    for (const [r, col, amp, seed] of hills) this.group.add(this.hillRing(r, col, amp, seed));
  }

  private hillRing(r: number, col: string, amp: number, seed: number) {
    const seg = 160;
    const pos: number[] = [], idx: number[] = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const h = amp * (0.35 + fbm2(Math.cos(a) * 3 + seed, Math.sin(a) * 3, seed, 4) * 1.1);
      const x = Math.sin(a) * r, z = -Math.cos(a) * r;
      pos.push(x, -2, z, x, h, z);
      if (i < seg) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const top = new THREE.Color(col), bottom = new THREE.Color(col).lerp(new THREE.Color(PAL.horizon), 0.45);
    const colors: number[] = [];
    for (let i = 0; i <= seg; i++) colors.push(bottom.r, bottom.g, bottom.b, top.r, top.g, top.b);
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide, depthWrite: true }));
    m.renderOrder = -8;
    return m;
  }

  update(dt: number, cam: THREE.Camera) {
    this.group.position.set(cam.position.x, 0, cam.position.z);
    for (const c of this.clouds) {
      c.angle -= c.speed * dt * (1 + WIND.gust * 0.3) * 60 * 0.016;
      c.mesh.position.set(Math.sin(c.angle) * c.dist, c.h, -Math.cos(c.angle) * c.dist);
      c.mesh.lookAt(0, c.h, 0);
    }
  }
}
