import * as THREE from 'three';
import {
  BASE_SPEED,
  BOOST_DRAIN,
  BOOST_MAX,
  BOOST_THRUST,
  FLARE_SINK,
  GLIDE_RATIO,
  LANDING_AGL,
  MAX_SPEED,
  MIN_SPEED,
  NEAR_MISS_MAX,
  NEAR_MISS_MIN,
  SPEED_RING_MULT,
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
    boost: 45,
    boosting: false,
    flare: false,
    speedBoost: 0,
    agl: 40,
    nearMiss: false,
    inThermal: false,
    inDowndraft: false,
    windX: 0,
    windZ: 0,
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
  const wantBoost = input.boost && flight.boost > 1;
  flight.boosting = wantBoost;
  flight.flare = input.flare || (ctx.flight.agl < 12 && input.dive < -0.4);
  flight.inThermal = ctx.inThermal;
  flight.inDowndraft = ctx.inDowndraft && !wantBoost;

  const pitchTarget = input.dive * 0.55 + (flight.flare ? -0.22 : 0);
  const bankTarget = input.steer * 0.78;
  flight.pitch = damp(flight.pitch, pitchTarget, 6.2, dt);
  flight.bank = damp(flight.bank, bankTarget, 5.4, dt);
  const turnRate = wantBoost ? 1.15 : 1.02;
  flight.heading += flight.bank * turnRate * dt;
  if (ctx.inDowndraft && !wantBoost) {
    flight.heading += Math.sin(position.x * 0.2 + position.z * 0.13) * 0.55 * dt;
    flight.bank += Math.sin(position.z * 0.3) * 0.35 * dt;
  }

  let target = BASE_SPEED + Math.max(0, flight.pitch) * 34;
  if (flight.flare) target *= 0.58;
  if (wantBoost) target += BOOST_THRUST;
  if (flight.speedBoost > 0) target *= SPEED_RING_MULT;
  target = clamp(target, MIN_SPEED, MAX_SPEED);
  flight.speed = damp(flight.speed, target, 2.4, dt);

  if (input.dive < -0.2 && flight.speed > 16 && !flight.flare) {
    const convert = (flight.speed - 15) * 0.55 * -input.dive;
    flight.speed = damp(flight.speed, flight.speed - convert * 0.35, 2, dt);
  }

  let sink = -flight.speed / GLIDE_RATIO;
  sink *= 1 + flight.pitch * 1.15;
  if (flight.flare) sink = Math.max(sink, -FLARE_SINK * 0.55);
  if (input.dive < -0.2) sink += -input.dive * flight.speed * 0.12;
  if (ctx.inThermal) {
    sink += 11.5;
    flight.boost = Math.min(BOOST_MAX, flight.boost + 28 * dt);
  }
  if (ctx.inDowndraft && !wantBoost) sink -= 9.5;
  if (wantBoost && ctx.inDowndraft) sink -= 1.4;
  flight.verticalSpeed = sink;

  if (wantBoost) flight.boost = Math.max(0, flight.boost - BOOST_DRAIN * dt);
  flight.speedBoost = Math.max(0, flight.speedBoost - dt);

  const step = flight.speed * dt;
  position.x += Math.sin(flight.heading) * step + ctx.wind.x * dt;
  position.z += Math.cos(flight.heading) * step + ctx.wind.z * dt;
  position.y += sink * dt;

  flight.windX = ctx.wind.x;
  flight.windZ = ctx.wind.z;

  if (ctx.groundY !== null) {
    flight.agl = position.y - ctx.groundY;
    if (flight.agl < LANDING_AGL) {
      position.y = ctx.groundY + LANDING_AGL;
      flight.agl = LANDING_AGL;
    }
  } else {
    flight.agl = 80;
  }

  flight.nearMiss = ctx.clearance > NEAR_MISS_MIN && ctx.clearance < NEAR_MISS_MAX;
  if (flight.nearMiss) flight.boost = Math.min(BOOST_MAX, flight.boost + 9 * dt);
}

export function grantBoost(flight: FlightState, amount: number): void {
  flight.boost = Math.min(BOOST_MAX, flight.boost + amount);
}

export function triggerSpeedRing(flight: FlightState): void {
  flight.speedBoost = Math.max(flight.speedBoost, 1.55);
  grantBoost(flight, 22);
}
