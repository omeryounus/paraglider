import { describe, expect, it } from 'vitest';
import { emptyProgress, isUnlocked, nextUnlocked } from './state';
import type { Progress } from './types';

function withStars(stars: Partial<Progress['stars']>): Progress {
  const progress = emptyProgress();
  return { stars: { ...progress.stars, ...stars }, best: progress.best };
}

describe('level unlock gating', () => {
  it('keeps Alpine open and locks later biomes until the previous earns 1★', () => {
    const blank = emptyProgress();
    expect(isUnlocked(blank, 'alpine')).toBe(true);
    expect(isUnlocked(blank, 'coastal')).toBe(false);
    expect(isUnlocked(blank, 'dune')).toBe(false);
    expect(isUnlocked(blank, 'ridge')).toBe(false);
    expect(nextUnlocked(blank, 'alpine')).toBe('alpine');
  });

  it('opens Coastal after a 1★ Alpine clear and walks the rest of the chain', () => {
    const alpineStar = withStars({ alpine: 1 });
    expect(isUnlocked(alpineStar, 'coastal')).toBe(true);
    expect(isUnlocked(alpineStar, 'dune')).toBe(false);
    expect(nextUnlocked(alpineStar, 'alpine')).toBe('coastal');

    const coastalStar = withStars({ alpine: 1, coastal: 2 });
    expect(isUnlocked(coastalStar, 'dune')).toBe(true);
    expect(nextUnlocked(coastalStar, 'coastal')).toBe('dune');

    const duneStar = withStars({ alpine: 1, coastal: 2, dune: 1 });
    expect(isUnlocked(duneStar, 'ridge')).toBe(true);
    expect(nextUnlocked(duneStar, 'ridge')).toBe('alpine');
  });

  it('does not unlock the next biome on a 0★ finish', () => {
    const progress = withStars({ alpine: 0 });
    expect(isUnlocked(progress, 'coastal')).toBe(false);
    expect(nextUnlocked(progress, 'alpine')).toBe('alpine');
  });
});
