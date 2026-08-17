import * as THREE from 'three';
import {
  BASE_SPEED,
  BOOST_DRAIN,
  BOOST_MAX,
  BOOST_MAX_SPEED,
  GLIDE_RATIO,
  LANDING_AGL,
  MAX_SPEED,
  MIN_SPEED,
  NEAR_MISS_MAX,
  NEAR_MISS_MIN,
  SPEED_RING_MULT,
  SPEED_RING_TIME,
  THERMAL_LIFT,
  WALL_CRASH_DIST,
} from '../config/constants';
import type { InputState } from './input';
import { clamp, damp } from './math';
import type { FlightState } from './types';

export function createFlight(): FlightState {
  return {
    heading: 0,
    pitch: 0,
    bank: 0,
    speed: BASE_SPEED,
    verticalSpeed: -BASE_SPEED / GLIDE_RATIO,
    boost: 75,
    boosting: false,
    flare: false,
    speedBoost: 0,
    agl: 40,
    asl: 0,
    nearMiss: false,
    inThermal: false,
    inDowndraft: false,
    windX: 0,
    windZ: 0,
    leftBrake: 0,
    rightBrake: 0,
    speedBar: 0,
    weightShift: 0,
    bigEars: false,
    stall: false,
    harnessRoll: 0,
    harnessPitch: 0,
    glideRatio: GLIDE_RATIO,
  };
}

export interface PhysicsContext {
  flight: FlightState;
  position: THREE.Vector3;
  input: InputState;
  dt: number;
  groundY: number | null;
  clearance: number;
  inThermal: boolean;
  inDowndraft: boolean;
  wind: THREE.Vector3;
}

