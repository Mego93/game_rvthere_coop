interface Point {
  x: number;
  y: number;
}

export function joystickVector(origin: Point, point: Point, radius: number, deadZone: number): { moveX: number; moveY: number } {
  const dx = point.x - origin.x;
  // Screen y grows downward; up is positive.
  const dy = origin.y - point.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { moveX: 0, moveY: 0 };
  const m = Math.min(length / radius, 1);
  if (m <= deadZone) return { moveX: 0, moveY: 0 };
  const scale = (m - deadZone) / (1 - deadZone) / length;
  return { moveX: dx * scale, moveY: dy * scale };
}
