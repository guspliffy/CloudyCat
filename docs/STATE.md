# State

Updated 2026-10-24 (Spark Trail fusion: herd the sparks).

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

## Jonny's notes on the map build (2026-10-24 08:21), done
- Camera a bit further back (camDistance 3.5) and calmer: the walking direction is smoothed, small steering is ignored, the swing eases in and out, height follows slowly so jumps do not bob the view, leaves ease the camera in instead of snapping.
- Kettle got soft cat ears (they flick now and then, lie back at a run, perk up when happy) and a friendlier face: a small cat smile, bigger pupils, warmer eyes, fully open lids, face-coloured lids for the happy squint.

## Jonny's camera note (2026-10-24 09:15), done
- The eased camera lagged too much: it only turned once Moth was leaving the screen. Now, while walking, the camera stays right behind Moth's back round every corner (follows Moth's facing, camAutoYaw 5, camLag 10); turning on the spot leaves it calm. Kettle turns a little softer (turnRate 8).
- Holding one direction walks a straight line; any change of direction picks up the camera's new angle, so after a corner "forward" is forward on screen again.

## Built: Mill Terrace, rebuilt
- Art direction in `docs/ART-GUIDE.md` (Ghibli rules, palette, sun, the smoke cat spec, level plan, first 60 seconds, detail list).
- Painted look (`src/world/ghibli.ts`): two-band anime shading with violet shade, shared wind with gusts. Sky with painted cumulus and far hills (`sky.ts`), blob trees with leaf fringe (`foliage.ts`), wind-blown grass Moth pushes aside (`meadow.ts`), pollen, butterflies, dandelion seeds, chimney smoke (`ambient.ts`).
- Spirit (`src/spirit.ts`, `src/smoke.ts`): Kettle waddles on two nub feet, mittens swing, bap and hug the ember; spring-lagged smoke mantle, a plume rising from its crown like steam that streams back at a run, a sigh ring when idle, wisps and rings on jump and land. `DESIGNS` also holds Wimble and Sorrel (`?spirit=wimble|sorrel`).
- Level (`src/level.ts`): upper garden terrace (cottage, seed pot on the low wall, barrel stack seed) with a gate and steps down to the court (sleeping spirit pot on the hearth, three lanterns, shed roof seed), river with waterwheel, mill and footbridge. A grassy ramp on the west side leads back up, so nobody gets stuck below.
- Goal: a 6 s intro shot of the sleeping spirit with "Bring three embers to the sleeping spirit.", lantern dots in the corner, a light beam over the next thing to do, the spirit breathes an amber ring toward the next seed.
- Camera pulls in front of walls and now also in front of tree canopies.

## Herd the sparks: Spark Trail fused into Moth (2026-10-24)
- Jonny asked to combine his game Spark Trail with Moth: Moth's free 3D movement and look plus Spark Trail's tasks, adaptive difficulty and worlds. Plan doc: https://claude.ai/artifact/BJt2VKpJGLeGFscsTyTtBz. Jonny: "go for it", he judges after playing a few rounds.
- First try (puzzle court: step on and Kettle itself drifts on a board, fixed camera) was judged "just Sparky in Moth's world". Jonny wants a real fusion that keeps free third-person play. He picked **herd the sparks** (2026-10-24 11:34).
- Now: Kettle always walks free. In the spark yard on the east lawn a little living spark (eyes, flame) sits on 6x6 flagstones. Bap it and it zips away from Kettle along the stones until something stops it (Spark Trail's rule). Walk round it (or climb on a piece) to send it another way. It gathers three embers on its way, then must stop in the ember bowl. A ring and dots on the stones show where it will stop. Obstacles, the crate and closed pens are solid, so Kettle walks round and climbs on them. The camera rises a little in the yard.
- `src/court/rules.ts` ports Spark Trail's rules engine (walls, keys, crate, gates and switch, portals, risers, pads, currents) with a BFS solver. `boards.ts` holds 6 stops from Jonny's own catalogs (intro 0, 2, 4 and mill 500, 501, 503), each with Gentle, Standard and Challenging variants, all checked by the solver. `adapt.ts` ports adaptation.mjs (a skill band per tool family, first finishes only, intro stops capped at Standard, comfort stops one step easier). `court.ts` is the 3D court: obstacles, embers, bowl, crate, picket-pen gates and the brass bell stone, drift animation and preview rings.
- Each first win sends the embers to the spirit and brings back one piece of the terrace, with a short camera shot: the three lanterns, the waterwheel, the mill windows, then the spirit wakes. A line says how many baps it took against the shortest; the next puzzle rises by itself. Once the spirit is awake, the yard offers puzzles below three flames again when Kettle comes back.
- Controls in the yard: Bap (E, pad X, touch Bap) sends the spark; Undo (Z, Backspace, pad LB) and Start over (R, pad Y), also as two buttons.
- Progress saves in localStorage `moth-court-v1`. `?fresh` resets it, `?round=N` starts at round N.

## Next
- Jonny plays the six spark puzzles.
- Then: sparks in more places of the open world (not only one yard), more tools (chimneys for portals, breeze streams, lily pads, rising stones), and the moving track of adaptive difficulty.
