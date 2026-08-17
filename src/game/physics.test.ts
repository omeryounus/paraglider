import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BASE_SPEED, GLIDE_RATIO } from '../config/constants';
import type { InputState } from './input';
import { createFlight, stepPhysics, type PhysicsContext } from './physics';

function idle(over: Partial<InputState> = {}): InputState {
  return {
    dive: 0,
    steer: 0,
    leftBrake: 0,
    rightBrake: 0,
    speedBar: 0,
    weightShift: 0,
    bigEars: false,
    boost: false,
    flare: false,
    pause: false,
    fpv: false,
    gyroActive: false,
    ...over,
  };
}

function drive(input: InputState, seconds: number, seed = createFlight()): ReturnType<typeof createFlight> {
  const flight = seed;
  const ctx: PhysicsContext = {
    flight,
    position: new THREE.Vector3(0, 220, 0),
    input,
    dt: 1 / 60,
    groundY: null,
    clearance: 80,
    inThermal: false,
    inDowndraft: false,
    wind: new THREE.Vector3(),
  };
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) stepPhysics(ctx);
  return flight;
}

describe('stepPhysics polar', () => {
  it('trim still-air sink matches airspeed / glide ratio', () => {
    const flight = drive(idle(), 2.5);
    const expected = -flight.speed / GLIDE_RATIO;
    expect(flight.speed).toBeGreaterThan(BASE_SPEED * 0.9);
    expect(flight.verticalSpeed).toBeLessThan(0);
    expect(Math.abs(flight.verticalSpeed - expected)).toBeLessThan(0.08);
    expect(Math.abs(flight.bank)).toBeLessThan(0.02);
  });

  it('bank from steer turns and increases |sink| versus trim', () => {
    const trim = drive(idle(), 2.5);
    const banked = drive(idle({ steer: 1 }), 2.5);
    expect(Math.abs(banked.bank)).toBeGreaterThan(0.35);
    expect(Math.abs(banked.heading)).toBeGreaterThan(Math.abs(trim.heading) + 0.2);
    expect(Math.abs(banked.verticalSpeed)).toBeGreaterThan(Math.abs(trim.verticalSpeed) * 1.06);
  });

  it('flare lowers airspeed and |sink| versus trim', () => {
    const trim = drive(idle(), 2.5);
    const flared = drive(idle({ flare: true }), 2.5);
    expect(flared.flare).toBe(true);
    expect(flared.speed).toBeLessThan(trim.speed - 1.5);
    expect(Math.abs(flared.verticalSpeed)).toBeLessThan(Math.abs(trim.verticalSpeed) * 0.7);
    expect(flared.verticalSpeed).toBeLessThan(0);
  });
});
