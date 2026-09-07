import type { FlightState, LevelId, Progress, ScoreState } from '../game/types';
import { CONTEST } from '../config/contest';
import { BOOST_MAX } from '../config/constants';
import { LEVELS } from '../config/levels';
import { formatTime } from '../game/math';
import { isUnlocked } from '../game/state';
import { canCraft, type SurvivalState } from '../game/survival';

export interface HudRefs {
  root: HTMLElement;
  score: HTMLElement;
  combo: HTMLElement;
  boost: HTMLElement;
  rings: HTMLElement;
  spd: HTMLElement;
  agl: HTMLElement;
  asl: HTMLElement;
  vario: HTMLElement;
  glide: HTMLElement;
  time: HTMLElement;
  compass: HTMLElement;
  chip: HTMLElement;
  speedLines: HTMLElement;
  biome: HTMLSelectElement;
  source: HTMLElement;
}

export function bindHud(): HudRefs {
  return {
    root: must('#hud'),
    score: must('#hud-score'),
    combo: must('#hud-combo'),
    boost: must('#hud-boost'),
    rings: must('#hud-rings'),
    spd: must('#hud-spd'),
    agl: must('#hud-agl'),
    asl: must('#hud-asl'),
    vario: must('#hud-vario'),
    glide: must('#hud-glide'),
    time: must('#hud-time'),
    compass: must('#hud-compass'),
    chip: must('#hud-chip'),
    speedLines: must('#speed-lines'),
    biome: must('#hud-biome') as HTMLSelectElement,
    source: must('#hud-source'),
  };
}

export function fillBiomeSelect(
  hud: HudRefs,
  current: LevelId,
  progress: Progress,
  onPick: (id: LevelId) => void,
): void {
  hud.biome.replaceChildren();
  const catalog = CONTEST ? LEVELS.filter((level) => level.id === 'alpine') : LEVELS;
  for (const level of catalog) {
    const opt = document.createElement('option');
    opt.value = level.id;
    const open = isUnlocked(progress, level.id);
    opt.textContent = open ? `${level.name} · ${level.template}` : `${level.name} · Locked`;
    opt.disabled = !open;
    hud.biome.appendChild(opt);
  }
  hud.biome.value = current;
  hud.biome.onchange = () => onPick(hud.biome.value as LevelId);
}

export type HudLesson = 'steer' | 'open' | 'flare' | 'full';

export function setHudVisible(hud: HudRefs, visible: boolean): void {
  hud.root.hidden = !visible;
  const rig = document.querySelector<HTMLElement>('#cam-rig');
  if (rig) rig.hidden = !visible;
}

export function setHudLesson(lesson: HudLesson): void {
  const root = document.getElementById('app');
  if (!root) return;
  root.classList.remove('lesson-steer', 'lesson-open', 'lesson-flare');
  if (lesson !== 'full') root.classList.add(`lesson-${lesson}`);
}

export function setTerrainSource(hud: HudRefs, studio: boolean, asset: string): void {
  hud.source.textContent = studio ? `Terrain Studio · ${asset}.glb` : 'Procedural fallback';
}

// Per-frame HUD writes go through a change-detector: setting textContent to
// the same string still rebuilds text nodes and invalidates layout every frame.
const _hudTextCache = new WeakMap<HTMLElement, string>();
function setText(el: HTMLElement, value: string): void {
  if (_hudTextCache.get(el) === value) return;
  _hudTextCache.set(el, value);
  el.textContent = value;
}

const _styleCache = new WeakMap<HTMLElement, { transform?: string; width?: string }>();
function setTransform(el: HTMLElement, value: string): void {
  const c = _styleCache.get(el) ?? {};
  if (c.transform === value) return;
  c.transform = value;
  _styleCache.set(el, c);
  el.style.transform = value;
}
function setWidth(el: HTMLElement, value: string): void {
  const c = _styleCache.get(el) ?? {};
  if (c.width === value) return;
  c.width = value;
  _styleCache.set(el, c);
  el.style.width = value;
}