export function stepPhysics(ctx: PhysicsContext): void {
  const { flight, position, input, dt } = ctx;

  // 1. Process Input Controls with Smooth Aerodynamic Response
  const wantBoost = input.boost && flight.boost > 1;
  flight.boosting = wantBoost;
  flight.leftBrake = damp(flight.leftBrake, input.leftBrake, 16, dt);
  flight.rightBrake = damp(flight.rightBrake, input.rightBrake, 16, dt);
  flight.speedBar = damp(flight.speedBar, input.speedBar, 9, dt);
  flight.weightShift = damp(flight.weightShift, input.weightShift, 12, dt);
  flight.bigEars = input.bigEars;

  const symBrake = Math.min(flight.leftBrake, flight.rightBrake);
  const diffBrake = flight.leftBrake - flight.rightBrake; // >0 turns left, <0 turns right
  flight.flare = symBrake > 0.4 || input.flare;

  flight.inThermal = ctx.inThermal;
  flight.inDowndraft = ctx.inDowndraft && !wantBoost;

  // Progressive aerodynamic response curve (fine micro-trimming + assertive thermal banking)
  const curvedDiffBrake = Math.sign(diffBrake) * Math.pow(Math.abs(diffBrake), 1.2);

  // 2. Aerodynamic Angles: Pitch & Bank
  // Pitch target: Speed bar / Dive input pitches down (dives forward for speed); Symmetrical brakes raise pitch (flares)
  const diveInput = input.dive;
  let pitchTarget = (diveInput * 0.65) - (symBrake * 0.4) + (flight.speedBar * 0.4);
  if (flight.bigEars) pitchTarget += 0.12;

  // Bank target: combination of differential braking and body weight shift
  let bankTarget = (-curvedDiffBrake * 0.92) + (flight.weightShift * 0.72) + (input.steer * 0.8);
  bankTarget = clamp(bankTarget, -1.15, 1.15);

  flight.pitch = damp(flight.pitch, pitchTarget, 7.5, dt);
  flight.bank = damp(flight.bank, bankTarget, 6.5, dt);

  // 3. Heading & Yaw Rate
  // Yaw turn rate directly derived from banking and differential brake drag with auto roll-coupling
  const yawRate = (flight.bank * 1.18) - (curvedDiffBrake * 0.65);
  flight.heading += yawRate * dt;

  // Turbulence disturbance in downdrafts
  if (ctx.inDowndraft && !wantBoost) {
    flight.heading += Math.sin(position.x * 0.2 + position.z * 0.13) * 0.38 * dt;
    flight.bank += Math.sin(position.z * 0.32) * 0.22 * dt;
  }

  // 4. Airspeed Calculations
  // Base trim speed ~12 m/s (43 km/h).
  // Pulling brakes slows speed down to 6.5 m/s.
  // Speed bar / diving increases speed up to 24 m/s.
  let targetSpeed = BASE_SPEED;
  targetSpeed += flight.speedBar * (MAX_SPEED - BASE_SPEED);
  targetSpeed -= symBrake * (BASE_SPEED - MIN_SPEED);
  targetSpeed += Math.max(0, flight.pitch) * 12.0; // diving aggressively gains airspeed

  if (wantBoost || flight.speedBoost > 0) {
    targetSpeed *= SPEED_RING_MULT;
    targetSpeed = clamp(targetSpeed, MIN_SPEED, BOOST_MAX_SPEED);
  } else {
    targetSpeed = clamp(targetSpeed, MIN_SPEED, MAX_SPEED + 6);
  }
  if (flight.flare) targetSpeed = Math.min(targetSpeed, MIN_SPEED);

  flight.speed = damp(flight.speed, targetSpeed, 4.2, dt);

  // 5. Vertical Speed & Glide Polar
  let currentGlide = GLIDE_RATIO;
  if (flight.speedBar > 0.1) {
    currentGlide = damp(currentGlide, 5.8, 5, dt);
  }
  if (flight.bigEars) {
    currentGlide = damp(currentGlide, 3.8, 8, dt);
  }
  flight.glideRatio = currentGlide;

  let sink = -flight.speed / currentGlide;
  // Banked turn: load factor 1/cos(phi) increases still-air sink.
  sink /= Math.max(Math.cos(Math.abs(flight.bank)), 0.42);

  // Diving actively increases downward sink rate (diving down to ground)
  if (flight.pitch > 0.05) {
    sink -= flight.pitch * 7.5;
  }

  // Dynamic Flare cushion & Ground Effect (near landing zone / ground)
  if (flight.flare) {
    sink *= 0.38;
    const groundEffectMult = flight.agl < 6.0 ? 1.0 + (6.0 - flight.agl) * 0.35 : 1.0;
    const flareLift = 2.5 * symBrake * groundEffectMult;
    sink += flareLift;
    // Ground effect flare cushion: smooth touchdown float
    if (flight.agl < 4.5 && symBrake > 0.55) {
      sink = Math.max(-0.35, sink);
    }
    flight.speed = Math.max(MIN_SPEED, flight.speed - 3.2 * symBrake * dt);
  }

  // Kinetic Zoom Climb: pulling out of a high speed dive converts excess kinetic energy into climb
  if (flight.speed > 16.5 && flight.pitch < 0.05 && (flight.flare || symBrake > 0.25)) {
    const excessSpeed = flight.speed - 16.5;
    sink += Math.min(3.5, excessSpeed * 0.45);
    flight.speed = Math.max(12, flight.speed - excessSpeed * 1.2 * dt);
  }

  // Big ears rapid descent
  if (flight.bigEars) {
    sink -= 3.6;
  }

  // Thermals & Ridge Lift: circling in thermals grants core lift bonus
  if (ctx.inThermal) {
    const isCircling = Math.abs(flight.bank) > 0.22;
    const coreBonus = isCircling ? 1.5 : 0;
    sink += THERMAL_LIFT + coreBonus;
    flight.boost = Math.min(BOOST_MAX, flight.boost + 32 * dt);
  }

  // Downdrafts
  if (ctx.inDowndraft && !wantBoost) {
    sink -= 4.2;
  }

  // Ridge updraft effect when near slopes with wind
  if (ctx.clearance < 25 && ctx.wind.lengthSq() > 1 && ctx.groundY !== null) {
    const slopeLift = Math.min(3.0, (25 - ctx.clearance) * 0.14 * Math.max(0, -ctx.wind.z));
    sink += slopeLift;
  }

  flight.verticalSpeed = damp(flight.verticalSpeed, sink, 4.8, dt);

  // 6. Boost Drain & Timers
  if (wantBoost) {
    flight.boost = Math.max(0, flight.boost - BOOST_DRAIN * dt);
  }
  flight.speedBoost = Math.max(0, flight.speedBoost - dt);

  // 7. World Position Update
  const step = flight.speed * dt;
  position.x += Math.sin(flight.heading) * step + ctx.wind.x * dt;
  position.z += Math.cos(flight.heading) * step + ctx.wind.z * dt;
  position.y += flight.verticalSpeed * dt;

  flight.asl = position.y;
  flight.windX = ctx.wind.x;
  flight.windZ = ctx.wind.z;

  // 8. Ground Clearance & Collision
  if (ctx.groundY !== null) {
    flight.agl = position.y - ctx.groundY;
    if (flight.agl < LANDING_AGL) {
      position.y = ctx.groundY + LANDING_AGL;
      flight.agl = LANDING_AGL;
      flight.asl = position.y;
    }
  } else {
    flight.agl = 80;
  }

  // Near miss scoring detector (brushing close to cliffs charges boost)
  flight.nearMiss = ctx.clearance > NEAR_MISS_MIN && ctx.clearance < NEAR_MISS_MAX;
  if (flight.nearMiss) {
    flight.boost = Math.min(BOOST_MAX, flight.boost + 14 * dt);
  }

  // 9. Harness Pendulum Inertia Dynamics
  // The pilot hangs beneath the canopy and swings naturally with bank acceleration
  const rollInertiaTarget = -flight.bank * 0.42 - (curvedDiffBrake * 0.25);
  const pitchInertiaTarget = -flight.pitch * 0.28 + (flight.flare ? 0.18 : 0) - (flight.speedBar * 0.2);
  flight.harnessRoll = damp(flight.harnessRoll, rollInertiaTarget, 6.8, dt);
  flight.harnessPitch = damp(flight.harnessPitch, pitchInertiaTarget, 6.5, dt);
}

export function grantBoost(flight: FlightState, amount: number): void {
  flight.boost = Math.min(BOOST_MAX, flight.boost + amount);
}

export function assistToward(flight: FlightState, from: THREE.Vector3, target: THREE.Vector3, dt: number): void {
  const desired = Math.atan2(target.x - from.x, target.z - from.z);
  let delta = desired - flight.heading;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const dist = from.distanceTo(target);
  const pull = dist < 160 ? 0.58 : 0.28;
  flight.heading += delta * pull * dt;
}

export function triggerSpeedRing(flight: FlightState): void {
  flight.speedBoost = Math.max(flight.speedBoost, SPEED_RING_TIME);
  grantBoost(flight, 25);
}

/** Airborne strike on a cliff or fold — not a pad landing. */
export function isWallFold(agl: number, forwardClearance: number): boolean {
  return agl > LANDING_AGL + 0.4 && forwardClearance < WALL_CRASH_DIST;
}
