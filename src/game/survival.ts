import type { ResultKind } from './types';

export type SalvageKind = 'fabric' | 'cord';
export type CraftId = 'patch' | 'bind' | 'wrap';

export interface SurvivalState {
  fabric: number;
  cord: number;
  integrity: number;
  warmth: number;
  storm: number;
  binds: number;
  patches: number;
  wraps: number;
  gathered: number;
  fail: ResultKind | null;
}

export interface CraftRecipe {
  id: CraftId;
  name: string;
  fabric: number;
  cord: number;
  hint: string;
}

export const RECIPES: Record<CraftId, CraftRecipe> = {
  patch: { id: 'patch', name: 'Patch', fabric: 2, cord: 0, hint: '2 fabric → canopy' },
  bind: { id: 'bind', name: 'Bind', fabric: 0, cord: 2, hint: '2 cord → slower tear' },
  wrap: { id: 'wrap', name: 'Heat wrap', fabric: 1, cord: 1, hint: '1+1 → warmth' },
};

export function createSurvival(): SurvivalState {
  return {
    fabric: 0,
    cord: 0,
    integrity: 72,
    warmth: 82,
    storm: 0,
    binds: 0,
    patches: 0,
    wraps: 0,
    gathered: 0,
    fail: null,
  };
}

export function gatherSalvage(state: SurvivalState, kind: SalvageKind): void {
  if (kind === 'fabric') state.fabric += 1;
  else state.cord += 1;
  state.gathered += 1;
}

export function canCraft(state: SurvivalState, id: CraftId): boolean {
  const recipe = RECIPES[id];
  return state.fabric >= recipe.fabric && state.cord >= recipe.cord;
}

export function craft(state: SurvivalState, id: CraftId): boolean {
  if (!canCraft(state, id)) return false;
  const recipe = RECIPES[id];
  state.fabric -= recipe.fabric;
  state.cord -= recipe.cord;
  if (id === 'patch') {
    state.integrity = Math.min(100, state.integrity + 30);
    state.patches += 1;
  } else if (id === 'bind') {
    state.binds += 1;
  } else {
    state.warmth = Math.min(100, state.warmth + 40);
    state.wraps += 1;
  }
  return true;
}

export interface SurvivalTick {
  inThermal: boolean;
  inDowndraft: boolean;
  stall: boolean;
  nearMiss: boolean;
  parTime: number;
  timeLeft: number;
}

/**
 * Gather / craft / survive: warmth and canopy drain as the storm ramps.
 * Returns a fail kind when the session is over.
 */
export function tickSurvival(state: SurvivalState, dt: number, opts: SurvivalTick): ResultKind | null {
  if (state.fail) return state.fail;
  const elapsed = Math.max(0, opts.parTime - opts.timeLeft);
  state.storm = opts.parTime <= 0 ? 1 : Math.min(1, elapsed / opts.parTime);

  if (opts.inThermal) {
    state.warmth = Math.min(100, state.warmth + 16 * dt);
  } else {
    state.warmth -= (1.05 + state.storm * 2.6) * dt;
  }

  const tear = (0.55 + state.storm * 5.1) / (1 + state.binds * 0.72);
  state.integrity -= tear * dt;
  if (opts.stall) state.integrity -= 5.5 * dt;
  if (opts.inDowndraft) state.integrity -= 4.2 * dt;
  if (opts.nearMiss) state.integrity -= 2.8 * dt;

  if (state.warmth <= 0) {
    state.warmth = 0;
    state.fail = 'freeze';
    return 'freeze';
  }
  if (state.integrity <= 0) {
    state.integrity = 0;
    state.fail = 'shred';
    return 'shred';
  }
  if (opts.timeLeft <= 0) {
    state.fail = 'storm';
    return 'storm';
  }
  return null;
}

export function stormGustScale(state: SurvivalState): number {
  return 1 + state.storm * 2.8;
}

export function stormFogBoost(state: SurvivalState): number {
  return state.storm * 0.00115;
}
