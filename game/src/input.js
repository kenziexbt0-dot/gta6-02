// Keyboard and pointer input. Held keys steer; one-shot presses (enter
// a car, punch, pause, mute) are queued as bit flags and taken once by
// the loop, so a press between two frames is never lost or counted twice.
export const ACTION_ENTER = 1;
export const ACTION_PUNCH = 2;
export const ACTION_PAUSE = 4;
export const ACTION_MUTE = 8;
export const ACTION_CONFIRM = 16;
export const ACTION_JOB = 32;
export const ACTION_HORN = 64;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const BRAKE = new Set(['Space']);
const ENTER = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const CONFIRM = new Set(['Enter']);
const JOB = new Set(['KeyJ']);
const HORN = new Set(['KeyH']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)
      || RUN.has(event.code) || BRAKE.has(event.code)) {
      held.add(event.code);
      event.preventDefault();
      return;
    }
    if (ENTER.has(event.code)) { if (!event.repeat) actions |= ACTION_ENTER; }
    else if (PUNCH.has(event.code)) { if (!event.repeat) actions |= ACTION_PUNCH; }
    else if (PAUSE.has(event.code)) { if (!event.repeat) actions |= ACTION_PAUSE; }
    else if (MUTE.has(event.code)) { if (!event.repeat) actions |= ACTION_MUTE; }
    else if (CONFIRM.has(event.code)) { if (!event.repeat) actions |= ACTION_CONFIRM; }
    else if (JOB.has(event.code)) { if (!event.repeat) actions |= ACTION_JOB; }
    else if (HORN.has(event.code)) { if (!event.repeat) actions |= ACTION_HORN; }
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });
  target.addEventListener('pointermove', (event) => {
    const rect = target.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  target.addEventListener('pointerdown', (event) => {
    const rect = target.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseDown = true;
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointerup', () => {
    mouseDown = false;
  });
  // The browser blocks audio until a gesture: a click anywhere counts.
  target.addEventListener('pointerdown', () => {
    if (typeof window.__solmarinaUnlockAudio === 'function') window.__solmarinaUnlockAudio();
  });

  function has(set) {
    let found = false;
    set.forEach((code) => { if (held.has(code)) found = true; });
    return found;
  }

  return {
    /** Steering: -1 up, 1 down on the vertical axis; -1 left, 1 right. */
    axes() {
      return {
        x: (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0),
        y: (has(DOWN) ? 1 : 0) - (has(UP) ? 1 : 0),
      };
    },
    run() { return has(RUN); },
    brake() { return has(BRAKE); },
    mouse() { return { x: mouseX, y: mouseY, down: mouseDown }; },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
