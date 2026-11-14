import type { Vec3 } from '@lodgy/shared';
import { SOUND_FILES, type LoopName, type SoundName } from './soundMap';

export interface AudioDeps {
  createContext: () => AudioContext;
  load: (url: string) => Promise<ArrayBuffer>;
}

export interface GameAudio {
  // Safe to call on every gesture: it makes the context once and resumes it whenever it is not running.
  unlock(): void;
  play(name: SoundName, opts?: { at?: Vec3; volume?: number }): void;
  // Idempotent; called every frame.
  setLoop(name: LoopName, on: boolean, params?: { rate?: number; volume?: number; at?: Vec3 }): void;
  setListener(pos: Vec3, forward: Vec3): void;
  setMuted(muted: boolean): void;
  dispose(): void;
}

interface Loop {
  source: AudioBufferSourceNode;
  gain: GainNode;
  panner: PannerNode | null;
}

function setPannerPosition(panner: PannerNode, at: Vec3) {
  if ('positionX' in panner && panner.positionX) {
    panner.positionX.value = at.x;
    panner.positionY.value = at.y;
    panner.positionZ.value = at.z;
  } else panner.setPosition(at.x, at.y, at.z);
}

export function createAudio(deps: AudioDeps): GameAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = false;
  let disposed = false;
  let failed = false;
  const buffers = new Map<string, AudioBuffer>();
  const loops = new Map<LoopName, Loop>();

  const decodeAll = (context: AudioContext) => {
    for (const [name, url] of Object.entries(SOUND_FILES)) {
      if (url === null) continue;
      const fail = (error: unknown) => console.warn(`Sound ${name} could not be loaded`, error);
      try {
        deps
          .load(url)
          .then((data) => context.decodeAudioData(data))
          .then((buffer) => {
            buffers.set(name, buffer);
          })
          .catch(fail);
      } catch (error) {
        fail(error);
      }
    }
  };

  // Makes the node chain for one sound: source, gain and, at a place, a panner, all ending at the master gain.
  const connect = (context: AudioContext, buffer: AudioBuffer, volume: number, at: Vec3 | undefined) => {
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    let panner: PannerNode | null = null;
    if (at) {
      panner = context.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = 3;
      panner.rolloffFactor = 1;
      setPannerPosition(panner, at);
      gain.connect(panner);
      panner.connect(master!);
    } else gain.connect(master!);
    return { source, gain, panner };
  };

  const ready = () => (ctx !== null && master !== null && ctx.state === 'running' && !disposed ? ctx : null);

  const stopLoop = (name: LoopName) => {
    const loop = loops.get(name);
    if (!loop) return;
    loops.delete(name);
    try {
      loop.source.stop();
      loop.source.disconnect();
      loop.gain.disconnect();
      loop.panner?.disconnect();
    } catch {
      // A source that never started or was already stopped.
    }
  };

  return {
    unlock() {
      if (disposed || failed) return;
      if (!ctx) {
        try {
          ctx = deps.createContext();
          master = ctx.createGain();
          master.gain.value = muted ? 0 : 1;
          master.connect(ctx.destination);
        } catch (error) {
          console.warn('Audio is not available', error);
          ctx = null;
          master = null;
          failed = true;
          return;
        }
        decodeAll(ctx);
      }
      if (ctx.state === 'running') return;
      try {
        ctx.resume().catch(() => {});
      } catch {
        // resume() is missing or threw synchronously.
      }
    },
    play(name, opts = {}) {
      const context = ready();
      const buffer = buffers.get(name);
      if (!context || !buffer) return;
      const { source, gain, panner } = connect(context, buffer, opts.volume ?? 1, opts.at);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        panner?.disconnect();
      };
      source.start(0);
    },
    setLoop(name, on, params = {}) {
      if (!on) {
        stopLoop(name);
        return;
      }
      const context = ready();
      const buffer = buffers.get(name);
      if (!context || !buffer) return;
      let loop = loops.get(name);
      if (!loop) {
        loop = connect(context, buffer, params.volume ?? 1, params.at);
        loop.source.loop = true;
        loop.source.start(0);
        loops.set(name, loop);
      }
      loop.source.playbackRate.value = params.rate ?? 1;
      loop.gain.gain.value = params.volume ?? 1;
      if (loop.panner && params.at) setPannerPosition(loop.panner, params.at);
    },
    setListener(pos, forward) {
      if (!ctx) return;
      const listener = ctx.listener;
      if ('positionX' in listener && listener.positionX) {
        listener.positionX.value = pos.x;
        listener.positionY.value = pos.y;
        listener.positionZ.value = pos.z;
        listener.forwardX.value = forward.x;
        listener.forwardY.value = forward.y;
        listener.forwardZ.value = forward.z;
        listener.upX.value = 0;
        listener.upY.value = 1;
        listener.upZ.value = 0;
      } else {
        listener.setPosition(pos.x, pos.y, pos.z);
        listener.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
      }
    },
    setMuted(next) {
      muted = next;
      if (master) master.gain.value = next ? 0 : 1;
    },
    dispose() {
      for (const name of [...loops.keys()]) stopLoop(name);
      disposed = true;
      try {
        ctx?.close().catch(() => {});
      } catch {
        // Already closed.
      }
    },
  };
}
