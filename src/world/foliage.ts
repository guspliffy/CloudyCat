import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint, PAL } from './ghibli';
import { mulberry } from './sky';

// Painted foliage (ART-GUIDE 1.4): canopies are clusters of round blobs whose normals all point away from
// one enclosing centre, so a tree shades as one soft painted mass with a sun side and a violet side.
// Fringe cards with a scalloped leaf edge sit on the silhouette so the outline reads as brushed leaves.
// Everything is merged into a few meshes; wind sways it in the vertex shader.

function leafTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  const r = mulberry(5);
  // a scalloped clump: a bigger centre and small leaf lobes around the rim
  g.beginPath(); g.arc(64, 70, 34, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + r() * 0.3;
    const d = 36 + r() * 8, rad = 13 + r() * 8;
    g.beginPath(); g.arc(64 + Math.cos(a) * d, 70 + Math.sin(a) * d * 0.9, rad, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

const SWAY_VERTEX = /* glsl */ `
  float h = sway;
  float ph = uTime * 0.9 + wpos0.x * 0.3 + wpos0.z * 0.2;
  float amt = (0.03 + 0.09 * uGust) * h;
  transformed.x += (sin(ph) * 0.6 + uWindDir.x * (0.5 + uGust)) * amt;
  transformed.z += (cos(ph * 0.8) * 0.6 + uWindDir.y * (0.5 + uGust)) * amt;
  transformed.y += sin(ph * 1.3) * amt * 0.2;
`;

export class Foliage {
  /** rough canopy spheres, so the camera can avoid ending up inside a tree */
  canopies: { c: THREE.Vector3; r: number }[] = [];
  private blobGeos: THREE.BufferGeometry[] = [];
  private cardGeos: THREE.BufferGeometry[] = [];
  private barkGeos: THREE.BufferGeometry[] = [];
  private rand = mulberry(99);
  group = new THREE.Group();
  private leafTex = leafTexture();

  /** colours for one clump: lit leaf colour, with per-blob variation */
  private colors = [new THREE.Color(PAL.leaf), new THREE.Color(PAL.leafMid), new THREE.Color('#9CC765'), new THREE.Color('#7FB45A')];

  private pushBlob(c: THREE.Vector3, r: number, centre: THREE.Vector3, axisPt: (p: THREE.Vector3) => THREE.Vector3, col: THREE.Color, sway: number, detail = 2) {
    const g = new THREE.IcosahedronGeometry(r, detail);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3), sw = new Float32Array(pos.count);
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      // a little lumpy so blobs are not perfect balls
      const bump = 1 + (Math.sin(p.x * 7.3 + c.x) * Math.sin(p.y * 6.1 + c.z) * Math.sin(p.z * 5.7)) * 0.07;
      p.multiplyScalar(bump).add(c);
      pos.setXYZ(i, p.x, p.y, p.z);
      n.copy(p).sub(axisPt(p)).normalize();
      nrm.setXYZ(i, n.x, n.y, n.z);
      // darker toward the inside and the bottom: painted occlusion
      const occ = THREE.MathUtils.clamp(0.72 + 0.28 * (p.y - centre.y) / (r * 2) + 0.15 * n.y, 0.55, 1.08);
      colors[i * 3] = col.r * occ; colors[i * 3 + 1] = col.g * occ; colors[i * 3 + 2] = col.b * occ;
      sw[i] = sway;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('sway', new THREE.BufferAttribute(sw, 1));
    g.deleteAttribute('uv');
    this.blobGeos.push(g);
  }

  private pushCard(at: THREE.Vector3, out: THREE.Vector3, size: number, col: THREE.Color, sway: number) {
    const g = new THREE.PlaneGeometry(size, size);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), out.clone().setY(out.y * 0.5).normalize());
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.rand() * Math.PI * 2));
    m.compose(at, q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
    const count = nrm.count;
    for (let i = 0; i < count; i++) nrm.setXYZ(i, out.x, out.y, out.z);
    const colors = new Float32Array(count * 3), sw = new Float32Array(count);
    for (let i = 0; i < count; i++) { colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b; sw[i] = sway * 1.4; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('sway', new THREE.BufferAttribute(sw, 1));
    this.cardGeos.push(g);
  }

  private pushBark(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) {
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r1, r0, len, 9, 3);
    const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3), sw = new Float32Array(pos.count);
    const c1 = new THREE.Color(PAL.bark), c2 = new THREE.Color('#5E4A44');
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const c = c1.clone().lerp(c2, THREE.MathUtils.clamp(1 - (y - a.y) / 1.5, 0, 1) * 0.5 + Math.sin(pos.getX(i) * 20 + y * 3) * 0.08);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      sw[i] = THREE.MathUtils.clamp((y - a.y) / 4, 0, 1) * 0.4;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('sway', new THREE.BufferAttribute(sw, 1));
    g.deleteAttribute('uv');
    this.barkGeos.push(g);
  }

  /** A round broadleaf tree. Returns the trunk base and radius for a collider. */
  tree(x: number, y: number, z: number, size = 1, tint = 0) {
    const r = this.rand;
    const lean = new THREE.Vector3((r() - 0.5) * 0.25, 1, (r() - 0.5) * 0.25).normalize();
    const trunkH = 2.4 * size;
    const base = new THREE.Vector3(x, y - 0.1, z);
    const top = base.clone().addScaledVector(lean, trunkH);
    this.pushBark(base, top, 0.26 * size, 0.16 * size);
    // root flare
    this.pushBark(base.clone().add(new THREE.Vector3(0, 0, 0)), base.clone().add(new THREE.Vector3(0, 0.5 * size, 0)), 0.4 * size, 0.25 * size);
    // two branches into the canopy
    for (let i = 0; i < 2; i++) {
      const a = r() * Math.PI * 2;
      const from = base.clone().addScaledVector(lean, trunkH * (0.55 + i * 0.15));
      this.pushBark(from, from.clone().add(new THREE.Vector3(Math.cos(a) * 0.9 * size, 0.9 * size, Math.sin(a) * 0.9 * size)), 0.1 * size, 0.06 * size);
    }
    const centre = top.clone().add(new THREE.Vector3(0, 0.9 * size, 0));
    this.canopies.push({ c: centre.clone().add(new THREE.Vector3(0, 0.3 * size, 0)), r: 2.2 * size });
    const col = this.colors[Math.floor(r() * this.colors.length)].clone().offsetHSL(tint, 0, 0);
    const n = 7 + Math.floor(r() * 3);
    const blobs: [THREE.Vector3, number][] = [[centre.clone(), 1.5 * size]];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.5;
      const up = (r() - 0.35) * 1.0;
      const d = (1.0 + r() * 0.5) * size;
      blobs.push([centre.clone().add(new THREE.Vector3(Math.cos(a) * d, up * size, Math.sin(a) * d)), (0.75 + r() * 0.5) * size]);
    }
    blobs.push([centre.clone().add(new THREE.Vector3(0, 1.2 * size, 0)), 1.0 * size]);
    const axis = () => centre;
    for (const [c, rad] of blobs) {
      const v = c.clone().sub(centre);
      const cc = col.clone().offsetHSL((r() - 0.5) * 0.02, 0, (r() - 0.5) * 0.06);
      this.pushBlob(c, rad, centre, axis, cc, THREE.MathUtils.clamp(0.6 + v.y * 0.3, 0.3, 1));
      // fringe cards around this blob's silhouette
      for (let k = 0; k < 6; k++) {
        const a = r() * Math.PI * 2, el = (r() - 0.3) * 1.2;
        const dir = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
        const at = c.clone().addScaledVector(dir, rad * 0.88);
        const out = at.clone().sub(centre).normalize();
        if (out.y < -0.6) continue;
        const shade = 0.9 + 0.2 * out.y;
        this.pushCard(at, out, (0.5 + r() * 0.35) * size, cc.clone().multiplyScalar(shade), 0.8);
      }
    }
    return { x, z, r: 0.28 * size, h: trunkH };
  }

  /** A soft bush, like a small canopy sitting on the ground. */
  bush(x: number, y: number, z: number, size = 1, flowers?: string) {
    const r = this.rand;
    const centre = new THREE.Vector3(x, y + 0.35 * size, z);
    const col = this.colors[Math.floor(r() * this.colors.length)].clone();
    const n = 4 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r();
      const c = centre.clone().add(new THREE.Vector3(Math.cos(a) * 0.35 * size, (r() - 0.3) * 0.25 * size, Math.sin(a) * 0.35 * size));
      this.pushBlob(c, (0.35 + r() * 0.15) * size, centre, () => centre.clone().setY(y), col.clone().offsetHSL(0, 0, (r() - 0.5) * 0.05), 0.25, 1);
    }
    for (let k = 0; k < 8; k++) {
      const a = r() * Math.PI * 2, el = r() * 0.9;
      const out = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
      this.pushCard(centre.clone().addScaledVector(out, 0.5 * size), out, 0.35 * size, col.clone(), 0.3);
    }
    if (flowers) this.flowerDots(centre, 0.55 * size, flowers, 10);
  }

  /** Little flower heads dotted over a surface (cards facing out, flower coloured). */
  private flowerDots(centre: THREE.Vector3, rad: number, color: string, n: number) {
    const r = this.rand; const col = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, el = 0.15 + r() * 1.1;
      const out = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
      this.pushCard(centre.clone().addScaledVector(out, rad), out, 0.12, col, 0.3);
    }
  }

  /** A hedge along a line: a rounded wall of small blobs with a leafy fringe. */
  hedge(x1: number, z1: number, x2: number, z2: number, y: number, h: number, t: number, flowers?: string) {
    const r = this.rand;
    const a = new THREE.Vector3(x1, y, z1), b = new THREE.Vector3(x2, y, z2);
    const len = a.distanceTo(b);
    const dir = b.clone().sub(a).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const axisY = y + h * 0.55;
    const axisPt = (p: THREE.Vector3) => {
      const k = THREE.MathUtils.clamp(p.clone().sub(a).dot(dir), 0, len);
      return a.clone().addScaledVector(dir, k).setY(Math.min(p.y, axisY));
    };
    const col = new THREE.Color(PAL.leafMid).lerp(new THREE.Color(PAL.leaf), 0.4);
    const per = Math.max(3, Math.round(len * 2.2));
    for (let i = 0; i <= per; i++) {
      const k = (i / per) * len;
      for (const s of [-1, 1]) {
        for (let j = 0; j < 2; j++) {
          const c = a.clone().addScaledVector(dir, k + (r() - 0.5) * 0.4).addScaledVector(side, s * t * 0.3).setY(y + h * (0.3 + j * 0.42) + (r() - 0.5) * 0.15);
          this.pushBlob(c, t * 0.42 + r() * 0.12, c, axisPt, col.clone().offsetHSL((r() - 0.5) * 0.02, 0, (r() - 0.5) * 0.05), 0.12 + j * 0.12, 1);
        }
      }
      const top = a.clone().addScaledVector(dir, k).setY(y + h - t * 0.35);
      this.pushBlob(top, t * 0.5, top, axisPt, col.clone().offsetHSL(0, 0, 0.03), 0.3, 1);
      // fringe on top and both faces
      for (let q = 0; q < 3; q++) {
        const s = r() < 0.5 ? -1 : 1;
        const out = side.clone().multiplyScalar(s).add(new THREE.Vector3(0, r() * 1.4, 0)).normalize();
        const at = a.clone().addScaledVector(dir, k + (r() - 0.5) * 0.4).setY(y + h * (0.35 + r() * 0.6)).addScaledVector(side, s * t * 0.55);
        this.pushCard(at, out, 0.35 + r() * 0.2, col.clone().multiplyScalar(0.92 + out.y * 0.15), 0.25);
      }
      if (flowers && r() < 0.6) this.flowerDots(top, t * 0.55, flowers, 2);
    }
  }

  build() {
    const blobMat = paint(new THREE.MeshLambertMaterial({ vertexColors: true }), { vertex: SWAY_VERTEX, vertexPars: 'attribute float sway;' });
    const cardMat = paint(new THREE.MeshLambertMaterial({ vertexColors: true, map: this.leafTex, alphaTest: 0.5, side: THREE.DoubleSide }),
      { vertex: SWAY_VERTEX + 'transformed.x += sin(uTime * 2.3 + wpos0.y * 4.0 + wpos0.x) * 0.02 * h;', vertexPars: 'attribute float sway;' });
    const barkMat = paint(new THREE.MeshLambertMaterial({ vertexColors: true }), { vertex: SWAY_VERTEX, vertexPars: 'attribute float sway;' });
    const add = (geos: THREE.BufferGeometry[], mat: THREE.Material, shadow: boolean) => {
      if (!geos.length) return;
      const g = mergeGeometries(geos.map((x) => (x.index ? x.toNonIndexed() : x)), false)!;
      geos.forEach((x) => x.dispose());
      const m = new THREE.Mesh(g, mat); m.castShadow = shadow; m.receiveShadow = true;
      this.group.add(m);
    };
    // cards need uv, blobs and bark do not: merged separately. Cards cast no shadow (the blobs do).
    add(this.blobGeos, blobMat, true);
    add(this.cardGeos, cardMat, false);
    add(this.barkGeos, barkMat, true);
    this.blobGeos = []; this.cardGeos = []; this.barkGeos = [];
    return this.group;
  }
}
