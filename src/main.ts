import * as THREE from 'three';
import { CONTEST } from './config/contest';
import { CRASH_SINK, LANDING_AGL, MISS_TIME_PENALTY, NEAR_MISS_MAX } from './config/constants';
import { getLevel, LEVELS } from './config/levels';
import { audio } from './game/audio';
import { createAtmosphere, type Atmosphere } from './game/atmosphere';
import { bindLookControls, resetLook, snapCamera, stepCamera, zoomLook } from './game/camera';
import {
  buildCourse,
  insideHazard,
  insideThermal,
  nextRing,
  padResult,
  spawnHeading,
  spawnPoint,
  updateCourse,
  type Course,
} from './game/course';
import { applyDailyLine, utcDayKey } from './game/daily';
import { loadGhost, recordGhost, saveGhost } from './game/ghost';
import { createLaunch, launchPoint, stepLaunch, type LaunchState } from './game/launch';
import { createInput } from './game/input';
import { assistToward, createFlight, grantBoost, stepPhysics, triggerSpeedRing } from './game/physics';
import { createComposer, resizeComposer } from './game/postfx';
import {
  awardCraft,
  awardLanding,
  awardNearMiss,
  awardOrb,
  awardRing,
  emptyScore,
  missRing,
  starCount,
  tickCombo,
} from './game/scoring';
import {
  craft,
  createSurvival,
  gatherSalvage,
  stormFogBoost,
  stormGustScale,
  tickSurvival,
  type CraftId,
  type SurvivalState,
} from './game/survival';
import {
  bindMuteListener,
  clearGameContext,
  gameplayStart,
  gameplayStop,
  happyTime,
  initCrazyGames,
  loadingStop,
  reportCompletion,
  setGameContext,
  submitScore,
} from './game/crazygames';
import { isUnlocked, loadProgress, nextUnlocked, recordResult, type Session } from './game/state';
import { loadTerrain, purgeTerrainFromScene, type TerrainWorld } from './game/terrain';
import { updateWater } from './game/water';
import type { FlightState, GhostSample, LevelDef, LevelId, Progress, ResultKind, ScoreState } from './game/types';
import { attachStudioAssets, createGlider, playPilotDying, poseGlider, setCanopyDeploy, setPilotGait } from './entities/glider';
import { createGhostVisual, stepGhost, type GhostVisual } from './entities/ghostGlider';
import { createThermalDust, spawnPopup, updatePopups, updateThermalDust, type Popup } from './entities/effects';
import { paintWaypointHud } from './entities/waypointArrow';
import {
  bindHud,
  fillBiomeSelect,
  paintHud,
  paintSurvive,
  setHasScrap,
  setHudLesson,
  setHudVisible,
  setSurviveMode,
  setTerrainSource,
  type HudLesson,
} from './ui/hud';
import {
  bindMenus,
  hideResults,
  renderLevelSelect,
  setCountdown,
  setLoader,
  showResults,
  showSelect,
} from './ui/menus';
import { bindTouch } from './ui/touch';

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  alpha: false,
  premultipliedAlpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0xb7d2e8, 1);
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app')?.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.8, 600000);
const composer = createComposer(renderer, scene, camera);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);
const scratch = new THREE.Vector3();
const wind = new THREE.Vector3();

const glider = createGlider();
scene.add(glider.root);
const wayMark = document.querySelector<HTMLElement>('#way-mark')!;
const dust = createThermalDust();
scene.add(dust);

const input = createInput();
const hud = bindHud();
const menus = bindMenus();
const popups: Popup[] = [];
const popupHost = document.querySelector<HTMLElement>('#popup-layer')!;
const pauseEl = document.querySelector<HTMLElement>('#pause')!;
const coachEl = document.querySelector<HTMLElement>('#coach')!;
const volSlider = document.querySelector<HTMLInputElement>('#vol-slider');

const ALPINE_COACH: Array<{ until: number; text: string }> = [
  { until: 16, text: 'Gold packs are fabric. Teal packs are cord. Grab both.' },
  { until: 36, text: 'Blue air is heat. Patch the canopy before it shreds.' },
  { until: 90, text: 'Craft with 1 / 2 / 3, then flare the valley pad.' },
];

