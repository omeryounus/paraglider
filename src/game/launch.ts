import * as THREE from 'three';
import type { LevelDef } from './types';
import type { TerrainWorld } from './terrain';
import { spawnHeading } from './course';

export interface LaunchState {
  heading: number;
  run: number;
  inflate: number;
  airborne: boolean;
}

export function launchPoint(level: LevelDef, terrain: TerrainWorld): THREE.Vector3 {
  const start = terrain.centerline(0);
  const ground = terrain.sampleHeight(start.x, start.z);
  const y = Number.isFinite(ground) ? ground + 1.05 : Math.max(4, (level.spawn[1] || 80) * 0.2);
  return new THREE.Vector3(start.x, y, start.z);
}

export function createLaunch(terrain: TerrainWorld): LaunchState {
  return { heading: spawnHeading(terrain), run: 0, inflate: 0, airborne: false };
}

export function stepLaunch(
  state: LaunchState,
  pos: THREE.Vector3,
  groundY: number | null,
  aheadGround: number | null,
  wantRun: boolean,
  dt: number,
): 'running' | 'inflate' | 'done' {
  if (state.inflate > 0 || state.airborne) {
    state.inflate = Math.min(1, state.inflate + dt / 1.35);
    pos.y += 1.8 * dt;
    pos.x += Math.sin(state.heading) * 6.5 * dt;
    pos.z += Math.cos(state.heading) * 6.5 * dt;
    return state.inflate >= 1 ? 'done' : 'inflate';
  }

  const speed = wantRun ? 5.4 : 2.4;
  state.run += speed * dt;
  pos.x += Math.sin(state.heading) * speed * dt;
  pos.z += Math.cos(state.heading) * speed * dt;
  const drop = groundY !== null && aheadGround !== null ? groundY - aheadGround : 0;
  if (drop > 3.4 || state.run > 44 || groundY === null) {
    state.airborne = true;
    state.inflate = 0.02;
    return 'inflate';
  }
  pos.y = groundY + 1.05;
  return 'running';
}
