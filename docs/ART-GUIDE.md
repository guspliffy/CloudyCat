# Moth: art guide for Mill Terrace

Creative director, 2026-10-24. Answers Jonny's M1 notes: no clear destination, cat not designed well, no Ghibli feeling, cat should be a smoke cloud that moves like smoke but keeps its cat shape, "three legs", too simple. Everything here is buildable in Three.js 0.186 without asking. World frame as in `src/level.ts`: X east, -Z north, Y up, metres. Cat units HU = 0.16 m.

Sources studied: Kazuo Oga (poster colour, ~21 pigments mixed; "extract the essence, render small things, not everything"; large masses first, small details last), Nizo Yamamoto ("Laputa clouds": towering sunlit cumulus against deep summer blue, dry-brush white highlights blurred), Ni no Kuni (flat ramps, no grey in shade, painted texture only on big surfaces), Bridson et al. 2007 curl noise, bluff-body wake and vortex-ring physics, soft-particle depth fade, anime foliage pipelines (cluster normals from an enclosing sphere).

## 1. Ghibli visual rules (with the Three.js technique and budget)

The one sentence: a few large, calm, saturated masses lit by one warm sun, shade that is coloured and full of sky, and small loving details only where people live and walk. No grey, no black, no outlines, nothing perfectly still.

### 1.1 Light and colour script, Mill Terrace, late morning (about 10:30, summer)

| Light | Value | Three.js |
|---|---|---|
| Sun direction | from SE, elevation 52°: `new Vector3(0.62, 0.78, -0.45).normalize()` (points toward the sun) | `DirectionalLight('#FFF1D2', 2.6)`, shadow map 2048 laptop / 1024 phone, `normalBias 0.03`, frustum 26 m, follows the player in 4 m snaps |
| Sky light | top `#BFD9F2`, ground bounce `#9DAE66` | `HemisphereLight(top, ground, 1.1)` |
| Shade colour rule | shade = base darkened 45% and pulled 35% toward violet `#4C4878` by luminance; never neutral grey | shared `GhibliMaterial` (one `ShaderMaterial` via `onBeforeCompile` on `MeshLambertMaterial` or copy the cat shader): `shade = mix(base*0.55, vec3(0.30,0.28,0.47)*lum(base)*1.4, 0.35)` |
| Diffuse ramp | wrap light `w = (NdotL + 0.45)/1.45`, then 3 soft bands: `smoothstep(0.18,0.30,w)*0.55 + smoothstep(0.55,0.68,w)*0.45` | shadow-map term multiplies `w` before the ramp, so cast shadows keep sky bounce and hue |
| Rim | sun-side rim `#FFE7BC` on foliage and the cat, 0.35 strength, fresnel power 2.5 | in the same shader |
| Fog / aerial | start 22 m, full at 110 m, colour `#C9D4E8`; far objects also lose 40% saturation | `scene.fog = Fog('#C9D4E8', 22, 110)` plus `mix(c, fogCol, pow(fogFactor, 0.7)*0.4)` desaturation in the shader |
| Tone | `ACESFilmicToneMapping`, exposure 1.0; no bloom pass, glows are additive sprites | cheaper on phone, same look |

Palette (sRGB hex, lit / in shade). Only these 30 values plus the cat palette; mix new colours from them, do not invent.

| Thing | Lit | Shade |
|---|---|---|
| Sky zenith / mid / horizon | `#4C7FC4` / `#8EB8E0` / `#E9E6DC` | |
| Cumulus top / body / underside | `#FFFDF6` / `#EFE9F0` / `#B3AED3` (deep `#8B88B4`) | |
| Far hills, 3 layers near to far | `#7F99BE` `#9DB1CE` `#BCC8DE` | |
| Meadow grass | `#A9C867` tip, `#7DA651` mid | `#4E7A55` root, cast shade `#3E6356` |
| Hedge / tree foliage | `#8FBE5C` / `#6A9E55` | `#38664F` / deep `#294B4A` |
| Trunks, bark | `#7A5E4A` | `#423549` |
| Path (packed earth, pale stones) | `#CDB78F` / stones `#DCD2BC` | `#8E85A0` |
| Stone wall, steps | `#D8CDB6` | `#8F8BA6` |
| Plaster (mill, shed) | `#F5E9D3` | `#B9B0C9` |
| Roof tiles, terracotta | `#C8775A` | `#8A5262` |
| Clay pots | `#C88D69` | `#7F5762` |
| Wood (gate, cart, wheel) | `#A98462` / dark `#6E5445` | `#4F4052` |
| Water | `#6FA6C8`, sparkle `#E6F4F9` | `#4A7596` |
| Moss, lichen | `#86A65A`, lichen `#B9C49A` | |
| Flowers | hollyhock `#E8A1B4`, poppy `#E0624F`, buttercup `#F2CF5B`, daisy `#FBF7EC`, lavender `#A89CD2` | |
| Ember / lit lantern / warm glow | `#FFC46B` core `#FFE8B8` | cold lantern glass `#8A94A8` |

