import { storageGet, storageSet } from './crazygames';
import type { GhostSample, LevelId } from './types';

const KEY = 'aero-glide-ghosts';
const MAX_SAMPLES = 1600;

export interface GhostTape {
  score: number;
  samples: GhostSample[];
}

type GhostBank = Partial<Record<LevelId, GhostTape>>;

function loadBank(): GhostBank {
  try {
    const raw = storageGet(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as GhostBank;
  } catch {
    return {};
  }
}

function saveBank(bank: GhostBank): void {
  try {
    storageSet(KEY, JSON.stringify(bank));
  } catch {
    /* ignore quota */
  }
}

export function loadGhost(id: LevelId): GhostTape | null {
  return loadBank()[id] ?? null;
}

export function saveGhost(id: LevelId, tape: GhostTape): void {
  const bank = loadBank();
  const prev = bank[id];
  if (prev && prev.score >= tape.score) return;
  bank[id] = {
    score: tape.score,
    samples: tape.samples.slice(0, MAX_SAMPLES),
  };
  saveBank(bank);
}

export function recordGhost(samples: GhostSample[], t: number, pos: { x: number; y: number; z: number }, heading: number, bank: number): void {
  const last = samples[samples.length - 1];
  if (last && t - last.t < 0.1) return;
  samples.push({ t, x: pos.x, y: pos.y, z: pos.z, heading, bank });
}

export function sampleGhost(tape: GhostTape, t: number): GhostSample | null {
  const samples = tape.samples;
  if (samples.length === 0) return null;
  if (t <= samples[0].t) return samples[0];
  if (t >= samples[samples.length - 1].t) return samples[samples.length - 1];
  let lo = 0;
  let hi = samples.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const u = (t - a.t) / Math.max(1e-4, b.t - a.t);
  return {
    t,
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    z: a.z + (b.z - a.z) * u,
    heading: a.heading + (b.heading - a.heading) * u,
    bank: a.bank + (b.bank - a.bank) * u,
  };
}
