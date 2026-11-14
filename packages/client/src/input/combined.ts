import type { GameInput, InputSource } from './source';

export function createInputSource(
  keyboard: InputSource,
  mouse: { yaw(): number; pitch(): number; dispose(): void },
): GameInput {
  return {
    sample: () => ({ ...keyboard.sample(), yaw: mouse.yaw(), pitch: mouse.pitch() }),
    aim: () => ({ yaw: mouse.yaw(), pitch: mouse.pitch() }),
    dispose() {
      keyboard.dispose();
      mouse.dispose();
    },
  };
}
