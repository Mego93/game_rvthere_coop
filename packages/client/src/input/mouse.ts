import { LOOK_SENSITIVITY, clamp } from '@lodgy/shared';

const PITCH_LIMIT = Math.PI / 2 - 0.05;
const TAU = 2 * Math.PI;

// Into (-pi, pi].
function wrap(yaw: number): number {
  if (yaw > Math.PI) return yaw - TAU * Math.ceil((yaw - Math.PI) / TAU);
  if (yaw <= -Math.PI) return yaw + TAU * (Math.floor((-Math.PI - yaw) / TAU) + 1);
  return yaw;
}

export interface MouseLook {
  yaw(): number;
  pitch(): number;
  locked(): boolean;
  dispose(): void;
}

export function createMouseLook(canvas: HTMLElement, doc: Document): MouseLook {
  let yaw = 0;
  let pitch = 0;
  const locked = () => doc.pointerLockElement === canvas;

  const onClick = () => {
    if (!locked()) canvas.requestPointerLock();
  };
  const onMove = (event: Event) => {
    if (!locked()) return;
    const { movementX, movementY } = event as MouseEvent;
    yaw = wrap(yaw - movementX * LOOK_SENSITIVITY);
    pitch = clamp(pitch - movementY * LOOK_SENSITIVITY, -PITCH_LIMIT, PITCH_LIMIT);
  };

  canvas.addEventListener('click', onClick);
  doc.addEventListener('mousemove', onMove);

  return {
    yaw: () => yaw,
    pitch: () => pitch,
    locked,
    dispose() {
      canvas.removeEventListener('click', onClick);
      doc.removeEventListener('mousemove', onMove);
    },
  };
}
