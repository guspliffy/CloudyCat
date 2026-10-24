// Spark Trail's adaptive difficulty, ported from Jonny's adaptation.mjs. A skill band per tool
// (0 Gentle, 1 Standard, 2 Challenging), judged only on the first finish of a stop: a clean three star
// first solve moves that tool one step harder, a one star or struggling solve one step gentler, and two
// strained two star solves in a row one step gentler. A stop that brings a new tool never starts above
// Standard, a comfort stop drops one step, and replays never move the estimate. The player never sees it.
import { featureFamilies, rating, type Board, type Family } from './rules';
import type { Stop } from './boards';

export interface Rec { attempts: number; restarts: number; undos: number; completions: number; bestMoves: number | null }
export interface Profile {
  bands: Record<string, number>;
  strained: Record<string, number>;
  assignments: Record<number, number>;
  records: Record<string, Rec>;
  evaluated: Record<number, boolean>;
  keys: Record<number, number>; // best stars per stop
}

const clamp = (n: number) => Math.max(0, Math.min(2, n));
export const TIER_NAMES = ['Gentle', 'Standard', 'Challenging'];

export function createProfile(saved: Partial<Profile> = {}): Profile {
  return {
    bands: { route: 1, crate: 1, gate: 1, current: 1, pad: 1, portal: 1, riser: 1, ...saved.bands },
    strained: { route: 0, crate: 0, gate: 0, current: 0, pad: 0, portal: 0, riser: 0, ...saved.strained },
    assignments: saved.assignments ?? {}, records: saved.records ?? {}, evaluated: saved.evaluated ?? {}, keys: saved.keys ?? {},
  };
}

const families = (stop: Stop): (Family | 'route')[] => { const f = featureFamilies(stop.variants[1]); return f.length ? f : ['route']; };

export function chooseTier(p: Profile, stop: Stop) {
  let tier = Math.min(...families(stop).map((f) => clamp(p.bands[f] ?? 1)));
  if (stop.introduces) tier = Math.min(tier, 1);
  if (stop.comfort) tier = Math.max(0, tier - 1);
  return tier;
}

/** The version this stop plays. Once picked it stays, so a retry is always the same board. */
export function assign(p: Profile, stop: Stop): Board {
  if (!Number.isInteger(p.assignments[stop.id])) p.assignments[stop.id] = chooseTier(p, stop);
  return stop.variants[clamp(p.assignments[stop.id])];
}

export function recordFor(p: Profile, level: Board): Rec {
  return (p.records[level.variantId] ??= { attempts: 0, restarts: 0, undos: 0, completions: 0, bestMoves: null });
}

export function complete(p: Profile, stop: Stop, level: Board, moves: number) {
  const row = recordFor(p, level), stars = rating(moves, level.par);
  row.completions++; row.bestMoves = Math.min(row.bestMoves ?? Infinity, moves);
  p.keys[stop.id] = Math.max(p.keys[stop.id] || 0, stars);
  if (p.evaluated[stop.id]) return { stars, changed: 0 };
  p.evaluated[stop.id] = true;
  const totals = stop.variants.map((l) => p.records[l.variantId]).filter(Boolean)
    .reduce((s, r) => ({ attempts: s.attempts + r.attempts, restarts: s.restarts + r.restarts, undos: s.undos + r.undos }), { attempts: 0, restarts: 0, undos: 0 });
  const clean = stars === 3 && totals.attempts === 1 && totals.restarts === 0 && totals.undos <= 1;
  const strained = totals.restarts >= 2 || totals.undos >= 4;
  const struggled = totals.restarts >= 3 || totals.undos >= 6;
  let direction = 0;
  for (const f of families(stop)) {
    let delta = 0;
    if (stars === 1 || struggled) { delta = -1; p.strained[f] = 0; }
    else if (clean) { delta = 1; p.strained[f] = 0; }
    else if (stars === 2 && strained) { p.strained[f] = (p.strained[f] ?? 0) + 1; if (p.strained[f] >= 2) { delta = -1; p.strained[f] = 0; } }
    else p.strained[f] = 0;
    p.bands[f] = clamp((p.bands[f] ?? 1) + delta); direction = delta || direction;
  }
  return { stars, changed: direction };
}
