export interface InputState {
  dive: number;
  steer: number;
  boost: boolean;
  flare: boolean;
  pause: boolean;
}

export function createInput(): {
  state: InputState;
  bind: () => void;
  setTouch: (partial: Partial<InputState>) => void;
} {
  const keys = new Set<string>();
  const state: InputState = { dive: 0, steer: 0, boost: false, flare: false, pause: false };
  const touch: InputState = { dive: 0, steer: 0, boost: false, flare: false, pause: false };

  const sync = (): void => {
    const keyDive =
      keys.has('w') || keys.has('arrowdown') ? 1 : keys.has('s') || keys.has('arrowup') ? -1 : 0;
    const keySteer =
      keys.has('a') || keys.has('arrowleft') ? 1 : keys.has('d') || keys.has('arrowright') ? -1 : 0;
    state.dive = touch.dive !== 0 ? touch.dive : keyDive;
    state.steer = touch.steer !== 0 ? touch.steer : keySteer;
    state.boost = touch.boost || keys.has('shift');
    state.flare = touch.flare || keys.has(' ') || keys.has('f');
  };

  const bind = (): void => {
    window.addEventListener('keydown', (event) => {
      keys.add(event.key.toLowerCase());
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(event.key.toLowerCase())) {
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

  const setTouch = (partial: Partial<InputState>): void => {
    Object.assign(touch, partial);
    sync();
  };

  return { state, bind, setTouch };
}
