import { COMBO_WINDOW, LANDING_SCORE, MAX_COMBO, RING_SCORE } from '../config/constants';
import type { RingKind, ScoreState } from './types';

export function emptyScore(): ScoreState {
  return {
    total: 0,
    combo: 1,
    comboTimer: 0,
    ringsHit: 0,
    ringsMissed: 0,
    goldHit: 0,
    boostHit: 0,
    nearMiss: 0,
    orbs: 0,
    landing: 0,
    landingLabel: '—',
    flareBonus: false,
  };
}

export function tickCombo(score: ScoreState, dt: number): void {
  if (score.combo <= 1) return;
  score.comboTimer -= dt;
  if (score.comboTimer <= 0) {
    score.combo = Math.max(1, score.combo - 1);
    score.comboTimer = COMBO_WINDOW * 0.45;
  }
}

export function awardRing(score: ScoreState, kind: RingKind): number {
  const pts = RING_SCORE[kind] * score.combo;
  score.total += pts;
  score.combo = Math.min(MAX_COMBO, score.combo + 1);
  score.comboTimer = COMBO_WINDOW;
  score.ringsHit += 1;
  if (kind === 'gold') score.goldHit += 1;
  if (kind === 'boost') score.boostHit += 1;
  return pts;
}

export function missRing(score: ScoreState): void {
  score.ringsMissed += 1;
  score.combo = 1;
  score.comboTimer = 0;
}

export function awardOrb(score: ScoreState): number {
  score.orbs += 1;
  const pts = 200 * score.combo;
  score.total += pts;
  return pts;
}

export function awardCraft(score: ScoreState): number {
  const pts = 500;
  score.total += pts;
  return pts;
}

export function awardNearMiss(score: ScoreState, dt: number): number {
  const pts = 90 * dt * score.combo;
  score.nearMiss += pts;
  score.total += pts;
  return pts;
}

export function awardLanding(
  score: ScoreState,
  band: 'bullseye' | 'mid' | 'outer',
  flare: boolean,
): number {
  const base = LANDING_SCORE[band];
  const pts = flare ? base * 2 : base;
  score.landing = pts;
  score.flareBonus = flare;
  score.landingLabel = flare ? `${band} ×2 flare` : band;
  score.total += pts;
  return pts;
}

export function starCount(total: number, thresholds: [number, number, number], cleared: boolean): number {
  if (!cleared) return 0;
  if (total >= thresholds[2]) return 3;
  if (total >= thresholds[1]) return 2;
  if (total >= thresholds[0]) return 1;
  return 1;
}
