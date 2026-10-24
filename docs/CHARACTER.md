# Moth: character design brief

Creative director (Fable), 2026-10-23. Written after Jonny asked for a cat that is "more cloudy ish and detailed" and "really appealing and lovable from first sight rather than just a simple cartoon cat with smoke".

Live look study: `study/index.html` (built from `study/template.html` + `study/designs.mjs`).

## What makes this cat lovable at first sight

1. **Baby proportions.** Head about as big as the body, short legs, oversized paws, no neck to speak of.
2. **Eyes carry the whole face.** Large, wide-set, slightly low on the head, heavy upper lids, lifted outer corner. Warm amber iris, soft almond pupil that rounds out in shade, one big catchlight. The eyes are the only hard, glossy surface on the character.
3. **One material, honestly.** Not a cat with smoke on it: a small cumulus cloud that happens to be cat-shaped. Rounded lobes everywhere, a cloud collar at the chest, a plume tail, edges that catch light like a cloud lit from behind.
4. **Readable silhouette.** Round head, two clear triangular ears, a wide low loaf body, a thick tail curling round the front. Readable as a dark blob on a phone at arm's length.
5. **Asymmetry.** One ear angled more than the other, the tail curled to one side, one cheek lobe slightly bigger. Perfect symmetry reads as a logo.
6. **A signature feature.** The chest ruff (cloud collar) plus a tail ending in a big soft curl.
7. **Idle life.** It breathes (lobes swell), lobes drift slowly like real cloud, the tail tip curls on its own. Nothing is ever fully still.

## Three directions

### A. Dumpling (recommended)
A round little cloud kitten built from big soft cumulus lobes, with a cloud collar and a plume tail.
- Head:body 1:1.1, very short legs, big paws, medium ears.
- Eyes 0.6 of head radius, iris #FFB15E with core #FFE3A3, soft vertical almond pupil, one large catchlight upper left and a tiny one lower right.
- Big billowy lobes (about 0.45 head radius), bigger on cheeks, ruff and tail; smooth face.
- Base #3B3550, shadow #221E33, rim #E8C6A6, inner glow #6F5B8A, dusty-rose nose #B97A7A.
- Idles: slow breathing with drifting lobes; tail tip curl; slow blink then head tilt, ears a beat later.

### B. Lantern
A slimmer dusk-cloud cat whose thin edges glow like a paper lantern. Elegant, a little mysterious.
- Head:body 1:1.4, longer legs, small paws, tall ears trailing wisps.
- Almond eyes, iris #F2A54A with deep ring #B86A1F, narrow pupil, one small catchlight.
- Fine fluff with wispy edges. Base #2E2A45, rim #FFD9A0, warm inner glow.

### C. Stormling
A sturdy little storm cloud with a silver lining, heavy brows and a big rolling tail.
- Head:body 1:1.2, short thick legs, huge paws, small wide-set ears.
- Round eyes, iris #FFC978, two catchlights, heavy brow lobes.
- Layered flat lobes. Base #363B4A, rim #D9E2EA cool silver.

**Why Dumpling:** it is unmistakably a cloud, detailed without being fussy, and huggable at a glance. Lantern reads mysterious before lovable and its fine fluff turns to mush at small sizes. Stormling's brow drifts toward grumpy. Dumpling also fits the smoke mechanic best: thick lobes can visibly thin in sun.

## Build spec (Dumpling)

Units: head radius = 1.0. Sitting, facing +Z, Y up, ground y = 0. The exact numbers in use live in `study/designs.mjs` (tuned from this spec: larger eyes, a wider face mask, calmer paws).

| Part | Type | Centre | Size | k |
|---|---|---|---|---|
| Head | sphere | (0, 2.55, 0.25) | r 1.00 | 0.30 |
| Cheek L / R | sphere | (-0.72, 2.30, 0.45) / (0.74, 2.28, 0.45) | r 0.50 / 0.54 | 0.35 |
| Muzzle | ellipsoid | (0, 2.30, 1.00) | (0.45, 0.32, 0.35) | 0.25 |
| Ears | round cone | base (±0.58, 3.20, 0.10) r 0.38, tips (-0.90, 4.00, 0.00) / (0.80, 4.05, -0.05) | | 0.20 |
| Ruff | spheres | (0, 1.90, 0.75) r 0.45; (±0.55, 1.95, 0.60) r 0.42; (±0.95, 2.10, 0.30) r 0.38 | | 0.45 |
| Body | ellipsoid | (0, 1.15, -0.15) | (1.05, 1.15, 1.00) | 0.40 |
| Haunches | ellipsoid | (±0.85, 0.65, -0.10) | (0.55, 0.60, 0.70) | 0.40 |
| Front legs | capsule | (±0.40, 1.30, 0.55) to (±0.40, 0.30, 0.70) | r 0.26 | 0.30 |
| Paws | ellipsoid | (±0.42, 0.28, 0.80) | (0.34, 0.26, 0.40) | 0.25 |

Tail: sphere chain curling round the right side to the front paws, radii growing to a plume then a curled tip.

Eyes: glossy, no noise; iris fills the visible eye (no white). Nose never brighter than the eyes. Wisps #4A4360 at 30 percent.

Judge against sky #CFE3EC, lit grass #B9C98A and a shade pool #4F6A5C. The cat must stay darker than the shade pool.

## Three tests

1. **Pet test.** Would you reach out and squish it? "Looks cool" instead of "looks soft" means the lobes are too small or sharp.
2. **Phone test.** From three metres on a phone, can you see the ears, the tail curl and the eyes, and tell its mood?
3. **Cloud test.** Cover the eyes. Does the rest still read as a cloud creature and not a black cat shape?