let progress: Progress = loadProgress();
let session: Session = { phase: 'menu', result: null, timeLeft: 0, countdown: 0 };
let level: LevelDef = LEVELS[0];
let terrain: TerrainWorld | null = null;
let course: Course | null = null;
let flight: FlightState = createFlight();
let score: ScoreState = emptyScore();
let atmo: Atmosphere | null = null;
let paused = false;
let coachElapsed = 0;
let inThermalLast = false;
let launch: LaunchState | null = null;
let ghost: GhostVisual | null = null;
let ghostSamples: GhostSample[] = [];
let flyClock = 0;
let lesson: HudLesson = 'full';
let survival: SurvivalState | null = null;
const visorEl = document.querySelector<HTMLElement>('#visor');
const titleEl = document.querySelector<HTMLElement>('#title-card');

const sampleGround = (origin: THREE.Vector3): number | null => {
  if (!terrain) return null;
  scratch.copy(origin);
  scratch.y += 120;
  raycaster.set(scratch, down);
  raycaster.far = 900;
  const hit = raycaster.intersectObject(terrain.collision, true)[0];
  return hit ? hit.point.y : terrain.sampleHeight(origin.x, origin.z);
};

const sampleClearance = (origin: THREE.Vector3, heading: number): number => {
  if (!terrain) return 80;
  const dirs = [
    down,
    new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading)),
    new THREE.Vector3(-Math.cos(heading), 0, Math.sin(heading)),
  ];
  let best = 80;
  for (const dir of dirs) {
    raycaster.set(origin, dir);
    raycaster.far = NEAR_MISS_MAX + 2;
    const hit = raycaster.intersectObject(terrain.collision, true)[0];
    if (hit) best = Math.min(best, hit.distance);
  }
  return best;
};

function setPaused(value: boolean): void {
  if (value && session.phase !== 'countdown' && session.phase !== 'flying' && session.phase !== 'launch') return;
  paused = value;
  pauseEl.hidden = !value;
  renderer.domElement.style.pointerEvents = value ? 'none' : '';
  if (value) {
    audio.update(0, 0, false);
    gameplayStop();
  } else if (session.phase === 'countdown' || session.phase === 'flying' || session.phase === 'launch') {
    gameplayStart();
  }
}

function togglePause(): void {
  if (session.phase !== 'countdown' && session.phase !== 'flying' && session.phase !== 'launch') return;
  setPaused(!paused);
}

function hideTitle(): void {
  if (titleEl) titleEl.hidden = true;
}

function showTitle(): void {
  if (titleEl) titleEl.hidden = false;
}

function playInput() {
  const raw = input.state;
  if (lesson === 'steer') {
    return {
      ...raw,
      dive: 0,
      speedBar: 0,
      flare: false,
      boost: false,
      bigEars: false,
    };
  }
  if (lesson === 'open') {
    return { ...raw, boost: false, bigEars: false };
  }
  return raw;
}

function syncLesson(): void {
  if (level.id !== 'alpine') {
    lesson = 'full';
    setHudLesson('full');
    return;
  }
  const nxt = course ? nextRing(course) : null;
  if (!nxt) lesson = 'flare';
  else if (flyClock > 16 || score.ringsHit > 0 || (survival && survival.gathered > 0)) lesson = 'open';
  else lesson = 'steer';
  setHudLesson(lesson);
}

function hideCoach(): void {
  coachEl.hidden = true;
}

function paintCoach(dt: number): void {
  const live = session.phase === 'flying';
  if (level.id !== 'alpine' || !live || paused || lesson === 'steer') {
    if (!live || lesson === 'steer') hideCoach();
    return;
  }
  coachElapsed += dt;
  if (coachElapsed > 40) {
    hideCoach();
    return;
  }
  const line = ALPINE_COACH.find((item) => coachElapsed < item.until);
  coachEl.hidden = !line;
  if (line) coachEl.textContent = line.text;
}

