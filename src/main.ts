import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { T } from './tuning';
import { Input } from './input';
import { Sound } from './audio';
import { Cat, PALETTE } from './cat';
import { Level, glowTexture, heightAt } from './level';
import { Player } from './player';
import { FollowCamera } from './camera';
import { Particles } from './particles';
import { Sky } from './world/sky';
import { Ambient } from './world/ambient';
import { SHARED, PAL, setLightLevels, updateWind } from './world/ghibli';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);

type SeedState = 'hidden' | 'idle' | 'carried' | 'delivering' | 'placed';
interface Seed { home: THREE.Vector3; mesh: THREE.Group; glow: THREE.Sprite; state: SeedState; t: number; pos: THREE.Vector3 }

async function main() {
  await RAPIER.init();
  const app = document.getElementById('app')!;
  const touch = matchMedia('(pointer: coarse)').matches;
  const phone = touch || params.has('phone');
  const renderer = new THREE.WebGLRenderer({ antialias: !phone, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, phone ? 1.25 : 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  app.appendChild(renderer.domElement);

  // --- light: late morning, sun high over the court so the cat and the trees get warm rims ---
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PAL.fog, 24, 120);
  const sunDir = new THREE.Vector3(0.62, 0.78, -0.45).normalize();
  const sky = new Sky(sunDir, phone);
  scene.add(sky.group);
  const hemi = new THREE.HemisphereLight('#BFD9F2', '#9DAE66', 1.1);
  const sun = new THREE.DirectionalLight('#FFF1D2', 2.6);
  setLightLevels(sun.intensity, hemi.intensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 90 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  scene.add(hemi, sun, sun.target);

  // --- world ---
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const level = new Level(world, phone);
  level.build();
  scene.add(level.group);

  const player = new Player(world, level.anchors.start, -1, () => false, level.inWater,
    () => [...level.pots.filter((p) => !p.broken).map((p) => p.body), ...level.crates.map((c) => c.body)]);
  player.facing = Math.PI;

  const cat = new Cat();
  scene.add(cat.root, cat.world);
  cat.setLight(sunDir, new THREE.Color('#FFF1D2').multiplyScalar(2.2), new THREE.Color('#BFD9F2'));

  const camera = new FollowCamera(innerWidth / innerHeight, world, player.collider, level.camBlock);
  camera.soft = level.foliage.canopies;
  camera.cam.far = 1000; camera.cam.updateProjectionMatrix();
  camera.snap(player.pos, player.facing);
  const particles = new Particles();
  particles.setScale(innerHeight);
  scene.add(particles.points);
  const flowerSpots = [new THREE.Vector3(-3, 1.6, -8.4), new THREE.Vector3(3.6, 1.6, 6.4), new THREE.Vector3(-5, 0, -11), new THREE.Vector3(2.8, 0, -26),
    new THREE.Vector3(-8, 0.8, -13), new THREE.Vector3(6, 0, -11), new THREE.Vector3(-8.6, 1.6, 6), new THREE.Vector3(15, 0, -9.5)];
  const ambient = new Ambient(new THREE.Vector3(7.4, 6.6, 5.6), flowerSpots, phone, heightAt);
  ambient.setScale(innerHeight);
  scene.add(ambient.group);

  const input = new Input(renderer.domElement);
  if (touch) input.device = 'touch';
  const sound = new Sound();

  // --- seeds, spirit, keepsake ---
  const glowTex = glowTexture();
  const seeds: Seed[] = level.seeds.map((home, i) => {
    const mesh = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshBasicMaterial({ color: '#FFD08A' }));
    core.scale.set(1, 1.25, 1); mesh.add(core);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshLambertMaterial({ color: '#7FA05A' }));
    leaf.scale.set(1, 0.4, 1.8); leaf.position.set(0.04, 0.13, 0); leaf.rotation.z = -0.5; mesh.add(leaf);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.scale.setScalar(0.9); mesh.add(glow);
    mesh.position.copy(home); scene.add(mesh);
    const potSeed = level.pots.some((p) => p.seed === i);
    mesh.visible = !potSeed;
    return { home, mesh, glow, state: potSeed ? 'hidden' : 'idle', t: 0, pos: home.clone() };
  });
  // a pot that holds a seed glows through its clay so you can see where to go first
  const potWithSeed = level.pots.find((p) => p.seed !== null)!;
  const potGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.8 }));
  potGlow.scale.setScalar(1.2); scene.add(potGlow);
  // a soft warm column of light over where to go next, seen over hedges and walls
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, 7, 16, 1, true), new THREE.MeshBasicMaterial({
    map: beaconTexture(), color: '#FFC98A', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, opacity: 0.5,
  }));
  scene.add(beacon);
  const beaconAt = new THREE.Vector3();

  let carried: Seed | null = null;
  let spiritLevel = 0;
  let awake = false;
  let wakeT = 0;
  const fireflies = level.fireflies.map((p) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#FFF1B8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
    s.scale.setScalar(0.22); s.position.copy(p); scene.add(s); return s;
  });
  const bow = level.group.getObjectByName('keepsake')!;
  let keepsakeFound = false;

  // --- UI ---
  const coach = document.getElementById('coach')!;
  const coachLine = coach.querySelector('.line') as HTMLElement, coachKey = coach.querySelector('.key') as HTMLElement;
  const hud = document.getElementById('hud')!;
  const lampDots = [...hud.querySelectorAll('.lamps i')] as HTMLElement[];
  const banner = document.getElementById('banner')!;
  const startEl = document.getElementById('start')!;
  document.getElementById('controls-hint')!.textContent = touch
    ? 'Left thumb moves. Jump and Paw on the right. Drag to look.'
    : 'Move WASD · Jump Space · Paw E · Drag to look. Gamepad works too.';
  document.getElementById('touch')!.hidden = !touch;
  let started = false;
  let introT = -1;
  const INTRO = 6.0;
  const begin = () => {
    if (started) return; started = true;
    sound.start(); startEl.classList.add('gone');
    introT = params.has('nointro') ? INTRO : 0;
    if (introT === 0) setTimeout(() => showBanner('Bring three embers to the sleeping spirit.', 3800), 900);
  };
  document.getElementById('go')!.addEventListener('click', begin);
  input.onAny = () => { if (started) sound.start(); };
  addEventListener('keydown', (e) => { if (!started && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); begin(); } });

  function showBanner(text: string, ms: number) {
    banner.textContent = text; banner.hidden = false; banner.style.opacity = '1';
    setTimeout(() => { banner.style.opacity = '0'; setTimeout(() => (banner.hidden = true), 1000); }, ms);
  }
  function updateHud() {
    lampDots.forEach((d, i) => { d.classList.toggle('lit', i < spiritLevel); d.classList.toggle('next', i === spiritLevel && !awake); });
  }
  updateHud();

  // first-minute coach: one short line at a time, in the world, next to the thing it is about
  const movedFrom = level.anchors.start.clone();
  const steps = [
    { line: 'Follow the path.', key: () => input.glyph('move'), anchor: () => player.pos.clone().add(new THREE.Vector3(0, 1.0, 0)),
      show: () => introT >= INTRO, done: () => player.pos.distanceTo(movedFrom) > 2.5 },
    { line: 'Jump. Tap again up high.', key: () => input.glyph('jump'), anchor: () => level.anchors.wall,
      show: () => player.pos.distanceTo(level.anchors.wall) < 5, done: () => player.usedDouble || (player.grounded && player.pos.y > 2.3) },
    { line: 'Bap it.', key: () => input.glyph('paw'), anchor: () => potWithSeed.mesh.position.clone().add(new THREE.Vector3(0, 0.6, 0)),
      show: () => player.pos.distanceTo(potWithSeed.mesh.position) < 2.8, done: () => potWithSeed.broken },
    { line: 'Bring it to the spirit.', key: () => '', anchor: () => player.pos.clone().add(new THREE.Vector3(0, 1.1, 0)),
      show: () => carried !== null, done: () => spiritLevel > 0 || level.gate.opening },
    { line: 'Bap the gate open.', key: () => input.glyph('paw'), anchor: () => level.anchors.gate,
      show: () => player.pos.distanceTo(level.gate.centre) < 3.5, done: () => level.gate.opening },
  ];
  let stepIndex = 0;
  let coachShown = false;
  function updateCoach() {
    while (stepIndex < steps.length && steps[stepIndex].done()) stepIndex++;
    const s = steps[stepIndex];
    let visible = false;
    if (s && started && introT >= INTRO && s.show()) {
      const p = s.anchor().clone().project(camera.cam);
      if (p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1) {
        const x = THREE.MathUtils.clamp((p.x * 0.5 + 0.5) * innerWidth, 120, innerWidth - 120);
        const y = THREE.MathUtils.clamp((-p.y * 0.5 + 0.5) * innerHeight, 70, innerHeight - 140);
        coach.style.left = x + 'px'; coach.style.top = y + 'px';
        if (coachLine.textContent !== s.line) coachLine.textContent = s.line;
        const k = s.key(); if (coachKey.textContent !== k) coachKey.textContent = k;
        visible = true;
      }
    }
    if (visible !== coachShown) { coach.classList.toggle('show', visible); coachShown = visible; }
  }

  // --- dev panel: ?dev ---
  if (params.has('dev')) {
    const dev = document.getElementById('dev')!; dev.hidden = false;
    for (const k of Object.keys(T) as (keyof typeof T)[]) {
      const v = T[k]; const row = document.createElement('label');
      const max = v === 0 ? 1 : Math.abs(v) * 3;
      row.innerHTML = `<span>${k}</span><input type="range" min="0" max="${max}" step="${max / 300}" value="${v}"><output>${v}</output>`;
      const inp = row.querySelector('input')!, out = row.querySelector('output')!;
      inp.addEventListener('input', () => { (T as any)[k] = +inp.value; out.textContent = (+inp.value).toFixed(2); });
      dev.appendChild(row);
    }
  }

  const amber = new THREE.Color(PALETTE.irisOuter);
  const petalCol = new THREE.Color('#F2B7B0');
  const shardCol = new THREE.Color(PAL.clay);
  const tmp = new THREE.Vector3();

  function breakPot(p: typeof level.pots[number]) {
    p.broken = true;
    const at = p.mesh.position.clone();
    world.removeRigidBody(p.body);
    p.mesh.visible = false;
    for (let i = 0; i < 14; i++) particles.emit(at, new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3 + 1, (Math.random() - 0.5) * 3), 0.07, 1.2 + Math.random(), shardCol, 0.95, 1, 1.2);
    for (let i = 0; i < 10; i++) particles.emit(at, new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2 + 1, (Math.random() - 0.5) * 2), 0.09, 1.6 + Math.random(), petalCol, 0.9, 1, 1.5);
    sound.breakPot();
    if (p.seed !== null) {
      const s = seeds[p.seed];
      s.state = 'idle'; s.mesh.visible = true; s.home.copy(at).setY(Math.max(at.y, 0) + 0.35); s.pos.copy(s.home); s.t = 0;
      potGlow.visible = false;
    }
  }

  function brightSeed(): Seed | null {
    if (carried) return null;
    let best: Seed | null = null, bd = 1e9;
    for (const s of seeds) if (s.state === 'idle') { const d = s.pos.distanceTo(player.pos); if (d < bd) { bd = d; best = s; } }
    return best;
  }

  // --- intro shot: the goal first, then back over the garden to Moth ---
  const introKeys = [
    { t: 0, p: new THREE.Vector3(3.0, 1.9, -14.4), l: new THREE.Vector3(2, 1.25, -18.5) },
    { t: 2.8, p: new THREE.Vector3(4.6, 6.4, -5.4), l: new THREE.Vector3(1.5, 0.5, -17.5) },
  ];
  function introCamera(t: number, followPos: THREE.Vector3, followLook: THREE.Vector3) {
    const cam = camera.cam;
    const e = (x: number) => x * x * (3 - 2 * x);
    if (t < introKeys[1].t) {
      const k = e(t / introKeys[1].t);
      cam.position.lerpVectors(introKeys[0].p, introKeys[1].p, k);
      tmp.lerpVectors(introKeys[0].l, introKeys[1].l, k);
    } else {
      const k = e(Math.min(1, (t - introKeys[1].t) / (INTRO - introKeys[1].t)));
      cam.position.lerpVectors(introKeys[1].p, followPos, k);
      tmp.lerpVectors(introKeys[1].l, followLook, k);
    }
    cam.lookAt(tmp);
  }

  // --- loop ---
  let acc = 0, last = performance.now(), time = 0;
  const prevPos = player.pos.clone(), curPos = player.pos.clone();
  const lerpPos = new THREE.Vector3();
  let renderFacing = player.facing;
  let camOverride: { p: THREE.Vector3; t: THREE.Vector3; rel: boolean } | null = null;
  let gatePush = 0;
  let fps = 60;

  function frame(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; time += dt;
    fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    input.poll();
    const look = input.takeLook();
    if (!started) { input.takeJump(); input.takePaw(); }
    // any real input during the intro hurries it along
    if (introT >= 0 && introT < INTRO) {
      introT += dt;
      if ((Math.abs(input.moveX) + Math.abs(input.moveY) > 0.3 || input.jumpHeld || input.pawHeld) && introT < INTRO - 0.9) introT = INTRO - 0.9;
    }
    const inIntro = introT >= 0 && introT < INTRO;
    if (started && !inIntro && hud.hidden) hud.hidden = false;
    updateWind(dt);

    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      prevPos.copy(curPos);
      if (inIntro && introT < INTRO - 0.9) { input.takeJump(); input.takePaw(); }
      player.update(STEP, input, camera.yaw);
      world.step();
      curPos.copy(player.pos);
      for (const e of player.events) handleEvent(e);
      for (const p of level.pots) {
        if (p.broken) continue;
        const v = p.body.linvel(); const vv = new THREE.Vector3(v.x, v.y, v.z);
        const tr = p.body.translation();
        const moved = Math.hypot(tr.x - p.spawn.x, tr.y - p.spawn.y, tr.z - p.spawn.z);
        if ((vv.distanceTo(p.prevV) > 2.4 && moved > 0.3) || tr.y < -1) breakPot(p);
        p.prevV.copy(vv);
      }
      acc -= STEP; n++;
    }
    if (n === 5) acc = 0;
    lerpPos.lerpVectors(prevPos, curPos, acc / STEP);
    level.syncDynamics();
    level.update(time, dt);
    SHARED.uPlayer.value.copy(lerpPos);

    // the gate opens when bapped (see handleEvent) or when Moth leans on it for a moment
    if (!level.gate.opening) {
      const g = level.gate.centre;
      const near = Math.hypot(lerpPos.x - g.x, lerpPos.z - g.z) < 0.85 && Math.abs(lerpPos.y - (g.y - 0.5)) < 0.8;
      const pushing = Math.abs(input.moveX) + Math.abs(input.moveY) > 0.3;
      gatePush = near && pushing ? gatePush + dt : 0;
      if (gatePush > 0.5) openGate();
    }

    // cat
    let df = player.facing - renderFacing; df = Math.atan2(Math.sin(df), Math.cos(df)); renderFacing += df * Math.min(1, dt * 20);
    cat.root.position.copy(lerpPos);
    cat.root.rotation.y = renderFacing;
    cat.float = player.float01;
    const sp = Math.hypot(player.vel.x, player.vel.z) / T.runSpeed;
    cat.update(dt, sp, player.grounded || player.floating, player.vel);
    {
      const hit = world.castRay(new RAPIER.Ray({ x: lerpPos.x, y: lerpPos.y + 0.3, z: lerpPos.z }, { x: 0, y: -1, z: 0 }), 6, true, undefined, undefined, player.collider);
      const gy = hit ? lerpPos.y + 0.3 - hit.timeOfImpact : lerpPos.y;
      const h = Math.max(0, lerpPos.y - gy);
      cat.blob.position.set(lerpPos.x, gy + 0.015, lerpPos.z);
      cat.blob.scale.setScalar(1 + h * 0.4);
      (cat.blob.material as THREE.MeshBasicMaterial).opacity = 0.5 * Math.max(0, 1 - h / 3) * (1 - player.float01);
    }

    // seeds
    const bright = brightSeed();
    for (const s of seeds) {
      s.t += dt;
      if (s.state === 'idle') {
        s.pos.copy(s.home).add(new THREE.Vector3(0, Math.sin(s.t * 2) * 0.06, 0));
        const isBright = s === bright;
        s.glow.material.opacity = isBright ? 0.95 + Math.sin(s.t * 3) * 0.05 : 0.4;
        s.glow.scale.setScalar(isBright ? 1.2 + Math.sin(s.t * 3) * 0.12 : 0.7);
        if (player.pos.distanceTo(s.pos) < 0.95 && !carried && !player.floating) {
          s.state = 'carried'; carried = s; sound.pickup();
          particles.burst(s.pos.clone(), 10, 1.0, 0.08, amber, 0.9, 0.6);
        }
      } else if (s.state === 'carried') {
        s.pos.lerp(cat.carryAnchor.position, Math.min(1, dt * 10));
        s.glow.material.opacity = 0.85; s.glow.scale.setScalar(0.85);
        if (Math.random() < dt * 4) particles.emit(s.pos.clone(), new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.3, (Math.random() - 0.5) * 0.3), 0.04, 0.9, amber, 0.9, 0.5, 1.5);
        if (Math.hypot(player.pos.x - level.spirit.x, player.pos.z - level.spirit.z) < 2.5 && player.pos.y < 2.2) { s.state = 'delivering'; s.t = 0; carried = null; }
      } else if (s.state === 'delivering') {
        const k = Math.min(1, s.t / 0.9);
        const target = level.spirit.clone().add(new THREE.Vector3(0, 1.4, 0));
        s.pos.lerp(target, Math.min(1, dt * 5)); s.pos.y += Math.sin(k * Math.PI) * dt * 2;
        s.glow.scale.setScalar(0.8 + k * 0.8);
        if (k >= 1) { s.state = 'placed'; s.mesh.visible = false; placeSeed(); }
      }
      s.mesh.position.copy(s.pos);
    }
    if (potGlow.visible) {
      potGlow.position.copy(potWithSeed.mesh.position).add(new THREE.Vector3(0, 0.15, 0));
      potGlow.material.opacity = 0.55 + Math.sin(time * 3) * 0.15;
    }
    // the beacon: over the pot first, then the brightest seed, then the spirit while carrying
    {
      let want: THREE.Vector3 | null = null;
      if (awake) want = null;
      else if (carried) want = level.spirit.clone().add(new THREE.Vector3(0, 0.6, 0));
      else if (bright) want = bright.pos;
      else if (!potWithSeed.broken) want = potWithSeed.mesh.position;
      const m = beacon.material as THREE.MeshBasicMaterial;
      if (want) {
        beaconAt.lerp(want, beaconAt.lengthSq() ? Math.min(1, dt * 3) : 1);
        beacon.position.set(beaconAt.x, beaconAt.y + 3.4, beaconAt.z);
        // fade when close so it never sits in the cat's face
        const d = Math.hypot(lerpPos.x - beaconAt.x, lerpPos.z - beaconAt.z);
        m.opacity = THREE.MathUtils.damp(m.opacity, 0.42 * THREE.MathUtils.smoothstep(d, 1.5, 5), 3, dt);
      } else m.opacity = THREE.MathUtils.damp(m.opacity, 0, 2, dt);
      beacon.visible = m.opacity > 0.01;
    }

    // spirit: warmer with each seed, wakes with the last
    const glowCol = new THREE.Color('#5A3E2C').lerp(new THREE.Color('#FFC46B'), spiritLevel / 3);
    (level.spiritGlow.material as THREE.MeshBasicMaterial).color.copy(glowCol);
    level.spiritMesh.scale.set(1 + Math.sin(time * 1.2) * 0.012, 1 - Math.sin(time * 1.2) * 0.015 * (awake ? 2 : 1), 1 + Math.sin(time * 1.2) * 0.012);
    if (awake) {
      wakeT += dt;
      level.wheel.rotation.x -= dt * Math.min(1, wakeT * 0.3) * 0.9;
      level.spiritMesh.rotation.z = Math.sin(time * 2) * 0.04;
    } else level.spiritMesh.rotation.z = Math.sin(time * 0.6) * 0.015;
    level.lanterns.forEach((l, i) => { if (i < spiritLevel) l.halo.material.opacity = 0.75 + Math.sin(time * 2.3 + i) * 0.08; });

    // sparrows hop away when Moth comes close, and come back later
    for (const s of level.sparrows) {
      s.t += dt;
      if (!s.away && lerpPos.distanceTo(s.home) < 1.6) { s.away = true; s.t = 0; }
      if (s.away) {
        const k = s.t / 2.2;
        if (k < 1) s.obj.position.set(s.home.x + k * 4, s.home.y + Math.sin(k * Math.PI * 0.5) * 3, s.home.z - k * 3);
        else s.obj.visible = false;
        if (s.t > 10 && lerpPos.distanceTo(s.home) > 3) { s.away = false; s.obj.visible = true; s.obj.position.copy(s.home); }
      } else s.obj.position.y = s.home.y + Math.max(0, Math.sin(s.t * 5)) * 0.03 * (Math.sin(s.t * 0.7) > 0.6 ? 1 : 0);
    }

    // fireflies along the high route to the keepsake
    fireflies.forEach((f, i) => {
      const base = level.fireflies[i];
      f.position.set(base.x + Math.sin(time * 0.7 + i) * 0.15, base.y + Math.sin(time * 1.1 + i * 2) * 0.12, base.z + Math.cos(time * 0.6 + i) * 0.15);
      f.material.opacity = (0.35 + 0.3 * Math.sin(time * 2.3 + i * 1.7) ** 2) * (keepsakeFound ? 0.3 : 1);
    });
    if (!keepsakeFound) {
      bow.rotation.y += dt * 0.8; bow.position.y = level.keepsake.y + Math.sin(time * 2) * 0.05;
      if (player.pos.distanceTo(level.keepsake) < 0.8) {
        keepsakeFound = true; sound.keepsake();
        cat.tailTip.add(bow); bow.position.set(0, 0.03, 0); bow.rotation.set(0, 0, 0); bow.scale.setScalar(0.5);
        showBanner('A ribbon for Moth.', 2200);
      }
    }
    level.sunShafts.forEach((s, i) => {
      // fade out when the camera walks into a beam, so it never becomes a flat slab across the screen
      const near = THREE.MathUtils.smoothstep(s.position.distanceTo(camera.cam.position), 1.5, 4.5);
      (s.material as THREE.MeshBasicMaterial).opacity = ((i < 5 ? 0.16 : 0.12) + 0.05 * Math.sin(time * 0.8 + i) + SHARED.uGust.value * 0.03) * near;
    });

    particles.update(dt);
    if (camOverride) {
      const base = camOverride.rel ? lerpPos : new THREE.Vector3();
      camera.cam.position.copy(camOverride.p).add(base); camera.cam.lookAt(camOverride.t.clone().add(base));
    } else {
      camera.update(dt, lerpPos, player.vel, look);
      if (inIntro) {
        const fp = camera.cam.position.clone(), fl = lerpPos.clone().add(new THREE.Vector3(0, T.camHeight, 0));
        introCamera(introT, fp, fl);
      }
    }
    // shadows follow Moth in steps so they do not swim
    const snap = (v: number) => Math.round(v / 2) * 2;
    sun.target.position.set(snap(lerpPos.x), 0, snap(lerpPos.z - 4));
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 45);
    sky.update(dt, camera.cam);
    ambient.update(dt, time, camera.cam, sunDir, lerpPos);
    updateCoach();
    camera.cam.updateMatrixWorld();
    cat.renderSmoke(camera.cam, time);
    renderer.render(scene, camera.cam);
    requestAnimationFrame(frame);
  }

  function openGate() {
    if (level.gate.opening) return;
    level.openGate();
    sound.bap(true);
    particles.burst(level.gate.centre.clone(), 10, 1.2, 0.08, petalCol, 0.8, 0.5);
  }

  function placeSeed() {
    spiritLevel++;
    sound.deliver(spiritLevel - 1);
    updateHud();
    const lamp = level.lanterns[spiritLevel - 1];
    if (lamp) (lamp.glass.material as THREE.MeshBasicMaterial).color.set(PAL.emberCore);
    const top = level.spirit.clone().add(new THREE.Vector3(0, 1.6, 0));
    particles.burst(top, 14, 1.6, 0.14, amber, 0.8, 0.6);
    // the spirit breathes out a warm ring toward the next ember
    const next = seeds.find((s) => s.state === 'idle' || s.state === 'hidden');
    if (next && spiritLevel < 3) {
      const target = next.state === 'hidden' ? potWithSeed.mesh.position : next.pos;
      const dir = target.clone().sub(top).setY(0).normalize();
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(Math.cos(a) * 0.35).add(new THREE.Vector3(0, Math.sin(a) * 0.35, 0));
        particles.emit(top.clone().add(side), dir.clone().multiplyScalar(2.6).add(side.multiplyScalar(0.5)), 0.12, 2.3, amber, 0.7, 1.4, 0.25);
      }
    }
    if (spiritLevel >= 3 && !awake) {
      awake = true; wakeT = 0;
      level.spiritEyes.forEach((e) => (e.visible = false));
      level.spiritOpenEyes.forEach((e) => (e.visible = true));
      (level.gateLantern.glass.material as THREE.MeshBasicMaterial).color.set(PAL.emberCore);
      level.gateLantern.halo.material.opacity = 0.8;
      hud.querySelector('.goal')!.textContent = 'The mill is awake';
      setTimeout(() => { sound.wake(); showBanner('The mill wakes.', 3500); }, 700);
      for (let i = 0; i < 40; i++) particles.emit(top.clone(), new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 4, (Math.random() - 0.5) * 4), 0.1, 2.2, petalCol, 0.9, 1, 1);
    }
  }

  function handleEvent(e: (typeof player.events)[number]) {
    switch (e.type) {
      case 'jump': sound.jump(); cat.kick('jump'); break;
      case 'double': sound.doubleJump(); cat.kick('double'); break;
      case 'land': sound.land(e.strength); cat.kick('land', e.strength); break;
      case 'step': sound.step(level.surfaces.get(player.groundHandle) ?? 'grass'); break;
      case 'bap': {
        sound.bap(e.hit); cat.kick('bap');
        const g = level.gate.centre;
        if (!level.gate.opening && Math.hypot(player.pos.x - g.x, player.pos.z - g.z) < 1.5 && Math.abs(player.pos.y - (g.y - 0.5)) < 1) openGate();
        break;
      }
      case 'float': sound.floatBack(); break;
      case 'floatEnd': cat.kick('land', 0.3); break;
    }
  }

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.cam.aspect = innerWidth / innerHeight; camera.cam.updateProjectionMatrix();
    particles.setScale(innerHeight); ambient.setScale(innerHeight);
  });

  // test hooks for automated screenshots
  (window as any).__moth = {
    player, camera, begin, seeds, level, breakPot, cat, renderer,
    setYaw: (y: number) => (camera.yaw = y),
    skipIntro: () => (introT = INTRO),
    freeCam: (p: number[] | null, t?: number[], rel = false) => { camOverride = p ? { p: new THREE.Vector3(...p), t: new THREE.Vector3(...t!), rel } : null; },
    teleport: (x: number, y: number, z: number, facing: number) => {
      player.body.setTranslation({ x, y: y + 0.4, z }, true); player.pos.set(x, y, z); player.vel.set(0, 0, 0); player.facing = facing;
      prevPos.copy(player.pos); curPos.copy(player.pos);
    },
    state: () => ({ pos: player.pos.toArray().map((v) => +v.toFixed(2)), grounded: player.grounded, floating: player.floating,
      seeds: seeds.map((s) => s.state), spirit: spiritLevel, step: stepIndex, carried: !!carried, gate: level.gate.opening, fps: Math.round(fps),
      calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
  };
  if (params.has('autostart')) begin();
  requestAnimationFrame(frame);
}

function beaconTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128;
  const g = c.getContext('2d')!; const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.92, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

main().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<p style="position:fixed;inset:auto 16px 40% 16px;text-align:center;color:#fff">Moth could not start: ${String(e?.message ?? e)}</p>`);
  console.error(e);
});
