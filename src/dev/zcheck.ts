import * as THREE from 'three';

// Dev only (?zcheck): finds faces from different props that lie in the same plane and overlap,
// which flicker on screen (z-fighting). Kit records every part while ?zcheck is on.

export interface Part { id: number; mat: string; pos: Float32Array }
export const parts: Part[] = [];

export function record(g: THREE.BufferGeometry, mat: THREE.Material) {
  parts.push({ id: parts.length, mat: (mat as any).color?.getHexString?.() ?? mat.type, pos: (g.getAttribute('position').array as Float32Array).slice() });
}

export function report(maxOut = 60) {
  type Tri = { part: number; n: THREE.Vector3; d: number; a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; area: number };
  const buckets = new Map<string, Tri[]>();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (const p of parts) {
    for (let i = 0; i + 8 < p.pos.length; i += 9) {
      const a = new THREE.Vector3(p.pos[i], p.pos[i + 1], p.pos[i + 2]), b = new THREE.Vector3(p.pos[i + 3], p.pos[i + 4], p.pos[i + 5]), c = new THREE.Vector3(p.pos[i + 6], p.pos[i + 7], p.pos[i + 8]);
      const n = e1.subVectors(b, a).cross(e2.subVectors(c, a));
      const area = n.length() / 2;
      if (area < 0.002) continue;
      n.normalize();
      if (n.y < -0.9) continue; // undersides sit on the ground and are never seen
      const t: Tri = { part: p.id, n: n.clone(), d: n.dot(a), a, b, c, area };
      const key = `${Math.round(n.x * 30)},${Math.round(n.y * 30)},${Math.round(n.z * 30)},${Math.round(t.d * 40)}`;
      let l = buckets.get(key); if (!l) buckets.set(key, (l = [])); l.push(t);
    }
  }
  const hits = new Map<string, { at: THREE.Vector3; area: number; mats: string }>();
  const inside = (p: THREE.Vector3, t: Tri) => {
    const bary = new THREE.Vector3();
    THREE.Triangle.getBarycoord(p, t.a, t.b, t.c, bary);
    return bary.x > 0.02 && bary.y > 0.02 && bary.z > 0.02;
  };
  for (const [key, list] of buckets) {
    const [nx, ny, nz, dk] = key.split(',').map(Number);
    const near = [...list, ...(buckets.get(`${nx},${ny},${nz},${dk + 1}`) ?? [])];
    for (let i = 0; i < list.length; i++) for (let j = 0; j < near.length; j++) {
      const A = list[i], B = near[j];
      if (A.part === B.part || A === B) continue;
      if (Math.abs(A.d - B.d) > 0.006 || A.n.dot(B.n) < 0.999) continue;
      // overlap: a point of one strictly inside the other (centroid or a vertex pulled toward the centroid)
      const cA = A.a.clone().add(A.b).add(A.c).divideScalar(3);
      const pts = [cA, A.a.clone().lerp(cA, 0.2), A.b.clone().lerp(cA, 0.2), A.c.clone().lerp(cA, 0.2)];
      if (!pts.some((p) => inside(p.clone().addScaledVector(B.n, B.d - B.n.dot(p)), B))) continue;
      const k = [Math.min(A.part, B.part), Math.max(A.part, B.part)].join('-');
      const h = hits.get(k);
      if (h) h.area += A.area; else hits.set(k, { at: cA, area: A.area, mats: parts[A.part].mat + '/' + parts[B.part].mat });
    }
  }
  return [...hits.values()].sort((a, b) => b.area - a.area).slice(0, maxOut)
    .map((h) => `${h.at.toArray().map((v) => v.toFixed(2)).join(',')} area ${h.area.toFixed(3)} ${h.mats}`);
}
