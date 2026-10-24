# Moth: the small spirit (hero pivot from the cat)

Creative director, 2026-10-24. Jonny: world is "way better now"; the hero becomes "a small spirit". Keep what he approved (big round eyes with catchlights, blush, soft round shapes, light cloud texture), keep smoke that lags, curls and trails, keep a clean silhouette. Original, not a soot sprite, kodama, Totoro or No-Face. Same build method as `src/cat.ts`: opaque noise-shaded core, clean face on the surface, spring-lagged surface puffs, a verlet tail of puffs, wisps. Knee-high (0.45 to 0.55 m). Colours are the ART-GUIDE palette only.

Story thread (one line, costs nothing, helps everything): the hero is a stray puff of the hearth's own smoke. Carrying the embers home is a homecoming, so the smoke is not a costume, it is what the spirit is made of.

## 1. Three directions

### A. Wimble, the cloud dumpling
Pitch: a pale little cumulus egg that hovers a hand above the grass on its own cushion of cloud and trails a soft comma.
- Silhouette: one mass, the head is the body: an egg 0.30 m wide, 0.34 m tall, slightly heavier at the bottom. No legs: it floats 0.08 m up on a flat cushion of 10 puffs (0.26 × 0.06 m). Two nub arms r 0.035 m. A comma tail of 6 puffs from the lower back, curling up and to its left. Top of head at about 0.50 m.
- Face: eyes r 0.045 m (0.6 of the half-width), centres 0.13 m apart, sitting at 0.62 of the body height, round pupils, one big catchlight upper left and a tiny one lower right. Blush discs r 0.035 m. Mouth a 0.02 m soft dash that becomes a small "o" when it inhales.
- Colours: body lit `#EFE9F0`, shade `#B3AED3`, deep shade `#8B88B4`, rim `#FFFDF6` (the cumulus row); cushion and tail `#EFE9F0` to `#B3AED3`; iris `#F7A94C` core `#FFE3A3`, pupil `#1A1226`, blush `#E79AA6`.
- Smoke: the cushion lags most (spring k 90), so at a run the body leans forward and the cushion trails behind like a skirt; the comma streams back. Jump: the cushion stays at the take-off point as a ring, the body stretches 1.15 in y. Double jump: the body inflates 1.12 for 120 ms and a wide ring of 14 pale puffs pops out. Land: the cushion flattens and spreads 1.6×, the body squashes. Bap: the whole body lunges and the cushion squirts forward in 6 wisps.
- Carry: the ember sits in the cushion under the chin like a lamp in a basket; it lights the belly and the underside of the cheeks.
- Idles: bobs 0.012 m at 0.4 Hz like something floating; tips onto one side while the cushion drifts out from under it, then the cushion catches it (a sleepy wobble); tilts its whole body back to watch a butterfly or a cloud go by.
- Cute: baby egg shape, pale, all face. Lowest monster risk of the three. Weakness: a hovering hero has no footfall, so jump and land feel lighter, and a pale body is lost against sky and plaster (it breaks the "darker than the shade pool" rule).

