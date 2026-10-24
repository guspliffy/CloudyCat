import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Static decor is built from many small primitives, then merged by material so the scene stays
// a few hundred draw calls even with lots of detail. Animated parts stay separate meshes.

export class Kit {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private tmpObj = new THREE.Object3D();

  /** Add a geometry with a transform. Returns nothing: it is baked. */
  add(geo: THREE.BufferGeometry, mat: THREE.Material, pos: THREE.Vector3Like, rot: THREE.Euler | [number, number, number] = [0, 0, 0], scale: number | [number, number, number] = 1) {
    const o = this.tmpObj;
    o.position.set(pos.x, pos.y, pos.z);
    if (Array.isArray(rot)) o.rotation.set(rot[0], rot[1], rot[2]); else o.rotation.copy(rot);
    if (typeof scale === 'number') o.scale.setScalar(scale); else o.scale.set(scale[0], scale[1], scale[2]);
    o.updateMatrix();
    this.addMatrix(geo, mat, o.matrix);
  }

  addMatrix(geo: THREE.BufferGeometry, mat: THREE.Material, m: THREE.Matrix4) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m);
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    g.morphAttributes = {};
    let list = this.parts.get(mat);
    if (!list) { list = []; this.parts.set(mat, list); }
    list.push(g);
  }

  /** Bake an Object3D tree (meshes only) into the kit, keeping world transforms. */
  addObject(o: THREE.Object3D) {
    o.updateMatrixWorld(true);
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh && !Array.isArray(m.material)) this.addMatrix(m.geometry, m.material, m.matrixWorld);
    });
  }

  build(shadows = true) {
    const group = new THREE.Group();
    for (const [mat, list] of this.parts) {
      const g = mergeGeometries(list, false);
      list.forEach((x) => x.dispose());
      if (!g) continue;
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = shadows; mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}

export const G = {
  box: (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d),
  cyl: (r0: number, r1: number, h: number, seg = 14) => new THREE.CylinderGeometry(r1, r0, h, seg),
  sph: (r: number, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h),
  ico: (r: number, d = 1) => new THREE.IcosahedronGeometry(r, d),
  torus: (r: number, t: number, rs = 8, ts = 18) => new THREE.TorusGeometry(r, t, rs, ts),
  cone: (r: number, h: number, seg = 12) => new THREE.ConeGeometry(r, h, seg),
  /** A gable roof prism along X: width w (x), depth d (z), height h. */
  gable: (w: number, d: number, h: number) => {
    const s = new THREE.Shape();
    s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.lineTo(-d / 2, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
    g.translate(0, 0, -w / 2); g.rotateY(Math.PI / 2);
    return g;
  },
};
