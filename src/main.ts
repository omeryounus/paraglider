import * as THREE from 'three';
import { CRASH_SINK, LANDING_AGL, MISS_TIME_PENALTY, NEAR_MISS_MAX } from './config/constants';
import { getLevel, LEVELS } from './config/levels';
import { createAtmosphere, type Atmosphere } from './game/atmosphere';
import { stepCamera } from './game/camera';
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
import { createInput } from './game/input';
import { createFlight, grantBoost, stepPhysics, triggerSpeedRing } from './game/physics';
import { createComposer, resizeComposer } from './game/postfx';
import {
  awardLanding,
  awardNearMiss,
  awardOrb,
  awardRing,
  emptyScore,
  missRing,
  starCount,
  tickCombo,
} from './game/scoring';
import { loadProgress, newSession, recordResult, type Session } from './game/state';
import { loadTerrain, type TerrainWorld } from './game/terrain';
import { updateWater } from './game/water';
import type { FlightState, LevelDef, LevelId, Progress, ScoreState } from './game/types';
import { createGlider, poseGlider } from './entities/glider';
import { createThermalDust, spawnPopup, updatePopups, updateThermalDust, type Popup } from './entities/effects';
import { createWaypointArrow, updateWaypointArrow } from './entities/waypointArrow';
import { bindHud, fillBiomeSelect, paintHud, setHudVisible } from './ui/hud';
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

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app')?.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.2, 20000);
const composer = createComposer(renderer, scene, camera);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);
const scratch = new THREE.Vector3();
const wind = new THREE.Vector3();

const glider = createGlider();
scene.add(glider.root);
const arrow = createWaypointArrow();
scene.add(arrow);
const dust = createThermalDust();
scene.add(dust);

const input = createInput();
const hud = bindHud();
const menus = bindMenus();
const popups: Popup[] = [];
const popupHost = document.querySelector<HTMLElement>('#popup-layer')!;

let progress: Progress = loadProgress();
let session: Session = { phase: 'menu', result: null, timeLeft: 0, countdown: 0 };
let level: LevelDef = LEVELS[0];
let terrain: TerrainWorld | null = null;
let course: Course | null = null;
let flight: FlightState = createFlight();
let score: ScoreState = emptyScore();
let atmo: Atmosphere | null = null;

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

function clearWorld(): void {
  course?.group.removeFromParent();
  terrain?.dispose();
  terrain = null;
  course = null;
  atmo?.dispose(scene);
  atmo = null;
  popups.splice(0).forEach((p) => p.el.remove());
}

async function startLevel(id: LevelId): Promise<void> {
  session.phase = 'load';
  showSelect(menus, false);
  hideResults(menus);
  setHudVisible(hud, false);
  setLoader(menus, `Building ${getLevel(id).name}…`, false);
  clearWorld();

  level = getLevel(id);
  atmo = createAtmosphere(level, scene);
  renderer.toneMappingExposure = 1.15;
  terrain = await loadTerrain(level, scene, atmo.sunDir);
  course = buildCourse(level, terrain, scene);
  flight = createFlight();
  score = emptyScore();
  session = newSession(level.parTime);
  const spawn = spawnPoint(level, terrain);
  glider.root.position.copy(spawn);
  flight.asl = spawn.y;
  flight.heading = spawnHeading(terrain);
  camera.position.set(
    spawn.x - Math.sin(flight.heading) * 10,
    spawn.y + 2.8,
    spawn.z - Math.cos(flight.heading) * 10,
  );
  fillBiomeSelect(hud, level.id, (next) => void startLevel(next));
  setLoader(menus, 'Ready', true);
  setHudVisible(hud, true);
}

function openMenu(): void {
  session.phase = 'menu';
  setHudVisible(hud, false);
  hideResults(menus);
  renderLevelSelect(menus, progress, (id) => void startLevel(id));
  showSelect(menus, true);
}

