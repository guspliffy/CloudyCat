// Spark Trail's puzzle rules, ported as they are from Jonny's game (engine.mjs, mill-engine.mjs and
// 3d/expansion-rules.mjs), so every board solves exactly as it does there.
// One rule carries it all: pick a direction and drift until something stops you.
// Collect the three embers (Spark Trail's keys), then stop on the ember bowl (the chest).

export type Dir = 'up' | 'right' | 'down' | 'left';
export const DIRS: Record<Dir, [number, number]> = { up: [-1, 0], right: [0, 1], down: [1, 0], left: [0, -1] };
export const DIR_LIST = Object.keys(DIRS) as Dir[];

export interface Board {
  size: number;
  start: [number, number];
  walls: number[];
  exit: number;
  keys: number[];
  gates?: number[];
  switch?: number;
  crate?: number;
  fixedCrate?: boolean;
  portals?: [number, number][];
  risers?: number[];
  pads?: number[];
  currents?: Record<string, Dir>;
  par: number;
  name: string;
  difficulty: string;
  variantId: string;
  tier: number;
}

export interface State { pos: [number, number]; mask: number; opened: boolean; crate: number; raised: number }
export interface Frame extends State { dir: Dir; teleport: boolean }
export interface Move extends State { path: [number, number][]; frames: Frame[]; pushed: boolean; won: boolean }

export const initialState = (l: Board): State => ({ pos: [l.start[0], l.start[1]], mask: 0, opened: false, crate: Number.isInteger(l.crate) ? l.crate! : -1, raised: 0 });
export const snapshot = (s: State): State => ({ pos: [s.pos[0], s.pos[1]], mask: s.mask, opened: s.opened, crate: s.crate, raised: s.raised });
export const stateKey = (s: State) => `${s.pos[0]},${s.pos[1]},${s.mask},${+s.opened},${s.crate},${s.raised}`;
export const isWon = (l: Board, s: State) => s.mask === 7 && s.pos[0] * l.size + s.pos[1] === l.exit;

export function move(l: Board, initial: State, direction: Dir): Move | null {
  let { pos: [r, c], mask, opened, crate, raised } = snapshot(initial);
  let dir = direction, pushed = false;
  const path: [number, number][] = [], frames: Frame[] = [], seen = new Set<string>();
  const walls = new Set(l.walls), gates = new Set(l.gates ?? []), pads = new Set(l.pads ?? []);
  const currents = l.currents ?? {}, portals = l.portals ?? [], risers = l.risers ?? [];
  const blocked = (r: number, c: number) => r < 0 || c < 0 || r >= l.size || c >= l.size || walls.has(r * l.size + c)
    || risers.some((cell, i) => cell === r * l.size + c && (raised & (1 << i))) || (!opened && gates.has(r * l.size + c));
  const collect = (cell: number) => { const k = l.keys.indexOf(cell); if (k >= 0) mask |= 1 << k; if (cell === l.switch) opened = true; };
  const record = (teleport = false) => { path.push([r, c]); frames.push({ pos: [r, c], mask, opened, crate, raised, dir, teleport }); };
  while (true) {
    const loop = [r, c, mask, opened, crate, raised, dir].join(',');
    if (seen.has(loop)) return null;
    seen.add(loop);
    const [dr, dc] = DIRS[dir], nr = r + dr, nc = c + dc, cell = nr * l.size + nc;
    if (blocked(nr, nc)) break;
    if (cell === crate) {
      const br = nr + dr, bc = nc + dc;
      if (blocked(br, bc) || l.fixedCrate) break;
      crate = br * l.size + bc; pushed = true;
    }
    const leaving = risers.indexOf(r * l.size + c);
    if (leaving >= 0) raised |= 1 << leaving;
    r = nr; c = nc; collect(cell); record();
    if (pushed) break;
    const portal = portals.find((pair) => pair.includes(cell));
    if (portal) {
      const destination = portal.find((p) => p !== cell)!;
      if (destination === crate) break;
      r = Math.floor(destination / l.size); c = destination % l.size; collect(destination); record(true);
      break;
    }
    if (pads.has(cell)) break;
    if (currents[cell]) dir = currents[cell];
  }
  if (!path.length) return null;
  return { pos: [r, c], mask, opened, crate, raised, path, frames, pushed, won: mask === 7 && r * l.size + c === l.exit };
}

/** Shortest route (breadth first), or null. */
export function solve(l: Board, initial = initialState(l)): Dir[] | null {
  if (isWon(l, initial)) return [];
  const queue: { state: State; parent: number; dir: Dir | null }[] = [{ state: initial, parent: -1, dir: null }];
  const seen = new Set([stateKey(initial)]);
  for (let i = 0; i < queue.length; i++) for (const dir of DIR_LIST) {
    const next = move(l, queue[i].state, dir);
    if (!next) continue;
    if (next.won) {
      const route: Dir[] = [dir];
      let p = i;
      while (queue[p].parent !== -1) { route.push(queue[p].dir!); p = queue[p].parent; }
      return route.reverse();
    }
    const key = stateKey(next);
    if (!seen.has(key)) { seen.add(key); queue.push({ state: snapshot(next), parent: i, dir }); }
  }
  return null;
}

/** Stars reward a short route. Undo is free and undone drifts do not count. */
export const rating = (moves: number, par: number) => (moves <= par ? 3 : moves <= par + 2 ? 2 : 1);

export type Family = 'route' | 'crate' | 'gate' | 'current' | 'pad' | 'portal' | 'riser';
export function featureFamilies(l: Board): Family[] {
  const f: Family[] = [];
  if (Number.isInteger(l.crate) && l.crate! >= 0) f.push('crate');
  if (l.gates?.length) f.push('gate');
  if (Object.keys(l.currents ?? {}).length) f.push('current');
  if (l.pads?.length) f.push('pad');
  if (l.portals?.length) f.push('portal');
  if (l.risers?.length) f.push('riser');
  return f;
}
