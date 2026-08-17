export interface InputState {
  dive: number;
  steer: number;
  leftBrake: number;
  rightBrake: number;
  speedBar: number;
  weightShift: number;
  bigEars: boolean;
  boost: boolean;
  flare: boolean;
  pause: boolean;
  fpv: boolean;
  gyroActive: boolean;
}

export function createInput(): {
  state: InputState;
  bind: () => void;
  setTouch: (partial: Partial<InputState>) => void;
  toggleFpv: () => void;
  toggleGyro: () => boolean;
  pollGamepad: () => void;
  consumePause: () => boolean;
} {
  const keys = new Set<string>();
  const state: InputState = {
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
  };

  const touch: InputState = {
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
  };

  let gyroSteer = 0;
  let gyroPitch = 0;
  let prevStart = false;
  let pauseQueued = false;

  const sync = (): void => {
    // Keyboard inputs:
    // Left & Right Steering Brakes
    const keyLeftBrake = keys.has('a') || keys.has('arrowleft') ? 1 : 0;
    const keyRightBrake = keys.has('d') || keys.has('arrowright') ? 1 : 0;

    // Pitch Down / Dive (W or Down Arrow: nose down, dive toward ground, accelerate)
    const keyDiveDown = keys.has('w') || keys.has('arrowdown') ? 1 : 0;

    // Pitch Up / Flare Brake (S, Up Arrow, Space: nose up, arrest descent, slow down)
    const keyFlareUp = keys.has('s') || keys.has('arrowup') || keys.has(' ') || keys.has('f') ? 1 : 0;

    // Weight Shift & Auxiliary
    const keyWeightShift = (keys.has('q') ? -1 : 0) + (keys.has('e') ? 1 : 0);
    const keyBigEars = keys.has('b');
    const keyBoost = keys.has('shift');

    // Combine Touch & Gyro with Keyboard
    let speedBar = Math.max(touch.speedBar, keyDiveDown);
    let flare = (touch.flare || keyFlareUp > 0) && keyDiveDown === 0;

    let leftBrake = Math.max(touch.leftBrake, keyLeftBrake, flare ? 0.85 : 0);
    let rightBrake = Math.max(touch.rightBrake, keyRightBrake, flare ? 0.85 : 0);
    let weightShift = touch.weightShift !== 0 ? touch.weightShift : keyWeightShift;
    let bigEars = touch.bigEars || keyBigEars;
    let boost = touch.boost || keyBoost;

    if (state.gyroActive) {
      if (gyroSteer < -0.1) leftBrake = Math.max(leftBrake, Math.min(1, -gyroSteer * 1.4));
      if (gyroSteer > 0.1) rightBrake = Math.max(rightBrake, Math.min(1, gyroSteer * 1.4));
      weightShift = Math.max(-1, Math.min(1, weightShift + gyroSteer));
      if (gyroPitch > 0.15) speedBar = Math.max(speedBar, Math.min(1, gyroPitch * 1.6));
      if (gyroPitch < -0.2) flare = true;
    }

    state.leftBrake = leftBrake;
    state.rightBrake = rightBrake;
    state.speedBar = speedBar;
    state.weightShift = weightShift;
    state.bigEars = bigEars;
    state.boost = boost;
    state.flare = flare;

    // High-level steer and dive vectors
    state.steer = (rightBrake - leftBrake) + weightShift + (touch.steer !== 0 ? touch.steer : 0);
    state.dive = (speedBar > 0 ? speedBar : 0) - (flare ? 0.8 : 0) + (touch.dive !== 0 ? touch.dive : 0);
  };

  const bind = (): void => {
    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (key === 'v' && !event.repeat) state.fpv = !state.fpv;
      if (key === 'c' && !event.repeat) toggleGyro();

      keys.add(key);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 's', 'a', 'd', 'b'].includes(key)) {
        event.preventDefault();
      }
      sync();
    });

    window.addEventListener('keyup', (event) => {
      keys.delete(event.key.toLowerCase());
      sync();
    });

    window.addEventListener('blur', () => {
      keys.clear();
      sync();
    });
  };

  const toggleGyro = (): boolean => {
    if (!state.gyroActive) {
      const DeviceOrientationEventAny = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (typeof DeviceOrientationEventAny?.requestPermission === 'function') {
        DeviceOrientationEventAny.requestPermission()
          .then((res) => {
            if (res === 'granted') {
              enableGyroListener();
              state.gyroActive = true;
            }
          })
          .catch(() => {});
      } else {
        enableGyroListener();
        state.gyroActive = true;
      }
    } else {
      state.gyroActive = false;
      gyroSteer = 0;
      gyroPitch = 0;
      sync();
    }
    return state.gyroActive;
  };

  const enableGyroListener = (): void => {
    window.addEventListener(
      'deviceorientation',
      (e) => {
        if (!state.gyroActive) return;
        const gamma = e.gamma ?? 0;
        const beta = (e.beta ?? 45) - 45;
        gyroSteer = Math.max(-1, Math.min(1, gamma / 28));
        gyroPitch = Math.max(-1, Math.min(1, beta / 30));
        sync();
      },
      { passive: true },
    );
  };

  const pollGamepad = (): void => {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[0] || gamepads[1] || gamepads[2] || gamepads[3];
    if (!gp) return;

    const axisX = gp.axes[0] ?? 0;
    const axisY = gp.axes[1] ?? 0;
    const lt = gp.buttons[6]?.value ?? 0;
    const rt = gp.buttons[7]?.value ?? 0;
    const lb = gp.buttons[4]?.pressed ?? false;
    const rb = gp.buttons[5]?.pressed ?? false;
    const btnA = gp.buttons[0]?.pressed ?? false;
    const btnY = gp.buttons[3]?.pressed ?? false;
    const btnStart = gp.buttons[9]?.pressed ?? false;

    if (btnY && !state.fpv) state.fpv = true;
    if (btnStart && !prevStart) pauseQueued = true;
    prevStart = btnStart;

    touch.leftBrake = Math.max(lt, axisX < -0.15 ? -axisX : 0);
    touch.rightBrake = Math.max(rt, axisX > 0.15 ? axisX : 0);
    // Push stick forward/up (negative axisY) or down (positive axisY depending on invert) -> dive
    touch.speedBar = axisY > 0.25 || axisY < -0.25 ? Math.abs(axisY) : 0;
    touch.flare = btnA || (lt > 0.6 && rt > 0.6);
    touch.bigEars = lb;
    touch.boost = rb;
    touch.weightShift = Math.abs(axisX) > 0.1 ? axisX : 0;

    sync();
  };

  const setTouch = (partial: Partial<InputState>): void => {
    Object.assign(touch, partial);
    sync();
  };

  const toggleFpv = (): void => {
    state.fpv = !state.fpv;
  };

  const consumePause = (): boolean => {
    if (!pauseQueued) return false;
    pauseQueued = false;
    return true;
  };

  return { state, bind, setTouch, toggleFpv, toggleGyro, pollGamepad, consumePause };
}