### 1.2 Sky: towering sunlit cumulus
- Dome: 150 m sphere, back side, shader gradient zenith → mid at `d.y = 0.35` → horizon at `d.y = 0.0`, with a warm sun halo `pow(max(dot(d,sun),0),8)*0.25` in `#FFE9C9`. Keep the existing dome, replace its colours.
- Clouds: 7 billboard cards (planes facing the camera about Y only), 70–140 m wide, 130–280 m away, bases 10–18° above the horizon, two big towers to the north-east behind the mill so the goal side of the world is the grand side. Texture per card made once on a 512² canvas: 2D fbm (5 octaves), threshold 0.52 for the mask, flat the bottom by multiplying the mask with `smoothstep(0.08,0.30,v)`, lighting by sampling the mask offset up-left by 14 px (sun side) → top colour, offset down by 20 px → underside colour, remaining mass → body colour. Add 6–10 small "cauliflower" circles on the lit shoulder. Drift 0.25 m/s west, towers slower than small clouds (parallax). Depth test on, depth write off, no fog.
- 20 tiny far clouds as one instanced card ring at the horizon for scale. Budget: 8 draw calls total.

### 1.3 Shadows, bounce, light shafts
- Cast shadows coloured by the rule above, soft edges: `PCFSoftShadowMap`, radius 2 on laptop; `PCFShadowMap` on phone.
- Fake bounce under warm walls: a vertex colour tint on ground vertices within 1.5 m of plaster or path (`#E8D9B8` at 25%).
- Light shafts: keep the gate shafts; add 3 under the big west tree and 4 in the mill doorway. Each is a `PlaneGeometry` 0.25 × 5 m, `#FFE6B8`, additive, opacity 0.10–0.18 pulsing with the wind uniform, always `lookAt` the camera about its own axis. Max 14 shafts in the scene.

### 1.4 Foliage: clustered blobs with painted edges, no outlines
- Tree = trunk (8-sided tapered cylinder, slight lean 3–6°) + 5–9 canopy blobs (`IcosahedronGeometry(r, 2)`, r 0.8–1.6) overlapping 30%. Crucial trick: after merging, set every canopy vertex normal to `normalize(vertex - canopyCentre)` (the enclosing-sphere normal). The canopy then shades as one painted mass with a sun side and a violet shade side instead of many balls.
- Painted edge: per blob, 10–14 fringe quads 0.5–0.9 m on the silhouette ring, alpha-tested "leaf scallop" texture (canvas: 7 overlapping circles), same material and normals, rotated to face out. Reads as brushed leaf edges from any angle.
- Wind: vertex shader rocks the canopy `rotation = 0.02 * windStrength * sin(t*0.9 + worldPos.x*0.3)` about the trunk base, fringe quads add their own `0.04 * sin(t*2.3 + vertexId)` flutter.
- Hedges: a box core plus 40–60 blobs per 10 m (r 0.35–0.6) on the faces and top, same normal trick with the hedge's local axis as a capsule centre line; top rounded (collider is a capsule so the cat slides off, no standing on hedges).
- Budget: tree ≈ 2.2k tris + 120 fringe quads, 1 draw call per material via `BatchedMesh` or merged geometry; 9 trees laptop, 6 phone (far ones become 2-card impostors).

