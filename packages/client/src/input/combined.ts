import type { GameInput, InputSource } from './source';

export function createInputSource(
  keyboard: InputSource,
  mouse: { yaw(): number; pitch(): number; fire?(): boolean; dispose(): void },
): GameInput {
  return {
    // Absent when not firing, so the neutral sample stays as it was.
    sample: () => ({ ...keyboard.sample(), yaw: mouse.yaw(), pitch: mouse.pitch(), ...(mouse.fire?.() ? { fire: true } : {}) }),
    aim: () => ({ yaw: mouse.yaw(), pitch: mouse.pitch() }),
    dispose() {
      keyboard.dispose();
      mouse.dispose();
    },
  };
}