function finish(kind: 'clear' | 'crash' | 'timeout'): void {
  if (session.phase !== 'flying' && session.phase !== 'countdown') return;
  session.phase = 'results';
  session.result = kind;
  const stars = starCount(score.total, level.starScores, kind === 'clear');
  progress = recordResult(progress, level.id, stars, Math.floor(score.total));
  showResults(
    menus,
    kind,
    score,
    session.timeLeft,
    level.starScores,
    () => void startLevel(level.id),
    () => {
      const idx = LEVELS.findIndex((item) => item.id === level.id);
      void startLevel(LEVELS[(idx + 1) % LEVELS.length].id);
    },
    openMenu,
  );
}

function handleLanding(): void {
  if (!course) return;
  const band = padResult(course, glider.root.position);
  const soft = Math.abs(flight.verticalSpeed) < 1.5;
  const gentle = Math.abs(flight.verticalSpeed) < CRASH_SINK;
  if (band && gentle) {
    awardLanding(score, band, soft);
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
  finish('crash');
}

function tickPlay(dt: number): void {
  if (!terrain || !course || !atmo) return;
  const pos = glider.root.position;

  if (session.phase === 'countdown') {
    session.countdown -= dt;
    setCountdown(menus, session.countdown);
    if (session.countdown <= 0) {
      session.phase = 'flying';
      setCountdown(menus, null);
    }
  }

  wind.set(
    Math.sin(clock.elapsedTime * 0.35) * level.gustStrength,
    0,
    Math.cos(clock.elapsedTime * 0.21) * level.gustStrength * 0.45,
  );

  if (session.phase === 'flying') {
    session.timeLeft -= dt;
    if (session.timeLeft <= 0) {
      finish('timeout');
      return;
    }
    const groundY = sampleGround(pos);
    const clearance = sampleClearance(pos, flight.heading);
    stepPhysics({
      flight,
      position: pos,
      input: input.state,
      dt,
      groundY,
      clearance,
      inThermal: insideThermal(course, pos),
      inDowndraft: insideHazard(course, pos),
      wind,
    });
    tickCombo(score, dt);
    if (flight.nearMiss) awardNearMiss(score, dt);

    const event = updateCourse(course, pos, clock.elapsedTime);
    if (event.kind === 'ring' && event.ring) {
      const pts = awardRing(score, event.ring.type);
      if (event.ring.type === 'gold') grantBoost(flight, 34);
      if (event.ring.type === 'boost') triggerSpeedRing(flight);
      popups.push(spawnPopup(popupHost, event.ring.position, event.popup ?? `+${pts}`, event.color ?? '#fff'));
    } else if (event.kind === 'miss') {
      missRing(score);
      session.timeLeft = Math.max(0, session.timeLeft - MISS_TIME_PENALTY);
      popups.push(spawnPopup(popupHost, pos, 'MISS −4s', '#ff5a4a'));
    } else if (event.kind === 'orb') {
      const pts = awardOrb(score);
      grantBoost(flight, 18);
      popups.push(spawnPopup(popupHost, pos, `+${pts}`, '#7cf0ff'));
    }

    if (flight.agl <= LANDING_AGL + 0.05) handleLanding();
  }

  poseGlider(glider, flight, input.state.steer, clock.elapsedTime, dt);
  const nxt = nextRing(course);
  updateWaypointArrow(arrow, pos, nxt ? nxt.position : course.pad.position);
  arrow.visible = !input.state.fpv;
  updateThermalDust(dust, course.thermals, clock.elapsedTime);
  updateWater(terrain.water, dt, atmo.sunDir);
  stepCamera(camera, atmo, pos, flight, dt, glider, input.state.fpv);
  paintHud(hud, score, flight, session.timeLeft, score.ringsHit, course.rings.length);
  updatePopups(popups, camera, window.innerWidth, window.innerHeight, dt);
}

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (session.phase === 'countdown' || session.phase === 'flying' || session.phase === 'results') {
    tickPlay(dt);
  }
  composer.render();
  requestAnimationFrame(frame);
}

function boot(): void {
  input.bind();
  bindTouch(input.setTouch);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeComposer(composer, renderer);
  });
  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'r' && (session.phase === 'flying' || session.phase === 'results')) {
      void startLevel(level.id);
    }
  });
  renderLevelSelect(menus, progress, (id) => void startLevel(id));
  showSelect(menus, true);
  setLoader(menus, 'Choose a canyon', true);
  session.phase = 'menu';
  frame();
}

boot();