function clearWorld(): void {
  course?.group.removeFromParent();
  terrain?.dispose();
  terrain = null;
  course = null;
  purgeTerrainFromScene(scene);
  atmo?.dispose(scene);
  atmo = null;
  popups.splice(0).forEach((p) => p.el.remove());
  if (wayMark) wayMark.hidden = true;
  if (ghost) {
    ghost.root.removeFromParent();
    ghost = null;
  }
}

function beginFlight(): void {
  if (session.phase !== 'attract') return;
  hideTitle();
  audio.init();
  audio.resume();
  audio.startBed();
  session.phase = 'flying';
  session.countdown = 0;
  setCountdown(menus, null);
  setCanopyDeploy(glider, 1);
  setPilotGait(glider, 'sit');
  setHudVisible(hud, true);
  lesson = 'steer';
  setHudLesson('steer');
  gameplayStart();
}

async function startLevel(id: LevelId, attract = false): Promise<void> {
  if (!isUnlocked(progress, id)) {
    openMenu();
    return;
  }
  audio.init();
  audio.resume();
  audio.startBed();

  session.phase = 'load';
  paused = false;
  pauseEl.hidden = true;
  renderer.domElement.style.pointerEvents = '';
  hideCoach();
  coachElapsed = 0;
  inThermalLast = false;
  showSelect(menus, false);
  hideResults(menus);
  hideTitle();
  setHudVisible(hud, false);
  setLoader(menus, attract ? 'Spinning up the canyon…' : `Building ${getLevel(id).name}…`, false);
  clearWorld();

  level = applyDailyLine(getLevel(id));
  atmo = createAtmosphere(level, scene);
  renderer.setClearColor(level.fogColor, 1);
  renderer.toneMappingExposure = 1.0;
  terrain = await loadTerrain(level, scene, atmo.sunDir);
  course = buildCourse(level, terrain, scene);
  flight = createFlight();
  score = emptyScore();
  survival = level.id === 'alpine' ? createSurvival() : null;
  setSurviveMode(Boolean(survival));
  setHasScrap(false);
  ghostSamples = [];
  flyClock = 0;
  launch = null;
  const tape = loadGhost(id);
  if (tape && tape.samples.length > 4) {
    ghost = createGhostVisual(tape);
    scene.add(ghost.root);
  }
  const heading = spawnHeading(terrain);
  flight.heading = heading;
  if (level.launch && !attract) {
    const spawn = launchPoint(level, terrain);
    glider.root.position.copy(spawn);
    flight.asl = spawn.y;
    flight.agl = 1.05;
    launch = createLaunch(terrain);
    session = { phase: 'launch', result: null, timeLeft: level.parTime, countdown: 0 };
    setCanopyDeploy(glider, 0);
    setPilotGait(glider, 'walk');
    camera.position.set(spawn.x - Math.sin(heading) * 7.5, spawn.y + 2.4, spawn.z - Math.cos(heading) * 7.5);
  } else {
    const spawn = spawnPoint(level, terrain);
    glider.root.position.copy(spawn);
    flight.asl = spawn.y;
    setCanopyDeploy(glider, 1);
    setPilotGait(glider, 'sit');
    camera.position.set(
      spawn.x - Math.sin(heading) * 11.5,
      spawn.y + 2.2,
      spawn.z - Math.cos(heading) * 11.5,
    );
    session = attract
      ? { phase: 'attract', result: null, timeLeft: level.parTime, countdown: 0 }
      : { phase: 'flying', result: null, timeLeft: level.parTime, countdown: 0 };
  }
  resetLook();
  snapCamera(glider.root.position, flight.heading);
  fillBiomeSelect(hud, level.id, progress, (next) => void startLevel(next));
  setTerrainSource(hud, terrain.fromStudio, level.asset);
  setLoader(menus, 'Ready', true);
  if (attract) {
    setHudVisible(hud, false);
    showTitle();
    lesson = 'steer';
    setHudLesson('steer');
    setGameContext({ biome: level.id, course: level.name, daily: utcDayKey() });
  } else {
    hideTitle();
    setHudVisible(hud, true);
    syncLesson();
    setGameContext({ biome: level.id, course: level.name, daily: utcDayKey() });
    gameplayStart();
  }
}

