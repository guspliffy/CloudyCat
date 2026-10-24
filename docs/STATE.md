# State

Updated 2026-10-24 (Spark Trail fusion: the spirit garden).

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

## Spark Trail fused into Moth: the spirit garden (2026-10-24)
- Jonny asked to combine his game Spark Trail with Moth: Moth's free 3D movement and look plus Spark Trail's tasks, adaptive difficulty and worlds. Plan doc: https://claude.ai/artifact/BJt2VKpJGLeGFscsTyTtBz.
- Two tries were turned down. A puzzle court where Kettle drifts on a board was "just Sparky in Moth's world". Herding a living spark across a 6x6 yard was too small and still not unique. Jonny wants Spark Trail's idea, not its board: walk onto things, push buttons and boxes that unlock the next step of a riddle, bridges, teleports. He picked **spirit gardens + smoke** (2026-10-24 12:53).
- Now: through an arch in the court's north hedge lies the spirit garden (`src/garden/`, layout numbers in `layout.ts`), about 19 x 23 m inside tall hedges. Spark Trail's pieces become things Kettle uses directly:
  - Room 1, the brass-plate court: a plate opens the lattice gate only while something holds it down. The big crate slides one flagstone per push (walk into it, or bap it), so it can hold the plate, and it is also the only step up to the ember on the stone stack. A crate pushed against the outer hedge puffs home after a moment, so it is never lost.
  - Room 2: hop onto the brick chimney and Kettle puffs into smoke and drifts over the wall into the walled bell yard (Spark Trail's portals). An ember waits there. Bapping the bell raises three stones out of the pond, up to the rock with the third ember, and opens the yard door.
  - Carry the three embers onto the dais at the north end: they fly into the spirit lantern, it lights, and the spirit in the court wakes with its lanterns, the waterwheel and the mill.
- The map always marks the next step (the arch from outside, then the plate, the crate, the chimney, and so on); Jonny asked for it 2026-10-24.
- Help adapts like Spark Trail's bands: per tool (plate, crate, chimney, bell, stones, step), the light beam points at the next step only after a wait in the garden, 12, 25 or 45 s depending on how quickly that tool went last time. Coach lines teach each tool once.
- Progress saves in localStorage `moth-garden-v1`; `?fresh` resets it.

## Next
- Jonny plays the spirit garden.
- Then: more gardens (the Spark Trail tools still unused: breeze streams, lily pads that drift, rising bridges), a garden per world, and layout variants chosen by the adaptive bands.
