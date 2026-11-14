import { MAX_PLAYERS, vec3, type PlayerSnapshot, type TimeOfDay, type Vec3, type VehicleState, type Weather } from '@lodgy/shared';
import * as THREE from 'three';

export const RAIN_DROPS = { desktop: 1500, touch: 600 };
export const RAIN_RADIUS = 30;
export const RAIN_SPEED = 12;
export const SANDSTORM_FOG = { near: 4, far: 45 };
export const HEADLIGHT_RANGE = 40;
export const HEADLIGHT_INTENSITY = 300;
export const PLAYER_LIGHT_RANGE = 6;
export const PLAYER_LIGHT_INTENSITY = 3;

const SKY = 0xcfe6f5;
const HEMISPHERE_GROUND = 0x8a7f72;
const RAIN_SKY = 0x7a8591;
const SAND_FOG = 0xc9a46a;
const HEADLIGHT_HALF_WIDTH = 0.7;
const PLAYER_LIGHT_HEIGHT = 1.2;
const SUN_DISTANCE = 100;
const rad = (degrees: number) => (degrees * Math.PI) / 180;
const unit = (x: number, y: number, z: number): Vec3 => {
  const length = Math.hypot(x, y, z);
  return vec3(x / length, y / length, z / length);
};

export interface Look {
  sky: number;
  sunDirection: Vec3;
  sunColour: number;
  sunIntensity: number;
  ambient: number;
  fog: { colour: number; near: number; far: number } | null;
  rain: boolean;
  headlights: boolean;
  playerLights: boolean;
}

const BASE: Record<TimeOfDay, Pick<Look, 'sky' | 'sunDirection' | 'sunColour' | 'sunIntensity' | 'ambient'>> = {
  dawn: { sky: 0xf2c6a0, sunDirection: vec3(Math.cos(rad(10)), Math.sin(rad(10)), 0), sunColour: 0xffd2a1, sunIntensity: 0.9, ambient: 0.7 },
  midday: { sky: SKY, sunDirection: unit(30, 60, 20), sunColour: 0xffffff, sunIntensity: 1.5, ambient: 1.2 },
  sunset: { sky: 0xe8875a, sunDirection: vec3(-Math.cos(rad(8)), Math.sin(rad(8)), 0), sunColour: 0xff9a5c, sunIntensity: 0.8, ambient: 0.6 },
  night: { sky: 0x0b1530, sunDirection: unit(-Math.cos(rad(30)) * 0.707, Math.sin(rad(30)), Math.cos(rad(30)) * 0.707), sunColour: 0x8fa3d6, sunIntensity: 0.25, ambient: 0.25 },
};

// A per-channel lerp of the sRGB bytes.
export function mixColour(from: number, to: number, amount: number): number {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    out |= Math.round(a + (b - a) * amount) << shift;
  }
  return out;
}

export function conditionsLook(timeOfDay: TimeOfDay, weather: Weather): Look {
  const base = BASE[timeOfDay];
  const look: Look = {
    ...base,
    fog: null,
    rain: weather === 'rain',
    headlights: timeOfDay === 'night',
    playerLights: timeOfDay === 'night',
  };
  if (weather === 'rain') {
    look.sky = mixColour(base.sky, RAIN_SKY, 0.5);
    look.sunIntensity = base.sunIntensity * 0.6;
  } else if (weather === 'sandstorm') {
    look.fog = { colour: SAND_FOG, ...SANDSTORM_FOG };
    look.sky = SAND_FOG;
    look.sunIntensity = base.sunIntensity * 0.7;
  }
  return look;
}

export interface Conditions {
  update(cameraPos: Vec3, dt: number): void;
  setLights(vehicle: VehicleState | null, players: PlayerSnapshot[]): void;
  dispose(): void;
}

