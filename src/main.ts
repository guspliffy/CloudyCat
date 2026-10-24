import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { T } from './tuning';
import { Input } from './input';
import { Sound } from './audio';
import { Spirit, PALETTE, DesignId } from './spirit';
import { Level, glowTexture, heightAt } from './level';
import { Player } from './player';
import { FollowCamera } from './camera';
import { Minimap } from './minimap';
import * as zcheck from './dev/zcheck';
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
  // resolution adapts to keep the frame rate steady: prMax is the sharpest we ever draw, prMin the softest
  const prMax = () => Math.min(devicePixelRatio || 1, phone ? 1.25 : 1.5);
  const prMin = () => Math.min(prMax(), phone ? 0.75 : 0.9);
  let pr = prMax();
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  app.appendChild(renderer.domElement);

  // --- light: late morning, sun high over the court so Moth and the trees get warm rims ---
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
  if (params.has('zcheck')) (window as any).__zcheck = true;
  const level = new Level(world, phone);
  level.build();
  scene.add(level.group);

  const player = new Player(world, level.anchors.start, -1, () => false, level.inWater,
    () => pushables);
  const pushables = [...level.pots.map((p) => p.body), ...level.crates.map((c) => c.body)];
  player.facing = Math.PI;

  const design = params.get('spirit');
  const moth = new Spirit(design === 'wimble' || design === 'sorrel' ? design : 'kettle');
  scene.add(moth.root, moth.world);
  moth.setLight(sunDir, new THREE.Color('#FFF1D2').multiplyScalar(2.2), new THREE.Color('#BFD9F2'));

  const camera = new FollowCamera(innerWidth / innerHeight, world, player.collider, level.camBlock);
  camera.soft = level.foliage.canopies;
  camera.cam.far = 1000; camera.cam.updateProjectionMatrix();
  camera.snap(player.pos, player.facing);
  const particles = new Particles();
  scene.add(particles.points);
  const flowerSpots = [new THREE.Vector3(-3, 1.6, -8.4), new THREE.Vector3(3.6, 1.6, 6.4), new THREE.Vector3(-5, 0, -11), new THREE.Vector3(2.8, 0, -26),
    new THREE.Vector3(-8, 0.8, -13), new THREE.Vector3(6, 0, -11), new THREE.Vector3(-8.6, 1.6, 6), new THREE.Vector3(15, 0, -9.5)];
  const ambient = new Ambient(new THREE.Vector3(7.4, 6.6, 5.6), flowerSpots, phone, heightAt);
  scene.add(ambient.group);

  // point sprites are sized in drawn pixels, so they follow the resolution and stay the same size on screen
  const pointScale = () => { particles.setScale(innerHeight * pr / 1.5); ambient.setScale(innerHeight * pr / 1.5); };
  pointScale();

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
    ? 'Left thumb moves. Jump and Bap on the right. Drag to look.'
    : 'Move WASD · Jump Space · Bap E · Drag to look. Gamepad works too.';
  document.getElementById('touch')!.hidden = !touch;
  let started = false, swallow = false;
  let introT = -1;
  const INTRO = 6.0;
  const begin = () => {
    if (started) return; started = true;
    sound.start(); startEl.classList.add('gone');
    // the key or button that started the game must not also jump, bap or hurry the intro
    input.takeJump(); input.takePaw(); swallow = true;
    introT = params.has('nointro') ? INTRO : 0;
    if (introT === 0) setTimeout(() => showBanner('Bring three embers to the sleeping spirit.', 3800), 900);
  };
  document.getElementById('go')!.addEventListener('click', begin);
  input.onAny = () => { if (started) sound.start(); };
  addEventListener('keydown', (e) => { if (!started && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); begin(); } });

  let bannerFade = 0, bannerHide = 0;
  function showBanner(text: string, ms: number) {
    clearTimeout(bannerFade); clearTimeout(bannerHide);
    banner.textContent = text; banner.hidden = false; banner.style.opacity = '1';
    bannerFade = setTimeout(() => { banner.style.opacity = '0'; bannerHide = setTimeout(() => (banner.hidden = true), 1000); }, ms);
  }
  function updateHud() {
    lampDots.forEach((d, i) => { d.classList.toggle('lit', i < spiritLevel); d.classList.toggle('next', i === spiritLevel && !awake); });
  }
  updateHud();

  // first-minute coach: one short line at a time, in the world, next to the thing it is about
  const movedFrom = level.anchors.start.clone();
  const anchorAt = new THREE.Vector3();
  const above = (p: THREE.Vector3, h: number) => anchorAt.set(p.x, p.y + h, p.z);
  // the gate hint comes before "bring it", since the gate stands between the seed and the spirit
  const steps = [
    { line: 'Follow the path.', key: () => input.glyph('move'), anchor: () => above(player.pos, 1.0),
      show: () => introT >= INTRO, done: () => player.pos.distanceTo(movedFrom) > 2.5 },
    { line: 'Jump. Tap again up high.', key: () => input.glyph('jump'), anchor: () => level.anchors.wall,
      show: () => player.pos.distanceTo(level.anchors.wall) < 5, done: () => player.usedDouble || (player.grounded && player.pos.y > 2.3) },
    { line: 'Bap it.', key: () => input.glyph('paw'), anchor: () => above(potWithSeed.mesh.position, 0.6),
      show: () => player.pos.distanceTo(potWithSeed.mesh.position) < 2.8, done: () => potWithSeed.broken },
    { line: 'Bap the gate open.', key: () => input.glyph('paw'), anchor: () => level.anchors.gate,
      show: () => player.pos.distanceTo(level.gate.centre) < 3.5, done: () => level.gate.opening },
    { line: 'Bring it to the spirit.', key: () => '', anchor: () => above(player.pos, 1.1),
      show: () => carried !== null, done: () => spiritLevel > 0 },
  ];
  // a step, once done, stays done; the line shown is the first open step that applies right now
  const stepDone = steps.map(() => false);
  let stepIndex = 0;
  let coachShown = false;
  const proj = new THREE.Vector3();
  function updateCoach() {
    let s: typeof steps[number] | null = null;
    stepIndex = steps.length;
    for (let i = 0; i < steps.length; i++) {
      if (!stepDone[i] && steps[i].done()) stepDone[i] = true;
      if (stepDone[i]) continue;
      stepIndex = Math.min(stepIndex, i);
      if (!s && started && introT >= INTRO && steps[i].show()) s = steps[i];
    }
    let visible = false;
    if (s) {
      const p = proj.copy(s.anchor()).project(camera.cam);
      if (p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1) {
        if (coachLine.textContent !== s.line) coachLine.textContent = s.line;
        const k = s.key(); if (coachKey.textContent !== k) coachKey.textContent = k;
        // keep the whole line on screen, and clear of the lamps and the map at the top
        const half = coach.offsetWidth / 2 + 12;
        const x = THREE.MathUtils.clamp((p.x * 0.5 + 0.5) * innerWidth, half, Math.max(half, innerWidth - half));
        const top = Math.min(innerHeight * 0.45, minimap.el.hidden ? 70 : minimap.el.offsetHeight + 60);
        const y = THREE.MathUtils.clamp((-p.y * 0.5 + 0.5) * innerHeight, top, innerHeight - 140);
        coach.style.left = x + 'px'; coach.style.top = y + 'px';
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
    pushables.splice(pushables.indexOf(p.body), 1);
    world.removeRigidBody(p.body);
    p.mesh.visible = false;
    for (let i = 0; i < 14; i++) particles.emit(at, new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3 + 1, (Math.random() - 0.5) * 3), 0.07, 1.2 + Math.random(), shardCol, 0.95, 1, 1.2);
    for (let i = 0; i < 10; i++) particles.emit(at, new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2 + 1, (Math.random() - 0.5) * 2), 0.09, 1.6 + Math.random(), petalCol, 0.9, 1, 1.5);
    sound.breakPot();
    if (p.seed !== null) {
      const s = seeds[p.seed];
      // a seed that would land in the river or off the terraces waits where its pot stood instead
      const lost = level.inWater(at) || at.y < -0.5 || (at.x > 9.3 && at.x < 13.7 && at.y < 0.6);
      s.state = 'idle'; s.mesh.visible = true;
      if (lost) s.home.copy(p.spawn).setY(p.spawn.y + 0.25); else s.home.copy(at).setY(Math.max(at.y, 0) + 0.35);
      s.pos.copy(s.home); s.t = 0;
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
  let moveYaw = 0, idleStick = 1, latchAng = 0;
  let goalAt: THREE.Vector3 | null = null, mapped = false;
  const potV = new THREE.Vector3(), tmpV = new THREE.Vector3(), spiritTop = new THREE.Vector3(), ORIGIN = new THREE.Vector3();
  const introFollow = new THREE.Vector3(), introLook = new THREE.Vector3();
  const glowCold = new THREE.Color('#5A3E2C'), glowWarm = new THREE.Color('#FFC46B');
  const blobRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  // the sun's own sideways and up directions, for snapping the shadow map
  const lightX = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), sunDir).normalize();
  const lightY = new THREE.Vector3().crossVectors(sunDir, lightX).normalize();
  const minimap = new Minimap();
  let camOverride: { p: THREE.Vector3; t: THREE.Vector3; rel: boolean } | null = null;
  let gatePush = 0;
  let fps = 60;

  function frame(now: number) {
    // ask for the next frame first, so one surprise can never freeze the game
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now; time += dt;
    fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    input.poll(dt);
    const look = input.takeLook();
    if (!started) {
      // before the start card is gone nothing moves; a gamepad button presses "Wake up"
      if (input.takePadPress()) begin();
      input.takeJump(); input.takePaw();
      input.moveX = input.moveY = 0; input.jumpHeld = input.pawHeld = false; look[0] = look[1] = 0;
    } else if (swallow) {
      // ignore the key that started the game until it is let go
      if (input.jumpHeld || input.pawHeld) { input.takeJump(); input.takePaw(); input.jumpHeld = input.pawHeld = false; } else swallow = false;
    }
    adaptResolution(dt);
    // any real input during the intro hurries it along
    if (introT >= 0 && introT < INTRO) {
      introT += dt;
      if ((Math.abs(input.moveX) + Math.abs(input.moveY) > 0.3 || input.jumpHeld || input.pawHeld) && introT < INTRO - 0.9) introT = INTRO - 0.9;
    }
    const inIntro = introT >= 0 && introT < INTRO;
    if (started && !inIntro && hud.hidden) { hud.hidden = false; minimap.el.hidden = false; }
    updateWind(dt);

    // movement is read against the camera angle from when the stick was pushed, so the camera can swing
    // round behind Moth without bending its path (holding a direction walks a straight line, never a circle).
    // Any change of direction (another key, a new stick angle), letting go or dragging the view picks up
    // the camera's new angle, so after a corner "forward" is forward on screen again.
    const pushing = Math.abs(input.moveX) + Math.abs(input.moveY) > 0.2;
    idleStick = pushing ? 0 : idleStick + dt;
    const stickAng = Math.atan2(input.moveX, input.moveY);
    let turned = stickAng - latchAng; turned = Math.abs(Math.atan2(Math.sin(turned), Math.cos(turned)));
    if (idleStick > 0.12 || look[0] || look[1] || (pushing && turned > 0.35)) { moveYaw = camera.yaw; latchAng = stickAng; }

    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      prevPos.copy(curPos);
      if (inIntro && introT < INTRO - 0.9) { input.takeJump(); input.takePaw(); }
      player.update(STEP, input, moveYaw);
      world.step();
      curPos.copy(player.pos);
      for (const e of player.events) handleEvent(e);
      for (const p of level.pots) {
        if (p.broken) continue;
        const v = p.body.linvel(); const vv = potV.set(v.x, v.y, v.z);
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

    // Moth
    let df = player.facing - renderFacing; df = Math.atan2(Math.sin(df), Math.cos(df)); renderFacing += df * Math.min(1, dt * 20);
    moth.root.position.copy(lerpPos);
    moth.root.rotation.y = renderFacing;
    moth.float = player.float01;
    moth.carrying = carried !== null;
    const sp = Math.hypot(player.vel.x, player.vel.z) / T.runSpeed;
    moth.update(dt, sp, player.grounded || player.floating, player.vel);
    {
      blobRay.origin.x = lerpPos.x; blobRay.origin.y = lerpPos.y + 0.3; blobRay.origin.z = lerpPos.z;
      const hit = world.castRay(blobRay, 6, true, undefined, undefined, player.collider);
      const gy = hit ? lerpPos.y + 0.3 - hit.timeOfImpact : lerpPos.y;
      const h = Math.max(0, lerpPos.y - gy);
      moth.blob.position.set(lerpPos.x, gy + 0.015, lerpPos.z);
      moth.blob.scale.setScalar(1 + h * 0.4);
      (moth.blob.material as THREE.MeshBasicMaterial).opacity = 0.5 * Math.max(0, 1 - h / 3) * (1 - player.float01);
    }

    // seeds
    const bright = brightSeed();
    for (const s of seeds) {
      s.t += dt;
      if (s.state === 'idle') {
        s.pos.copy(s.home); s.pos.y += Math.sin(s.t * 2) * 0.06;
        const isBright = s === bright;
        s.glow.material.opacity = isBright ? 0.95 + Math.sin(s.t * 3) * 0.05 : 0.4;
        s.glow.scale.setScalar(isBright ? 1.2 + Math.sin(s.t * 3) * 0.12 : 0.7);
        if (player.pos.distanceTo(s.pos) < 0.95 && !carried && !player.floating) {
          s.state = 'carried'; carried = s; sound.pickup();
          particles.burst(s.pos, 10, 1.0, 0.08, amber, 0.9, 0.6);
        }
      } else if (s.state === 'carried') {
        s.pos.lerp(moth.carryAnchor.position, Math.min(1, dt * 10));
        // hugged to Moth's belly: small enough to keep the face clear
        s.glow.material.opacity = 0.45; s.glow.scale.setScalar(0.7);
        s.mesh.scale.setScalar(THREE.MathUtils.damp(s.mesh.scale.x, 0.5, 8, dt));
        if (Math.random() < dt * 4) particles.emit(s.pos, tmpV.set((Math.random() - 0.5) * 0.3, 0.3, (Math.random() - 0.5) * 0.3), 0.04, 0.9, amber, 0.9, 0.5, 1.5);
        if (Math.hypot(player.pos.x - level.spirit.x, player.pos.z - level.spirit.z) < 2.5 && player.pos.y < 2.2) { s.state = 'delivering'; s.t = 0; carried = null; }
      } else if (s.state === 'delivering') {
        const k = Math.min(1, s.t / 0.9);
        s.mesh.scale.setScalar(THREE.MathUtils.damp(s.mesh.scale.x, 1, 6, dt));
        const target = tmpV.set(level.spirit.x, level.spirit.y + 1.4, level.spirit.z);
        s.pos.lerp(target, Math.min(1, dt * 5)); s.pos.y += Math.sin(k * Math.PI) * dt * 2;
        s.glow.scale.setScalar(0.8 + k * 0.8);
        if (k >= 1) { s.state = 'placed'; s.mesh.visible = false; placeSeed(); }
      }
      s.mesh.position.copy(s.pos);
    }
    if (potGlow.visible) {
      potGlow.position.copy(potWithSeed.mesh.position); potGlow.position.y += 0.15;
      potGlow.material.opacity = 0.55 + Math.sin(time * 3) * 0.15;
    }
    // the beacon: over the pot first, then the brightest seed, then the spirit while carrying
    {
      let want: THREE.Vector3 | null = null;
      if (awake) want = null;
      else if (carried) want = spiritTop.set(level.spirit.x, level.spirit.y + 0.6, level.spirit.z);
      else if (bright) want = bright.pos;
      else if (!potWithSeed.broken) want = potWithSeed.mesh.position;
      goalAt = want;
      const m = beacon.material as THREE.MeshBasicMaterial;
      if (want) {
        beaconAt.lerp(want, beaconAt.lengthSq() ? Math.min(1, dt * 3) : 1);
        beacon.position.set(beaconAt.x, beaconAt.y + 3.4, beaconAt.z);
        // fade when close so it never sits in Moth's face
        const d = Math.hypot(lerpPos.x - beaconAt.x, lerpPos.z - beaconAt.z);
        m.opacity = THREE.MathUtils.damp(m.opacity, 0.42 * THREE.MathUtils.smoothstep(d, 1.5, 5), 3, dt);
      } else m.opacity = THREE.MathUtils.damp(m.opacity, 0, 2, dt);
      beacon.visible = m.opacity > 0.01;
    }

    // spirit: warmer with each seed, wakes with the last
    (level.spiritGlow.material as THREE.MeshBasicMaterial).color.lerpColors(glowCold, glowWarm, spiritLevel / 3);
    level.spiritMesh.scale.set(1 + Math.sin(time * 1.2) * 0.012, 1 - Math.sin(time * 1.2) * 0.015 * (awake ? 2 : 1), 1 + Math.sin(time * 1.2) * 0.012);
    if (awake) {
      wakeT += dt;
      level.wheel.rotation.x -= dt * Math.min(1, wakeT * 0.3) * 0.9;
      level.spiritMesh.rotation.z = Math.sin(time * 2) * 0.04;
    } else level.spiritMesh.rotation.z = Math.sin(time * 0.6) * 0.015;
    for (let i = 0; i < spiritLevel && i < level.lanterns.length; i++) level.lanterns[i].halo.material.opacity = 0.75 + Math.sin(time * 2.3 + i) * 0.08;

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
    for (let i = 0; i < fireflies.length; i++) {
      const f = fireflies[i], base = level.fireflies[i];
      f.position.set(base.x + Math.sin(time * 0.7 + i) * 0.15, base.y + Math.sin(time * 1.1 + i * 2) * 0.12, base.z + Math.cos(time * 0.6 + i) * 0.15);
      f.material.opacity = (0.35 + 0.3 * Math.sin(time * 2.3 + i * 1.7) ** 2) * (keepsakeFound ? 0.3 : 1);
    }
    if (!keepsakeFound) {
      bow.rotation.y += dt * 0.8; bow.position.y = level.keepsake.y + Math.sin(time * 2) * 0.05;
      if (player.pos.distanceTo(level.keepsake) < 0.8) {
        keepsakeFound = true; sound.keepsake();
        moth.wear(bow);
        showBanner('A ribbon for Moth.', 2200);
      }
    }
    for (let i = 0; i < level.sunShafts.length; i++) {
      const s = level.sunShafts[i];
      // fade out when the camera walks into a beam, so it never becomes a flat slab across the screen
      const near = THREE.MathUtils.smoothstep(s.position.distanceTo(camera.cam.position), 1.5, 4.5);
      (s.material as THREE.MeshBasicMaterial).opacity = ((i < 5 ? 0.16 : 0.12) + 0.05 * Math.sin(time * 0.8 + i) + SHARED.uGust.value * 0.03) * near;
    }

    particles.update(dt);
    if (camOverride) {
      const base = camOverride.rel ? lerpPos : ORIGIN;
      camera.cam.position.copy(camOverride.p).add(base); camera.cam.lookAt(tmpV.copy(camOverride.t).add(base));
    } else {
      camera.update(dt, lerpPos, player.vel, renderFacing, look);
      if (inIntro) {
        introFollow.copy(camera.cam.position); introLook.set(lerpPos.x, lerpPos.y + T.camHeight, lerpPos.z);
        introCamera(introT, introFollow, introLook);
      }
    }
    camera.cam.updateMatrixWorld();
    // the shadow map follows Moth in whole shadow texels, measured across the sun, so shadow edges never crawl
    {
      const texel = (sun.shadow.camera.right - sun.shadow.camera.left) / sun.shadow.mapSize.x;
      tmpV.set(lerpPos.x, 0, lerpPos.z - 4);
      const a = Math.round(tmpV.dot(lightX) / texel) * texel, b = Math.round(tmpV.dot(lightY) / texel) * texel, c = tmpV.dot(sunDir);
      sun.target.position.copy(lightX).multiplyScalar(a).addScaledVector(lightY, b).addScaledVector(sunDir, c);
      sun.position.copy(sun.target.position).addScaledVector(sunDir, 45);
    }
    sky.update(dt, camera.cam);
    ambient.update(dt, time, camera.cam, sunDir, lerpPos);
    updateCoach();
    moth.renderSmoke(camera.cam, time);
    for (const x of lineup) { x.update(dt, 0, true, ORIGIN); x.renderSmoke(camera.cam, time); }
    renderer.render(scene, camera.cam);
    // photograph the level for the map once, on the first frame, while the start card is still up
    if (!mapped) { mapped = true; minimap.capture(renderer, scene, [level.group]); }
    if (!minimap.el.hidden) minimap.update(dt, lerpPos, renderFacing, camera.yaw, goalAt, level.spirit);
  }

  // keep the frame rate steady: draw a little softer when frames run long, sharper again when there is room.
  // If drawing softer does not help, the screen itself is capped (a phone in low power mode runs at 30 Hz):
  // then go back to sharp and take that rate as the target.
  let refresh = 0, capped = 0, slowFor = 0, fastFor = 0, settle = 2, probe = 0, fpsAtDrop = 0, noGain = 0;
  function applySize() {
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight);
    camera.cam.aspect = innerWidth / innerHeight; camera.cam.updateProjectionMatrix();
    pointScale();
    settle = 1.5;
  }
  function adaptResolution(dt: number) {
    if (params.has('fixedres') || document.hidden || !started) return;
    if (settle > 0) { settle -= dt; return; }
    refresh = Math.max(refresh * (1 - dt * 0.02), fps);
    if (probe > 0 && (probe -= dt) <= 0) {
      noGain = fps < fpsAtDrop + 2 ? noGain + 1 : 0;
      if (noGain >= 2) { capped = Math.round(fpsAtDrop); noGain = 0; pr = prMax(); applySize(); return; }
    }
    const target = capped || Math.max(refresh, 60);
    const slow = fps < Math.min(target * 0.85, 52), fast = fps > Math.min(target * 0.95, 58);
    slowFor = slow ? slowFor + dt : 0;
    fastFor = fast ? fastFor + dt : 0;
    if (slowFor > 1.2 && probe <= 0 && pr > prMin() + 0.01) {
      fpsAtDrop = fps; probe = 2; slowFor = 0;
      pr = Math.max(prMin(), pr - 0.15); applySize();
    } else if (fastFor > 8 && pr < prMax() - 0.01) { pr = Math.min(prMax(), pr + 0.1); fastFor = 0; applySize(); }
  }

  function openGate() {
    if (level.gate.opening) return;
    level.openGate();
    sound.bap(true);
    particles.burst(level.gate.centre.clone(), 10, 1.2, 0.08, petalCol, 0.8, 0.5);
  }

  function placeSeed() {
    spiritLevel++;
    moth.kick('happy');
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
      case 'jump': sound.jump(); moth.kick('jump'); break;
      case 'double': sound.doubleJump(); moth.kick('double'); break;
      case 'land': sound.land(e.strength); moth.kick('land', e.strength); break;
      case 'step': sound.step(level.surfaces.get(player.groundHandle) ?? 'grass'); break;
      case 'bap': {
        sound.bap(e.hit); moth.kick('bap');
        const g = level.gate.centre;
        if (!level.gate.opening && Math.hypot(player.pos.x - g.x, player.pos.z - g.z) < 1.5 && Math.abs(player.pos.y - (g.y - 0.5)) < 1) openGate();
        break;
      }
      case 'float': sound.floatBack(); break;
      case 'floatEnd': moth.kick('land', 0.3); break;
    }
  }

  // resize, rotate, browser zoom or a move to another screen: redo the size and the sharpness limits
  const onResize = () => { pr = THREE.MathUtils.clamp(pr, prMin(), prMax()); applySize(); };
  addEventListener('resize', onResize);
  visualViewport?.addEventListener('resize', onResize);
  // a hidden tab goes quiet and lets go of every key; coming back starts from a clean frame
  document.addEventListener('visibilitychange', () => {
    input.clear();
    if (document.hidden) sound.ctx?.suspend();
    else { if (started) sound.ctx?.resume(); last = performance.now(); acc = 0; }
  });

  // dev: stand other spirit designs next to Moth to compare them
  const lineup: Spirit[] = [];
  const showLineup = (ids: DesignId[], gap = 0.9) => {
    ids.forEach((id, i) => {
      const x = new Spirit(id);
      x.setLight(sunDir, new THREE.Color('#FFF1D2').multiplyScalar(2.2), new THREE.Color('#BFD9F2'));
      const side = new THREE.Vector3(Math.cos(player.facing), 0, -Math.sin(player.facing)).multiplyScalar((i === 0 ? -1 : 1) * gap);
      x.root.position.copy(player.pos).add(side);
      x.root.position.y = heightAt(x.root.position.x, x.root.position.z);
      x.root.rotation.y = player.facing;
      x.blob.position.copy(x.root.position).setY(x.root.position.y + 0.015);
      scene.add(x.root, x.world); lineup.push(x);
    });
  };

  // test hooks for automated screenshots
  (window as any).__moth = {
    player, camera, begin, seeds, level, breakPot, moth, renderer, zcheck, showLineup,
    setYaw: (y: number) => (camera.yaw = y),
    skipIntro: () => (introT = INTRO),
    freeCam: (p: number[] | null, t?: number[], rel = false) => { camOverride = p ? { p: new THREE.Vector3(...p), t: new THREE.Vector3(...t!), rel } : null; },
    teleport: (x: number, y: number, z: number, facing: number) => {
      player.body.setTranslation({ x, y: y + 0.4, z }, true); player.pos.set(x, y, z); player.vel.set(0, 0, 0); player.facing = facing;
      prevPos.copy(player.pos); curPos.copy(player.pos);
    },
    state: () => ({ pos: player.pos.toArray().map((v) => +v.toFixed(2)), grounded: player.grounded, floating: player.floating,
      seeds: seeds.map((s) => s.state), spirit: spiritLevel, step: stepIndex, carried: !!carried, gate: level.gate.opening, fps: Math.round(fps),
      calls: renderer.info.render.calls, tris: renderer.info.render.triangles, intro: +introT.toFixed(2), pr }),
  };
  if (params.has('autostart')) begin();
  // touch screens on laptops and tablets with a trackpad: show the buttons once a finger is used
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') document.getElementById('touch')!.hidden = false; });
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
