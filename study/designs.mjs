// Fable's three directions. Head radius = 1, sitting, facing +Z, ground y = 0.
const mirror = (o) => [o, { ...o, c: o.c ? [-o.c[0], o.c[1], o.c[2]] : undefined, a: o.a ? [-o.a[0], o.a[1], o.a[2]] : undefined, b: o.b ? [-o.b[0], o.b[1], o.b[2]] : undefined, ear: o.ear ? (o.ear === 'R' ? 'L' : 'R') : undefined }];
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const dumpling = {
  id: 'dumpling', name: 'Dumpling',
  pitch: 'A round little cloud kitten: big soft lobes, a cloud collar, a plume tail.',
  headPivot: [0, 2.55, 0.25], headBlend: 0.3,
  headPrims: [
    { t: 'sph', c: [0, 2.55, 0.25], r: 1.0 },
    { t: 'sph', c: [-0.72, 2.30, 0.45], r: 0.50, k: 0.35 },
    { t: 'sph', c: [0.74, 2.28, 0.45], r: 0.54, k: 0.35 },
    { t: 'ell', c: [0, 2.30, 1.00], r: [0.45, 0.32, 0.35], k: 0.25 },
    { t: 'cone', a: [-0.58, 3.20, 0.10], b: [-0.90, 4.00, 0.00], r1: 0.38, r2: 0.09, k: 0.2, ear: 'L' },
    { t: 'cone', a: [0.58, 3.20, 0.10], b: [0.80, 4.05, -0.05], r1: 0.38, r2: 0.09, k: 0.2, ear: 'R' },
  ],
  bodyPrims: [
    { t: 'ell', c: [0, 1.15, -0.15], r: [1.05, 1.15, 1.00] },
    { t: 'sph', c: [0, 1.90, 0.75], r: 0.45, k: 0.45 },
    ...mirror({ t: 'sph', c: [0.55, 1.95, 0.60], r: 0.42, k: 0.45 }),
    ...mirror({ t: 'sph', c: [0.95, 2.10, 0.30], r: 0.38, k: 0.45 }),
    ...mirror({ t: 'ell', c: [0.85, 0.65, -0.10], r: [0.55, 0.60, 0.70], k: 0.4 }),
    ...mirror({ t: 'cap', a: [0.40, 1.30, 0.55], b: [0.40, 0.30, 0.70], r: 0.26, k: 0.3, calm: true }),
    ...mirror({ t: 'ell', c: [0.42, 0.28, 0.80], r: [0.34, 0.26, 0.40], k: 0.25, calm: true }),
  ].map(clean),
  tail: { k: 0.35, pts: [[0.30, 0.55, -0.90, 0.32], [0.85, 0.45, -0.75, 0.34], [1.30, 0.40, -0.30, 0.36], [1.45, 0.40, 0.25, 0.38], [1.30, 0.45, 0.75, 0.40], [0.90, 0.50, 1.00, 0.42], [0.55, 0.65, 1.05, 0.38], [0.35, 0.90, 0.95, 0.28]] },
  eyes: { c: [[-0.40, 2.62, 1.02], [0.40, 2.62, 1.02]], r: 0.34, fwd: [0.32, 0.04, 1], irisR: 0.8, pupilW: 0.38, pupilH: 0.72, lidRest: 0.9,
    catch: [[-0.42, 0.50, 0.30], [0.50, -0.42, 0.14]] },
  nose: { c: [0, 2.38, 1.33], r: [0.10, 0.07, 0.06] },
  faceCenter: [0, 2.45, 1.0], faceRadius: 1.15,
  noise: { scale: 0.95, octaves: 1, shell: 0.3, blend: 0.8, inflate: 0.1, faceAmp: 0.1, earAmp: 0.2, calmAmp: 0.25, fluff: 0.05, fluffScale: 6.5 },
  colors: { base: '#3B3550', shadow: '#221E33', rim: '#E8C6A6', glow: '#6F5B8A', irisInner: '#FFE3A3', irisOuter: '#FFB15E', pupil: '#1A1226', nose: '#B97A7A' },
  target: [0, 1.95, 0.2], petCenter: [0, 2.0, 0.3], petRadius: 1.7, wispCrown: [0, 3.5, 0.1],
};

