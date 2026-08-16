import type { InputState } from '../game/input';

export function bindTouch(setTouch: (partial: Partial<InputState>) => void): void {
  const stick = document.querySelector<HTMLElement>('#stick');
  const knob = document.querySelector<HTMLElement>('#stick-knob');
  const boost = document.querySelector<HTMLElement>('#btn-boost');
  const flare = document.querySelector<HTMLElement>('#btn-flare');
  if (!stick || !knob || !boost || !flare) return;

  let tracking = false;

  const apply = (clientX: number, clientY: number): void => {
    const rect = stick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const max = rect.width * 0.36;
    const len = Math.hypot(dx, dy);
    const s = len > max ? max / len : 1;
    const x = dx * s;
    const y = dy * s;
    knob.style.transform = `translate(${x}px, ${y}px)`;
    setTouch({
      steer: Math.max(-1, Math.min(1, -x / max)),
      dive: Math.max(-1, Math.min(1, y / max)),
    });
  };

  const end = (): void => {
    tracking = false;
    knob.style.transform = 'translate(0, 0)';
    setTouch({ steer: 0, dive: 0 });
  };

  stick.addEventListener('pointerdown', (event) => {
    tracking = true;
    stick.setPointerCapture(event.pointerId);
    apply(event.clientX, event.clientY);
  });
  stick.addEventListener('pointermove', (event) => {
    if (tracking) apply(event.clientX, event.clientY);
  });
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);

  const hold = (el: HTMLElement, key: 'boost' | 'flare'): void => {
    const on = (event: Event): void => {
      event.preventDefault();
      setTouch({ [key]: true });
      el.classList.add('down');
    };
    const off = (): void => {
      setTouch({ [key]: false });
      el.classList.remove('down');
    };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointerleave', off);
    el.addEventListener('pointercancel', off);
  };
  hold(boost, 'boost');
  hold(flare, 'flare');
}