function openMenu(): void {
  session.phase = 'menu';
  paused = false;
  pauseEl.hidden = true;
  renderer.domElement.style.pointerEvents = '';
  hideCoach();
  hideTitle();
  audio.stopBed();
  gameplayStop();
  clearGameContext();
  setHudVisible(hud, false);
  setHudLesson('full');
  hideResults(menus);
  renderLevelSelect(menus, progress, (id) => void startLevel(id));
  showSelect(menus, true);
}

function tryCraft(id: CraftId): void {
  if (!survival || paused || session.phase !== 'flying') return;
  if (!craft(survival, id)) return;
  const pts = awardCraft(score);
  audio.playOrbSound();
  popups.push(spawnPopup(popupHost, glider.root.position.clone(), `CRAFT +${pts}`, '#ffc14a'));
}

function finish(kind: ResultKind): void {
  if (session.phase !== 'flying' && session.phase !== 'countdown' && session.phase !== 'launch') return;
  session.phase = 'results';
  session.result = kind;
  setHasScrap(false);
  paused = false;
  pauseEl.hidden = true;
  renderer.domElement.style.pointerEvents = '';
  hideCoach();
  audio.stopBed();
  if (kind === 'crash' || kind === 'freeze' || kind === 'shred' || kind === 'storm') playPilotDying(glider);
  gameplayStop();
  clearGameContext();
  const stars = starCount(score.total, level.starScores, kind === 'clear');
  const total = Math.floor(score.total);
  const prevBest = progress.best[level.id] ?? 0;
  progress = recordResult(progress, level.id, stars, total);
  if (kind === 'clear' && ghostSamples.length > 6) saveGhost(level.id, { score: total, samples: ghostSamples });
  void submitScore(total);
  const earned = Object.values(progress.stars).reduce((sum, n) => sum + n, 0);
  reportCompletion((earned / 12) * 100);
  if (kind === 'clear' && stars >= 3) happyTime();
  const nextId = nextUnlocked(progress, level.id);
  const nextOpen = !CONTEST && nextId !== level.id;
  const ghostNote = kind === 'clear' && total >= prevBest ? 'Ghost saved — beat the cyan wing next run.' : '';
  const board = `Daily ${utcDayKey()} · best ${Math.max(prevBest, total).toLocaleString()}`;
  const surviveNote = survival
    ? `Canopy ${Math.max(0, survival.integrity).toFixed(0)} · Warmth ${Math.max(0, survival.warmth).toFixed(0)} · Patch ${survival.patches} · Bind ${survival.binds}`
    : '';
  showResults(
    menus,
    kind,
    score,
    session.timeLeft,
    level.starScores,
    () => void startLevel(level.id),
    () => void startLevel(nextId),
    openMenu,
    nextOpen,
    [board, surviveNote, ghostNote].filter(Boolean).join(' · '),
  );
}

function handleLanding(): void {
  if (!course) return;
  const band = padResult(course, glider.root.position);
  const soft = Math.abs(flight.verticalSpeed) < 1.5;
  const gentle = Math.abs(flight.verticalSpeed) < CRASH_SINK;
  if (band && gentle) {
    awardLanding(score, band, soft);
    audio.playLandingSound(soft);
    popups.push(
      spawnPopup(
        popupHost,
        glider.root.position.clone(),
        soft ? 'FLARE ×2' : band.toUpperCase(),
        '#ffc14a',
      ),
    );
    finish('clear');
    return;
  }
  audio.playLandingSound(false);
  finish('crash');
}