const lantern = {
  id: 'lantern', name: 'Lantern',
  pitch: 'A slimmer dusk-cloud cat whose thin edges glow like a paper lantern.',
  headPivot: [0, 2.95, 0.2], headBlend: 0.28,
  headPrims: [
    { t: 'sph', c: [0, 2.95, 0.2], r: 0.92 },
    ...mirror({ t: 'sph', c: [0.6, 2.75, 0.4], r: 0.38, k: 0.3 }),
    { t: 'ell', c: [0, 2.72, 0.92], r: [0.36, 0.26, 0.30], k: 0.22 },
    { t: 'cone', a: [-0.5, 3.6, 0.05], b: [-0.85, 4.65, -0.1], r1: 0.30, r2: 0.05, k: 0.18, ear: 'L' },
    { t: 'cone', a: [0.5, 3.6, 0.05], b: [0.8, 4.6, -0.12], r1: 0.30, r2: 0.05, k: 0.18, ear: 'R' },
  ].map(clean),
  bodyPrims: [
    { t: 'ell', c: [0, 1.35, -0.25], r: [0.85, 1.35, 0.95], k: 0.4 },
    { t: 'ell', c: [0, 2.15, 0.55], r: [0.6, 0.5, 0.4], k: 0.4 },
    ...mirror({ t: 'ell', c: [0.65, 0.7, -0.25], r: [0.45, 0.6, 0.65], k: 0.35 }),
    ...mirror({ t: 'cap', a: [0.33, 1.6, 0.5], b: [0.33, 0.22, 0.65], r: 0.19, k: 0.25 }),
    ...mirror({ t: 'ell', c: [0.34, 0.16, 0.75], r: [0.24, 0.16, 0.30], k: 0.2, calm: true }),
  ].map(clean),
  tail: { k: 0.3, pts: [[0.3, 0.4, -1.0, 0.2], [0.9, 0.35, -1.1, 0.19], [1.5, 0.5, -0.8, 0.17], [1.8, 0.9, -0.3, 0.15], [1.85, 1.5, 0.1, 0.13], [1.6, 2.0, 0.3, 0.11], [1.3, 2.25, 0.25, 0.08]] },
  eyes: { c: [[-0.36, 3.02, 0.98], [0.36, 3.02, 0.98]], r: 0.25, fwd: [0.35, 0.05, 1], irisR: 0.8, pupilW: 0.18, pupilH: 0.8, lidRest: 0.5,
    catch: [[-0.35, 0.45, 0.2]] },
  nose: { c: [0, 2.78, 1.2], r: [0.08, 0.055, 0.05] },
  faceCenter: [0, 2.9, 0.9], faceRadius: 0.8,
  noise: { scale: 1.55, octaves: 1, shell: 0.25, blend: 0.65, inflate: 0.08, faceAmp: 0.15, earAmp: 0.5, calmAmp: 0.3, fluff: 0.035, fluffScale: 8.0 },
  colors: { base: '#2E2A45', shadow: '#1A1730', rim: '#FFD9A0', glow: '#9A6A6A', irisInner: '#F7B85A', irisOuter: '#B86A1F', pupil: '#1A1226', nose: '#9C6B70' },
  target: [0, 2.2, 0.2], petCenter: [0, 2.3, 0.2], petRadius: 1.9, wispCrown: [0.82, 4.6, -0.1],
};