### 1.5 Grass that moves in waves, flowers
- Meadow: ground mesh gets the shade rule and a 2-tone noise patch pattern (two greens, 2.5 m blobs). On top, grass clumps as one `InstancedMesh` per 8 × 8 m chunk, chunks built only within 26 m of the player, 3 LODs (3 cross-quads 4 segments / 2 quads 2 segments / 1 quad). Density: laptop 14 clumps per m² inside 12 m, 5 beyond; phone 6 and 2. Total ≈ 45k laptop, 12k phone. Hard cap 60k.
- Vertex shader: `bend = uv.y²` × ( `0.08*sin(t*1.3 + wp.x*0.6 + wp.z*0.35)` base sway + `0.35*gust` + player push ). Gust is a world-space travelling band: `g = fract((dot(wp.xz, windDir) - t*gustSpeed) / gustPeriod)`, `gust = smoothstep(0.0,0.25,g)*smoothstep(0.55,0.3,g)*gustAmp*noise(wp.xz*0.15)`; `gustSpeed 4 m/s, gustPeriod 18 m, gustAmp 0.6` from the global wind. Player push: `max(0, 1 - dist(wp.xz, playerXZ)/0.55)` away from the cat, 0.25 m. The cat's wisps use the same wind vector.
- Colour: root `#4E7A55` → tip `#A9C867` by `uv.y`, tip warmed `#D9D36A` by 20% inside sun patches; dark root fakes occlusion, no per-blade shadows.
- Flowers: 6 instanced types (hollyhock stalks, poppies, buttercups, daisies, lavender, clover), only within ring A and B below, 900 laptop / 350 phone, same wind shader with 1.6× amplitude and a 0.2 Hz nod.

### 1.6 Detail density, atmosphere and wind
- Three rings from the path centre line: A (0–2 m): dense lived-in clutter, every object touched by a person, moss and chips on stones; B (2–8 m): flowers, pots, a tree, one or two props; C (beyond): big calm shapes only, hills, meadow, clouds, mill.
- Floating life: 220 pollen motes (`Points`, 2–4 px, `#FFF3C8`, 35% alpha, rising 0.05 m/s with curl drift, brightest in shafts); 28 dandelion seeds (billboard cards 8 cm, slow spiral, wind-carried, respawn upwind); 10 white butterflies on figure-eight paths near flowers (two quads flapping 6 Hz). Phone: halve.
- Wind is one object `wind = { dir: (-0.8, 0, -0.6), base: 0.35, gust: 0..1 }` updated in main: gust rises over 1.2 s every 7–11 s, holds 1.5 s, falls over 2 s. Every moving thing reads it: grass, canopy, fringe, laundry, chimes, pollen, seeds, cloud drift, water ripple speed, the cat's wisps and ear tips, the shaft opacity. The audio wind bed follows `gust`.
- Water: plane with two scrolling normal-noise layers, `#6FA6C8` with sun sparkle `step(0.93, noise)` in `#E6F4F9`, 0.25 Hz lapping ring at the wheel; no reflection pass (phone), a flat sky tint instead.

Budgets, 60 fps: mid laptop (iGPU) ≤ 320 draw calls, ≤ 650k tris, pixel ratio ≤ 1.5, 1 shadow map 2048, 1 depth read for soft particles. Phone ≤ 140 draw calls, ≤ 220k tris, pixel ratio 1, shadow 1024, no depth read (fallbacks named below), no fringe quads on far trees.

## 2. The smoke cat

Target: the "Lantern, cuter" face Jonny approved, standing on four readable legs, whose body is a small dusk-coloured cloud of smoke that lags, stretches, curls and sheds when it moves, and never stops being a cat. Four layers, back to front.

### 2.1 What stays solid (opaque core, current `cloudMaterial`)
Head sphere, cheeks, muzzle, nose, blush, both ears (tips may fuzz 10%), both eyes, body ellipsoid, haunches, four legs and four paws. The core never deforms except squash and stretch and gait. Rules that fix the "three legs": hind stance widened to x ±0.52 HU, hind legs 0.05 HU longer than front so they show below the belly from behind-and-above, tail roots at the top rear (0, 1.55, -1.25) and curls up and to the cat's left, never hanging between the hind legs; each paw gets a soft contact blob (`CircleGeometry` 0.3 HU, `#2C2850` at 45%, fading with height) so four feet read on grass; gait lifts paws 0.18 HU; default camera pitch raised from 0.28 to 0.34 rad so the hind pair is never hidden by the rump. Eyes stay the only glossy surface, never covered by smoke.