export function applyConditions(scene: THREE.Scene, look: Look, isTouch: boolean, halfExtents: Vec3): Conditions {
  const created: THREE.Object3D[] = [];
  const disposables: { dispose(): void }[] = [];
  const add = <T extends THREE.Object3D>(object: T): T => {
    scene.add(object);
    created.push(object);
    return object;
  };

  scene.background = new THREE.Color(look.sky);
  scene.fog = look.fog ? new THREE.Fog(look.fog.colour, look.fog.near, look.fog.far) : null;
  add(new THREE.HemisphereLight(0xffffff, HEMISPHERE_GROUND, look.ambient));
  const sun = add(new THREE.DirectionalLight(look.sunColour, look.sunIntensity));
  sun.position.set(look.sunDirection.x * SUN_DISTANCE, look.sunDirection.y * SUN_DISTANCE, look.sunDirection.z * SUN_DISTANCE);

  let rain: { points: THREE.Points; positions: Float32Array } | null = null;
  if (look.rain) {
    const count = isTouch ? RAIN_DROPS.touch : RAIN_DROPS.desktop;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < positions.length; i++) positions[i] = (Math.random() * 2 - 1) * RAIN_RADIUS;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xaab4c0, size: 0.08, sizeAttenuation: true, opacity: 0.6, transparent: true, depthWrite: false });
    const points = add(new THREE.Points(geometry, material));
    points.frustumCulled = false;
    disposables.push(geometry, material);
    rain = { points, positions };
  }

  const headlights: THREE.SpotLight[] = [];
  if (look.headlights) {
    for (let i = 0; i < 2; i++) {
      const light = add(new THREE.SpotLight(0xfff2d6, 0, HEADLIGHT_RANGE, 0.45, 0.4, 2));
      add(light.target);
      headlights.push(light);
    }
  }
  const playerLights: THREE.PointLight[] = [];
  if (look.playerLights) {
    for (let i = 0; i < MAX_PLAYERS; i++) playerLights.push(add(new THREE.PointLight(0xffe2b0, 0, PLAYER_LIGHT_RANGE, 2)));
  }

  const scratch = new THREE.Vector3();
  const scratchRot = new THREE.Quaternion();
  const wrap = (value: number, centre: number) => {
    const span = RAIN_RADIUS * 2;
    return centre + ((((value - centre + RAIN_RADIUS) % span) + span) % span) - RAIN_RADIUS;
  };

  return {
    update(cameraPos, dt) {
      if (!rain) return;
      const p = rain.positions;
      for (let i = 0; i < p.length; i += 3) {
        p[i] = wrap(p[i]!, cameraPos.x);
        p[i + 1] = wrap(p[i + 1]! - RAIN_SPEED * dt, cameraPos.y);
        p[i + 2] = wrap(p[i + 2]!, cameraPos.z);
      }
      rain.points.geometry.attributes.position!.needsUpdate = true;
    },
    setLights(vehicle, players) {
      for (let index = 0; index < headlights.length; index++) {
        const light = headlights[index]!;
        if (!vehicle) {
          light.intensity = 0;
          continue;
        }
        const x = (index === 0 ? -1 : 1) * HEADLIGHT_HALF_WIDTH * halfExtents.x;
        scratchRot.set(vehicle.rot.x, vehicle.rot.y, vehicle.rot.z, vehicle.rot.w);
        scratch.set(x, 0, -halfExtents.z).applyQuaternion(scratchRot);
        light.position.set(vehicle.pos.x + scratch.x, vehicle.pos.y + scratch.y, vehicle.pos.z + scratch.z);
        scratch.set(x, -1, -halfExtents.z - 10).applyQuaternion(scratchRot);
        light.target.position.set(vehicle.pos.x + scratch.x, vehicle.pos.y + scratch.y, vehicle.pos.z + scratch.z);
        light.intensity = HEADLIGHT_INTENSITY;
      }
      for (let index = 0; index < playerLights.length; index++) {
        const light = playerLights[index]!;
        const player = players[index];
        if (!player || player.seat !== null) {
          light.intensity = 0;
          continue;
        }
        light.position.set(player.pos.x, player.pos.y + PLAYER_LIGHT_HEIGHT, player.pos.z);
        light.intensity = PLAYER_LIGHT_INTENSITY;
      }
    },
    dispose() {
      for (const object of created) scene.remove(object);
      for (const item of disposables) item.dispose();
      scene.fog = null;
    },
  };
}
