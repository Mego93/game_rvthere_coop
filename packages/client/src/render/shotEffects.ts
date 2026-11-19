import * as THREE from 'three';

export const TRACER_SECONDS = 0.12;
export const FLASH_SECONDS = 0.18;
const TRACER_RADIUS = 0.025;
const HIT_FLASH_RADIUS = 0.22;
const MUZZLE_FLASH_RADIUS = 0.09;
// Metres in front of, below and to the right of the eye where the tracer leaves, so it shows beside the crosshair.
const MUZZLE_FORWARD = 0.3;
const MUZZLE_DOWN = 0.2;
const MUZZLE_RIGHT = 0.22;

interface Point {
  x: number;
  y: number;
  z: number;
}

// 1 at the start, 0 from `seconds` on.
export const effectAlpha = (age: number, seconds: number): number => Math.min(1, Math.max(0, 1 - age / seconds));

// The tracer's first point: the eye moved forward, down and to the shooter's right (the horizontal side of the shot's direction).
export function tracerStart(eye: Point, to: Point): Point {
  const dx = to.x - eye.x;
  const dz = to.z - eye.z;
  const flat = Math.hypot(dx, dz);
  if (flat < 1e-6) return { x: eye.x, y: eye.y - MUZZLE_DOWN, z: eye.z };
  const fx = dx / flat;
  const fz = dz / flat;
  return { x: eye.x + fx * MUZZLE_FORWARD - fz * MUZZLE_RIGHT, y: eye.y - MUZZLE_DOWN, z: eye.z + fz * MUZZLE_FORWARD + fx * MUZZLE_RIGHT };
}

interface Live {
  mesh: THREE.Mesh;
  born: number;
  seconds: number;
  scale: number;
}

export interface ShotEffects {
  // A shot from the eye `from` to `to`; `hit` also flashes where it landed.
  fire(from: Point, to: Point, hit: boolean, now: number): void;
  update(now: number): void;
  dispose(): void;
}

const bright = (colour: number) => new THREE.MeshBasicMaterial({ color: colour, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

export function createShotEffects(scene: THREE.Scene): ShotEffects {
  const tube = new THREE.CylinderGeometry(TRACER_RADIUS, TRACER_RADIUS, 1, 5, 1, true).rotateX(Math.PI / 2);
  const ball = new THREE.SphereGeometry(1, 10, 8);
  const live: Live[] = [];
  const up = new THREE.Vector3(0, 0, 1);

  const spawn = (mesh: THREE.Mesh, born: number, seconds: number, scale: number) => {
    mesh.frustumCulled = false;
    scene.add(mesh);
    live.push({ mesh, born, seconds, scale });
  };
  const remove = (entry: Live) => {
    scene.remove(entry.mesh);
    (entry.mesh.material as THREE.Material).dispose();
  };

  return {
    fire(from, to, hit, now) {
      const start = tracerStart(from, to);
      const a = new THREE.Vector3(start.x, start.y, start.z);
      const b = new THREE.Vector3(to.x, to.y, to.z);
      const length = a.distanceTo(b);
      if (length > 1e-3) {
        const tracer = new THREE.Mesh(tube, bright(0xfff0b0));
        tracer.position.copy(a).lerp(b, 0.5);
        tracer.scale.set(1, 1, length);
        tracer.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
        spawn(tracer, now, TRACER_SECONDS, 1);
      }
      const muzzle = new THREE.Mesh(ball, bright(0xffd27a));
      muzzle.position.copy(a);
      muzzle.scale.setScalar(MUZZLE_FLASH_RADIUS);
      spawn(muzzle, now, TRACER_SECONDS / 2, MUZZLE_FLASH_RADIUS);
      if (hit) {
        const flash = new THREE.Mesh(ball, bright(0xff7a45));
        flash.position.copy(b);
        spawn(flash, now, FLASH_SECONDS, HIT_FLASH_RADIUS);
      }
    },
    update(now) {
      for (let i = live.length - 1; i >= 0; i--) {
        const entry = live[i]!;
        const age = now - entry.born;
        const alpha = effectAlpha(age, entry.seconds);
        if (alpha <= 0) {
          remove(entry);
          live.splice(i, 1);
          continue;
        }
        (entry.mesh.material as THREE.MeshBasicMaterial).opacity = alpha;
        // A ball swells as it fades; a tracer keeps its size.
        if (entry.scale !== 1) entry.mesh.scale.setScalar(entry.scale * (1 + 0.8 * (1 - alpha)));
      }
    },
    dispose() {
      for (const entry of live) remove(entry);
      live.length = 0;
      tube.dispose();
      ball.dispose();
    },
  };
}
