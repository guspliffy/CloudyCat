# State

Updated 2026-10-24 (rebuild after Jonny's first playtest).

## Decided
- Game: **Moth** (repo CloudyCat), calm 3D platform-puzzler, concept in `docs/concept.html`.
- Gate A: all recommendations approved. Web stack: TypeScript, Vite, Three.js, Rapier. Desktop and gamepad first, phone playable. Procedural and free art through M2. One long day, 8 levels.
- Cat: cute first (big eyes, soft shapes; very cloudy versions read as a monster).

## Jonny's first playtest (2026-10-24), all addressed in this rebuild
- No clear goal at the start; got stuck and could not get back into the garden.
- Cat had three legs and did not read as smoke; wanted a smoky tail and trail that moves like real smoke while keeping a clear cat shape.
- Not Ghibli enough, too simple; wants deep love for detail.

## Built: Mill Terrace, rebuilt
- Art direction in `docs/ART-GUIDE.md` (Ghibli rules, palette, sun, the smoke cat spec, level plan, first 60 seconds, detail list).
- Painted look (`src/world/ghibli.ts`): two-band anime shading with violet shade, shared wind with gusts. Sky with painted cumulus and far hills (`sky.ts`), blob trees with leaf fringe (`foliage.ts`), wind-blown grass the cat pushes aside (`meadow.ts`), pollen, butterflies, dandelion seeds, chimney smoke (`ambient.ts`).
- Smoke cat (`src/cat.ts`, `src/smoke.ts`): four legs, clean cute face, a body of spring-lagged smoke puffs that trail and swirl when moving, a buoyant smoke tail, wisps from tail, rump, ears and paws, rings on jump and land.
- Level (`src/level.ts`): upper garden terrace (cottage, seed pot on the low wall, barrel stack seed) with a gate and steps down to the court (sleeping spirit pot on the hearth, three lanterns, shed roof seed), river with waterwheel, mill and footbridge. A grassy ramp on the west side leads back up, so nobody gets stuck below.
- Goal: a 6 s intro shot of the sleeping spirit with "Bring three embers to the sleeping spirit.", lantern dots in the corner, a light beam over the next thing to do, the spirit breathes an amber ring toward the next seed.
- Camera pulls in front of walls and now also in front of tree canopies.

## Next
- Jonny plays the rebuild (Gate M1 again: is the goal clear, does the cat feel like smoke, does it feel Ghibli?).
- Feel pass (M2) from his notes, music layer.
