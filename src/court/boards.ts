// The rounds of the Mill Terrace court. Each stop and its three versions (Gentle, Standard, Challenging) are
// Jonny's own Spark Trail boards, copied from its catalogs (intro.json with the intro-aha edition, mill.json),
// so they solve exactly as they do there. Each win brings back one named piece of the terrace.
import type { Board } from './rules';

export interface Stop { id: number; introduces: boolean; comfort: boolean; variants: Board[]; piece: string; restore: Restore }
export type Restore = 'lantern0' | 'lantern1' | 'lantern2' | 'wheel' | 'mill' | 'spirit';

export const STOPS: Stop[] = [
  { id: 0, introduces: true, comfort: false, piece: 'The steps lantern', restore: 'lantern0', variants: [
    {"size": 6, "start": [5, 5], "walls": [14, 15, 20, 21], "exit": 0, "keys": [29, 17, 3], "par": 2, "name": "First discovery", "difficulty": "Gentle", "variantId": "intro-1-0", "tier": 0},
    {"size": 6, "start": [5, 0], "walls": [14, 15, 20, 21], "exit": 0, "keys": [32, 17, 3], "par": 3, "name": "First discovery", "difficulty": "Standard", "variantId": "intro-1-1", "tier": 1},
    {"size": 6, "start": [5, 0], "walls": [14, 15, 20, 21], "exit": 0, "keys": [32, 6, 3], "par": 5, "name": "First discovery", "difficulty": "Challenging", "variantId": "intro-1-2", "tier": 2},
  ] },
  { id: 2, introduces: false, comfort: false, piece: 'The shed lantern', restore: 'lantern1', variants: [
    {"size": 6, "start": [5, 5], "walls": [2, 15, 16, 26, 7], "exit": 1, "keys": [6, 30, 33], "par": 3, "name": "The old lookout", "difficulty": "Gentle", "variantId": "intro-2-0", "tier": 0},
    {"size": 6, "start": [3, 2], "walls": [2, 15, 16, 26, 28], "exit": 1, "keys": [6, 30, 33], "par": 5, "name": "The old lookout", "difficulty": "Standard", "variantId": "intro-2-1", "tier": 1},
    {"size": 6, "start": [3, 2], "walls": [2, 19, 16, 26, 35], "exit": 1, "keys": [6, 23, 33], "par": 7, "name": "The old lookout", "difficulty": "Challenging", "variantId": "intro-2-2", "tier": 2},
  ] },
  { id: 4, introduces: false, comfort: false, piece: 'The river lantern', restore: 'lantern2', variants: [
    {"size": 6, "start": [0, 4], "walls": [22, 16, 11, 24, 12], "exit": 5, "keys": [8, 1, 6], "par": 4, "name": "A wall becomes a way", "difficulty": "Gentle", "variantId": "intro-3-0-aha1", "tier": 0},
    {"size": 6, "start": [5, 1], "walls": [20, 11, 30, 7, 21], "exit": 13, "keys": [35, 16, 23], "par": 5, "name": "A wall becomes a way", "difficulty": "Standard", "variantId": "intro-3-1-aha1", "tier": 1},
    {"size": 6, "start": [2, 1], "walls": [30, 32, 16, 29, 31], "exit": 22, "keys": [33, 1, 21], "par": 7, "name": "A wall becomes a way", "difficulty": "Challenging", "variantId": "intro-3-2-aha1", "tier": 2},
  ] },
  { id: 500, introduces: true, comfort: false, piece: 'The waterwheel turns', restore: 'wheel', variants: [
    {"size": 6, "start": [5, 3], "walls": [2, 7, 14, 15, 16, 22, 34], "exit": 29, "keys": [25, 30, 31], "crate": 24, "par": 3, "name": "A little nudge", "difficulty": "Gentle", "variantId": "mill-1-0", "tier": 0},
    {"size": 6, "start": [5, 0], "walls": [15, 16, 21, 22], "exit": 35, "keys": [1, 5, 13], "crate": 31, "par": 4, "name": "A little nudge", "difficulty": "Standard", "variantId": "mill-1-1", "tier": 1},
    {"size": 6, "start": [2, 1], "walls": [3, 4, 10, 15, 23, 25, 26, 27, 29], "exit": 32, "keys": [8, 34, 21], "crate": 33, "par": 7, "name": "A little nudge", "difficulty": "Challenging", "variantId": "mill-1-2", "tier": 2},
  ] },
  { id: 501, introduces: false, comfort: false, piece: 'Lights in the mill', restore: 'mill', variants: [
    {"size": 6, "start": [1, 1], "walls": [0, 2, 4, 6, 12, 16, 21, 26, 32], "exit": 34, "keys": [17, 22, 28], "crate": 23, "par": 4, "name": "Somewhere to turn", "difficulty": "Gentle", "variantId": "mill-2-0", "tier": 0},
    {"size": 6, "start": [5, 3], "walls": [6, 8, 20, 22, 24, 30], "exit": 17, "keys": [2, 19, 34], "crate": 4, "par": 6, "name": "Somewhere to turn", "difficulty": "Standard", "variantId": "mill-2-1", "tier": 1},
    {"size": 6, "start": [0, 3], "walls": [8, 10, 11, 29, 30, 32, 33], "exit": 27, "keys": [22, 18, 28], "crate": 16, "par": 9, "name": "Somewhere to turn", "difficulty": "Challenging", "variantId": "mill-2-2", "tier": 2},
  ] },
  { id: 503, introduces: true, comfort: false, piece: 'The spirit wakes', restore: 'spirit', variants: [
    {"size": 6, "start": [5, 2], "walls": [0, 5, 11, 16, 17], "exit": 2, "keys": [30, 18, 24], "gates": [9], "switch": 35, "crate": 8, "par": 5, "name": "A little click", "difficulty": "Gentle", "variantId": "mill-4-0", "tier": 0},
    {"size": 6, "start": [3, 5], "walls": [0, 3, 9, 19, 20, 25, 28, 31], "exit": 1, "keys": [14, 15, 17], "gates": [6], "switch": 12, "crate": 7, "par": 7, "name": "A little click", "difficulty": "Standard", "variantId": "mill-4-1", "tier": 1},
    {"size": 6, "start": [3, 0], "walls": [2, 17, 29, 30], "exit": 21, "keys": [22, 32, 24], "gates": [3], "switch": 14, "crate": 19, "par": 10, "name": "A little click", "difficulty": "Challenging", "variantId": "mill-4-2", "tier": 2},
  ] },
];
