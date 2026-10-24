# State

Updated 2026-10-24 (map, camera and quality pass after Jonny's third playtest).

## Decided
- Game: **Moth** (repo CloudyCat), calm 3D platform-puzzler, concept in `docs/concept.html`.
- Gate A: all recommendations approved. Web stack: TypeScript, Vite, Three.js, Rapier. Desktop and gamepad first, phone playable. Procedural and free art through M2. One long day, 8 levels.
- Hero: Moth is **Kettle**, a small hearth spirit (docs/SPIRIT.md), picked by Jonny 2026-10-24 over Wimble and Sorrel. Cute first (big eyes, soft shapes; very cloudy versions read as a monster). docs/CHARACTER.md is the older cat brief.

## Jonny's first playtest (2026-10-24), all addressed in this rebuild
- No clear goal at the start; got stuck and could not get back into the garden.
- Cat had three legs and did not read as smoke; wanted a smoky tail and trail that moves like real smoke while keeping a clear cat shape.
- Not Ghibli enough, too simple; wants deep love for detail.

## Jonny's second playtest (2026-10-24)
- "The general design is way better now", but visual glitches: a flickering house door, a roof that wasn't clean. Wants everything clean, no glitches.
- Pivot the hero from a cat to a small spirit.

## Polish pass (2026-10-24)
- Doors no longer sit flush with the stone plinths (that was the flicker). Every roof is rebuilt: tiled slabs with overhang, ridge cap, barge boards, fascia, plaster gable ends with a tie beam, and a new cleaner tile texture.
- Overlapping stepping stones, the woodpile, flower pot soil and gate light shafts fixed. Reversed GLSL smoothsteps (undefined behaviour) fixed everywhere.
- `?zcheck` plus `__moth.zcheck.report()` lists coplanar overlapping faces (z-fighting) across all static props.

## Jonny's third playtest (2026-10-24, Kettle build)
- "Pretty well done", most glitches fixed. Asked for: a small map, the camera always behind the spirit while walking (manual only when standing and dragging), and above all a lag free, bug free UI before more levels.

## Map, camera and quality pass (2026-10-24)
- Map (`src/minimap.ts`): round, top right; the level is photographed once from above on the first frame, tinted like paper, and turned with the camera. Marks: Moth (violet drop), the next goal (warm pulse, or an arrow on the rim), the sleeping spirit (pot).
- Camera (`src/camera.ts`): swings behind Moth whenever it walks; dragging takes over until 0.35 s after letting go. Movement keeps the camera angle from when the stick was pushed, so the swing never bends Moth's path.
- Lag: resolution adapts to the frame rate (and notices a 30 Hz screen cap), no per-frame garbage in the loop, player, camera, spirit, smoke and particles, shadow map snapped to whole texels (no crawling shadow edges). `?fixedres` turns the adaptation off.
- Bugs fixed: Moth could walk behind the start card; the start key jumped and cut the intro short; gamepad could not start; Ctrl+W walking closed the tab; coach hints could vanish or never show the gate hint; a seed could fall in the river and a crate could be lost (soft-locks); stuck keys after Cmd or a tab switch; sound kept playing in a hidden tab; banners hid each other early; right-stick look speed depended on frame rate; touch buttons missing on touch laptops; HUD, banner and coach clear of the map and notches.

## Built: Mill Terrace, rebuilt
- Art direction in `docs/ART-GUIDE.md` (Ghibli rules, palette, sun, the smoke cat spec, level plan, first 60 seconds, detail list).
- Painted look (`src/world/ghibli.ts`): two-band anime shading with violet shade, shared wind with gusts. Sky with painted cumulus and far hills (`sky.ts`), blob trees with leaf fringe (`foliage.ts`), wind-blown grass Moth pushes aside (`meadow.ts`), pollen, butterflies, dandelion seeds, chimney smoke (`ambient.ts`).
- Spirit (`src/spirit.ts`, `src/smoke.ts`): Kettle waddles on two nub feet, mittens swing, bap and hug the ember; spring-lagged smoke mantle, a plume rising from its crown like steam that streams back at a run, a sigh ring when idle, wisps and rings on jump and land. `DESIGNS` also holds Wimble and Sorrel (`?spirit=wimble|sorrel`).
- Level (`src/level.ts`): upper garden terrace (cottage, seed pot on the low wall, barrel stack seed) with a gate and steps down to the court (sleeping spirit pot on the hearth, three lanterns, shed roof seed), river with waterwheel, mill and footbridge. A grassy ramp on the west side leads back up, so nobody gets stuck below.
- Goal: a 6 s intro shot of the sleeping spirit with "Bring three embers to the sleeping spirit.", lantern dots in the corner, a light beam over the next thing to do, the spirit breathes an amber ring toward the next seed.
- Camera pulls in front of walls and now also in front of tree canopies.

## Next
- Jonny plays this build (map, camera, smoothness).
- Only Mill Terrace exists. Next levels (Washing Lines first) after he signs off on this one; feel pass and music layer.
