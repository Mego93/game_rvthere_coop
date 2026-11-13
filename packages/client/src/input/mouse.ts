import { LOOK_SENSITIVITY } from '@lodgy/shared';
import { createLook } from './look';

export interface MouseLook {
  yaw(): number;
  pitch(): number;
  locked(): boolean;
  dispose(): void;
}

export function createMouseLook(canvas: HTMLElement, doc: Document): MouseLook {
  const look = createLook();
  const locked = () => doc.pointerLockElement === canvas;

  const onClick = () => {
    if (locked()) return;
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