function tickPlay(dt: number): void {
  if (!terrain || !course || !atmo) return;
  const pos = glider.root.position;

  input.pollGamepad();
  if (input.consumePause()) togglePause();
  if (paused) {
    paintCoach(0);
    return;
  }

  paintCoach(dt);

  if (session.phase === 'launch' && launch) {
    const groundY = sampleGround(pos);
    const ahead = pos.clone().add(new THREE.Vector3(Math.sin(launch.heading) * 6, 0, Math.cos(launch.heading) * 6));
    const aheadGround = sampleGround(ahead);
    const wantRun = input.state.speedBar > 0.2 || input.state.dive > 0.2;
    const stage = stepLaunch(launch, pos, groundY, aheadGround, wantRun, dt);
    flight.heading = launch.heading;
    flight.speed = wantRun ? 5.4 : 2.4;
    flight.asl = pos.y;
    flight.agl = groundY !== null ? pos.y - groundY : 8;
    setCanopyDeploy(glider, launch.inflate);
    if (stage === 'running') setPilotGait(glider, wantRun ? 'run' : 'walk');
    if (stage === 'inflate') setPilotGait(glider, 'jump');
    if (stage === 'done') {
      setCanopyDeploy(glider, 1);
      setPilotGait(glider, 'sit');
      session.phase = 'countdown';
      session.countdown = 2.2;
      launch = null;
    }
  }

  if (session.phase === 'countdown') {
    session.countdown -= dt;
    setCountdown(menus, session.countdown);
    if (session.countdown <= 0) {
      session.phase = 'flying';
      setCountdown(menus, null);
    }
    const gated = playInput();
    flight.leftBrake = gated.leftBrake;
    flight.rightBrake = gated.rightBrake;
    flight.weightShift = gated.weightShift;
    flight.flare = gated.flare;
    flight.speedBar = gated.speedBar;
    flight.bigEars = gated.bigEars;
  }

  const gust = survival ? stormGustScale(survival) : 1;
  wind.set(
    Math.sin(clock.elapsedTime * 0.35) * level.gustStrength * gust,
    0,
    Math.cos(clock.elapsedTime * 0.21) * level.gustStrength * 0.45 * gust,
  );

  if (session.phase === 'flying') {
    session.timeLeft -= dt;
    if (!survival && session.timeLeft <= 0) {
      finish('timeout');
      return;
    }
    const groundY = sampleGround(pos);
    const clearance = sampleClearance(pos, flight.heading);
    syncLesson();
    stepPhysics({
      flight,
      position: pos,
      input: playInput(),
      dt,
      groundY,
      clearance,
      inThermal: insideThermal(course, pos),
      inDowndraft: insideHazard(course, pos),
      wind,
      glideTax: level.glideTax,
      overBrakeSink: level.overBrakeSink,
      ridgeLift: level.ridgeLift,
    });
    flyClock += dt;
    recordGhost(ghostSamples, flyClock, pos, flight.heading, flight.bank);
    if (ghost) stepGhost(ghost, flyClock);
    const magnet = nextRing(course);
    if (magnet) assistToward(flight, pos, magnet.position, dt);
    tickCombo(score, dt);
    if (flight.nearMiss) awardNearMiss(score, dt);
    if (flight.inThermal && !inThermalLast) audio.playThermalSting();
    inThermalLast = flight.inThermal;

    if (survival) {
      const fail = tickSurvival(survival, dt, {
        inThermal: flight.inThermal,
        inDowndraft: flight.inDowndraft,
        stall: flight.stall,
        parTime: level.parTime,
        timeLeft: session.timeLeft,
      });
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.density = Math.min(0.0025, level.fog + stormFogBoost(survival));
      }
      if (fail) {
        finish(fail);
        return;
      }
    }

    const event = updateCourse(course, pos, clock.elapsedTime);
    if (event.kind === 'ring' && event.ring) {
      const pts = awardRing(score, event.ring.type);
      audio.playRingSound(event.ring.type);
      if (event.ring.type === 'gold') grantBoost(flight, 34);
      if (event.ring.type === 'boost') {
        triggerSpeedRing(flight);
        audio.playBoostSound();
      }
      popups.push(spawnPopup(popupHost, event.ring.position, event.popup ?? `+${pts}`, event.color ?? '#fff'));
    } else if (event.kind === 'miss') {
      missRing(score);
      session.timeLeft = Math.max(0, session.timeLeft - MISS_TIME_PENALTY);
      audio.playMissSound();
      popups.push(spawnPopup(popupHost, pos, 'MISS −2s', '#ff5a4a'));
    } else if (event.kind === 'orb') {
      const pts = awardOrb(score);
      if (survival && event.orb && (event.orb.kind === 'fabric' || event.orb.kind === 'cord')) {
        gatherSalvage(survival, event.orb.kind);
        setHasScrap(true);
      } else {
        grantBoost(flight, 18);
      }
      audio.playOrbSound();
      popups.push(spawnPopup(popupHost, pos, event.popup ?? `+${pts}`, event.color ?? '#7cf0ff'));
    }

    if (level.waterCrash && level.water && pos.y < level.waterLevel + 1.35 && !padResult(course, pos)) {
      audio.playLandingSound(false);
      finish('crash');
      return;
    }
    if (flight.agl <= LANDING_AGL + 0.05 && padResult(course, pos)) handleLanding();
  }

  // Update audio dynamically with airspeed & variometer climb/sink
  audio.update(
    flight.speed,
    flight.verticalSpeed,
    session.phase === 'flying' || session.phase === 'countdown' || session.phase === 'attract',
  );

  poseGlider(glider, flight, session.phase === 'attract' ? 0 : playInput().steer, clock.elapsedTime, dt);
  const nxt = nextRing(course);
  const wayTarget = nxt ? nxt.position : course.pad.position;
  paintWaypointHud(
    wayMark,
    camera,
    pos,
    wayTarget,
    (session.phase === 'flying' || session.phase === 'countdown') && !input.state.fpv,
  );
  updateThermalDust(dust, course.thermals, clock.elapsedTime);
  updateWater(terrain.water, dt, atmo.sunDir);
  stepCamera(camera, atmo, pos, flight, dt, glider, input.state.fpv);
  const hint =
    session.phase === 'attract'
      ? ''
      : session.phase === 'launch'
        ? 'W sprints the ridge — the wing opens when you step off'
        : flight.stall
          ? 'STALL — ease both brakes to recover'
          : survival && survival.integrity < 28
            ? 'Canopy tearing — craft Patch (1) with 2 fabric'
            : survival && survival.warmth < 28
              ? 'Freezing — ride blue lift or craft a heat wrap (3)'
              : lesson === 'steer'
                ? 'A / D banks the wing. Grab gold fabric and teal cord.'
                : lesson === 'flare' || !nxt
                  ? 'Hold Space or FLARE onto the pad'
                  : nxt
                    ? `Next ring · ${pos.distanceTo(nxt.position).toFixed(0)} m`
                    : 'Flare and land on the bullseye';
  paintHud(hud, score, flight, session.timeLeft, score.ringsHit, course.rings.length, hint);
  paintSurvive(survival, session.timeLeft);
  if (visorEl) visorEl.hidden = !input.state.fpv;
  updatePopups(popups, camera, window.innerWidth, window.innerHeight, dt);
}

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (
    session.phase === 'countdown' ||
    session.phase === 'flying' ||
    session.phase === 'results' ||
    session.phase === 'launch' ||
    session.phase === 'attract'
  ) {
    tickPlay(dt);
  }
  composer.render();
  requestAnimationFrame(frame);
}

