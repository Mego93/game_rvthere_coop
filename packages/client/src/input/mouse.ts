import { LOOK_SENSITIVITY } from '@lodgy/shared';
import { createLook } from './look';

export interface MouseLook {
  yaw(): number;
  pitch(): number;
  locked(): boolean;
  dispose(): void;
}

// While `blocked` is true a click does not ask for pointer lock; the game sets it with a menu open.
export function createMouseLook(canvas: HTMLElement, doc: Document, gate: { blocked: boolean } = { blocked: false }): MouseLook {
  const look = createLook();
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

  canvas.addEventListener('click', onClick);
  doc.addEventListener('mousemove', onMove);

  return {
    yaw: look.yaw,
    pitch: look.pitch,
    locked,
    dispose() {
      canvas.removeEventListener('click', onClick);
      doc.removeEventListener('mousemove', onMove);
    },
  };
}
