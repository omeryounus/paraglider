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
