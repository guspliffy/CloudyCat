// Where the spirit garden sits: north of the court, through an arch in the court's north hedge.
// Plain numbers only, so the terrain (level.ts) and the garden (garden.ts) can both read them.
// World: X east, -Z north, Y up, metres.

/** The whole garden inside its tall hedges. */
export const GARDEN = { x0: -10.1, x1: 9.2, z0: -50.3, z1: -27.3 };
/** The arch from the court into the garden. */
export const ARCH = { x: 0, z: -27.3, half: 1.2 };
/** Room 1, the brass-plate court: flagstones on a 1 m grid the crate slides on. */
export const ROOM1 = { x0: -9.6, x1: 8.75, z0: -35.15, z1: -27.75, floor: 0.04 };
/** Cells the crate may stand on (centres, inclusive). */
export const CELLS = { x0: -8.5, x1: 7.5, z0: -34.5, z1: -28.5 };
/** The tall hedge between room 1 and room 2, with the lattice gate in it. */
export const DIVIDE = { z: -35.6, gateHalf: 1.3 };
export const PLATE = { x: 4.5, z: -31.5 };
export const CRATE_HOME = { x: 1.5, z: -31.5 };
/** The stone stack in room 1 that holds the first ember; too high to jump onto without the crate. */
export const PLINTH = { x: -6.8, z: -31.5, half: 0.8, h: 3.2 };
/** The pond in room 2, its rock and the three stones that rise when the bell rings. */
export const POND = { x: -4, z: -41.5, r: 3.6, water: -0.35, bed: -1.0 };
export const ROCK = { x: -4, z: -41.5, r: 0.85, h: 3.2 };
export const STONES = [
  { x: -1.5, z: -41.5, top: 0.8 },
  { x: -2.8, z: -43.58, top: 1.6 },
  { x: -5.2, z: -43.58, top: 2.4 },
];
/** The walled bell yard: no way in but the chimney, until the bell opens its door. */
export const YARD = { x0: 2.8, x1: 9.0, z0: -44.0, z1: -38.0, wall: 0.5, h: 3.4, doorZ: -41.2, doorHalf: 0.6, doorH: 2.1 };
export const CHIMNEY_OUT = { x: 1.5, z: -39.2, h: 1.3, half: 0.42 };
export const CHIMNEY_IN = { x: 4.3, z: -39.2, h: 1.3, half: 0.42 };
export const BELL = { x: 7.4, z: -39.7 };
export const EMBER_C = { x: 7.5, z: -42.9, stand: 0.55 };
/** The spirit lantern on its round dais at the north end. */
export const DAIS = { x: 1.2, z: -47.3, r: 2.1, h: 0.4 };
