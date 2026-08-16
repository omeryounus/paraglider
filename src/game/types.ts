export type LevelId = 'alpine' | 'coastal' | 'dune' | 'ridge';
export type RingKind = 'green' | 'gold' | 'boost';
export type Phase = 'boot' | 'menu' | 'load' | 'countdown' | 'flying' | 'results';
export type ResultKind = 'clear' | 'crash' | 'timeout';

export interface RingSpec {
  t: number;
  lateral: number;
  agl: number;
  type: RingKind;
  radius: number;
}

export interface ZoneSpec {
  t: number;
  lateral: number;
  radius: number;
  height?: number;
}

export interface LevelDef {
  id: LevelId;
  name: string;
  subtitle: string;
  template: string;
  blurb: string;
  parTime: number;
  starScores: [number, number, number];
  fog: number;
  fogColor: number;
  sky: { top: number; horizon: number; bottom: number };
  sunColor: number;
  hemiSky: number;
  hemiGround: number;
  water: boolean;
  waterLevel: number;
  path: {
    length: number;
    startZ: number;
    amplitude: number;
    waves: number;
    halfWidth: number;
    startHeight: number;
    drop: number;
  };
  rings: RingSpec[];
  thermals: ZoneSpec[];
  downdrafts: ZoneSpec[];
  orbs: ZoneSpec[];
  gustStrength: number;
}

export interface FlightState {
  heading: number;
  pitch: number;
  bank: number;
  speed: number;
  verticalSpeed: number;
  boost: number;
  boosting: boolean;
  flare: boolean;
  speedBoost: number;
  agl: number;
  nearMiss: boolean;
  inThermal: boolean;
  inDowndraft: boolean;
  windX: number;
  windZ: number;
}

export interface ScoreState {
  total: number;
  combo: number;
  comboTimer: number;
  ringsHit: number;
  ringsMissed: number;
  goldHit: number;
  boostHit: number;
  nearMiss: number;
  orbs: number;
  landing: number;
  landingLabel: string;
  flareBonus: boolean;
}

export interface Progress {
  stars: Record<LevelId, number>;
  best: Record<LevelId, number>;
}
