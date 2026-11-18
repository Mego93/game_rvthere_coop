import { MAX_PLAYERS, WEATHER_BLEND, vec3, type PlayerSnapshot, type TimeOfDay, type Vec3, type VehicleState, type Weather } from '@lodgy/shared';
import * as THREE from 'three';

export const RAIN_DROPS = { desktop: 1500, touch: 600 };
export const RAIN_RADIUS = 30;
export const RAIN_SPEED = 12;
export const SANDSTORM_FOG = { near: 4, far: 45 };
export const HEADLIGHT_RANGE = 40;
export const HEADLIGHT_INTENSITY = 220;
export const PLAYER_LIGHT_RANGE = 6;
export const PLAYER_LIGHT_INTENSITY = 3;

export const EXPOSURE: Record<TimeOfDay, number> = { dawn: 0.8, midday: 1, sunset: 0.9, night: 0.6 };
export const ENVIRONMENT_INTENSITY: Record<TimeOfDay, number> = { dawn: 0.6, midday: 0.9, sunset: 0.6, night: 0.25 };
export const BACKGROUND_INTENSITY: Record<TimeOfDay, number> = { dawn: 0.45, midday: 1, sunset: 0.35, night: 0.18 };
// The fog meets the sky: its colour is the sky's horizon colour; far stays under the camera's far plane of 1000.
export const FOG: Record<TimeOfDay, { colour: number; near: number; far: number }> = {
  dawn: { colour: 0xf3dbce, near: 100, far: 700 },
  midday: { colour: 0xb3bacd, near: 150, far: 900 },
  sunset: { colour: 0xffdaa8, near: 120, far: 800 },
  night: { colour: 0x61596c, near: 80, far: 500 },
};
export const HEMISPHERE_WITH_SKY = 0.35;
export const RAIN_BACKGROUND = 0.6;
export const SHADOW_MAP_SIZE = 2048;
// Half the side of the sun's shadow box around the vehicle, in metres.
export const SHADOW_HALF_EXTENT = 40;
const SHADOW_BIAS = -0.0005;
const SHADOW_NORMAL_BIAS = 0.02;
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

const RAIN_OPACITY = 0.6;

// 0 at the moment the weather changes, 1 once the look has settled.
export const weatherBlend = (seconds: number): number => Math.min(1, Math.max(0, seconds / WEATHER_BLEND));

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

// The look between two: numbers and colours lerp, the discrete sky switch happens at the midpoint.
export function blendLook(from: Look, to: Look, amount: number): Look {
  if (amount <= 0) return from;
  if (amount >= 1) return to;
  const late = amount >= 0.5 ? to : from;
  return {
    ...late,
    sky: mixColour(from.sky, to.sky, amount),
    sunIntensity: lerp(from.sunIntensity, to.sunIntensity, amount),
    ambient: lerp(from.ambient, to.ambient, amount),
    fog: { colour: mixColour(from.fog.colour, to.fog.colour, amount), near: lerp(from.fog.near, to.fog.near, amount), far: lerp(from.fog.far, to.fog.far, amount) },
    exposure: lerp(from.exposure, to.exposure, amount),
    environmentIntensity: lerp(from.environmentIntensity, to.environmentIntensity, amount),
    backgroundIntensity: lerp(from.backgroundIntensity, to.backgroundIntensity, amount),
  };
}

