import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { T } from './tuning';
import { Input } from './input';
import { Sound } from './audio';
import { Cat, PALETTE, HU } from './cat';
import { Level } from './level';
import { Player } from './player';
import { FollowCamera } from './camera';
import { Particles } from './particles';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);

type SeedState = 'hidden' | 'idle' | 'carried' | 'delivering' | 'placed';
interface Seed { home: THREE.Vector3; mesh: THREE.Group; glow: THREE.Sprite; state: SeedState; t: number; pos: THREE.Vector3 }

async function main() {
  await RAPIER.init();
  const app = document.getElementById('app')!;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const touch = matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  app.appendChild(renderer.domElement);

  // --- scene: dawn over the mill terrace ---
  const scene = new THREE.Scene();
  const horizon = new THREE.Color('#F4D9B4');
  scene.fog = new THREE.Fog(horizon, 30, 95);
  const sunDir = new THREE.Vector3(0.55, 0.42, -0.62).normalize();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: sunDir }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vD; uniform vec3 uSun; uniform float uTime;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec3 d = normalize(vD);
        vec3 top = vec3(0.42, 0.58, 0.80), hor = vec3(0.98, 0.86, 0.68);
        vec3 c = mix(hor, top, pow(clamp(d.y * 1.5 + 0.02, 0.0, 1.0), 0.65));
        float s = max(dot(d, uSun), 0.0);
        c += vec3(1.0, 0.85, 0.6) * (pow(s, 6.0) * 0.35 + pow(s, 400.0) * 2.0);
        vec2 cp = d.xz / (d.y + 0.2) * 1.2 + vec2(uTime * 0.004, 0.0);
        float cl = smoothstep(0.55, 0.82, n(cp * 1.4) * 0.6 + n(cp * 3.3) * 0.4) * smoothstep(0.03, 0.22, d.y) * (1.0 - smoothstep(0.55, 0.95, d.y));
        vec3 cloudCol = mix(vec3(1.0, 0.93, 0.85), vec3(1.0, 0.98, 0.95), pow(s, 2.0));
        c = mix(c, cloudCol, cl * 0.8);
        gl_FragColor = vec4(pow(c, vec3(2.2)), 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  scene.add(sky);
  const hemi = new THREE.HemisphereLight('#C9DCEC', '#8E9C5C', 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#FFDDB2', 2.4);
  sun.position.copy(sunDir).multiplyScalar(40).add(new THREE.Vector3(2, 0, -9));
  sun.target.position.set(2, 0, -9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 100 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // --- physics and level ---
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const level = new Level(world);
  level.build();
  scene.add(level.group);

  const nearGate = (p: THREE.Vector3) => Math.abs(p.x) < 1.25 && p.z > -11.4 && p.z < -8.7 && p.y < 2.5;
  const inWater = (p: THREE.Vector3) => p.x > 9.05 && p.x < 13 && p.y < -0.15;
  const player = new Player(world, level.anchors.start, level.gateHandle, nearGate, inWater,
    () => [...level.pots.filter((p) => !p.broken).map((p) => p.body), ...level.crates.map((c) => c.body)]);
  player.facing = Math.PI;

  const cat = new Cat();
  scene.add(cat.root);
  cat.setLight(sunDir, new THREE.Color(1.0, 0.86, 0.68).multiplyScalar(2.0), new THREE.Color(0.6, 0.7, 0.88), new THREE.Color(0.5, 0.58, 0.34));

  const camera = new FollowCamera(innerWidth / innerHeight, world, player.collider, level.camBlock);
  camera.snap(player.pos, player.facing);
  const particles = new Particles();
  particles.setScale(innerHeight);
  scene.add(particles.points);

  const input = new Input(renderer.domElement);
  if (touch) input.device = 'touch';
  const sound = new Sound();

  // --- seeds, spirit, keepsake ---
  const amber = new THREE.Color(PALETTE.irisOuter);
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!; const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,230,170,1)'); gr.addColorStop(0.3, 'rgba(255,190,100,0.55)'); gr.addColorStop(1, 'rgba(255,170,80,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const seeds: Seed[] = level.seeds.map((home, i) => {
    const mesh = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshBasicMaterial({ color: '#FFD08A' }));
    core.scale.set(1, 1.25, 1); mesh.add(core);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshLambertMaterial({ color: '#7FA05A' }));
    leaf.scale.set(1, 0.4, 1.8); leaf.position.set(0.04, 0.13, 0); leaf.rotation.z = -0.5; mesh.add(leaf);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.scale.setScalar(0.9); mesh.add(glow);
    mesh.position.copy(home); scene.add(mesh);
    const potSeed = level.pots.some((p) => p.seed === i);
    mesh.visible = !potSeed;
    return { home, mesh, glow, state: potSeed ? 'hidden' : 'idle', t: 0, pos: home.clone() };
  });
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
  const hud = document.getElementById('hud')!, hudCount = hud.querySelector('.count') as HTMLElement;
  const banner = document.getElementById('banner')!;
  const startEl = document.getElementById('start')!;
  document.getElementById('controls-hint')!.textContent = touch
    ? 'Left thumb moves. Jump and Paw on the right. Drag to look.'
    : 'Move WASD · Jump Space · Paw E, hold for smoke · Drag to look. Gamepad works too.';
  document.getElementById('touch')!.hidden = !touch;
  let started = false;
  const begin = () => {
    if (started) return; started = true;
    sound.start(); startEl.classList.add('gone');
  };
  document.getElementById('go')!.addEventListener('click', begin);
  input.onAny = () => { if (started) sound.start(); };
  addEventListener('keydown', (e) => { if (!started && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); begin(); } });

  function showBanner(text: string, ms: number) {
    banner.textContent = text; banner.hidden = false; banner.style.opacity = '1';
    setTimeout(() => { banner.style.opacity = '0'; setTimeout(() => (banner.hidden = true), 1000); }, ms);
  }

  // first-minute coach: one line at a time, in the world, next to the thing
  const potWithSeed = level.pots.find((p) => p.seed !== null)!;
  let movedFrom = level.anchors.start.clone();
  let throughGate = false;
  const steps = [
    { line: 'Stretch. Then wander.', key: () => input.glyph('move'), anchor: () => player.pos.clone().add(new THREE.Vector3(0, 1.0, 0)),
      show: () => true, done: () => player.pos.distanceTo(movedFrom) > 2.2 },
    { line: 'Jump. Tap again up high.', key: () => input.glyph('jump'), anchor: () => level.anchors.wall,
      show: () => player.pos.distanceTo(level.anchors.wall) < 5.5, done: () => player.usedDouble || (player.grounded && player.pos.y > 0.8 && Math.abs(player.pos.z + 4) < 0.6) },
    { line: 'Bap it.', key: () => input.glyph('paw'), anchor: () => potWithSeed.mesh.position.clone().add(new THREE.Vector3(0, 0.6, 0)),
      show: () => player.pos.distanceTo(potWithSeed.mesh.position) < 2.6, done: () => potWithSeed.broken },
    { line: 'Breathe through the sun.', key: () => 'Hold ' + input.glyph('paw'), anchor: () => level.anchors.gate,
      show: () => player.pos.distanceTo(level.anchors.gate) < 4.5 && carried !== null, done: () => throughGate },
  ];
  let stepIndex = 0;
  let coachShown = false;

  function updateCoach() {
    while (stepIndex < steps.length && steps[stepIndex].done()) { stepIndex++; }
    const s = steps[stepIndex];
    let visible = false;
    if (s && started && s.show()) {
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

  // --- helpers for effects ---
  const wispCol = new THREE.Color(PALETTE.base).multiplyScalar(1.4);
  const thinCol = new THREE.Color(PALETTE.thin);
  const petalCol = new THREE.Color('#F2B7B0');
  const tmp = new THREE.Vector3();
  let wispAcc = 0;

  function breakPot(p: typeof level.pots[number]) {
    p.broken = true;
    const at = p.mesh.position.clone();
    world.removeRigidBody(p.body);
    p.mesh.visible = false;
    for (let i = 0; i < 18; i++) {
      particles.emit(at, new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3 + 1, (Math.random() - 0.5) * 3), 0.09, 1.4 + Math.random(), petalCol, 0.95, 1, 1.2);
    }
    sound.breakPot();
    if (p.seed !== null) {
      const s = seeds[p.seed];
      s.state = 'idle'; s.mesh.visible = true; s.home.copy(at).setY(Math.max(at.y, 0) + 0.35); s.pos.copy(s.home); s.t = 0;
    }
  }

  function brightSeed(): Seed | null {
    if (carried) return null;
    let best: Seed | null = null, bd = 1e9;
    for (const s of seeds) if (s.state === 'idle') { const d = s.pos.distanceTo(player.pos); if (d < bd) { bd = d; best = s; } }
    return best;
  }

  // --- loop ---
  let acc = 0, last = performance.now(), time = 0;
  const prevPos = player.pos.clone(), curPos = player.pos.clone();
  const lerpPos = new THREE.Vector3();
  let renderFacing = player.facing;

  let fps = 60;
  function frame(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; time += dt;
    fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    input.poll();
    const look = input.takeLook();
    if (!started) { input.takeJump(); input.takePaw(); }

    acc += dt;
    let steps_ = 0;
    while (acc >= STEP && steps_ < 5) {
      prevPos.copy(curPos);
      player.update(STEP, input, camera.yaw);
      world.step();
      curPos.copy(player.pos);
      for (const e of player.events) handleEvent(e);
      // pots break when they land hard away from where they stood
      for (const p of level.pots) {
        if (p.broken) continue;
        const v = p.body.linvel(); const vv = new THREE.Vector3(v.x, v.y, v.z);
        const t = p.body.translation();
        const moved = Math.hypot(t.x - p.spawn.x, t.y - p.spawn.y, t.z - p.spawn.z);
        if ((vv.distanceTo(p.prevV) > 2.4 && moved > 0.3) || t.y < -1) breakPot(p);
        p.prevV.copy(vv);
      }
      acc -= STEP; steps_++;
    }
    if (steps_ === 5) acc = 0;
    const alpha = acc / STEP;
    lerpPos.lerpVectors(prevPos, curPos, alpha);
    level.syncDynamics();

    // cat visual
    let df = player.facing - renderFacing; df = Math.atan2(Math.sin(df), Math.cos(df)); renderFacing += df * Math.min(1, dt * 20);
    cat.root.position.copy(lerpPos);
    cat.root.rotation.y = renderFacing;
    cat.thin = player.thin01; cat.float = player.float01;
    const sp = Math.hypot(player.vel.x, player.vel.z) / T.runSpeed;
    cat.update(dt, sp, player.grounded || player.floating, player.vel.y);
    if (player.thinning) throughGate ||= player.pos.z < -10.55 || (stepIndex >= 3 && player.pos.z > -9.45 && carried === null);
    if (!throughGate && player.pos.z < -10.6 && player.pos.y < 2.5) throughGate = true;

    // wisps from the tail tip, more when thin or floating
    wispAcc += dt;
    const rate = player.floating ? 0.02 : player.thinning ? 0.025 : 0.11;
    while (wispAcc > rate) {
      wispAcc -= rate;
      cat.tailTip.getWorldPosition(tmp);
      const c = player.thinning || player.floating ? thinCol : wispCol;
      particles.emit(tmp.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.1, 0, (Math.random() - 0.5) * 0.1)),
        new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.35 + Math.random() * 0.2, (Math.random() - 0.5) * 0.2), 0.1, 1.4, c, player.thinning ? 0.4 : 0.16, 1.8, 0.6);
      if (player.thinning) {
        const b = lerpPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * 0.5));
        particles.emit(b, new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.3, (Math.random() - 0.5) * 0.3), 0.16, 1.0, thinCol, 0.35, 1.8, 0.8);
      }
    }

    // seeds
    const bright = brightSeed();
    for (const s of seeds) {
      s.t += dt;
      if (s.state === 'idle') {
        s.pos.copy(s.home).add(new THREE.Vector3(0, Math.sin(s.t * 2) * 0.06, 0));
        const isBright = s === bright;
        s.glow.material.opacity = isBright ? 0.9 + Math.sin(s.t * 3) * 0.1 : 0.25;
        s.glow.scale.setScalar(isBright ? 1.0 + Math.sin(s.t * 3) * 0.1 : 0.55);
        if (player.pos.distanceTo(s.pos) < 0.65 + 0.3 && !carried && !player.floating) {
          s.state = 'carried'; carried = s; sound.pickup(); hud.hidden = false;
        }
      } else if (s.state === 'carried') {
        cat.carryAnchor.getWorldPosition(tmp);
        s.pos.lerp(tmp, Math.min(1, dt * 8));
        s.glow.material.opacity = 0.8; s.glow.scale.setScalar(0.8);
        if (Math.hypot(player.pos.x - level.spirit.x, player.pos.z - level.spirit.z) < 2.3 && Math.abs(player.pos.y - level.spirit.y) < 1.5) { s.state = 'delivering'; s.t = 0; carried = null; }
      } else if (s.state === 'delivering') {
        const k = Math.min(1, s.t / 0.9);
        const target = level.spirit.clone().add(new THREE.Vector3(0, 1.55, 0));
        s.pos.lerp(target, Math.min(1, dt * 5)); s.pos.y += Math.sin(k * Math.PI) * dt * 2;
        s.glow.scale.setScalar(0.8 + k * 0.8);
        if (k >= 1) { s.state = 'placed'; s.mesh.visible = false; placeSeed(); }
      }
      s.mesh.position.copy(s.pos);
    }

    // spirit: glows a little more with each seed, wakes with the last
    const glowCol = new THREE.Color('#5A3E2C').lerp(new THREE.Color('#FFC46B'), spiritLevel / 3);
    (level.spiritGlow.material as THREE.MeshBasicMaterial).color.copy(glowCol);
    level.spiritMesh.scale.setScalar(1 + Math.sin(time * 1.2) * 0.012 * (awake ? 2 : 1));
    if (awake) {
      wakeT += dt;
      level.wheel.rotation.x -= dt * Math.min(1, wakeT * 0.3) * 0.9;
      for (const e of level.spiritEyes) e.scale.y = THREE.MathUtils.damp(e.scale.y, 2.2, 3, dt);
    }
    // the goal glow when carrying: the spirit is the bright thing
    const sg = level.spiritGlow;
    sg.scale.setScalar(carried ? 1.2 + Math.sin(time * 3) * 0.15 : 1);

    // fireflies drift along the high route
    fireflies.forEach((f, i) => {
      const base = level.fireflies[i];
      f.position.set(base.x + Math.sin(time * 0.7 + i) * 0.15, base.y + Math.sin(time * 1.1 + i * 2) * 0.12, base.z + Math.cos(time * 0.6 + i) * 0.15);
      f.material.opacity = 0.35 + 0.3 * Math.sin(time * 2.3 + i * 1.7) ** 2;
      if (keepsakeFound) f.material.opacity *= 0.3;
    });
    if (!keepsakeFound) {
      bow.rotation.y += dt * 0.8; bow.position.y = level.keepsake.y + Math.sin(time * 2) * 0.05;
      if (player.pos.distanceTo(level.keepsake) < 0.75) {
        keepsakeFound = true; sound.keepsake();
        cat.tailTip.add(bow); bow.position.set(0, 0.2, 0); bow.rotation.set(0, 0, 0); bow.scale.setScalar(0.9 / HU);
        showBanner('A ribbon for Moth.', 2200);
      }
    }

    // light shafts shimmer at the gate
    level.sunShafts.forEach((s, i) => { (s.material as THREE.MeshBasicMaterial).opacity = 0.16 + 0.06 * Math.sin(time * 0.8 + i); });

    particles.update(dt);
    camera.update(dt, lerpPos, player.vel, look);
    (sky.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
    updateCoach();
    renderer.render(scene, camera.cam);
    requestAnimationFrame(frame);
  }

  function placeSeed() {
    spiritLevel++;
    sound.deliver(spiritLevel - 1);
    hudCount.textContent = `${spiritLevel} / 3`;
    const lamp = level.lanterns[spiritLevel - 1];
    if (lamp) (lamp.material as THREE.MeshBasicMaterial).color.set('#FFD08A');
    particles.burst(level.spirit.clone().add(new THREE.Vector3(0, 1.6, 0)), 14, 1.6, 0.14, amber, 0.8, 0.6);
    if (spiritLevel >= 3 && !awake) {
      awake = true; wakeT = 0;
      setTimeout(() => { sound.wake(); showBanner('The mill wakes.', 3500); }, 700);
      for (let i = 0; i < 40; i++) particles.emit(level.spirit.clone().add(new THREE.Vector3(0, 1.6, 0)), new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 4, (Math.random() - 0.5) * 4), 0.1, 2.2, petalCol, 0.9, 1, 1);
    }
  }

  function handleEvent(e: (typeof player.events)[number]) {
    const feet = player.pos.clone().add(new THREE.Vector3(0, 0.05, 0));
    switch (e.type) {
      case 'jump': sound.jump(); cat.kick('jump'); break;
      case 'double':
        sound.doubleJump(); cat.kick('double');
        particles.burst(player.pos.clone().add(new THREE.Vector3(0, 0.25, 0)), 12, 1.8, 0.28, thinCol, 0.55, -0.1);
        break;
      case 'land':
        sound.land(e.strength); cat.kick('land', e.strength);
        if (e.strength > 0.25) particles.burst(feet, 8, 1.2 * e.strength + 0.4, 0.2, thinCol, 0.35, 0.1);
        break;
      case 'step': sound.step(level.surfaces.get(player.groundHandle) ?? 'grass'); break;
      case 'bap': sound.bap(e.hit); cat.kick('bap'); break;
      case 'thin': sound.thin(e.on); break;
      case 'float': sound.floatBack(); break;
      case 'floatEnd': cat.kick('land', 0.3); break;
    }
  }

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.cam.aspect = innerWidth / innerHeight; camera.cam.updateProjectionMatrix();
    particles.setScale(innerHeight);
  });

  // test hooks for automated screenshots
  (window as any).__moth = {
    player, camera, begin, seeds, level, breakPot, setYaw: (y: number) => (camera.yaw = y),
    teleport: (x: number, y: number, z: number, facing: number) => {
      player.body.setTranslation({ x, y: y + 0.4, z }, true); player.pos.set(x, y, z); player.vel.set(0, 0, 0); player.facing = facing;
      prevPos.copy(player.pos); curPos.copy(player.pos);
    },
    state: () => ({ pos: player.pos.toArray().map((v) => +v.toFixed(2)), grounded: player.grounded, thin: player.thinning, floating: player.floating,
      seeds: seeds.map((s) => s.state), spirit: spiritLevel, step: stepIndex, carried: !!carried, fps: Math.round(fps) }),
  };
  if (params.has('autostart')) begin();
  requestAnimationFrame(frame);
}

main().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<p style="position:fixed;inset:auto 16px 40% 16px;text-align:center;color:#fff">Moth could not start: ${String(e?.message ?? e)}</p>`);
  console.error(e);
});
