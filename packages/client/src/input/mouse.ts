import { LOOK_SENSITIVITY } from '@lodgy/shared';
import { createLook } from './look';

export interface MouseLook {
  yaw(): number;
  pitch(): number;
  locked(): boolean;
  // The left button is down, or was pressed since the last call; only with the pointer locked and the gate open.
  fire(): boolean;
  dispose(): void;
}

// While `blocked` is true a click does not ask for pointer lock; the game sets it with a menu open.
export function createMouseLook(canvas: HTMLElement, doc: Document, gate: { blocked: boolean } = { blocked: false }): MouseLook {
  const look = createLook();
  let held = false;
  let tapped = false;
  const locked = () => doc.pointerLockElement === canvas;

  const onClick = () => {
    if (locked() || gate.blocked) return;
    // iOS Safari has no requestPointerLock and Chrome's promise can reject.
    const request: unknown = canvas.requestPointerLock?.();
    if (request instanceof Promise) request.catch(() => {});
  };
  const onMove = (event: Event) => {
    if (!locked()) return;
    const { movementX, movementY } = event as MouseEvent;
    look.apply(movementX, movementY, LOOK_SENSITIVITY);
  };

  const onDown = (event: Event) => {
    if ((event as MouseEvent).button !== 0 || !locked() || gate.blocked) return;
    held = true;
    tapped = true;
  };
  const onUp = (event: Event) => {
    if ((event as MouseEvent).button === 0) held = false;
  };
  const onLockChange = () => {
    if (!locked()) held = tapped = false;
  };

  canvas.addEventListener('click', onClick);
  canvas.addEventListener('mousedown', onDown);
  doc.addEventListener('mouseup', onUp);
  doc.addEventListener('pointerlockchange', onLockChange);
  doc.addEventListener('mousemove', onMove);

  return {
    yaw: look.yaw,
    pitch: look.pitch,
    locked,
    fire() {
      const pressed = (held || tapped) && !gate.blocked;
      tapped = false;
      return pressed;
    },
    dispose() {
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('mousedown', onDown);
      doc.removeEventListener('mouseup', onUp);
      doc.removeEventListener('pointerlockchange', onLockChange);
      doc.removeEventListener('mousemove', onMove);
    },
  };
}
