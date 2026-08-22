import { describe, expect, it } from 'vitest';
import { canCraft, craft, createSurvival, gatherSalvage, tickSurvival } from './survival';

function fly(partial: Partial<Parameters<typeof tickSurvival>[2]> = {}) {
  return {
    inThermal: false,
    inDowndraft: false,
    stall: false,
    nearMiss: false,
    parTime: 90,
    timeLeft: 80,
    ...partial,
  };
}

describe('survival gather / craft / threat', () => {
  it('collects fabric and cord, then spends them on patch, bind, and wrap', () => {
    const state = createSurvival();
    expect(canCraft(state, 'patch')).toBe(false);
    gatherSalvage(state, 'fabric');
    gatherSalvage(state, 'fabric');
    gatherSalvage(state, 'cord');
    gatherSalvage(state, 'cord');
    expect(state.gathered).toBe(4);
    expect(craft(state, 'patch')).toBe(true);
    expect(state.fabric).toBe(0);
    expect(state.patches).toBe(1);
    expect(state.integrity).toBeGreaterThan(72);
    expect(craft(state, 'bind')).toBe(true);
    expect(state.cord).toBe(0);
    expect(state.binds).toBe(1);
    gatherSalvage(state, 'fabric');
    gatherSalvage(state, 'cord');
    const warmth = state.warmth;
    expect(craft(state, 'wrap')).toBe(true);
    expect(state.wraps).toBe(1);
    expect(state.warmth).toBeGreaterThan(warmth);
  });

  it('refuses a craft when the player is short on salvage', () => {
    const state = createSurvival();
    gatherSalvage(state, 'fabric');
    expect(craft(state, 'patch')).toBe(false);
    expect(state.fabric).toBe(1);
    expect(state.patches).toBe(0);
  });

  it('fills warmth in a thermal and drains it in open air', () => {
    const cold = createSurvival();
    tickSurvival(cold, 8, fly({ inThermal: false, timeLeft: 80 }));
    const heat = createSurvival();
    tickSurvival(heat, 8, fly({ inThermal: true, timeLeft: 80 }));
    expect(heat.warmth).toBeGreaterThan(cold.warmth);
    expect(cold.warmth).toBeLessThan(82);
  });

  it('tears the canopy faster as the storm ramps, and binds slow that tear', () => {
    const early = createSurvival();
    tickSurvival(early, 5, fly({ timeLeft: 85 }));
    const late = createSurvival();
    tickSurvival(late, 5, fly({ timeLeft: 10 }));
    expect(late.integrity).toBeLessThan(early.integrity);

    const bound = createSurvival();
    bound.binds = 2;
    tickSurvival(bound, 5, fly({ timeLeft: 10 }));
    expect(bound.integrity).toBeGreaterThan(late.integrity);
  });

  it('fails freeze, shred, or storm when a meter hits zero', () => {
    const ice = createSurvival();
    ice.warmth = 0.2;
    expect(tickSurvival(ice, 1, fly())).toBe('freeze');

    const tear = createSurvival();
    tear.integrity = 0.2;
    expect(tickSurvival(tear, 1, fly())).toBe('shred');

    const gale = createSurvival();
    expect(tickSurvival(gale, 0.1, fly({ timeLeft: 0 }))).toBe('storm');
  });
});