### 2.2 Smoke shell (transparent mesh over body, chest, haunches, tail root)
- Geometry: copies of the body and haunch ellipsoids and the chest ruff at 1.12× scale, `SphereGeometry(1, 48, 32)` for smooth displacement, one `ShaderMaterial`, `transparent`, `depthWrite false`, normal blending, rendered after opaque, `side: FrontSide`.
- Colour: `#625B92` core to `#9A94C4` at the rim; lighter than the body `#3D3860`, never darker. Sun side adds `#FFE7BC` × 0.3 rim; thin state lerps to `#B9B4D4`.
- Vertex displacement: `d = fbm3(localPos*2.4 + uFlow) * 0.10 HU + 0.04 HU` along the normal, 3 octaves of value noise in a 32³ `Data3DTexture` (laptop) or 2 octaves procedural (phone). `uFlow` is advected on the CPU: `uFlow += (-velLocal*0.9 + vec3(0,0.25,0) + wind*0.3) * dt`, so the pattern slides backward over the body as it moves and drifts up at rest, like smoke sliding along a moving object.
- Velocity stretch: `back = max(0, dot(normalize(localPos - bodyCentre), -velLocalDir))`, offset `+= velLocalDir * -back² * speed01 * 0.45 HU`; front side compresses 0.1 HU. Shell lags the core through a spring: shell group position = core + `lagOffset`, `lagOffset'' = -k*lagOffset - c*lagOffset' - accel*m`, k 60, c 9, m 0.045 (≈ 70 ms lag, one overshoot). Chest shell uses k 90, haunch shell k 45, so the back of the cat arrives last.
- Alpha: `a = 0.55 * pow(1 - NdotV, 1.4) * erode`, `erode = smoothstep(uErode, uErode + 0.28, fbm3(localPos*4 + uFlow*1.3))`, `uErode = 0.25 + 0.35*uThin + 0.25*uSun`; multiplied by soft-particle depth fade `saturate((sceneDepth - fragDepth)/0.12 m)` on laptop (render opaque pass to a `WebGLRenderTarget` with a `DepthTexture`, sample in shell and wisp shaders). On phone skip the depth read: fade by height above the known ground point instead. Result: a fuzzy, breathing halo at the silhouette that is almost invisible over the face.
- Idle breathing: displacement amplitude × `(1 + 0.15 sin(t*1.6))`; lobes drift at 0.08 HU/s.

### 2.3 Lagging tail (replaces the rigid link chain)
- 7 nodes, Verlet, rest spacing 0.42 HU, root fixed to the body. Per step: inherit root velocity, `vel *= 0.86` (viscous), buoyancy `+0.9 m/s²` (smoke rises, so the tail floats up when still), spring to the previous node `k 55, c 8`, a rest-pose pull toward the curled-up shape `k 6`, wind × 0.4, curl noise (2.4) × 0.3 at the last 3 nodes. Max bend per link 48°, so it never kinks.
- Render: `CatmullRomCurve3` through the nodes → `TubeGeometry(curve, 24, r, 10)` rebuilt each frame (720 tris), radius ramp 0.22 → 0.10 → 0.16 HU (thin neck, soft plume at the tip), shell material with `uErode` rising to 0.55 at the tip so the tip dissolves into wisps instead of ending. 8 soft billboards (0.3–0.45 HU) ride the last third of the spline and lag 60 ms behind it. The keepsake bow and the carried seed attach to node 5.
- Tail behaviour from motion: run → the tail streams straight back and up at 25°, stretched 1.3× (nodes spread, radius × 0.8); stop → it overshoots forward past the body by 0.4 HU, then springs back; turn → it swings out, lags by 0.25 s; still → it curls round the front paws and the tip rises and sinks 0.1 HU at 0.3 Hz.

### 2.4 Wisps: the wake, shedding and dissolving (instanced soft particles)
Replace `THREE.Points` for cat smoke with one `InstancedMesh` of 1-quad billboards (max 240 laptop, 120 phone) so each wisp can stretch along its velocity and rotate. Texture: 128² canvas radial puff with 4 soft lobes, alpha 0.9 centre to 0 at 0.5 radius.

