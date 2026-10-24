import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint, PAL } from './ghibli';

// Grass that moves in waves and parts around the cat, and flowers in the grass (ART-GUIDE 1.5).
// Instanced clumps of three curved blades, lit like the ground under them (up-facing normals),
// dark at the root and warm at the tip. A travelling gust band rolls across the meadow.

export interface Tuft { x: number; y: number; z: number; s: number; tint: number }
export interface Flower { x: number; y: number; z: number; color: string; s: number }

function bladeClump() {
  const parts: THREE.BufferGeometry[] = [];
  for (let b = 0; b < 5; b++) {
    const g = new THREE.PlaneGeometry(0.1, 1, 1, 4);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + 0.5; // 0..1
      const w = 1 - y * 0.92;
      pos.setXYZ(i, pos.getX(i) * w, y, y * y * 0.18); // taper and curve forward
    }
    const ang = (b / 5) * Math.PI * 2 + 0.3;
    g.rotateY(ang + 1.2);
    g.translate(Math.cos(ang) * 0.06, 0, Math.sin(ang) * 0.06);
    g.scale(1, 0.7 + ((b * 7) % 5) * 0.08, 1);
    parts.push(g);
  }
  const g = mergeGeometries(parts)!;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const root = new THREE.Color(PAL.grassRoot), mid = new THREE.Color(PAL.grassMid), tip = new THREE.Color(PAL.grassTip);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    nrm.setXYZ(i, 0, 1, 0);
    const y = pos.getY(i);
    if (y < 0.5) c.copy(root).lerp(mid, y / 0.5); else c.copy(mid).lerp(tip, (y - 0.5) / 0.5);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

const WIND_PARS = /* glsl */ `vec3 wOff;`;
const WIND_VERTEX = (amp: number) => /* glsl */ `
  {
    float hgt = clamp(position.y, 0.0, 1.0);
    vec2 wp = wpos0.xz;
    float gp = fract((dot(wp, uWindDir) - uTime * 4.0) / 18.0);
    float gust = smoothstep(0.0, 0.25, gp) * smoothstep(0.55, 0.3, gp) * (0.25 + 0.75 * uGust);
    float sway = sin(uTime * 1.3 + wp.x * 0.6 + wp.y * 0.35) * 0.5 + sin(uTime * 2.1 + wp.x * 1.7 - wp.y * 1.1) * 0.25;
    vec2 bend = uWindDir * (gust * 0.55 + 0.08) + vec2(sway, sway * 0.6) * 0.12;
    vec2 d = wp - uPlayer.xz; float dist = length(d);
    float push = max(0.0, 1.0 - dist / 0.5) * step(abs(wpos0.y - uPlayer.y), 0.7);
    bend += (d / max(dist, 1e-3)) * push * 0.9;
    float k = hgt * hgt;
    float scaleY = length(vec3(instanceMatrix[1]));
    wOff = vec3(bend.x, 0.0, bend.y) * k * scaleY * ${amp.toFixed(2)};
    wOff.y = -length(bend) * k * scaleY * 0.25 * ${amp.toFixed(2)};
  }
`;

function windMaterial(mat: THREE.MeshLambertMaterial, amp: number) {
  paint(mat, { vertex: WIND_VERTEX(amp), vertexPars: WIND_PARS });
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      mvPosition.xyz += wOff;
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.customProgramCacheKey = () => 'wind' + amp;
  return mat;
}

export class Meadow {
  group = new THREE.Group();

  grass(tufts: Tuft[]) {
    const geo = bladeClump();
    const mat = windMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 1);
    const mesh = new THREE.InstancedMesh(geo, mat, tufts.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    const warm = new THREE.Color('#E8E0A0'), cool = new THREE.Color('#9FB7A0');
    tufts.forEach((t, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(i * 12.9898) * 43758.5453 % (Math.PI * 2));
      m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s * 1.1, t.s, t.s * 1.1));
      mesh.setMatrixAt(i, m);
      c.setRGB(1, 1, 1);
      if (t.tint > 0) c.lerp(warm, t.tint * 0.35); else c.lerp(cool, -t.tint * 0.35);
      mesh.setColorAt(i, c);
    });
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  }

  flowers(list: Flower[]) {
    if (!list.length) return;
    const stemG = new THREE.CylinderGeometry(0.006, 0.008, 1, 4, 2).translate(0, 0.5, 0);
    const headG = mergeGeometries([
      // heads are drawn in metres across but in stem lengths up (an average stem is 0.35 m)
      new THREE.IcosahedronGeometry(0.045, 0).scale(1, 0.45 / 0.35, 1).translate(0, 1.0, 0),
      new THREE.IcosahedronGeometry(0.018, 0).scale(1, 1 / 0.35, 1).translate(0, 1.06, 0),
    ].map((g) => g.toNonIndexed()))!;
    // the flower centre: a warm dot
    const hc = new Float32Array(headG.getAttribute('position').count * 3);
    const n0 = new THREE.IcosahedronGeometry(0.045, 0).toNonIndexed().getAttribute('position').count;
    for (let i = 0; i < hc.length / 3; i++) { const centre = i >= n0; hc[i * 3] = 1; hc[i * 3 + 1] = centre ? 0.8 : 1; hc[i * 3 + 2] = centre ? 0.35 : 1; }
    headG.setAttribute('color', new THREE.BufferAttribute(hc, 3));
    const stemMat = windMaterial(new THREE.MeshLambertMaterial({ color: PAL.grassMid }), 1.4);
    const headMat = windMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), 1.4);
    const stems = new THREE.InstancedMesh(stemG, stemMat, list.length);
    const heads = new THREE.InstancedMesh(headG, headMat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    list.forEach((f, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 2.4);
      m.compose(new THREE.Vector3(f.x, f.y, f.z), q, new THREE.Vector3(1, f.s, 1));
      stems.setMatrixAt(i, m); heads.setMatrixAt(i, m);
      heads.setColorAt(i, new THREE.Color(f.color));
    });
    stems.receiveShadow = heads.receiveShadow = true;
    stems.frustumCulled = heads.frustumCulled = false;
    this.group.add(stems, heads);
  }
}
