import { afterEach, expect, test, vi } from 'vitest';
import { createAudio } from './audio';

class FakeParam {
  value = 0;
}

interface FakeNode {
  kind: string;
  connect: () => void;
  disconnect: () => void;
  [key: string]: unknown;
}

function makeContext(listenerApi: 'modern' | 'legacy', state = 'suspended', legacyPanner = false) {
  const sources: FakeNode[] = [];
  const panners: FakeNode[] = [];
  const gains: FakeNode[] = [];
  const calls: unknown[][] = [];
  const node = (kind: string, extra: object = {}): FakeNode => ({ kind, connect: () => {}, disconnect: () => {}, ...extra });
  const listener =
    listenerApi === 'modern'
      ? { positionX: new FakeParam(), positionY: new FakeParam(), positionZ: new FakeParam(), forwardX: new FakeParam(), forwardY: new FakeParam(), forwardZ: new FakeParam(), upX: new FakeParam(), upY: new FakeParam(), upZ: new FakeParam() }
      : { setPosition: (...args: number[]) => calls.push(['setPosition', ...args]), setOrientation: (...args: number[]) => calls.push(['setOrientation', ...args]) };
  const ctx = {
    state,
    destination: node('destination'),
    listener,
    resume: vi.fn(() => {
      ctx.state = 'running';
      return Promise.resolve();
    }),
    close: vi.fn(() => Promise.resolve()),
    decodeAudioData: vi.fn((data: ArrayBuffer) => Promise.resolve({ decoded: data })),
    createGain: () => {
      const gain = node('gain', { gain: new FakeParam() });
      gains.push(gain);
      return gain;
    },
    createPanner: () => {
      const panner = legacyPanner
        ? node('panner', { setPosition: (...args: number[]) => calls.push(['panner.setPosition', ...args]) })
        : node('panner', { positionX: new FakeParam(), positionY: new FakeParam(), positionZ: new FakeParam() });
      panners.push(panner);
      return panner;
    },
    createBufferSource: () => {
      const source = node('source', { playbackRate: new FakeParam(), loop: false, start: vi.fn(), stop: vi.fn(), buffer: null, onended: null });
      sources.push(source);
      return source;
    },
  };
  return { ctx, sources, panners, gains, calls };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(listenerApi: 'modern' | 'legacy' = 'modern', failing: string[] = [], legacyPanner = false) {
  const fake = makeContext(listenerApi, 'suspended', legacyPanner);
  const createContext = vi.fn(() => fake.ctx as unknown as AudioContext);
  const load = vi.fn((url: string) => (failing.some((part) => url.includes(part)) ? Promise.reject(new Error('404')) : Promise.resolve(new ArrayBuffer(8))));
  const audio = createAudio({ createContext, load });
  return { ...fake, audio, createContext, load };
}

afterEach(() => vi.restoreAllMocks());

test('E6: nothing is made or played before unlock', async () => {
  const { audio, createContext, load, sources } = setup();
  audio.play('click');
  audio.setLoop('engine', true, { rate: 1 });
  audio.setListener({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
  await flush();
  expect(createContext).not.toHaveBeenCalled();
  expect(load).not.toHaveBeenCalled();
  expect(sources).toHaveLength(0);
});

test('E6: unlock makes the context once, resumes it, and decodes each file once', async () => {
  const { audio, ctx, createContext, load } = setup();
  audio.unlock();
  expect(createContext).toHaveBeenCalledTimes(1);
  expect(ctx.resume).toHaveBeenCalledTimes(1);
  await flush();
  audio.unlock();
  audio.unlock();
  await flush();
  expect(createContext).toHaveBeenCalledTimes(1);
  expect(load).toHaveBeenCalledTimes(16);
  expect(ctx.decodeAudioData).toHaveBeenCalledTimes(16);
  // Running now, so a later unlock does not resume again.
  expect(ctx.resume).toHaveBeenCalledTimes(1);
});

test('R1: a context that is no longer running is resumed again', async () => {
  const { audio, ctx } = setup();
  audio.unlock();
  ctx.state = 'interrupted';
  audio.unlock();
  expect(ctx.resume).toHaveBeenCalledTimes(2);
});

test('E6: after unlock a decoded sound plays; a sound whose buffer is not ready is skipped', async () => {
  const { audio, sources } = setup();
  audio.unlock();
  audio.play('click');
  expect(sources).toHaveLength(0);
  await flush();
  audio.play('click');
  expect(sources).toHaveLength(1);
  expect(sources[0]!.start).toHaveBeenCalledTimes(1);
});

test('E6: a positional sound goes through a panner set up as specified', async () => {
  const { audio, panners } = setup();
  audio.unlock();
  await flush();
  audio.play('hurt', { at: { x: 4, y: 5, z: 6 }, volume: 0.5 });
  expect(panners).toHaveLength(1);
  expect(panners[0]).toMatchObject({ panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 3, rolloffFactor: 1 });
  expect((panners[0]!.positionX as FakeParam).value).toBe(4);
  expect((panners[0]!.positionZ as FakeParam).value).toBe(6);
  audio.play('click');
  expect(panners).toHaveLength(1);
});

test('E6: a missing file warns once and the rest still play', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { audio, sources } = setup('modern', ['coin']);
  audio.unlock();
  await flush();
  expect(warn).toHaveBeenCalledTimes(1);
  audio.play('coin');
  expect(sources).toHaveLength(0);
  audio.play('click');
  expect(sources).toHaveLength(1);
  audio.unlock();
  await flush();
  expect(warn).toHaveBeenCalledTimes(1);
});

test('E6 and R11: a loop makes one looping source, updates it in place, and stops when off', async () => {
  const { audio, sources } = setup();
  audio.setLoop('engine', true, { rate: 1 });
  expect(sources).toHaveLength(0);
  audio.unlock();
  audio.setLoop('engine', true, { rate: 1 });
  expect(sources).toHaveLength(0);
  await flush();
  audio.setLoop('engine', true, { rate: 0.8, volume: 0.35, at: { x: 1, y: 0, z: 0 } });
  expect(sources).toHaveLength(1);
  const source = sources[0]!;
  expect(source.loop).toBe(true);
  expect(source.start).toHaveBeenCalledTimes(1);
  audio.setLoop('engine', true, { rate: 1.4, volume: 0.2, at: { x: 2, y: 0, z: 0 } });
  expect(sources).toHaveLength(1);
  expect((source.playbackRate as FakeParam).value).toBe(1.4);
  audio.setLoop('engine', false);
  expect(source.stop).toHaveBeenCalledTimes(1);
  audio.setLoop('engine', false);
  expect(source.stop).toHaveBeenCalledTimes(1);
  audio.setLoop('engine', true, { rate: 1 });
  expect(sources).toHaveLength(2);
});

test('E6: setListener sets position and orientation with positionX and forwardX', () => {
  const { audio, ctx } = setup('modern');
  audio.unlock();
  audio.setListener({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: -1 });
  const listener = ctx.listener as unknown as Record<string, FakeParam>;
  expect([listener.positionX!.value, listener.positionY!.value, listener.positionZ!.value]).toEqual([1, 2, 3]);
  expect([listener.forwardX!.value, listener.forwardY!.value, listener.forwardZ!.value]).toEqual([0, 0, -1]);
  expect([listener.upX!.value, listener.upY!.value, listener.upZ!.value]).toEqual([0, 1, 0]);
});

test('E6: setListener falls back to setPosition and setOrientation', () => {
  const { audio, calls } = setup('legacy');
  audio.unlock();
  audio.setListener({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: -1 });
  expect(calls).toEqual([
    ['setPosition', 1, 2, 3],
    ['setOrientation', 0, 0, -1, 0, 1, 0],
  ]);
});

test('E6: mute sets the master gain to 0, also when set before unlock', () => {
  const { audio, gains } = setup();
  audio.setMuted(true);
  audio.unlock();
  const master = gains[0]!.gain as FakeParam;
  expect(master.value).toBe(0);
  audio.setMuted(false);
  expect(master.value).toBe(1);
  audio.setMuted(true);
  expect(master.value).toBe(0);
});

test('a failing resume or context factory does not throw', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const fake = makeContext('modern');
  fake.ctx.resume = vi.fn(() => Promise.reject(new Error('blocked')));
  const audio = createAudio({ createContext: () => fake.ctx as unknown as AudioContext, load: () => Promise.resolve(new ArrayBuffer(1)) });
  expect(() => audio.unlock()).not.toThrow();
  await flush();
  const broken = createAudio({
    createContext: () => {
      throw new Error('no audio');
    },
    load: () => Promise.resolve(new ArrayBuffer(1)),
  });
  expect(() => broken.unlock()).not.toThrow();
  expect(warn).toHaveBeenCalled();
});

test('dispose stops the loops and closes the context', async () => {
  const { audio, ctx, sources } = setup();
  audio.unlock();
  await flush();
  audio.setLoop('rain', true, { volume: 0.3 });
  audio.dispose();
  expect(sources[0]!.stop).toHaveBeenCalled();
  expect(ctx.close).toHaveBeenCalled();
});

test('a panner without positionX is placed with setPosition', async () => {
  const { audio, calls } = setup('modern', [], true);
  audio.unlock();
  await flush();
  audio.play('hurt', { at: { x: 4, y: 5, z: 6 } });
  expect(calls).toEqual([['panner.setPosition', 4, 5, 6]]);
});

test('a context factory that throws warns once, however many gestures follow', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const createContext = vi.fn(() => {
    throw new Error('no audio');
  });
  const audio = createAudio({ createContext, load: () => Promise.resolve(new ArrayBuffer(1)) });
  audio.unlock();
  audio.unlock();
  audio.unlock();
  expect(createContext).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledTimes(1);
});
