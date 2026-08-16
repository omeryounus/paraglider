import * as THREE from 'three';
import { createDowndraft, type HazardZone, updateHazard } from '../entities/hazard';
import { createLandingPad, landingBand, type LandingPad } from '../entities/landingPad';
import { createOrb, type EnergyOrb, updateOrb } from '../entities/orb';
import { createRing, type CourseRing, updateRingVisual } from '../entities/ring';
import { containsCylinder, createThermal, type ThermalZone } from '../entities/thermal';
import type { LevelDef } from './types';
import type { TerrainWorld } from './terrain';
import { pathFrame } from './terrain';

export interface Course {
  rings: CourseRing[];
  active: number;
  thermals: ThermalZone[];
  hazards: HazardZone[];
  orbs: EnergyOrb[];
  pad: LandingPad;
  group: THREE.Group;
}

export function buildCourse(level: LevelDef, terrain: TerrainWorld, scene: THREE.Scene): Course {
  const group = new THREE.Group();
  group.name = 'Course';
  const rings: CourseRing[] = [];

  for (const spec of level.rings) {
    const pos = place(level, terrain, spec.t, spec.lateral, spec.agl);
    const ahead = place(level, terrain, Math.min(1, spec.t + 0.03), spec.lateral, spec.agl);
    const normal = ahead.sub(pos).normalize();
    if (normal.lengthSq() < 0.001) normal.set(0, 0, 1);
    const ring = createRing(pos, normal, spec.radius, spec.type);
    group.add(ring.mesh);
    rings.push(ring);
  }

  const thermals = level.thermals.map((spec) => {
    const pos = place(level, terrain, spec.t, spec.lateral, 0);
    const ground = terrain.sampleHeight(pos.x, pos.z);
    const zone = createThermal(pos.x, ground, pos.z, spec.radius, spec.height ?? 64);
    group.add(zone.group);
    return zone;
  });

  const hazards = level.downdrafts.map((spec) => {
    const pos = place(level, terrain, spec.t, spec.lateral, 0);
    const ground = terrain.sampleHeight(pos.x, pos.z);
    const wander = level.id === 'dune' ? spec.radius * 0.8 : 0;
    const zone = createDowndraft(pos.x, ground, pos.z, spec.radius, spec.height ?? 36, wander);
    group.add(zone.group);
    return zone;
  });

  const orbs = level.orbs.map((spec) => {
    const pos = place(level, terrain, spec.t, spec.lateral, spec.height ?? 18);
    const orb = createOrb(pos);
    group.add(orb.mesh);
    return orb;
  });

  const padPos = place(level, terrain, 1, 0, 0.4);
  padPos.y = terrain.sampleHeight(padPos.x, padPos.z) + 0.15;
  const heading = Math.atan2(terrain.tangent(1).x, terrain.tangent(1).z);
  const pad = createLandingPad(padPos, heading);
  group.add(pad.group);

  scene.add(group);
  return { rings, active: 0, thermals, hazards, orbs, pad, group };
}

function place(
  level: LevelDef,
  terrain: TerrainWorld,
  t: number,
  lateral: number,
  agl: number,
): THREE.Vector3 {
  if (terrain.fromStudio) {
    const base = terrain.centerline(t);
    const tan = terrain.tangent(t);
    const right = new THREE.Vector3(tan.z, 0, -tan.x);
    const x = base.x + right.x * lateral;
    const z = base.z + right.z * lateral;
    const y = terrain.sampleHeight(x, z) + agl;
    return new THREE.Vector3(x, y, z);
  }
  const local = pathFrame(level, t, lateral, agl);
  const y = terrain.sampleHeight(local.x, local.z) + agl;
  return new THREE.Vector3(local.x, y, local.z);
}

export function spawnPoint(level: LevelDef, terrain: TerrainWorld): THREE.Vector3 {
  return place(level, terrain, 0.0, 0, 28);
}

export function spawnHeading(terrain: TerrainWorld): number {
  const tan = terrain.tangent(0.02);
  return Math.atan2(tan.x, tan.z);
}

export interface CourseEvent {
  kind: 'ring' | 'miss' | 'orb' | 'none';
  ring?: CourseRing;
  orb?: EnergyOrb;
  popup?: string;
  color?: string;
}

export function updateCourse(
  course: Course,
  pos: THREE.Vector3,
  time: number,
): CourseEvent {
  for (const hazard of course.hazards) updateHazard(hazard, time);
  for (const orb of course.orbs) updateOrb(orb, time);

  let event: CourseEvent = { kind: 'none' };
  const ring = course.rings[course.active];
  if (ring && !ring.collected && !ring.missed) {
    const toPlayer = pos.clone().sub(ring.position);
    const along = toPlayer.dot(ring.normal);
    const radial = toPlayer.clone().addScaledVector(ring.normal, -along);
    const inside = radial.length() <= ring.radius * 0.95;
    if (Math.abs(along) < 3.2 && inside) {
      ring.collected = true;
      course.active += 1;
      event = { kind: 'ring', ring, popup: popupFor(ring.type), color: colorFor(ring.type) };
    } else if (along > ring.radius * 0.65 && !inside) {
      ring.missed = true;
      course.active += 1;
      event = { kind: 'miss', ring };
    }
  }

  for (const orb of course.orbs) {
    if (orb.collected) continue;
    if (pos.distanceTo(orb.position) < 3.2) {
      orb.collected = true;
      event = { kind: 'orb', orb, popup: '+200', color: '#7cf0ff' };
      break;
    }
  }

  for (let i = 0; i < course.rings.length; i++) {
    updateRingVisual(course.rings[i], i === course.active, time);
  }
  return event;
}

export function nextRing(course: Course): CourseRing | null {
  return course.rings[course.active] ?? null;
}

export function insideThermal(course: Course, pos: THREE.Vector3): boolean {
  return course.thermals.some((zone) => containsCylinder(zone, pos));
}

export function insideHazard(course: Course, pos: THREE.Vector3): boolean {
  return course.hazards.some((zone) => containsCylinder(zone, pos));
}

export function padResult(course: Course, pos: THREE.Vector3): ReturnType<typeof landingBand> {
  return landingBand(course.pad, pos);
}

function popupFor(type: CourseRing['type']): string {
  if (type === 'gold') return '+1500';
  if (type === 'boost') return '+1000';
  return '+500';
}

function colorFor(type: CourseRing['type']): string {
  if (type === 'gold') return '#ffc14a';
  if (type === 'boost') return '#3ce6ff';
  return '#3ee08a';
}
