import type { LevelDef } from './types';

export function utcDayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Offset ring / thermal / hazard laterals for today's line. Alpine stays honest. */
export function applyDailyLine(level: LevelDef, day = utcDayKey()): LevelDef {
  const rand = mulberry32(hashSeed(`${day}:${level.id}`));
  if (level.sport === 'teach') return { ...level };
  const span = level.sport === 'ridge' ? 10 : 14;
  const shift = (base: number) => {
    const next = base + (rand() * 2 - 1) * span;
    return Math.max(-level.path.halfWidth * 0.85, Math.min(level.path.halfWidth * 0.85, next));
  };
  return {
    ...level,
    rings: level.rings.map((ring) => ({ ...ring, lateral: shift(ring.lateral) })),
    thermals: level.thermals.map((zone) => ({ ...zone, lateral: shift(zone.lateral) })),
    downdrafts: level.downdrafts.map((zone) => ({ ...zone, lateral: shift(zone.lateral) })),
    orbs: level.orbs.map((zone) => ({ ...zone, lateral: shift(zone.lateral) })),
  };
}