export interface Look {
  sky: number;
  sunDirection: Vec3;
  sunColour: number;
  sunIntensity: number;
  ambient: number;
  fog: { colour: number; near: number; far: number };
  exposure: number;
  environmentIntensity: number;
  backgroundIntensity: number;
  // False when the flat sky colour must show instead of the HDRI (a sandstorm).
  hdriBackground: boolean;
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
    fog: { ...FOG[timeOfDay] },
    exposure: EXPOSURE[timeOfDay],
    environmentIntensity: ENVIRONMENT_INTENSITY[timeOfDay],
    backgroundIntensity: BACKGROUND_INTENSITY[timeOfDay],
    hdriBackground: true,
    rain: weather === 'rain',
    headlights: timeOfDay === 'night',
    playerLights: timeOfDay === 'night',
  };
  if (weather === 'rain') {
    look.sky = mixColour(base.sky, RAIN_SKY, 0.5);
    look.sunIntensity = base.sunIntensity * 0.6;
    look.backgroundIntensity = look.backgroundIntensity * RAIN_BACKGROUND;
    // Linear 0.6 is about 0.79 in sRGB bytes, so the fog darkens with the sky.
    look.fog.colour = mixColour(look.fog.colour, 0, 1 - RAIN_BACKGROUND ** (1 / 2.2));
  } else if (weather === 'sandstorm') {
    look.fog = { colour: SAND_FOG, ...SANDSTORM_FOG };
    look.sky = SAND_FOG;
    look.hdriBackground = false;
    look.sunIntensity = base.sunIntensity * 0.7;
  }
  return look;
}

// The part of the renderer the look sets; the sun's shadows are for desktop GPUs only.
export interface RendererLike {
  toneMapping: THREE.ToneMapping;
  toneMappingExposure: number;
  shadowMap: { enabled: boolean; type: THREE.ShadowMapType };
}

export function configureRenderer(renderer: RendererLike, look: Look, shadows: boolean): void {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = look.exposure;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
}

// A flat background is not tone mapped by the renderer, but the fog it must meet is; this is three's ACESFilmic curve on the CPU.
export function toneMappedColour(hex: number, exposure: number): THREE.Color {
  const linear = new THREE.Color(hex);
  const scale = exposure / 0.6;
  const [r, g, b] = [linear.r * scale, linear.g * scale, linear.b * scale];
  const mixed = [
    0.59719 * r + 0.35458 * g + 0.04823 * b,
    0.076 * r + 0.90834 * g + 0.01566 * b,
    0.0284 * r + 0.13383 * g + 0.83777 * b,
  ].map((v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081));
  const out = [
    1.60475 * mixed[0]! - 0.53108 * mixed[1]! - 0.07367 * mixed[2]!,
    -0.10208 * mixed[0]! + 1.10813 * mixed[1]! - 0.00605 * mixed[2]!,
    -0.00327 * mixed[0]! - 0.07276 * mixed[1]! + 1.07602 * mixed[2]!,
  ].map((v) => Math.min(1, Math.max(0, v)));
  return new THREE.Color().setRGB(out[0]!, out[1]!, out[2]!, THREE.LinearSRGBColorSpace);
}

export interface Conditions {
  // Shows `look` as `blend` (0 to 1) of the way from what was shown when it became the target; returns the look shown. A new target starts from what is shown now.
  setLook(look: Look, blend: number): Look;
  update(cameraPos: Vec3, dt: number, focus: Vec3): void;
  setLights(vehicle: VehicleState | null, players: PlayerSnapshot[]): void;
  dispose(): void;
}