### B. Kettle, the little chimney
Pitch: a tubby dusk-violet hearth spirit that waddles on two nub feet, and whose smoke rises from the crown of its head like steam from a spout, streaming back like hair when it runs.
- Silhouette: round head r 0.14 m on a round belly r 0.15 m, head overlapping the belly by a third, no neck. Head:body width 1:1.05. Two nub feet (flattened domes 0.11 × 0.06 m) it waddles on; two mitten hands r 0.036 m on the belly's sides. A single smoke plume from the top-back of the head, rising 0.28 m at rest and curling, the tail. Crown at 0.49 m.
- Face: eyes r 0.040 m (0.57 R), centres 0.108 m apart, set 0.016 m into the head, iris fills the eye, round pupil, big catchlight upper left and a tiny one lower right, heavy upper lid at 15% rest. Blush discs r 0.028 m under the outer eye corners. A tiny mouth dash 0.022 m, no nose. Eyes are the only glossy surface.
- Colours: core `#3D3860`, shade `#24203A`, sun side pulled toward `#625B92`, rim `#FFD9A0`; puffs `#8A7FB5` lit to `#B8B0D6` pale, never darker than the core; iris `#F7A94C` core `#FFE3A3`, pupil `#1A1226`, blush `#E79AA6`, mouth `#24203A`.
- Smoke: a mantle of puffs over the belly and the back of the head, a collar ring of puffs hiding the head-belly join, and the crown plume. Walk: the plume sways with each step; run: it streams back and up at 30°, stretched 1.3×, and the lower back sheds a wake of wisps. Stop: everything arrives after the body, in order mittens, mantle, plume. Jump: a ring of 8 puffs stays at the feet, the plume lags 70 ms and floats up at the apex. Double jump: the body "puffs" (inflates 1.12 for 120 ms) and a horizontal ring of 14 pale puffs plus 6 downward bursts from the belly centre. Land: squash, 8 + 10 × strength puffs roll outward at foot height, the plume overshoots down and forward then springs back, both mittens flap up once. Bap: both mittens shoot forward 0.07 m, a short cone of 6 wisps leaves from between them, the plume flicks back, the eyes squeeze happy for 150 ms.
- Carry: hugs the ember to its belly with both mittens. The ember up-lights the belly, cheeks and under-eyes (`#FFC46B` × 0.35 in the core shader), blush gains 30%, and 3 amber sparks a second rise through the plume. The plume stays smoke-coloured.
- Idles: the kettle breath, every 6 to 9 s it inhales (belly 1.06×, plume shrinks) and sighs one small round smoke ring out of its crown that drifts off on the wind; the look-about, eyes glance to the nearest ember or lantern, the head tilts 8°, one mitten lifts to a cheek a beat later; the settle, after 4 s still it sinks 0.015 m into its feet, lids to 30%, the plume droops forward-right and curls, and the first step pops it upright with a tiny puff.
- Cute: toddler proportions with weight (feet, waddle, mittens), a smoke-free dome of a face, smoke that lives above and behind the eyes, one readable plume instead of many tendrils, smoke lighter than the body. It reads as a teardrop with a flag on a phone.

### C. Sorrel, the brush-stroke
Pitch: a deep-dusk spirit that is all head, with a brush-stroke of smoke where a body should be, swimming through the air like a tadpole.
- Silhouette: solid round head r 0.15 m floating at 0.42 m, two mitten hands r 0.04 m under the chin, and below the head a tapering plume of 18 puffs, 0.14 m wide at the neck to 0.02 m at the tip, 0.35 m long, hanging and curling to its left. No feet. A small silver-rimmed lobe on the top of the head for asymmetry.
- Face: eyes r 0.048 m (0.64 R), centres 0.14 m apart, big catchlights, round pupils; blush r 0.032 m; tiny mouth.
- Colours: head `#363B4A`, shade `#24203A`, rim cool silver `#D9E2EA` (the Stormling set); plume `#8A7FB5` to `#B8B0D6`; iris `#FFC978` core `#FFE3A3`, pupil `#1A1226`, blush `#E79AA6`.
- Smoke: the plume is body and tail at once, a 9-node verlet chain. Walk: the plume sweeps side to side like a fish tail, that is the gait. Run: it streams straight back. Jump: it whips down then trails. Double jump: it blooms into a ring and re-gathers. Land: it pools on the ground as a disc then rises back under the head. Bap: head-butt lunge, the plume snaps forward.
- Carry: the ember is cradled in the top of the plume under the chin, so the smoke glows from inside. The prettiest carry of the three.
- Idles: curls the plume into a spiral and sits on it; brings its hands together and kneads nothing; slow blink then taps the ground twice with the plume tip.
- Cute, with care: the head keeps baby proportions and the face stays solid, but a dark head on a trailing smoke body is the classic ghost silhouette. It needs mittens and blush always on, a plume never longer than 2.5 R, no tendrils, plume lighter than the head.

