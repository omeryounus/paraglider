import { STORAGE_KEY } from '../config/constants';
import type { LevelId, Phase, Progress, ResultKind } from './types';
import { LEVELS } from '../config/levels';

export function loadProgress(): Progress {
  const blank = emptyProgress();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return blank;
    const parsed = JSON.parse(raw) as Progress;
    return {
      stars: { ...blank.stars, ...parsed.stars },
      best: { ...blank.best, ...parsed.best },
    };
  } catch {
    return blank;
  }
}

export function saveProgress(progress: Progress): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function emptyProgress(): Progress {
  const stars = { alpine: 0, coastal: 0, dune: 0, ridge: 0 } as Record<LevelId, number>;
  const best = { alpine: 0, coastal: 0, dune: 0, ridge: 0 } as Record<LevelId, number>;
  for (const level of LEVELS) {
    stars[level.id] = 0;
    best[level.id] = 0;
  }
  return { stars, best };
}

const UNLOCK_ORDER: LevelId[] = ['alpine', 'coastal', 'dune', 'ridge'];

export function isUnlocked(progress: Progress, id: LevelId): boolean {
  const idx = UNLOCK_ORDER.indexOf(id);
  if (idx <= 0) return true;
  const prev = UNLOCK_ORDER[idx - 1];
  return (progress.stars[prev] ?? 0) >= 1;
}

export function nextUnlocked(progress: Progress, id: LevelId): LevelId {
  const idx = UNLOCK_ORDER.indexOf(id);
  for (let i = 1; i <= UNLOCK_ORDER.length; i++) {
    const candidate = UNLOCK_ORDER[(idx + i) % UNLOCK_ORDER.length];
    if (isUnlocked(progress, candidate)) return candidate;
  }
  return 'alpine';
}

export function recordResult(progress: Progress, id: LevelId, stars: number, score: number): Progress {
  const next: Progress = {
    stars: { ...progress.stars, [id]: Math.max(progress.stars[id] ?? 0, stars) },
    best: { ...progress.best, [id]: Math.max(progress.best[id] ?? 0, score) },
  };
  saveProgress(next);
  return next;
}

export interface Session {
  phase: Phase;
  result: ResultKind | null;
  timeLeft: number;
  countdown: number;
}

export function newSession(parTime: number): Session {
  return { phase: 'countdown', result: null, timeLeft: parTime, countdown: 3.2 };
}