export function paintHud(
  hud: HudRefs,
  score: ScoreState,
  flight: FlightState,
  timeLeft: number,
  ringsHit: number,
  ringsTotal: number,
  nextHint?: string,
): void {
  setText(hud.score, Math.floor(score.total).toLocaleString());
  setText(hud.combo, `${score.combo.toFixed(0)}×`);
  hud.combo.classList.toggle('hot', score.combo >= 3);
  setWidth(hud.boost, `${(flight.boost / BOOST_MAX) * 100}%`);
  hud.boost.parentElement?.classList.toggle('boosting', flight.boosting || flight.speedBoost > 0);
  setText(hud.rings, `${ringsHit}/${ringsTotal}`);
  setText(hud.spd, `${(flight.speed * 3.6).toFixed(0)}`);
  setText(hud.agl, `${Math.max(0, flight.agl).toFixed(0)}`);
  setText(hud.asl, `${Math.max(0, flight.asl).toFixed(0)}`);
  const vari = flight.verticalSpeed;
  setText(hud.vario, `${vari >= 0 ? '+' : ''}${vari.toFixed(1)}`);
  hud.vario.classList.toggle('lift', vari > 0.15);
  hud.vario.classList.toggle('sink', vari < -0.15);
  const liveGlide = vari < -0.05 ? flight.speed / Math.abs(vari) : 99;
  setText(hud.glide, liveGlide > 40 ? '∞' : liveGlide.toFixed(1));
  setText(hud.time, formatTime(timeLeft));
  hud.time.classList.toggle('low', timeLeft < 16);
  const hint = document.querySelector<HTMLElement>('#hud-hint');
  if (hint) setText(hint, nextHint ?? 'Fly through the next glowing ring');
  const deg = ((180 / Math.PI) * flight.heading % 360 + 360) % 360;
  setTransform(hud.compass, `rotate(${-deg}deg)`);

  const tags: string[] = [];
  if (flight.inThermal) tags.push('THERMAL +3.5');
  if (flight.inDowndraft) tags.push('DOWNDRAFT');
  if (flight.nearMiss) tags.push('NEAR MISS');
  if (flight.speedBoost > 0) tags.push('SPEED ×2');
  hud.chip.hidden = tags.length === 0;
  setText(hud.chip, tags.join('  ·  '));
  hud.chip.classList.toggle('danger', flight.inDowndraft);
  hud.chip.classList.toggle('lift', flight.inThermal || flight.nearMiss);

  const intensity = Math.max(
    0,
    (flight.speed - 16) / 22,
    flight.boosting ? 0.7 : 0,
    flight.speedBoost > 0 ? 0.9 : 0,
  );
  hud.speedLines.style.opacity = String(Math.min(1, intensity));
}

export function setSurviveMode(on: boolean): void {
  const app = document.getElementById('app');
  if (!app) return;
  app.classList.toggle('survive', on);
  app.classList.toggle('contest', CONTEST);
}

export function setHasScrap(on: boolean): void {
  document.getElementById('app')?.classList.toggle('has-scrap', on);
  const drawer = document.getElementById('craft-drawer');
  if (drawer) drawer.hidden = !on;
}

export function paintSurvive(state: SurvivalState | null, timeLeft: number): void {
  const fill = (id: string, value: number): void => {
    const el = document.getElementById(id);
    if (el) el.style.width = `${Math.max(0, Math.min(100, value))}%`;
  };
  if (!state) return;
  fill('hud-integrity', state.integrity);
  fill('hud-warmth', state.warmth);
  fill('hud-storm', state.storm * 100);
  const fabric = document.getElementById('inv-fabric');
  const cord = document.getElementById('inv-cord');
  if (fabric) fabric.textContent = String(state.fabric);
  if (cord) cord.textContent = String(state.cord);
  const patch = document.querySelector<HTMLButtonElement>('#craft-patch');
  const bind = document.querySelector<HTMLButtonElement>('#craft-bind');
  const wrap = document.querySelector<HTMLButtonElement>('#craft-wrap');
  if (patch) patch.disabled = !canCraft(state, 'patch');
  if (bind) bind.disabled = !canCraft(state, 'bind');
  if (wrap) wrap.disabled = !canCraft(state, 'wrap');
  const integrity = document.getElementById('hud-integrity');
  const warmth = document.getElementById('hud-warmth');
  integrity?.classList.toggle('low', state.integrity < 28);
  warmth?.classList.toggle('low', state.warmth < 28);
  const time = document.getElementById('hud-time');
  time?.classList.toggle('low', timeLeft < 16 || state.storm > 0.72);
}

function must(sel: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(sel);
  if (!node) throw new Error(`Missing ${sel}`);
  return node;
}