function bindCamRig(): void {
  const zoomIn = document.querySelector<HTMLButtonElement>('#btn-zoom-in');
  const zoomOut = document.querySelector<HTMLButtonElement>('#btn-zoom-out');
  const reset = document.querySelector<HTMLButtonElement>('#btn-cam-reset');
  const hold = (el: HTMLButtonElement | null, fn: () => void): void => {
    if (!el) return;
    let id = 0;
    const start = (event: Event): void => {
      event.preventDefault();
      fn();
      id = window.setInterval(fn, 90);
    };
    const stop = (): void => window.clearInterval(id);
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointerleave', stop);
    el.addEventListener('pointercancel', stop);
  };
  hold(zoomIn, () => zoomLook(-1));
  hold(zoomOut, () => zoomLook(1));
  reset?.addEventListener('click', () => resetLook());
}

function syncMuteButton(): void {
  const btn = document.querySelector<HTMLButtonElement>('#btn-audio-mute');
  if (btn) btn.textContent = audio.getMasterVolume() <= 0.01 ? '🔇' : '🔊';
}

function bindAudioToggle(): void {
  const btn = document.querySelector<HTMLButtonElement>('#btn-audio-mute');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const isMuted = audio.toggleMute();
    btn.textContent = isMuted ? '🔇' : '🔊';
  });
}

