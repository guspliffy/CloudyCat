import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { T } from './tuning';
import { Input } from './input';
import { Sound } from './audio';
import { Spirit, PALETTE, DesignId } from './spirit';
import { Level, glowTexture, heightAt } from './level';
import { Player, HALF, RADIUS } from './player';
import { FollowCamera } from './camera';
import { Minimap } from './minimap';
import * as zcheck from './dev/zcheck';
import { Particles } from './particles';
import { Sky } from './world/sky';
import { Ambient } from './world/ambient';
import { SHARED, PAL, setLightLevels, updateWind } from './world/ghibli';
import { Court, COURT, COURT_RECT } from './court/court';
import { STOPS, type Restore } from './court/boards';
import { createProfile, assign, recordFor, complete, type Profile } from './court/adapt';
import { rating, type Dir } from './court/rules';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const SAVE_KEY = 'moth-court-v1';

// Kettle's modes around the puzzle court: walking free, hopping on, drifting on the court, the win
// (embers fly to the spirit, a piece of the terrace comes back), the result card, hopping off.
type Mode = 'free' | 'enter' | 'court' | 'win' | 'card' | 'leave';

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
    new THREE.Vector3(-8, 0.8, -13), new THREE.Vector3(2.2, 0, -10.8), new THREE.Vector3(-8.6, 1.6, 6), new THREE.Vector3(15, 0, -9.5)];
  const ambient = new Ambient(new THREE.Vector3(7.4, 6.6, 5.6), flowerSpots, phone, heightAt);
  scene.add(ambient.group);

  // point sprites are sized in drawn pixels, so they follow the resolution and stay the same size on screen
  const pointScale = () => { particles.setScale(innerHeight * pr / 1.5); ambient.setScale(innerHeight * pr / 1.5); };
  pointScale();

  const input = new Input(renderer.domElement);
  if (touch) input.device = 'touch';
  const sound = new Sound();

  // --- the puzzle court, its rounds and the saved progress ---
  const glowTex = glowTexture();
  const court = new Court(glowTex);
  scene.add(court.group);
  let profile: Profile = createProfile();
  let nextStop = 0; // the first stop not finished yet; STOPS.length once the spirit is awake
  if (params.has('fresh')) { try { localStorage.removeItem(SAVE_KEY); } catch { /* storage may be blocked */ } }
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (saved) { profile = createProfile(saved.profile); nextStop = Math.min(STOPS.length, saved.next | 0); }
  } catch { /* a private window starts fresh */ }
  if (params.has('round')) nextStop = THREE.MathUtils.clamp(+params.get('round')! - 1, 0, STOPS.length);
  const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ profile, next: nextStop })); } catch { /* not kept, play goes on */ } };
  let stopIndex = -1; // the stop on the court right now
  let replaying = false;

  const fireflies = level.fireflies.map((p) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#FFF1B8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
    s.scale.setScalar(0.22); s.position.copy(p); scene.add(s); return s;
  });
  const bow = level.group.getObjectByName('keepsake')!;
  let keepsakeFound = false;
  // a soft warm column of light over where to go next, seen over hedges and walls
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, 7, 16, 1, true), new THREE.MeshBasicMaterial({
    map: beaconTexture(), color: '#FFC98A', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, opacity: 0.5,
  }));
  scene.add(beacon);
  const beaconAt = new THREE.Vector3();
  const courtDoor = new THREE.Vector3(COURT_RECT.x0 + 0.45, COURT.y, COURT.cz);
  const courtExit = new THREE.Vector3(COURT_RECT.x0 - 0.75, 0.02, COURT.cz);
  const courtCentre = new THREE.Vector3(COURT.cx, 0, COURT.cz);

  // --- UI ---
  const coach = document.getElementById('coach')!;
  const coachLine = coach.querySelector('.line') as HTMLElement, coachKey = coach.querySelector('.key') as HTMLElement;
  const hud = document.getElementById('hud')!;
  const hudGoal = hud.querySelector('.goal') as HTMLElement, hudCount = hud.querySelector('.count') as HTMLElement;
  const lamps = hud.querySelector('.lamps') as HTMLElement;
  const lampDots = [...hud.querySelectorAll('.lamps i')] as HTMLElement[];
  const banner = document.getElementById('banner')!;
  const startEl = document.getElementById('start')!;
  const bar = document.getElementById('courtbar')!;
  const card = document.getElementById('result')!;
  const cardStars = [...card.querySelectorAll('.stars i')] as HTMLElement[];
  const cardRoute = card.querySelector('.route') as HTMLElement, cardRetry = card.querySelector('[data-act="retry"]') as HTMLButtonElement;
  const cardNext = card.querySelector('[data-act="next"]') as HTMLButtonElement;
  document.getElementById('controls-hint')!.textContent = touch
    ? 'Left thumb moves. Jump and Bap on the right. Drag to look.'
    : 'Move WASD · Jump Space · Bap E · Drag to look. Gamepad works too.';
  document.getElementById('touch')!.hidden = !touch;
  for (const b of bar.querySelectorAll('button')) b.addEventListener('click', () => input.press(b.dataset.act as 'undo' | 'restart' | 'leave'));
  cardRetry.addEventListener('click', () => cardChoice('retry'));
  cardNext.addEventListener('click', () => cardChoice('next'));
  let started = false, swallow = false;
  let introT = -1;
  const INTRO = 6.0;
  const begin = () => {
    if (started) return; started = true;
    sound.start(); startEl.classList.add('gone');
    // the key or button that started the game must not also jump, bap or hurry the intro
    input.takeJump(); input.takePaw(); input.takeAction('confirm'); swallow = true;
    introT = params.has('nointro') ? INTRO : 0;
    if (introT === 0 && nextStop < STOPS.length) setTimeout(() => showBanner('Wake the spirit with embers from its court.', 3800), 900);
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
  // the HUD: walking, only the goal; on the court, three ember dots, the board's name and the drift count
  let hudKey = '';
  function updateHud() {
    const onCourt = mode !== 'free' && mode !== 'leave' && !!court.state;
    const mask = court.state?.mask ?? 0;
    const goal = onCourt ? court.board!.name : nextStop >= STOPS.length ? 'The mill is awake' : 'Wake the sleeping spirit';
    const count = onCourt ? `${court.moves} ${court.moves === 1 ? 'drift' : 'drifts'}` : '';
    const key = `${onCourt}|${mask}|${goal}|${count}`;
    if (key === hudKey) return;
    hudKey = key;
    lamps.hidden = !onCourt;
    lampDots.forEach((d, i) => { d.classList.toggle('lit', !!(mask & (1 << i))); d.classList.toggle('next', false); });
    hudGoal.textContent = goal; hudCount.textContent = count; hudCount.hidden = !count;
  }

  // first-minute coach: one short line at a time, in the world, next to the thing it is about
  const movedFrom = level.anchors.start.clone();
  const anchorAt = new THREE.Vector3();
  const above = (p: THREE.Vector3, h: number) => anchorAt.set(p.x, p.y + h, p.z);
  let courtVisits = 0, driftsMade = 0, pushedOnce = false, gateOnce = false;
  const onCourtNow = () => mode === 'court' && court.busy === 0;
  const steps = [
    { line: 'Follow the path.', key: () => input.glyph('move'), anchor: () => above(player.pos, 1.0),
      show: () => mode === 'free', done: () => player.pos.distanceTo(movedFrom) > 2.5 },
    { line: 'Jump. Tap again up high.', key: () => input.glyph('jump'), anchor: () => level.anchors.wall,
      show: () => mode === 'free' && player.pos.distanceTo(level.anchors.wall) < 5, done: () => player.usedDouble || (player.grounded && player.pos.y > 2.3) },
    { line: 'Bap the gate open.', key: () => input.glyph('paw'), anchor: () => level.anchors.gate,
      show: () => mode === 'free' && player.pos.distanceTo(level.gate.centre) < 3.5, done: () => level.gate.opening },
    { line: 'Step onto the court.', key: () => '', anchor: () => above(courtDoor, 0.9),
      show: () => mode === 'free' && nextStop < STOPS.length && player.pos.distanceTo(courtDoor) < 6, done: () => courtVisits > 0 },
    { line: 'Pick a way. Drift until something stops.', key: () => (input.device === 'touch' ? 'Swipe' : input.glyph('move')), anchor: () => above(court.kettle, 1.0),
      show: onCourtNow, done: () => driftsMade >= 2 },
    { line: 'Gather three embers. Then stop in the bowl.', key: () => '', anchor: () => above(court.bowlAt, 0.7),
      show: () => onCourtNow() && !court.drifting && (court.state?.mask ?? 0) !== 7, done: () => nextStop > 0 },
    { line: 'Bump the crate. It slides one stone.', key: () => '', anchor: () => above(court.crateAt ?? court.kettle, 1.0),
      show: () => onCourtNow() && court.hasCrate && !court.drifting, done: () => pushedOnce },
    { line: 'Cross the brass stone to open the gate.', key: () => '', anchor: () => above(court.plateAt ?? court.kettle, 0.6),
      show: () => onCourtNow() && court.hasGate && !court.drifting && !court.state!.opened, done: () => gateOnce },
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
  const dustCol = new THREE.Color('#D8CDB6');
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
  }

  // --- intro shot: the spirit and its court first, then back over the garden to Moth ---
  const introKeys = [
    { t: 0, p: new THREE.Vector3(9.6, 2.4, -11.4), l: new THREE.Vector3(3.4, 0.7, -17.6) },
    { t: 2.8, p: new THREE.Vector3(4.6, 6.4, -5.4), l: new THREE.Vector3(3.5, 0.5, -15.5) },
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

  // --- the court: camera shot, entering and leaving, drifting, winning ---
  let mode: Mode = 'free';
  let modeT = 0;
  const shotPos = new THREE.Vector3(), shotLook = new THREE.Vector3();
  const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
  let shotW = 0; // 0 = the follow camera, 1 = the court (or a restoration) shot
  let restoreShot: { p: THREE.Vector3; l: THREE.Vector3 } | null = null;
  /** The court seen from above the terrace wall, the whole board in frame whatever the screen shape. */
  function courtShot(outPos: THREE.Vector3, outLook: THREE.Vector3) {
    const aspect = innerWidth / innerHeight, half = (camera.cam.fov * Math.PI) / 360;
    // on a short screen (a phone on its side) the board sits a little higher, clear of the buttons below it
    const short = innerHeight < 560;
    const fitV = (short ? 3.8 : 3.35) / Math.tan(half), fitH = 3.45 / (Math.tan(half) * aspect);
    const d = Math.max(fitV, fitH), el = THREE.MathUtils.degToRad(57);
    outLook.set(COURT.cx, 0.1, COURT.cz + (short ? 0.75 : 0.25));
    outPos.set(outLook.x, outLook.y + Math.sin(el) * d, outLook.z + Math.cos(el) * d);
  }
  const hopFrom = new THREE.Vector3(), hopTo = new THREE.Vector3();
  let hopT = -1, hopFacing = 0;
  function startHop(to: THREE.Vector3) {
    hopFrom.copy(player.pos); hopTo.copy(to); hopT = 0;
    const dx = to.x - hopFrom.x, dz = to.z - hopFrom.z;
    if (dx * dx + dz * dz > 1e-4) hopFacing = Math.atan2(dx, dz);
    sound.jump(); moth.kick('jump');
  }
  function stopFor(i: number) { return STOPS[i]; }
  function pickReplay(from: number) {
    for (let k = 0; k < STOPS.length; k++) { const i = (from + k) % STOPS.length; if ((profile.keys[STOPS[i].id] ?? 0) < 3) return i; }
    return -1;
  }
  function enterCourt() {
    courtVisits++;
    const want = nextStop < STOPS.length ? nextStop : stopIndex >= 0 && court.board ? stopIndex : Math.max(0, pickReplay(0));
    replaying = nextStop >= STOPS.length;
    if (want !== stopIndex || !court.board) {
      stopIndex = want;
      const board = assign(profile, stopFor(stopIndex));
      recordFor(profile, board).attempts++;
      waitPlaced = court.placed; court.load(board);
      sound.rise();
      for (let i = 0; i < 16; i++) particles.emit(tmp.set(COURT.cx + (Math.random() - 0.5) * 5, 0.25, COURT.cz + (Math.random() - 0.5) * 5), new THREE.Vector3(0, 0.6 + Math.random(), 0), 0.12, 1.2, dustCol, 0.5, 1.8, 0.4);
      save();
    }
    mode = 'enter'; modeT = 0;
    if (waitPlaced < 0) startHop(court.kettleCell);
    courtShot(shotPos, shotLook);
    dirArmed = false; queued = null;
  }
  function leaveCourt() {
    mode = 'leave'; modeT = 0; card.hidden = true; bar.hidden = true;
    startHop(courtExit);
    hopFacing = -Math.PI / 2;
  }
  // input on the court: one push, one drift; a new push can wait while Kettle is still drifting
  let dirArmed = false, queued: Dir | null = null;
  let swipeX = 0, swipeY = 0, swipeQuiet = 0;
  function readDir(dt: number, look: number[], tap: Dir | null): Dir | null {
    const mx = input.moveX, my = input.moveY, mag = Math.max(Math.abs(mx), Math.abs(my));
    let d: Dir | null = null;
    if (mag < 0.3) dirArmed = true;
    else if (dirArmed && mag > 0.5) { d = Math.abs(mx) > Math.abs(my) ? (mx > 0 ? 'right' : 'left') : (my > 0 ? 'up' : 'down'); dirArmed = false; }
    if (tap) { d = tap; dirArmed = false; }
    // a swipe or a mouse drag anywhere also picks a way
    if (look[0] || look[1]) { swipeX += look[0]; swipeY += look[1]; swipeQuiet = 0; } else swipeQuiet += dt;
    if (swipeQuiet > 0.18) swipeX = swipeY = 0;
    const sw = Math.max(Math.abs(swipeX), Math.abs(swipeY));
    if (!d && sw > 34 && sw < 1e5) {
      d = Math.abs(swipeX) > Math.abs(swipeY) ? (swipeX > 0 ? 'right' : 'left') : (swipeY > 0 ? 'down' : 'up');
      swipeX = swipeY = 1e6; // one swipe, one drift: wait for the finger to rest
    }
    return d;
  }
  let winT = 0, winFirst = false, winStars = 0;
  function onWin() {
    mode = 'win'; modeT = 0; winT = 0; bar.hidden = true;
    const stop = stopFor(stopIndex), board = court.board!;
    const before = profile.keys[stop.id] ?? 0;
    const res = complete(profile, stop, board, court.moves);
    winStars = res.stars;
    winFirst = !replaying && stopIndex === nextStop && before === 0;
    sound.win(); moth.kick('happy');
    particles.burst(tmp.copy(court.bowlAt).setY(COURT.y + 0.4), 18, 1.6, 0.12, amber, 0.9, 0.7);
    if (winFirst) {
      nextStop = stopIndex + 1;
      // the embers rise from the bowl and fly to the spirit, then the piece comes back
      setTimeout(() => court.release(tmp.set(level.spirit.x, level.spirit.y + 1.5, level.spirit.z).clone(), () => restore(stop.restore, false)), 650);
    }
    save();
  }
  function showCard() {
    mode = 'card'; modeT = 0;
    const board = court.board!;
    cardStars.forEach((s, i) => s.classList.toggle('lit', i < winStars));
    cardRoute.textContent = winStars === 3 && court.moves <= board.par ? `${court.moves} drifts, the shortest route` : `Your route ${court.moves} · Shortest ${board.par}`;
    cardRetry.hidden = winStars === 3;
    const last = replaying ? pickReplay(stopIndex + 1) < 0 || pickReplay(stopIndex + 1) === stopIndex : nextStop >= STOPS.length;
    cardNext.textContent = last ? 'Done' : 'Next';
    card.hidden = false; bar.hidden = true;
    input.takeAction('confirm'); input.takeAction('restart');
  }
  function cardChoice(c: 'retry' | 'next') {
    if (mode !== 'card') return;
    card.hidden = true;
    if (c === 'retry') {
      recordFor(profile, court.board!).attempts++;
      waitPlaced = court.placed; court.load(court.board!); sound.rise();
      mode = 'court'; modeT = 0; dirArmed = false; queued = null; bar.hidden = false;
      return;
    }
    const nxt = replaying ? pickReplay(stopIndex + 1) : nextStop;
    if (nxt < 0 || nxt >= STOPS.length || (replaying && nxt === stopIndex)) {
      // all rounds done: the court rests and Kettle steps back out into the waking garden
      court.rest(); stopIndex = -1;
      leaveCourt();
      return;
    }
    stopIndex = nxt;
    const board = assign(profile, stopFor(stopIndex));
    recordFor(profile, board).attempts++;
    waitPlaced = court.placed; court.load(board); sound.rise();
    mode = 'court'; modeT = 0; dirArmed = false; queued = null; bar.hidden = false;
    save();
  }

  // --- restoration: each first win brings back one named piece of Mill Terrace ---
  const restored = new Set<Restore>();
  let wheelOn = false, wheelT = 0, awake = false;
  const SHOTS: Record<Restore, { p: THREE.Vector3; l: THREE.Vector3 }> = {
    lantern0: { p: new THREE.Vector3(1.9, 1.7, -12.4), l: new THREE.Vector3(-0.6, 0.95, -15.5) },
    lantern1: { p: new THREE.Vector3(-3.4, 1.8, -16.6), l: new THREE.Vector3(-0.8, 0.95, -20.2) },
    lantern2: { p: new THREE.Vector3(7.8, 2.2, -19.9), l: new THREE.Vector3(5.0, 1.0, -17.3) },
    wheel: { p: new THREE.Vector3(8.4, 2.4, -16.6), l: new THREE.Vector3(12.4, 0.8, -19.3) },
    mill: { p: new THREE.Vector3(8.9, 2.7, -16.4), l: new THREE.Vector3(14.0, 2.1, -19.6) },
    spirit: { p: new THREE.Vector3(2.9, 2.0, -14.4), l: new THREE.Vector3(2.0, 1.15, -18.5) },
  };
  function restore(r: Restore, instant: boolean) {
    restored.add(r);
    if (r.startsWith('lantern')) {
      const lamp = level.lanterns[+r.slice(7)];
      (lamp.glass.material as THREE.MeshBasicMaterial).color.set(PAL.emberCore);
    }
    if (r === 'wheel') wheelOn = true;
    if (r === 'spirit') {
      awake = true;
      level.spiritEyes.forEach((e) => (e.visible = false));
      level.spiritOpenEyes.forEach((e) => (e.visible = true));
      (level.gateLantern.glass.material as THREE.MeshBasicMaterial).color.set(PAL.emberCore);
      level.gateLantern.halo.material.opacity = 0.8;
    }
    if (instant) { if (r === 'wheel') wheelT = 10; return; }
    sound.restore();
    restoreShot = SHOTS[r];
    const piece = STOPS.find((s) => s.restore === r)!.piece;
    showBanner(r === 'spirit' ? 'The mill wakes.' : piece, 2600);
    if (r === 'spirit') setTimeout(() => sound.wake(), 600);
    const at = r.startsWith('lantern') ? level.lanterns[+r.slice(7)].pos : r === 'spirit' ? tmp.set(level.spirit.x, level.spirit.y + 1.6, level.spirit.z) : null;
    if (at) particles.burst(at.clone(), 16, 1.4, 0.12, amber, 0.8, 0.6);
    if (r === 'spirit') for (let i = 0; i < 40; i++) particles.emit(tmp.set(level.spirit.x, level.spirit.y + 1.6, level.spirit.z), new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 4, (Math.random() - 0.5) * 4), 0.1, 2.2, petalCol, 0.9, 1, 1);
  }
  for (let i = 0; i < Math.min(nextStop, STOPS.length); i++) restore(STOPS[i].restore, true);

  // --- loop ---
  let acc = 0, last = performance.now(), time = 0;
  const prevPos = player.pos.clone(), curPos = player.pos.clone();
  const lerpPos = new THREE.Vector3();
  let renderFacing = player.facing;
  let moveYaw = 0, idleStick = 1, latchAng = 0;
  let goalAt: THREE.Vector3 | null = null, mapped = false;
  const potV = new THREE.Vector3(), tmpV = new THREE.Vector3(), ORIGIN = new THREE.Vector3();
  const introFollow = new THREE.Vector3(), introLook = new THREE.Vector3();
  const followLook = new THREE.Vector3();
  const glowCold = new THREE.Color('#5A3E2C'), glowWarm = new THREE.Color('#FFC46B');
  const blobRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  // the sun's own sideways and up directions, for snapping the shadow map
  const lightX = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), sunDir).normalize();
  const lightY = new THREE.Vector3().crossVectors(sunDir, lightX).normalize();
  const minimap = new Minimap();
  let camOverride: { p: THREE.Vector3; t: THREE.Vector3; rel: boolean } | null = null;
  let gatePush = 0;
  let fps = 60;
  let outsideFor = 1;
  const driftVel = new THREE.Vector3();

  /** While Kettle is on the court (or hopping on and off) the court moves it, not the character controller. */
  function placeKettle(p: THREE.Vector3, vel: THREE.Vector3) {
    player.pos.copy(p); player.vel.copy(vel); player.grounded = true;
    player.body.setTranslation({ x: p.x, y: p.y + HALF + RADIUS, z: p.z }, true);
    prevPos.copy(p); curPos.copy(p);
  }

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
    const free = mode === 'free';
    if (started && !inIntro && hud.hidden) hud.hidden = false;
    minimap.el.hidden = !(started && !inIntro && free);
    if (free !== bodyFree) { bodyFree = free; document.body.classList.toggle('on-court', !free); }
    updateWind(dt);
    modeT += dt;

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
      if (free) {
        player.update(STEP, input, moveYaw);
        world.step();
        curPos.copy(player.pos);
        for (const e of player.events) handleEvent(e);
      } else world.step();
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

    // --- the court ---
    if (free) {
      const inside = court.contains(player.pos, -0.1) && player.pos.y < 0.7 && !player.floating;
      outsideFor = inside ? 0 : outsideFor + dt;
      if (inside && started && !inIntro && outsideFor === 0 && leftAt + 0.6 < time && (nextStop < STOPS.length || pickReplay(0) >= 0 || court.board)) enterCourt();
    }
    // jumping is for the garden; on the court Space steps out, on the card it means Next
    const jumpPressed = !free && input.takeJump();
    const tap = input.takeTapDir();
    const showPreview = mode === 'court' && hopT < 0 && waitPlaced < 0;
    court.update(dt, showPreview);
    // a new board has risen: Kettle hops onto its start stone
    if (waitPlaced >= 0 && court.placed > waitPlaced) { waitPlaced = -1; startHop(court.kettleCell); }
    if (mode === 'enter' && hopT < 0 && waitPlaced < 0 && court.busy === 0) { mode = 'court'; bar.hidden = false; }
    if (mode === 'court') {
      let d = readDir(dt, look, tap);
      if (d && (court.drifting || court.busy > 0 || hopT >= 0 || waitPlaced >= 0)) { queued = d; d = null; }
      if (!d && queued && !court.drifting && court.busy === 0 && hopT < 0 && waitPlaced < 0) { d = queued; queued = null; }
      if (d && court.drift(d)) driftsMade++;
      if (!court.drifting && court.busy === 0) {
        if (input.takePaw() || input.takeAction('undo')) { if (court.undo()) { sound.undo(); recordFor(profile, court.board!).undos++; puffAt(court.kettle); } }
        if (input.takeAction('restart')) { if (court.restart()) { sound.undo(); recordFor(profile, court.board!).restarts++; puffAt(court.kettle); } }
      }
      if (input.takeAction('leave') || (jumpPressed && modeT > 0.4 && !court.drifting && waitPlaced < 0)) leaveCourt();
    } else { input.takePaw(); input.takeAction('undo'); input.takeAction('restart'); if (mode !== 'card') input.takeAction('leave'); }
    for (const e of court.events) {
      switch (e.type) {
        case 'drift': sound.drift(e.tiles); break;
        case 'key': sound.ember(e.count - 1); particles.burst(tmp.copy(court.kettle).setY(COURT.y + 0.4), 10, 1.0, 0.08, amber, 0.9, 0.6); break;
        case 'switch': sound.bell(); setTimeout(() => sound.gateSink(), 250); gateOnce = true; break;
        case 'push': sound.push(); pushedOnce = true; break;
        case 'stop': sound.stop(e.strength); moth.kick('land', 0.25 + e.strength * 0.4); break;
        case 'bump': sound.bump(); break;
        case 'ready': sound.bowlReady(); break;
        case 'won': onWin(); break;
      }
    }
    if (mode === 'win') {
      winT += dt;
      // the restoration shot holds a moment, then the camera comes back to the court and the card shows
      if (restoreShot && winT > 4.4) restoreShot = null;
      if ((!winFirst && winT > 1.1) || (winFirst && winT > 5.4)) showCard();
    }
    if (mode === 'card') {
      if (input.takeAction('confirm') || (jumpPressed && modeT > 0.3)) cardChoice('next');
      else if (input.takeAction('restart') && !cardRetry.hidden) cardChoice('retry');
    }
    if (mode === 'leave' && hopT < 0) {
      mode = 'free'; leftAt = time;
      camera.snap(player.pos, player.facing);
      if (nextStop >= STOPS.length && !finaleShown) { finaleShown = true; showBanner('The mill is awake. Thank you, Kettle.', 3600); }
    }

    // hopping on and off the court; drifting on it
    if (hopT >= 0) {
      hopT = Math.min(1, hopT + dt / 0.5);
      const k = hopT * hopT * (3 - 2 * hopT);
      tmpV.lerpVectors(hopFrom, hopTo, k); tmpV.y += Math.sin(hopT * Math.PI) * 0.55;
      driftVel.subVectors(hopTo, hopFrom).multiplyScalar(1.6);
      player.facing = hopFacing;
      placeKettle(tmpV, driftVel);
      lerpPos.copy(tmpV);
      if (hopT >= 1) { hopT = -1; sound.land(0.3); moth.kick('land', 0.35); if (mode !== 'leave') court.kettle.copy(hopTo); }
    } else if (mode !== 'free' && mode !== 'leave' && waitPlaced < 0) {
      // check mode itself, not "free": stepping off can end earlier in this same frame
      player.facing = court.kettleFacing;
      placeKettle(court.kettle, court.kettleVel);
      lerpPos.copy(court.kettle);
    }
    level.syncDynamics();
    level.update(time, dt);
    SHARED.uPlayer.value.copy(lerpPos);

    // the gate opens when bapped (see handleEvent) or when Moth leans on it for a moment
    if (!level.gate.opening) {
      const g = level.gate.centre;
      const near = Math.hypot(lerpPos.x - g.x, lerpPos.z - g.z) < 0.85 && Math.abs(lerpPos.y - (g.y - 0.5)) < 0.8;
      const pushing = Math.abs(input.moveX) + Math.abs(input.moveY) > 0.3;
      gatePush = near && pushing && free ? gatePush + dt : 0;
      if (gatePush > 0.5) openGate();
    }

    // Moth
    let df = player.facing - renderFacing; df = Math.atan2(Math.sin(df), Math.cos(df)); renderFacing += df * Math.min(1, dt * (free ? 20 : 14));
    moth.root.position.copy(lerpPos);
    moth.root.rotation.y = renderFacing;
    // on the court Kettle glides as a little cloud: feet tucked, a little puffed up while it drifts
    const gliding = !free && (court.drifting || hopT >= 0);
    moth.float = THREE.MathUtils.damp(moth.float, gliding ? 0.45 : free ? player.float01 : 0, 10, dt);
    moth.carrying = false;
    const sp = gliding ? Math.min(1, Math.hypot(player.vel.x, player.vel.z) / T.runSpeed) : Math.hypot(player.vel.x, player.vel.z) / T.runSpeed;
    moth.update(dt, sp, gliding ? false : player.grounded || player.floating, gliding ? tmpV.set(player.vel.x, 0, player.vel.z) : player.vel);
    {
      blobRay.origin.x = lerpPos.x; blobRay.origin.y = lerpPos.y + 0.3; blobRay.origin.z = lerpPos.z;
      const hit = world.castRay(blobRay, 6, true, undefined, undefined, player.collider);
      const gy = hit ? lerpPos.y + 0.3 - hit.timeOfImpact : lerpPos.y;
      const h = Math.max(0, lerpPos.y - gy);
      moth.blob.position.set(lerpPos.x, gy + 0.015, lerpPos.z);
      moth.blob.scale.setScalar(1 + h * 0.4);
      (moth.blob.material as THREE.MeshBasicMaterial).opacity = 0.5 * Math.max(0, 1 - h / 3) * (1 - player.float01);
    }

    // the beacon: over the way into the court while rounds wait there
    {
      const want = free && nextStop < STOPS.length ? courtDoor : null;
      goalAt = want ? courtCentre : null;
      const m = beacon.material as THREE.MeshBasicMaterial;
      if (want) {
        beaconAt.lerp(want, beaconAt.lengthSq() ? Math.min(1, dt * 3) : 1);
        beacon.position.set(beaconAt.x, beaconAt.y + 3.4, beaconAt.z);
        // fade when close so it never sits in Moth's face
        const d = Math.hypot(lerpPos.x - beaconAt.x, lerpPos.z - beaconAt.z);
        m.opacity = THREE.MathUtils.damp(m.opacity, 0.42 * THREE.MathUtils.smoothstep(d, 1.5, 5), 3, dt);
      } else m.opacity = THREE.MathUtils.damp(m.opacity, 0, 4, dt);
      beacon.visible = m.opacity > 0.01;
    }

    // the spirit warms with every round and wakes with the last; lit lanterns flicker softly
    (level.spiritGlow.material as THREE.MeshBasicMaterial).color.lerpColors(glowCold, glowWarm, restored.size / STOPS.length);
    level.spiritMesh.scale.set(1 + Math.sin(time * 1.2) * 0.012, 1 - Math.sin(time * 1.2) * 0.015 * (awake ? 2 : 1), 1 + Math.sin(time * 1.2) * 0.012);
    level.spiritMesh.rotation.z = awake ? Math.sin(time * 2) * 0.04 : Math.sin(time * 0.6) * 0.015;
    if (wheelOn) { wheelT += dt; level.wheel.rotation.x -= dt * Math.min(1, wheelT * 0.3) * 0.9; }
    for (let i = 0; i < level.lanterns.length; i++) if (restored.has(`lantern${i}` as Restore)) level.lanterns[i].halo.material.opacity = 0.75 + Math.sin(time * 2.3 + i) * 0.08;
    for (const w of level.millWindows) {
      const m = w.material as THREE.MeshBasicMaterial;
      m.opacity = THREE.MathUtils.damp(m.opacity, restored.has('mill') ? 0.9 + Math.sin(time * 1.7) * 0.04 : 0, 1.5, dt);
      w.visible = m.opacity > 0.01;
    }

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
      camera.update(dt, lerpPos, free ? player.vel : ORIGIN, renderFacing, free ? look : [0, 0]);
      if (inIntro) {
        introFollow.copy(camera.cam.position); introLook.set(lerpPos.x, lerpPos.y + T.camHeight, lerpPos.z);
        introCamera(introT, introFollow, introLook);
      }
      // the court shot (or a restoration shot) blends over the follow camera
      const wantShot = mode !== 'free' && mode !== 'leave';
      shotW = THREE.MathUtils.damp(shotW, wantShot ? 1 : 0, wantShot ? 3.2 : 3.6, dt);
      if (restoreShot) { wantPos.copy(restoreShot.p); wantLook.copy(restoreShot.l); } else courtShot(wantPos, wantLook);
      const rate = restoreShot || mode === 'win' ? 2.2 : 6;
      shotPos.x = THREE.MathUtils.damp(shotPos.x, wantPos.x, rate, dt); shotPos.y = THREE.MathUtils.damp(shotPos.y, wantPos.y, rate, dt); shotPos.z = THREE.MathUtils.damp(shotPos.z, wantPos.z, rate, dt);
      shotLook.x = THREE.MathUtils.damp(shotLook.x, wantLook.x, rate, dt); shotLook.y = THREE.MathUtils.damp(shotLook.y, wantLook.y, rate, dt); shotLook.z = THREE.MathUtils.damp(shotLook.z, wantLook.z, rate, dt);
      if (shotW > 0.001 && !inIntro) {
        const k = shotW * shotW * (3 - 2 * shotW);
        followLook.set(lerpPos.x, lerpPos.y + T.camHeight, lerpPos.z);
        camera.cam.position.lerp(shotPos, k);
        camera.cam.lookAt(followLook.lerp(shotLook, k));
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
    updateHud();
    moth.renderSmoke(camera.cam, time);
    for (const x of lineup) { x.update(dt, 0, true, ORIGIN); x.renderSmoke(camera.cam, time); }
    renderer.render(scene, camera.cam);
    // photograph the level for the map once, on the first frame, while the start card is still up
    if (!mapped) { mapped = true; minimap.capture(renderer, scene, [level.group]); }
    if (!minimap.el.hidden) minimap.update(dt, lerpPos, renderFacing, camera.yaw, goalAt, level.spirit);
  }
  let waitPlaced = -1, bodyFree = true;
  let leftAt = -10, finaleShown = nextStop >= STOPS.length;
  function puffAt(p: THREE.Vector3) {
    for (let i = 0; i < 10; i++) particles.emit(tmp.set(p.x, p.y + 0.25, p.z), new THREE.Vector3((Math.random() - 0.5) * 1.4, Math.random() * 0.8, (Math.random() - 0.5) * 1.4), 0.14, 0.8, dustCol, 0.5, 1.6, 0.6);
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
    player, camera, begin, level, breakPot, moth, renderer, zcheck, showLineup, court, input,
    setYaw: (y: number) => (camera.yaw = y),
    skipIntro: () => (introT = INTRO),
    freeCam: (p: number[] | null, t?: number[], rel = false) => { camOverride = p ? { p: new THREE.Vector3(...p), t: new THREE.Vector3(...t!), rel } : null; },
    teleport: (x: number, y: number, z: number, facing: number) => {
      player.body.setTranslation({ x, y: y + 0.4, z }, true); player.pos.set(x, y, z); player.vel.set(0, 0, 0); player.facing = facing;
      prevPos.copy(player.pos); curPos.copy(player.pos);
    },
    enterCourt, cardChoice, drift: (d: Dir) => court.drift(d), solve: async () => (await import('./court/rules')).solve(court.board!, court.state!),
    state: () => ({ pos: player.pos.toArray().map((v) => +v.toFixed(2)), grounded: player.grounded, floating: player.floating,
      mode, stop: stopIndex, next: nextStop, board: court.board?.variantId, moves: court.moves, mask: court.state?.mask, restored: [...restored],
      step: stepIndex, gate: level.gate.opening, fps: Math.round(fps), stars: rating(court.moves, court.board?.par ?? 0),
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
