import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BASE_SPEED, GLIDE_RATIO } from '../config/constants';
import type { InputState } from './input';
import { assistToward, createFlight, isWallFold, stepPhysics, type PhysicsContext } from './physics';

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

describe('assistToward wind drift', () => {
  it('aims upwind of the target when wind blows (intercept lead)', () => {
    const flight = createFlight();
    flight.heading = 0; // flying +Z
    const from = new THREE.Vector3(0, 100, 0);
    const target = new THREE.Vector3(0, 100, 200); // dead ahead
    const dt = 1 / 60;
    const calm = createFlight();
    calm.heading = 0;
    assistToward(calm, from.clone(), target.clone(), dt, new THREE.Vector3(0, 0, 0));
    const windy = createFlight();
    windy.heading = 0;
    assistToward(windy, from.clone(), target.clone(), dt, new THREE.Vector3(5, 0, 0)); // wind pushes +X
    // Wind from -X pushing the glider +X means the assist must crab into -X.
    expect(windy.heading).toBeLessThan(calm.heading);
  });

  it('with no wind behaves like the old direct aim', () => {
    const a = createFlight();
    const b = createFlight();
    a.heading = 0.5;
    b.heading = 0.5;
    const from = new THREE.Vector3(0, 100, 0);
    const target = new THREE.Vector3(30, 100, 100);
    assistToward(a, from.clone(), target.clone(), 1 / 60);
    assistToward(b, from.clone(), target.clone(), 1 / 60, new THREE.Vector3());
    expect(a.heading).toBeCloseTo(b.heading, 10);
  });
});

describe('near miss lateral spacing', () => {
  it('low flight over flat ground does not farm near-miss boost', () => {
    const flight = createFlight();
    const ctx: PhysicsContext = {
      flight,
      position: new THREE.Vector3(0, 4, 0), // 2.5 m over the ground
      input: idle(),
      dt: 1 / 60,
      groundY: 1.5,
      clearance: 2.5, // down-ray: very close
      lateralClearance: 80, // nothing ahead within 80 m
      inThermal: false,
      inDowndraft: false,
      wind: new THREE.Vector3(),
    };
    stepPhysics(ctx);
    expect(flight.nearMiss).toBe(false);
  });

  it('brushing a cliff ahead still charges near-miss boost', () => {
    const flight = createFlight();
    const ctx: PhysicsContext = {
      flight,
      position: new THREE.Vector3(0, 120, 0),
      input: idle(),
      dt: 1 / 60,
      groundY: null,
      clearance: 3,
      lateralClearance: 3,
      inThermal: false,
      inDowndraft: false,
      wind: new THREE.Vector3(),
    };
    stepPhysics(ctx);
    expect(flight.nearMiss).toBe(true);
    expect(flight.boost).toBeGreaterThan(0);
  });
});

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

describe('isWallFold', () => {
  it('folds only when airborne and the wall is closer than the crash band', () => {
    expect(isWallFold(18, 0.6)).toBe(true);
    expect(isWallFold(18, 6)).toBe(false);
    expect(isWallFold(1.55, 0.4)).toBe(false);
  });

  it('stalls after holding both brakes away from the ground', () => {
    const flight = drive(idle({ leftBrake: 1, rightBrake: 1, flare: false }), 1.4);
    expect(flight.stallCharge).toBeGreaterThan(1);
    expect(flight.stall).toBe(true);
    expect(flight.verticalSpeed).toBeLessThan(-3);
  });

  it('hard terrain contact crashes the wing; gentle skim survives', () => {
    const hard = createFlight();
    hard.verticalSpeed = -9;
    let crashed = false;
    const hardCtx: PhysicsContext = {
      flight: hard,
      position: new THREE.Vector3(0, 10, 0),
      input: idle(),
      dt: 1 / 60,
      groundY: 9,
      clearance: 80,
      inThermal: false,
      inDowndraft: false,
      wind: new THREE.Vector3(),
      onGroundContact: (impact) => {
        crashed = impact < -7.2;
      },
    };
    stepPhysics(hardCtx);
    expect(hard.agl).toBeGreaterThanOrEqual(1.55);
    expect(crashed).toBe(true);

    const gentle = createFlight();
    gentle.verticalSpeed = -2;
    let gentleCrash = false;
    const gentleCtx: PhysicsContext = {
      flight: gentle,
      position: new THREE.Vector3(0, 10, 0),
      input: idle(),
      dt: 1 / 60,
      groundY: 9,
      clearance: 80,
      inThermal: false,
      inDowndraft: false,
      wind: new THREE.Vector3(),
      onGroundContact: (impact) => {
        gentleCrash = impact < -7.2;
      },
    };
    stepPhysics(gentleCtx);
    expect(gentleCrash).toBe(false);
    // No free lift: the skim may only arrest descent, never climb.
    expect(gentle.verticalSpeed).toBeLessThanOrEqual(0.001);
  });

  it('folding into a cliff face sets crashed', () => {
    const flight = createFlight();
    flight.agl = 18;
    const ctx: PhysicsContext = {
      flight,
      position: new THREE.Vector3(0, 100, 0),
      input: idle(),
      dt: 1 / 60,
      groundY: null,
      clearance: 0.6,
      inThermal: false,
      inDowndraft: false,
      wind: new THREE.Vector3(),
    };
    stepPhysics(ctx);
    expect(flight.crashed).toBe(true);
  });

  it('clear air never sets crashed', () => {
    const flight = drive(idle(), 2.5);
    expect(flight.crashed).toBe(false);
  });
});