function bindPauseUi(): void {
  document.querySelector('#btn-pause')?.addEventListener('click', () => togglePause());
  document.querySelector('#btn-resume')?.addEventListener('click', () => setPaused(false));
  document.querySelector('#btn-pause-retry')?.addEventListener('click', () => {
    if (session.phase === 'flying' || session.phase === 'countdown' || session.phase === 'launch') {
      void startLevel(level.id);
    }
  });
  document.querySelector('#btn-pause-menu')?.addEventListener('click', () => openMenu());
  if (volSlider) {
    volSlider.value = String(Math.round(audio.getMasterVolume() * 100));
    volSlider.addEventListener('input', () => {
      audio.init();
      audio.setMasterVolume(Number(volSlider.value) / 100);
      syncMuteButton();
    });
  }
}

async function boot(): Promise<void> {
  await initCrazyGames();
  progress = loadProgress();
  bindMuteListener((muted) => {
    audio.setPlatformMute(muted);
    const btn = document.querySelector<HTMLButtonElement>('#btn-audio-mute');
    if (btn && muted) btn.textContent = '🔇';
  });

  input.bind();
  bindTouch(input.setTouch, input.toggleFpv, input.toggleGyro);
  bindCamRig();
  bindAudioToggle();
  bindPauseUi();
  document.getElementById('craft-patch')?.addEventListener('click', () => tryCraft('patch'));
  document.getElementById('craft-bind')?.addEventListener('click', () => tryCraft('bind'));
  document.getElementById('craft-wrap')?.addEventListener('click', () => tryCraft('wrap'));
  bindLookControls(renderer.domElement, () =>
    !paused &&
      (session.phase === 'countdown' ||
        session.phase === 'flying' ||
        session.phase === 'results' ||
        session.phase === 'launch'),
  );

  // Browsers block AudioContext until a gesture; keep trying until it runs.
  const unlockAudio = (): void => {
    audio.init();
    audio.resume();
    if (audio.isReady()) {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    }
  };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeComposer(composer, renderer);
  });

  titleEl?.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    beginFlight();
  });

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (session.phase === 'attract' && key !== 'escape') {
      beginFlight();
      return;
    }
    const live =
      session.phase === 'countdown' ||
      session.phase === 'flying' ||
      session.phase === 'results' ||
      session.phase === 'launch';
    if (key === 'r' && (session.phase === 'flying' || session.phase === 'results' || session.phase === 'launch')) {
      void startLevel(level.id);
    }
    if (key === '1') tryCraft('patch');
    if (key === '2') tryCraft('bind');
    if (key === '3') tryCraft('wrap');
    if (key === 'm' && !event.repeat) {
      const isMuted = audio.toggleMute();
      const btn = document.querySelector<HTMLButtonElement>('#btn-audio-mute');
      if (btn) btn.textContent = isMuted ? '🔇' : '🔊';
    }
    if ((key === 'escape' || key === 'p') && !event.repeat) {
      if (session.phase === 'results') openMenu();
      else togglePause();
    }
    if (!live) return;
    if (key === '=' || key === '+') zoomLook(-1);
    if (key === '-' || key === '_') zoomLook(1);
    if (key === 'home' || key === '0') resetLook();
  });

  renderLevelSelect(menus, progress, (id) => void startLevel(id));
  showSelect(menus, false);
  setLoader(menus, 'Spinning up the canyon…', false);
  frame();
  await attachStudioAssets(glider);
  loadingStop();
  await startLevel('alpine', true);
}

void boot();
