import { describe, expect, it } from 'vitest';
import { recordGhost, sampleGhost, type GhostTape } from './ghost';

describe('ghost tape', () => {
  it('interpolates between samples', () => {
    const tape: GhostTape = {
      score: 100,
      samples: [
        { t: 0, x: 0, y: 10, z: 0, heading: 0, bank: 0 },
        { t: 1, x: 10, y: 10, z: 0, heading: 1, bank: 0.4 },
      ],
    };
    const mid = sampleGhost(tape, 0.5);
    expect(mid?.x).toBeCloseTo(5, 5);
    expect(mid?.heading).toBeCloseTo(0.5, 5);
  });

  it('throttles recording to about 10 Hz', () => {
    const samples: GhostTape['samples'] = [];
    recordGhost(samples, 0, { x: 0, y: 1, z: 0 }, 0, 0);
    recordGhost(samples, 0.05, { x: 1, y: 1, z: 0 }, 0, 0);
    recordGhost(samples, 0.12, { x: 2, y: 1, z: 0 }, 0, 0);
    expect(samples).toHaveLength(2);
  });
});