| Source | Rate | Spawn | Life | Size (start → end) | Colour / alpha |
|---|---|---|---|---|---|
| Body wake, alternating left/right at `f = 0.2 * speed / 0.35 m` (Strouhal shedding; ≈ 2 Hz at trot, 3.2 Hz at run) | 1 per shed, both sides at run | rump, 0.5 HU behind body centre, ±0.45 HU sideways | 1.1–1.6 s | 0.35 HU → 1.1 HU | `#8A84B6` 0.30 → 0 |
| Tail tip | 6/s at rest, 14/s running | last node | 1.6–2.2 s | 0.25 → 0.9 HU | `#9A94C4` 0.22 → 0 |
| Chest ruff, idle breath | 1.5/s | front of ruff, on exhale phase | 1.2 s | 0.2 → 0.5 HU | `#9A94C4` 0.12 |
| Jump | 10 in a ring | under the paws at the take-off point (stay behind, do not follow) | 0.9 s | 0.5 → 1.4 HU | `#8A84B6` 0.35 |
| Double jump | 14 in a horizontal ring + 6 downward | body centre | 1.0 s | 0.45 → 1.3 HU | `#B9B4D4` 0.45 |
| Landing | 8 + 10 × strength, ring expanding outward `v = 1.4 m/s * strength` decaying, rolls up (spin 1.5 rad/s) | paw height | 0.8–1.2 s | 0.4 → 1.6 HU | `#8A84B6` 0.4 × strength |
| Carrying a seed | 3/s amber sparks | tail node 5 | 1.0 s | 0.08 → 0.02 HU | `#FFC46B` 0.9, additive |
| Thin through the gate | 40/s | whole body volume | 1.0 s | 0.4 → 0.8 HU | `#B9B4D4` 0.35 |

Motion per wisp each frame (this is "how smoke moves"):
1. Inherit 35% of the cat's velocity at birth (advection), plus 0.15 m/s outward from the body axis.
2. Drag `vel *= exp(-2.2 dt)`; buoyancy `vel.y += 0.45 dt` for the first 60% of life, then 0 (cooling smoke stops rising); wind `+= wind*0.6 dt`.
3. Curl noise (divergence-free, Bridson): potential `ψ = fbm3(p*1/L + t*0.15)` sampled three times with offsets, `vel += curl(ψ) * A dt`; two octaves, `L 0.35 m, A 0.35 m/s` and `L 0.12 m, A 0.12 m/s`. Behind the cat multiply A by `1 + 2*speed01` within a 0.6 m wake cone, so eddies curl mostly in the wake. Evaluate on the CPU for ≤ 240 particles (cheap), or in a vertex shader with a stored seed.
4. Stretch: billboard scale along velocity `1 + 0.6*min(|vel|,1.5)`, across `1/(that)^0.5`, rotation = velocity angle on screen; a filament thins as it stretches.
5. Dissipation: size `s(k) = s0 + (s1-s0)*sqrt(k)` (diffusive growth), alpha `a(k) = a0 * smoothstep(0,0.08,k) * (1-k)^1.6 * s0²/s(k)²` (optical mass conserved, so growing puffs fade), where k is normalised age. In a sun patch alpha × 0.6 and life × 0.7 (thinning in sunlight); in shade life × 1.2.
6. Never spawn or drift in front of the face: if a wisp's position projects within 0.9 HU of the head on screen, alpha × 0.2.

### 2.5 State responses
- Jump: core stretches 1.18 y, shell lags 70 ms so the cloud briefly hangs below the body, take-off ring stays at the ground. Apex: shell displacement amplitude × 1.4 (puffs out), tail floats up. Landing: core squash, shell overshoots down and out 0.3 HU, landing ring, grass push radius 1.0 m for 0.3 s.
- Run: shell stretch back, wake shedding, ears fold 10°, tail streams; at a stop everything (shell, tail, wisps) arrives 0.1–0.3 s after the body in order chest, body, haunch, tail.
- Sun patch (`uSun` from a cheap test against the shaft and patch volumes): shell erode up, rim brighter, pupils round and wide, wisps shorter. Thin state as now, plus the shell alpha → 0.85 and the core → 40% opaque, the face stays at 100%.
- Idle: breathing shell, chest exhale wisps, tail curl, lobes drift; loaf sinks the shell too.

