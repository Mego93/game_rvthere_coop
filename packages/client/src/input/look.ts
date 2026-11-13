import { clamp } from '@lodgy/shared';

const PITCH_LIMIT = Math.PI / 2 - 0.05;
const TAU = 2 * Math.PI;

// Into (-pi, pi].
function wrap(yaw: number): number {
  if (yaw > Math.PI) return yaw - TAU * Math.ceil((yaw - Math.PI) / TAU);
  if (yaw <= -Math.PI) return yaw + TAU * (Math.floor((-Math.PI - yaw) / TAU) + 1);
  return yaw;
}

export interface Look {
  yaw(): number;
  pitch(): number;
  apply(dx: number, dy: number, sensitivity: number): void;
}

export function createLook(): Look {
  let yaw = 0;
  let pitch = 0;
  return {
    yaw: () => yaw,
    pitch: () => pitch,
    apply(dx, dy, sensitivity) {
      yaw = wrap(yaw - dx * sensitivity);
      pitch = clamp(pitch - dy * sensitivity, -PITCH_LIMIT, PITCH_LIMIT);
    },
  };
}
