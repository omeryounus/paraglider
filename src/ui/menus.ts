import { CONTEST } from '../config/contest';
import { LEVELS } from '../config/levels';
import { utcDayKey } from '../game/daily';
import { formatTime } from '../game/math';
import { isUnlocked } from '../game/state';
import type { LevelId, Progress, ResultKind, ScoreState } from '../game/types';
import { starCount } from '../game/scoring';

export interface MenuRefs {
  loader: HTMLElement;
  loaderStatus: HTMLElement;
  select: HTMLElement;
  grid: HTMLElement;
  results: HTMLElement;
  resultsCard: HTMLElement;
  countdown: HTMLElement;
}

export function bindMenus(): MenuRefs {
  return {
    loader: must('#loader'),
    loaderStatus: must('#loader-status'),
    select: must('#level-select'),
    grid: must('#level-grid'),
    results: must('#results'),
    resultsCard: must('#results-card'),
    countdown: must('#countdown'),
  };
}

export function renderLevelSelect(
  menus: MenuRefs,
  progress: Progress,
  onPick: (id: LevelId) => void,
): void {
  menus.grid.replaceChildren();
  const catalog = CONTEST ? LEVELS.filter((level) => level.id === 'alpine') : LEVELS;
  for (const level of catalog) {
    const stars = progress.stars[level.id] ?? 0;
    const best = progress.best[level.id] ?? 0;
    const unlocked = isUnlocked(progress, level.id);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `level-card biome-${level.id}${unlocked ? '' : ' locked'}`;
    card.disabled = !unlocked;
    const prev = LEVELS[Math.max(0, LEVELS.findIndex((item) => item.id === level.id) - 1)];
    card.innerHTML = `
      <span class="level-kicker">${level.subtitle}</span>
      <strong>${level.name}</strong>
      <p>${unlocked ? level.blurb : `Earn 1★ on ${prev.name} to unlock.`}</p>
      <span class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>
      <small>${best ? `Best ${best.toLocaleString()}` : unlocked ? 'Unflown' : 'Locked'} · Daily line ${utcDayKey()} · ${formatTime(level.parTime)}</small>
    `;
    if (unlocked) card.addEventListener('click', () => onPick(level.id));
    menus.grid.appendChild(card);
  }
}

export function showSelect(menus: MenuRefs, show: boolean): void {
  menus.select.hidden = !show;
}

export function showResults(
  menus: MenuRefs,
  kind: ResultKind,
  score: ScoreState,
  timeLeft: number,
  thresholds: [number, number, number],
  onRetry: () => void,
  onNext: () => void,
  onMenu: () => void,
  nextOpen = false,
  extra = '',
): void {
  const cleared = kind === 'clear';
  const stars = starCount(score.total, thresholds, cleared);
  const titles: Record<ResultKind, [string, string]> = {
    clear: ['Valley reached', 'You outran the storm'],
    crash: ['Wing folded', 'Crash'],
    timeout: ['Time expired', 'DNF'],
    freeze: ['Hypothermia', 'The cold took the ridge'],
    shred: ['Canopy shredded', 'The wing tore apart'],
    storm: ['Whiteout', 'The storm swallowed the LZ'],
  };
  const [kicker, headline] = titles[kind] ?? titles.crash;
  menus.results.hidden = false;
  menus.resultsCard.className = `modal-card ${kind}`;
  menus.resultsCard.innerHTML = `
    <p class="modal-kicker">${kicker}</p>
    <h2>${headline}</h2>
    <div class="star-row">${[1, 2, 3].map((n) => `<span class="${n <= stars ? 'on' : ''}">★</span>`).join('')}</div>
    <p class="result-score">${Math.floor(score.total).toLocaleString()}</p>
    <dl class="modal-stats">
      <div><dt>Rings</dt><dd>${score.ringsHit} hit / ${score.ringsMissed} miss</dd></div>
      <div><dt>Landing</dt><dd>${score.landingLabel}</dd></div>
      <div><dt>Near miss</dt><dd>${Math.floor(score.nearMiss)}</dd></div>
      <div><dt>Time left</dt><dd>${formatTime(timeLeft)}</dd></div>
    </dl>
    ${extra ? `<p class="banner-hint">${extra}</p>` : ''}
    <div class="result-actions">
      <button type="button" id="btn-retry">Retry</button>
      <button type="button" id="btn-next" ${cleared && nextOpen ? '' : 'hidden'}>Next course</button>
      <button type="button" class="ghost" id="btn-menu">Courses</button>
    </div>
  `;
  must('#btn-retry').addEventListener('click', onRetry);
  must('#btn-next').addEventListener('click', onNext);
  must('#btn-menu').addEventListener('click', onMenu);
}

export function hideResults(menus: MenuRefs): void {
  menus.results.hidden = true;
}

export function setCountdown(menus: MenuRefs, value: number | null): void {
  if (value === null) {
    menus.countdown.hidden = true;
    return;
  }
  menus.countdown.hidden = false;
  menus.countdown.textContent = value > 0.2 ? String(Math.ceil(value)) : 'GO';
}

export function setLoader(menus: MenuRefs, text: string, hidden = false): void {
  menus.loaderStatus.textContent = text;
  menus.loader.classList.toggle('hidden', hidden);
}

function must(sel: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(sel);
  if (!node) throw new Error(`Missing ${sel}`);
  return node;
}
