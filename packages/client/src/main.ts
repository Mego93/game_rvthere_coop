import RAPIER from '@dimforge/rapier3d-compat';
import { createWorld, type PlayerInput } from '@lodgy/shared';
import * as THREE from 'three';
import { createKeyboardSource } from './input/keyboard';
import { createFixedStepper } from './loop';
import { updateFollowCamera } from './render/followCamera';
import { createScene } from './render/scene';
import { createVehicleMesh, placeVehicleMesh } from './render/vehicleMesh';
import { overlayText } from './ui/overlay';

const LOCAL_PLAYER = 'local';
// A frame longer than this (a background tab, a debugger pause) is treated as this long.
const MAX_FRAME_SECONDS = 0.25;

async function main() {
  await RAPIER.init();
  const vehicleId = new URLSearchParams(location.search).get('vehicle') ?? 'lodgy';
  const world = createWorld(RAPIER, { courseId: 'test', vehicleId });

  const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
  const overlay = document.querySelector<HTMLPreElement>('#overlay')!;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 6, 14);

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const scene = createScene(world.course);
  const vehicleMesh = createVehicleMesh(world.vehicleConfig);
  scene.add(vehicleMesh);

  const keyboard = createKeyboardSource(window);
  const inputs = new Map<string, PlayerInput>();
  let seq = 0;
  const stepper = createFixedStepper(() => {
    inputs.set(LOCAL_PLAYER, { ...keyboard.sample(), seq });
    seq += 1;
    world.step(inputs);
  });

  let last = performance.now();
  let fps = 60;
  const frame = (now: number) => {
    const frameSeconds = Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
    last = now;
    stepper.advance(frameSeconds);
    if (frameSeconds > 0) fps += (1 / frameSeconds - fps) * 0.05;

    const { vehicle } = world.snapshot();
    placeVehicleMesh(vehicleMesh, vehicle);
    updateFollowCamera(camera, vehicle, frameSeconds);
    overlay.textContent = overlayText(world, fps);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main().catch((error: unknown) => {
  document.querySelector('#overlay')!.textContent = `Failed to start: ${String(error)}`;
  throw error;
});
