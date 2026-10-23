# State

Updated 2026-10-23 (overnight build while Jonny slept).

## Decided
- Game: **Moth** (repo CloudyCat), calm 3D platform-puzzler, concept in `docs/concept.html`.
- Gate A: all recommendations approved. Web stack: TypeScript, Vite, Three.js, Rapier. Desktop and gamepad first, phone playable. Procedural and free art through M2. One long day, 8 levels.
- Cat: "Lantern, cuter" (Jonny: the cloudier versions looked like a monster). Big round eyes, blush, soft body, only light cloud texture. Look study in `study/`, design id `lantern-cute`.

## Built: M1 greybox, Mill Terrace
- Controller (`src/player.ts`): walk/trot/run by stick tilt, jump with coyote time and buffer, floaty apex, double jump puff, paw bap (knocks pots and crates), hold paw at the sunlit gate to thin through it. Falls and the river float you back to the last safe ground.
- Camera (`src/camera.ts`): lagging follow, slow auto-swing behind movement, drag to look, pulls in front of hedges and buildings only.
- Level (`src/level.ts`): south garden (wall with the seed pot, barrel stack seed), hedge with the gate, north court (sleeping spirit, shed roof seed), river and waterwheel, optional firefly route to a ribbon keepsake on the hedge corner.
- Loop (`src/main.ts`): carry one ember-seed at a time to the spirit, lanterns light per seed, the third wakes the spirit and turns the wheel. HUD shows seeds placed only after the first pickup.
- First-minute coach lines in the world, one at a time, with the right key for keyboard, gamepad or touch.
- In-game cat (`src/cat.ts`): mesh version of the cute Lantern, with breathing, trot gait, squash and stretch, tail sway, ear twitch, blink, idle stretch and loaf.
- Sound (`src/audio.ts`): Web Audio synth for paws, jumps, bap, seeds, wake, wind.
- Tuning: every feel number in `src/tuning.ts`; open with `?dev` for live sliders.

## Next
- Jonny plays the greybox (Gate M1: is moving around already pleasant?).
- Feel pass (M2): tune controller and camera from his notes, composed camera shots, painterly shader, music layer.
- Bring the raymarched look-study cat into the game if the mesh cat is not cute enough.
