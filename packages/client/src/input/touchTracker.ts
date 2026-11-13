interface Point {
  x: number;
  y: number;
}

export interface TouchTracker {
  start(id: number, x: number, y: number): void;
  move(id: number, x: number, y: number): void;
  end(id: number): void;
  cancelAll(): void;
  joystick(): { origin: Point; point: Point } | null;
  takeLook(): { dx: number; dy: number };
}

export function createTouchTracker(width: () => number): TouchTracker {
  let stick: { id: number; origin: Point; point: Point } | null = null;
  let look: { id: number; last: Point } | null = null;
  let dx = 0;
  let dy = 0;

  return {
    start(id, x, y) {
      if (stick?.id === id || look?.id === id) return;
      if (x < width() / 2) {
        if (!stick) stick = { id, origin: { x, y }, point: { x, y } };
      } else if (!look) {
        look = { id, last: { x, y } };
      }
    },
    move(id, x, y) {
      if (stick?.id === id) {
        stick.point = { x, y };
      } else if (look?.id === id) {
        dx += x - look.last.x;
        dy += y - look.last.y;
        look.last = { x, y };
      }
    },
    end(id) {
      if (stick?.id === id) stick = null;
      else if (look?.id === id) look = null;
    },
    cancelAll() {
      stick = null;
      look = null;
      dx = 0;
      dy = 0;
    },
    joystick: () => (stick ? { origin: { ...stick.origin }, point: { ...stick.point } } : null),
    takeLook() {
      const taken = { dx, dy };
      dx = 0;
      dy = 0;
      return taken;
    },
  };
}