export function applyConditions(scene: THREE.Scene, look: Look, isTouch: boolean, halfExtents: Vec3, hdri = false, shadows = !isTouch): Conditions {
  const created: THREE.Object3D[] = [];
  const disposables: { dispose(): void }[] = [];
  const add = <T extends THREE.Object3D>(object: T): T => {
    scene.add(object);
    created.push(object);
    return object;
  };

  scene.background = toneMappedColour(look.sky, look.exposure);
  scene.fog = new THREE.Fog(look.fog.colour, look.fog.near, look.fog.far);
  add(new THREE.HemisphereLight(0xffffff, HEMISPHERE_GROUND, hdri ? look.ambient * HEMISPHERE_WITH_SKY : look.ambient));
  const sun = add(new THREE.DirectionalLight(look.sunColour, look.sunIntensity));
  add(sun.target);
  sun.position.set(look.sunDirection.x * SUN_DISTANCE, look.sunDirection.y * SUN_DISTANCE, look.sunDirection.z * SUN_DISTANCE);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    const camera = sun.shadow.camera;
    camera.left = camera.bottom = -SHADOW_HALF_EXTENT;
    camera.right = camera.top = SHADOW_HALF_EXTENT;
    camera.near = 1;
    camera.far = SUN_DISTANCE * 2.5;
    camera.updateProjectionMatrix();
    sun.shadow.bias = SHADOW_BIAS;
    sun.shadow.normalBias = SHADOW_NORMAL_BIAS;
  }
  const texel = (SHADOW_HALF_EXTENT * 2) / SHADOW_MAP_SIZE;
  const lightDir = new THREE.Vector3(look.sunDirection.x, look.sunDirection.y, look.sunDirection.z).normalize();
  const lightRight = new THREE.Vector3(0, 1, 0).cross(lightDir).normalize();
  const lightUp = new THREE.Vector3().crossVectors(lightDir, lightRight);

  // Always built, so a weather change can fade it in; invisible and not stepped while the amount is zero.
  const rainCount = isTouch ? RAIN_DROPS.touch : RAIN_DROPS.desktop;
  const rainPositions = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainPositions.length; i++) rainPositions[i] = (Math.random() * 2 - 1) * RAIN_RADIUS;
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rainMaterial = new THREE.PointsMaterial({ color: 0xaab4c0, size: 0.08, sizeAttenuation: true, opacity: 0, transparent: true, depthWrite: false });
  const rainPoints = add(new THREE.Points(rainGeometry, rainMaterial));
  rainPoints.frustumCulled = false;
  rainPoints.visible = false;
  disposables.push(rainGeometry, rainMaterial);
  const rain = { points: rainPoints, positions: rainPositions };
  let rainAmount = 0;
  const setRain = (amount: number) => {
    rainAmount = amount;
    rainMaterial.opacity = amount * RAIN_OPACITY;
    rainPoints.visible = amount > 0;
  };
  setRain(look.rain ? 1 : 0);

  let fromLook = look;
  let toLook = look;
  let fromRain = rainAmount;
  let shown = look;
  let lastBlend = 1;

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
    setLook(target, blend) {
      if (target === toLook && blend === lastBlend) return shown;
      if (target !== toLook) {
        fromLook = shown;
        toLook = target;
        fromRain = rainAmount;
      }
      lastBlend = blend;
      shown = blendLook(fromLook, toLook, blend);
      scene.fog = scene.fog ?? new THREE.Fog(shown.fog.colour, shown.fog.near, shown.fog.far);
      const fog = scene.fog as THREE.Fog;
      fog.color.setHex(shown.fog.colour);
      fog.near = shown.fog.near;
      fog.far = shown.fog.far;
      sun.intensity = shown.sunIntensity;
      scene.backgroundIntensity = shown.backgroundIntensity;
      scene.environmentIntensity = shown.environmentIntensity;
      if (scene.background instanceof THREE.Color) scene.background = toneMappedColour(shown.sky, shown.exposure);
      setRain(lerp(fromRain, toLook.rain ? 1 : 0, blend));
      return shown;
    },
    update(cameraPos, dt, focus) {
      if (shadows) {
        // The shadow box follows the focus in whole texels of the light's own plane, so the shadows do not shimmer.
        const right = Math.round((focus.x * lightRight.x + focus.y * lightRight.y + focus.z * lightRight.z) / texel) * texel;
        const up = Math.round((focus.x * lightUp.x + focus.y * lightUp.y + focus.z * lightUp.z) / texel) * texel;
        const along = focus.x * lightDir.x + focus.y * lightDir.y + focus.z * lightDir.z;
        scratch.set(0, 0, 0).addScaledVector(lightRight, right).addScaledVector(lightUp, up).addScaledVector(lightDir, along);
        sun.target.position.copy(scratch);
        sun.position.copy(scratch).addScaledVector(lightDir, SUN_DISTANCE);
      }
      if (!rainPoints.visible) return;
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
