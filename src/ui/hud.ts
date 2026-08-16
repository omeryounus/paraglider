import type { FlightState, LevelId, ScoreState } from '../game/types';
import { BOOST_MAX } from '../config/constants';
import { LEVELS } from '../config/levels';
import { formatTime } from '../game/math';

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
  };
}

export function fillBiomeSelect(hud: HudRefs, current: LevelId, onPick: (id: LevelId) => void): void {
  hud.biome.replaceChildren();
  for (const level of LEVELS) {
    const opt = document.createElement('option');
    opt.value = level.id;
    opt.textContent = `${level.name} · ${level.template}`;
    hud.biome.appendChild(opt);
  }
  hud.biome.value = current;
  hud.biome.onchange = () => onPick(hud.biome.value as LevelId);
}

export function setHudVisible(hud: HudRefs, visible: boolean): void {
  hud.root.hidden = !visible;
}

export function paintHud(
  hud: HudRefs,
  score: ScoreState,
  flight: FlightState,
  timeLeft: number,
  ringsHit: number,
  ringsTotal: number,
): void {
  hud.score.textContent = Math.floor(score.total).toLocaleString();
  hud.combo.textContent = `${score.combo.toFixed(0)}×`;
  hud.combo.classList.toggle('hot', score.combo >= 3);
  hud.boost.style.width = `${(flight.boost / BOOST_MAX) * 100}%`;
  hud.boost.parentElement?.classList.toggle('boosting', flight.boosting || flight.speedBoost > 0);
  hud.rings.textContent = `${ringsHit}/${ringsTotal}`;
  hud.spd.textContent = `${(flight.speed * 3.6).toFixed(0)}`;
  hud.agl.textContent = `${Math.max(0, flight.agl).toFixed(0)}`;
  hud.asl.textContent = `${Math.max(0, flight.asl).toFixed(0)}`;
  const vari = flight.verticalSpeed;
  hud.vario.textContent = `${vari >= 0 ? '+' : ''}${vari.toFixed(1)}`;
  hud.vario.classList.toggle('lift', vari > 0.15);
  hud.vario.classList.toggle('sink', vari < -0.15);
  const liveGlide = vari < -0.05 ? flight.speed / Math.abs(vari) : 99;
  hud.glide.textContent = liveGlide > 40 ? '∞' : liveGlide.toFixed(1);
  hud.time.textContent = formatTime(timeLeft);
  hud.time.classList.toggle('low', timeLeft < 12);
  const deg = ((180 / Math.PI) * flight.heading % 360 + 360) % 360;
  hud.compass.style.transform = `rotate(${-deg}deg)`;

  const tags: string[] = [];
  if (flight.inThermal) tags.push('THERMAL +3.5');
  if (flight.inDowndraft) tags.push('DOWNDRAFT');
  if (flight.nearMiss) tags.push('NEAR MISS');
  if (flight.speedBoost > 0) tags.push('SPEED ×2');
  hud.chip.hidden = tags.length === 0;
  hud.chip.textContent = tags.join('  ·  ');
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

function must(sel: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(sel);
  if (!node) throw new Error(`Missing ${sel}`);
  return node;
}