### 2.6 What keeps it cute, not monstrous
Face always 100% solid and smoke-free; smoke is lighter than the body, never black or dark grey; all smoke shapes are round lobes, never spikes or tendrils (erode threshold width ≥ 0.28, puff texture with lobes); smoke lives behind and below the head; speeds are slow (wisps ≤ 0.6 m/s, shell lag ≤ 100 ms); the silhouette of head, ears and four legs is untouched; eyes stay the highest-contrast thing on screen; wisp alpha ≤ 0.45; the whole cloud, cat included, stays darker than the shade pool `#4E7A55` (CHARACTER.md rule) except the rim.

## 3. Level and purpose: Mill Terrace reworked

Problem: the 3 m hedge hides the north court, so the goal is invisible and the first minute has no destination. Fix: Mill Terrace becomes a real terrace. The south garden is raised 1.6 m; its north edge is a stone retaining wall with an arched doorway and a wooden gate at x = 0; the hedge grows at the foot of the wall on the court side, top at y = 2.1 (0.5 m above the terrace floor, a waist-high hedge seen from above, a tall one from the court). From the start the player looks over the hedge, through the gate arch, down five steps, across the court, to the sleeping spirit on a raised stone hearth with three cold lanterns, with the waterwheel and mill behind to the right and the two cloud towers above. The hedge collider is a capsule, so hopping onto it just slides you back; the gate (thinning) is the only way down, and the sunlit gate is the brightest thing in the frame.

### 3.1 Layout (coordinates, y = floor height)
- Start stoop (0, 1.6, 1.2): a flagstone step by the mill's back door (the mill house is moved to the south-east corner of the terrace, (6, 1.6, 3), so the player starts at home). Facing north. Sun patch on the stoop.
- Path: pale stepping stones, S-curve from the stoop west around the flower bed to the seed wall (0, 2.5, -4), then north-east to the gate (0, 1.6, -9.4). Stones brighter than grass, each slightly rotated, moss on the shade side.
- Seed 1: the clay pot on the low wall (1.7, 2.5+0.22, -4), seen glowing from the start 5 m away, left of the path. Seed 2: on the barrel stack by the east hedge (6.0, 1.6+2.55, -7.5), visible from the gate, with a crate step. Seed 3: on the shed roof in the court (-6.2, 2.45, -17.8), the cart as the step up, visible from the bottom of the steps because the shed faces the steps.
- Gate (0, 1.6, -9.4) in the wall; steps 1.2 m wide from (0, 1.6, -10) down to (0, 0, -12.5); sunlight through the slats paints the steps.
- Hearth (2, 0, -18): stone ring raised 0.5 m, the spirit on it, three lanterns on 1.2 m posts at the three approaches: steps (0.5, -14.5), shed side (-1.5, -19.5), river side (5, -17). Each seed lights the lantern on the side the player came from, then the next unlit seed's glow gets 30% brighter.
- Way back: stone steps are two-way; a grassy bank with a flower border ramps from the court's west side up to the terrace (-8, 0 → 1.6, -12 → -8), so the court always has a soft way up without thinning; the barrel stack has a crate stair down its back. Every raised place has a lower side within 2 m: no dead ends, no drop that needs a float back except the river, which floats you to the bank.
- River and wheel unchanged, mill house across the river keeps the far landmark; the start mill is a smaller cottage with a chimney.

### 3.2 The first 60 seconds
1. 0–4 s: start card gone; the camera eases from a composed shot (stoop lower-left, gate centre, spirit framed in the arch, wheel and cloud towers right) into the follow camera over 2.5 s. Cold lanterns, grey hearth, warm pot glow at left. No text.
2. 4–12 s: "Stretch. Then wander." Grass parts around the paws, pollen in the sun, a butterfly lifts off the path. The path stones lead to the wall.
3. 12–24 s: "Jump. Tap again up high." at the wall; landing puff. "Bap it." at the pot; it cracks, the seed lifts, lands on the tail, amber sparks join the trail, the HUD shows three small lantern dots, one pulsing.
4. 24–40 s: the gate shafts brighten when the player carries a seed near; "Breathe through the sun." Thin, pass, re-form on the steps with a puff; the camera tilts up a touch to show the hearth 8 m ahead.
5. 40–55 s: at the hearth the seed flies in, the spirit's lid glows, a chime, the steps lantern lights with a soft orange halo; the spirit exhales one warm smoke ring that drifts toward the shed (the nearest unlit seed) and fades at 6 m.
6. 55–60 s: the player turns; the shed seed is glowing on the roof with the cart under it. No line needed. The grass gust rolls across the court.

