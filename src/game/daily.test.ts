import { describe, expect, it } from 'vitest';
import { applyDailyLine, hashSeed, utcDayKey } from './daily';
import { getLevel } from '../config/levels';

describe('daily line', () => {
  it('is stable for a given UTC day and differs across days', () => {
    const level = getLevel('dune');
    const a = applyDailyLine(level, '2026-08-18');
    const b = applyDailyLine(level, '2026-08-18');
    const c = applyDailyLine(level, '2026-08-19');
    expect(a.rings[3].lateral).toBe(b.rings[3].lateral);
    expect(a.rings[3].lateral).not.toBe(c.rings[3].lateral);
    expect(hashSeed('2026-08-18:dune')).toBe(hashSeed('2026-08-18:dune'));
    expect(utcDayKey(Date.parse('2026-08-18T12:00:00Z'))).toBe('2026-08-18');
  });

  it('keeps Alpine laterals modest', () => {
    const alpine = applyDailyLine(getLevel('alpine'), '2026-08-18');
    for (const ring of alpine.rings) {
      expect(Math.abs(ring.lateral)).toBeLessThan(20);
    }
  });
});