const stormling = {
  id: 'stormling', name: 'Stormling',
  pitch: 'A sturdy little storm cloud with a silver lining and a big rolling tail.',
  headPivot: [0, 2.45, 0.2], headBlend: 0.32,
  headPrims: [
    { t: 'sph', c: [0, 2.45, 0.2], r: 1.0 },
    ...mirror({ t: 'sph', c: [0.75, 2.2, 0.35], r: 0.5, k: 0.35 }),
    { t: 'ell', c: [0, 2.2, 0.95], r: [0.48, 0.30, 0.35], k: 0.25 },
    ...mirror({ t: 'ell', c: [0.42, 2.98, 0.82], r: [0.42, 0.2, 0.28], k: 0.2 }),
    { t: 'cone', a: [-0.8, 3.1, 0.0], b: [-1.15, 3.62, -0.05], r1: 0.30, r2: 0.08, k: 0.18, ear: 'L' },
    { t: 'cone', a: [0.8, 3.1, 0.0], b: [1.12, 3.66, -0.05], r1: 0.30, r2: 0.08, k: 0.18, ear: 'R' },
  ].map(clean),
  bodyPrims: [
    { t: 'ell', c: [0, 1.05, -0.15], r: [1.2, 1.05, 1.05] },
    { t: 'ell', c: [0, 1.85, 0.55], r: [1.1, 0.45, 0.6], k: 0.45 },
    { t: 'ell', c: [0, 1.5, 0.4], r: [1.15, 0.4, 0.7], k: 0.45 },
    ...mirror({ t: 'ell', c: [0.95, 0.6, -0.1], r: [0.6, 0.55, 0.75], k: 0.4 }),
    ...mirror({ t: 'cap', a: [0.5, 1.2, 0.6], b: [0.5, 0.3, 0.75], r: 0.3, k: 0.3 }),
    ...mirror({ t: 'ell', c: [0.5, 0.3, 0.9], r: [0.42, 0.3, 0.45], k: 0.25, calm: true }),
  ].map(clean),
  tail: { k: 0.4, pts: [[0.4, 0.5, -0.95, 0.4], [1.0, 0.5, -0.85, 0.45], [1.5, 0.55, -0.35, 0.48], [1.6, 0.6, 0.3, 0.5], [1.35, 0.65, 0.85, 0.48], [0.95, 0.8, 1.15, 0.42], [0.7, 1.1, 1.2, 0.32]] },
  eyes: { c: [[-0.4, 2.55, 1.0], [0.4, 2.55, 1.0]], r: 0.28, fwd: [0.28, 0, 1], irisR: 0.8, pupilW: 0.5, pupilH: 0.56, lidRest: 0.55,
    catch: [[-0.4, 0.45, 0.3], [0.45, -0.35, 0.13]] },
  nose: { c: [0, 2.28, 1.3], r: [0.1, 0.07, 0.06] },
  faceCenter: [0, 2.45, 1.0], faceRadius: 0.9,
  noise: { scale: 1.2, octaves: 1, shell: 0.3, blend: 0.75, inflate: 0.12, faceAmp: 0.15, earAmp: 0.25, calmAmp: 0.3, fluff: 0.05, fluffScale: 5.5 },
  colors: { base: '#363B4A', shadow: '#1F2230', rim: '#D9E2EA', glow: '#7A6B8F', irisInner: '#FFE7B5', irisOuter: '#FFC978', pupil: '#1A1226', nose: '#8E8399' },
  target: [0, 1.9, 0.2], petCenter: [0, 1.9, 0.3], petRadius: 1.8, wispCrown: [0, 3.4, 0.1],
};

function bound(D) {
  const pts = [];
  for (const p of [...D.headPrims, ...D.bodyPrims]) {
    const r = p.r !== undefined ? (Array.isArray(p.r) ? Math.max(...p.r) : p.r) : Math.max(p.r1 ?? 0, p.r2 ?? 0);
    for (const c of [p.c, p.a, p.b].filter(Boolean)) pts.push([c, r]);
  }
  for (const t of D.tail.pts) pts.push([t.slice(0, 3), t[3] + 0.3]);
  const c = [0, 2.0, 0];
  let R = 0;
  for (const [p, r] of pts) R = Math.max(R, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) + r);
  return { c, r: R + 0.45 };
}
export const DESIGNS = [dumpling, lantern, stormling].map(D => ({ ...D, bound: bound(D) }));