### 3.3 Always knowing where to go, no arrows
- Warmth is the task: the only saturated oranges in the world are ember seeds, lit lanterns and the hearth. The next unlit seed is 30% brighter than the others; lit lanterns stay lit and leave a warm trail of where you have been.
- Shape: path stones point the way; gaps in flower borders mark climbs; the composition from each delivery looks at the next seed (hearth exhale ring, camera settle 1.5 s facing it).
- Light: sun patches sit where the player should stand (stoop, wall top, steps, cart). Shade pools mark rest, not routes.
- UI: three lantern dots top-right after the first pickup (as now), coach lines ≤ 8 words beside the thing, one at a time. Nothing else. No timers, no fail state; pots re-form after 20 s if their seed was already taken, so bapping is always free play.

## 4. Detail list (where they go)

Terrace ring A/B: 1 laundry line between the cottage and a pole, 4 small cloths swinging in the wind shader (2, 2.9, 0 → -2, 2.9, -1). 2 Teapot and two cups on the stoop step (0.6, 1.75, 1.6). 3 Wind chime of 5 clay tubes under the cottage eave (4.2, 3.4, 1.5), rings on gusts, audio tied to `wind.gust`. 4 Flower boxes under both cottage windows, hollyhocks and daisies. 5 Moss on the shade side of every path stone and on the wall foot, lichen spots on the wall top. 6 A watering can left on the path bend (-2, 1.6, -1). 7 Sleeping frog on the wall end (-2.4, 2.5, -4), breathes, blinks when bapped. 8 Broom leaning on the wall. 9 A row of 5 clay pots on the wall, two tipped. 10 Bird bath at (-5, 1.6, -3) with two sparrows that fly off when the cat comes within 1.5 m. 11 Vegetable patch (-7, 1.6, -6): 4 rows of lettuce and cane tepee with beans. 12 Beehive (-8, 1.6, 1) with 6 bees on tiny orbits. 13 Stone bench under the west tree with a cushion and a book. 14 Wooden wheelbarrow with hay by the barrel stack. 15 Rope and bucket on the barrel. 16 Chimney with a thin smoke thread (6 wisps/s, `#D9D4E8`, bending in the wind: a second smoke in the world, so the cat's smoke feels at home). 17 Cat flap in the back door, slightly ajar. 18 Dandelion clocks in the lawn corners (seed sources). 19 Worn patch of bare earth in front of the gate. 20 Gate: iron ring latch, ivy on the left post, a hanging lantern (cold, lights with the last seed). 21 Stair rail of knotted rope on the steps; moss in step corners.

Court ring A/B: 22 Washing stone and a bar of soap at the river edge. 23 Stacked firewood against the shed with a hatchet in a log. 24 Shed: a shutter half open, swallow nest under the eave with two heads. 25 Cart with a sack and a spilled pile of grain, three sparrows pecking. 26 Rain barrel at the shed corner, drip rings every 2 s. 27 Hearth ring: offerings, a bowl, three pebbles, a wilted flower that straightens when the spirit wakes. 28 Stone lantern (ishidoro) at the river path with moss cap. 29 A ladder on the mill wall across the river. 30 Mill wheel: wet shine on the lower paddles, drip particles when it turns, a duck family that paddles off when it starts. 31 Fisherman's stool and rod propped on the bank. 32 Flower border of poppies and lavender along the west bank ramp, bees. 33 Milestone at the bottom of the steps with a scratched cat mark. 34 Clover patch with one four-leaf clover (a tiny keepsake). 35 Footbridge planks across the river, one missing, handrail with a hanging basket. 36 A hammock between the two north trees, swinging, empty. 37 Paper windmill on a stick in the vegetable patch, spins with the gust. 38 Puddle in the court that mirrors the sky colour and the cat as a flat tinted sprite. 39 Scattered petals under the pink tree, one in the water drifting.

Ring C: 40 Three hill silhouettes with 2 tiny far houses, a windmill speck and a drifting bird flock (8 V sprites). 41 Far cloud shadows: a slow 40 m blob of 12% shade moving across the meadow every 30 s.