## 2. Recommendation: B, Kettle
Why: it serves the verbs. Feet and weight make jump, land and bap read on the ground (the "three legs" problem disappears: two nub feet under a round belly are always visible). The crown plume is an original signature with a story (the hearth's stray smoke) and it puts the smoke where it can be thick and alive without ever touching the eyes. It keeps the exact face Jonny approved, adds a mouth and mittens for expression, and survives the phone test as a teardrop with a flag. Wimble is cuter at rest but floats through the platforming and vanishes against sky; Sorrel is the most smoke-like and the most likely to be called a monster again.

The one risk to watch: the crown plume reading as hair or a flame. Rules: it is always smoke-coloured (never amber, even when carrying; only the sparks are amber), slow (lag at least 70 ms, buoyant, viscous), built from lobes no smaller than 0.035 m, and it never crosses the face plane: clamp plume nodes below y 0.50 to z ≤ head z + 0.02 m, so when the spirit stops and the plume overshoots forward it curls over the crown, not over the eyes.

## 3. Build numbers for Kettle
Metres, facing +Z, Y up, feet at y 0. Replace `HU` scaling with direct metres or set `SU = 0.14` (head radius) and divide. Keep `cloudMaterial` (noise core), `eyeMaterial`, `SmokeRenderer`, the puff spring, the verlet tail, the wisp pool, the ground shadow, `thin`, `carryAnchor` and the squash spring. Collider: capsule r 0.15, height 0.49.

| Part | Type | Centre | Size | Notes |
|---|---|---|---|---|
| Belly | ellipsoid | (0, 0.165, 0.00) | r (0.145, 0.150, 0.135) | noise core, `#3D3860`, k 0.40 noise strength as the cat body |
| Head | sphere | (0, 0.350, 0.02) | r 0.140 | noise 0.30, smooth within 60° of the face normal (0, -0.1, 1) |
| Cheeks | spheres | (±0.100, 0.315, 0.075) | r 0.055 / 0.058 (right bigger) | asymmetry |
| Eyes | spheres | (±0.054, 0.365, 0.131) | r 0.040 | `eyeMaterial`, `uPupilW 0.75` (round), lids rest 0.15, blink every 3 to 6 s, double blink 20% |
| Blush | surface discs | head direction (±0.70, -0.25, 0.66) | r 0.028 | `#E79AA6` 55% alpha, soft edge, 85% when carrying or happy |
| Mouth | surface decal | (0, 0.322, 0.138) | 0.022 × 0.008 dash | `#24203A` 60%; widens to a 0.030 m smile arc on bap, delivery and lantern lighting |
| Mittens | spheres | (±0.155, 0.190, 0.050) | r 0.036 | spring k 180, lag 0.02, maxOff 0.012; touch the belly, no limb needed |
| Feet | flattened domes | (±0.065, 0.025, 0.030) | r (0.055, 0.030, 0.065) | contact blob `CircleGeometry` r 0.05 `#2C2850` 45% under each |
| Collar | puff ring | y 0.25, radius 0.135, 10 puffs | size 0.045 to 0.060 | hides the head-belly join; k 260, lag 0.015 |
| Plume root | anchor | (0, 0.470, -0.040) | | top-back of head |

Gait: step frequency 2.4 Hz at walk, 3.6 Hz at run; feet alternate lifting 0.025 m with a 0.03 m forward swing; the belly rolls ±4° and bobs 0.008 m; the head counter-rolls 2°. Stand: squash spring as the cat (jump +5, double +7, land -4 -5 × strength), stretch 1.15 y on jump, squash 0.86 y / 1.08 xz on land.

Surface puffs (`scatter`, same spring model): belly 40 puffs size 0.050 to 0.080, k 170, lag 0.03, maxOff 0.015 m, rear puffs get k × 0.55 and maxOff × 2 as now; belly halo 16 puffs at 1.10× radii, size 0.085 to 0.120, alpha 0.18, k 120, lag 0.04, light 0.3; head 14 puffs on the back and top only (skip within 70° of the face normal), size 0.040 to 0.060, k 420, lag 0.006, maxOff 0.005. Base alpha 0.55 lit `#8A7FB5`, thinning to `#B8B0D6`. Idle: size × (1 + 0.07 sin(1.4 t + seed)), as now. Total surface puffs 80.

Plume (the tail): verlet, 8 nodes, rest spacing 0.045 m (0.36 m rest length), root fixed at the plume root. Per step: inherit root velocity, `vel *= 0.86`, buoyancy +1.1 m/s², link spring k 55 c 8, rest-pose pull k 6 toward a shape that rises straight for 3 nodes then curls back and to the right, wind × 0.4, curl noise amplitude 0.3 on the last 3 nodes, max bend 45° per link, face clamp as in section 2. 14 puffs ride the chain, size 0.075 at the root to 0.035 at the tip, alpha 0.55 to 0.15, erode 0.3 to 0.75 so the tip dissolves. Run: nodes spread 1.3×, sizes × 0.85, plume angle about 30° above the back. Rest: tip rises and sinks 0.02 m at 0.3 Hz. `carryAnchor` moves off the tail to (0, 0.210, 0.140) in body space.

Wisps (pool 200, phone 100), all using the ART-GUIDE 2.4 motion rules (35% velocity inheritance, drag exp(-2.2 dt), buoyancy 0.45 for the first 60% of life, wind × 0.6, two-octave curl noise, velocity stretch, diffusive growth and mass-conserving fade, alpha × 0.2 near the face on screen):

| Source | Rate | Spawn | Life | Size | Colour, alpha |
|---|---|---|---|---|---|
| Plume tip | 5/s rest, 12/s run | last node | 1.6 to 2.2 s | 0.035 to 0.12 m | `#B8B0D6` 0.22 |
| Lower back wake | 0 rest, 6/s walk, 14/s run, alternating sides | (±0.06, 0.14, -0.14) | 1.1 to 1.6 s | 0.05 to 0.16 m | `#8A7FB5` 0.30 |
| Jump ring | 8 once | foot height, take-off point, stays behind | 0.9 s | 0.07 to 0.20 m | `#8A7FB5` 0.35 |
| Double jump | 14 horizontal ring + 6 down | belly centre | 1.0 s | 0.065 to 0.19 m | `#B8B0D6` 0.45 |
| Land | 8 + 10 × strength, outward 1.4 m/s × strength | foot height | 0.8 to 1.2 s | 0.06 to 0.23 m | `#8A7FB5` 0.4 × strength |
| Bap cone | 6 once | between the mittens, forward 0.8 m/s | 0.6 s | 0.04 to 0.10 m | `#B8B0D6` 0.35 |
| Sigh ring (idle) | 1 ring of 8 every 6 to 9 s | plume root, rising 0.25 m/s, ring radius 0.03 growing to 0.10 | 1.8 s | 0.03 to 0.05 m | `#B8B0D6` 0.30 |
| Ember sparks | 3/s carrying | ember, up through the plume | 1.0 s | 0.012 to 0.003 m | `#FFC46B` 0.9 additive |
| Thin (gate) | 40/s | whole core volume | 1.0 s | 0.06 to 0.12 m | `#B8B0D6` 0.35 |

State responses: bap, mittens to (±0.075, 0.200, 0.120) in 80 ms, back in 200 ms, `uHappy` 0.6 for 150 ms, plume shove (0, 0.4, -1.2). Carry, mittens to (±0.055, 0.210, 0.130), ember sphere r 0.035 `#FFC46B` core `#FFE8B8` with the existing additive halo at the anchor, core shader uniform `uEmber` adds `#FFC46B × 0.35 × saturate(1 - dist/0.30)` from the anchor as an up-light, blush 85%. Thin, core 40% opaque, puffs alpha × 0.65 and light 0.8, plume spread 1.6×, face 100%. Idles on the timings in B; the look-about targets the nearest unlit seed or lantern within 6 m and uses `uLook` ± 0.12. Everything moving reads the shared wind.

Checks before showing Jonny: pet test (would you squish it), phone test (head, plume and eyes visible at 3 m, mood readable), cloud test (cover the eyes, it still reads as a smoke creature, not a dark blob), and the ghost test (in silhouette, feet and mittens are visible from the default camera).
