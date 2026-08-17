import type { InputState } from '../game/input';

export function bindTouch(
  setTouch: (partial: Partial<InputState>) => void,
  toggleFpv?: () => void,
  toggleGyro?: () => boolean,
): void {
  // Dual Vertical Brake Toggles (Left & Right Thumb)
  const leftTrack = document.querySelector<HTMLElement>('#touch-brake-left');
  const leftKnob = document.querySelector<HTMLElement>('#touch-brake-left .brake-knob');
  const rightTrack = document.querySelector<HTMLElement>('#touch-brake-right');
  const rightKnob = document.querySelector<HTMLElement>('#touch-brake-right .brake-knob');

  // Action Buttons
  const btnSpeedbar = document.querySelector<HTMLElement>('#btn-speedbar');
  const btnBigEars = document.querySelector<HTMLElement>('#btn-bigears');
  const btnBoost = document.querySelector<HTMLElement>('#btn-boost');
  const btnFlare = document.querySelector<HTMLElement>('#btn-flare');
  const btnCam = document.querySelector<HTMLElement>('#btn-cam');
  const btnGyro = document.querySelector<HTMLElement>('#btn-gyro');

  const vibrate = (ms = 12): void => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(ms);
      } catch {
        // Ignore vibration errors
      }
    }
  };

  // Setup Left & Right Brake Sliders
  const setupBrakeSlider = (
    track: HTMLElement | null,
    knob: HTMLElement | null,
    side: 'leftBrake' | 'rightBrake',
  ): void => {
    if (!track || !knob) return;
    let active = false;
    let lastHaptic = 0;

    const update = (clientY: number): void => {
      const rect = track.getBoundingClientRect();
      const top = rect.top;
      const height = rect.height - knob.offsetHeight;
      const relY = Math.max(0, Math.min(height, clientY - top));
      const brakeVal = relY / height; // 0 (top/rest) to 1 (bottom/pulled)
      knob.style.transform = `translateY(${relY}px)`;
      
      const pct = Math.round(brakeVal * 100);
      const icon = knob.querySelector<HTMLElement>('.knob-icon');
      if (icon) {
        icon.textContent = pct > 10 ? `${pct}%` : '▼';
        icon.style.fontSize = pct > 10 ? '0.65rem' : '0.9rem';
      }

      setTouch({ [side]: brakeVal });

      // Haptic tick every 30% pull
      const hapticBand = Math.floor(brakeVal * 3);
      if (hapticBand !== lastHaptic) {
        lastHaptic = hapticBand;
        vibrate(10);
      }
    };

    const reset = (): void => {
      active = false;
      lastHaptic = 0;
      knob.style.transform = 'translateY(0px)';
      const icon = knob.querySelector<HTMLElement>('.knob-icon');
      if (icon) {
        icon.textContent = '▼';
        icon.style.fontSize = '0.9rem';
      }
      setTouch({ [side]: 0 });
    };

    track.addEventListener('pointerdown', (e) => {
      active = true;
      track.setPointerCapture(e.pointerId);
      vibrate(15);
      update(e.clientY);
    });

    track.addEventListener('pointermove', (e) => {
      if (active) update(e.clientY);
    });

    track.addEventListener('pointerup', reset);
    track.addEventListener('pointercancel', reset);
  };

  setupBrakeSlider(leftTrack, leftKnob, 'leftBrake');
  setupBrakeSlider(rightTrack, rightKnob, 'rightBrake');

  // Hold Action Buttons
  const hold = (el: HTMLElement | null, key: 'speedBar' | 'bigEars' | 'boost' | 'flare', val: number | boolean): void => {
    if (!el) return;
    const on = (e: Event): void => {
      e.preventDefault();
      vibrate(20);
      setTouch({ [key]: val } as unknown as Partial<InputState>);
      el.classList.add('active');
    };
    const off = (): void => {
      setTouch({ [key]: typeof val === 'boolean' ? false : 0 } as unknown as Partial<InputState>);
      el.classList.remove('active');
    };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointerleave', off);
    el.addEventListener('pointercancel', off);
  };

  hold(btnSpeedbar, 'speedBar', 1);
  hold(btnBigEars, 'bigEars', true);
  hold(btnBoost, 'boost', true);
  hold(btnFlare, 'flare', true);

  btnCam?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    vibrate(15);
    toggleFpv?.();
  });

  btnGyro?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    vibrate(25);
    const active = toggleGyro?.();
    if (active) {
      btnGyro.classList.add('active');
    } else {
      btnGyro.classList.remove('active');
    }
  });
}
