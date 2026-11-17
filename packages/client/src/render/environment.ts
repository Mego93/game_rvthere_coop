import type { TimeOfDay, Vec3, Weather } from '@lodgy/shared';
import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { conditionsLook, toneMappedColour, type Look } from './conditions';

const SKY_BASE_URL = '/env/';

// The sky of each time of day, and the overcast sky that rain and sandstorms use by day.
export type SkyId = TimeOfDay | 'overcast';

export const SKY_FILES: Record<SkyId, string> = {
  dawn: 'qwantani_dawn_puresky_1k.hdr',
  midday: 'kloofendal_48d_partly_cloudy_puresky_1k.hdr',
  sunset: 'qwantani_sunset_puresky_1k.hdr',
  night: 'qwantani_night_puresky_1k.hdr',
  overcast: 'kloofendal_overcast_puresky_1k.hdr',
};

// Night keeps its own sky in any weather: the overcast file is a daylight sky.
export function skyFor(timeOfDay: TimeOfDay, weather: Weather = 'clear'): SkyId {
  return timeOfDay !== 'night' && weather !== 'clear' ? 'overcast' : timeOfDay;
}

// Where the sun is in each file, measured on the file: azimuth is atan2(z, x) of the brightest direction, in degrees.
export const SKY_SUN_AZIMUTH: Record<SkyId, number> = { dawn: 36.3, midday: 34.3, sunset: 36, night: 101.6, overcast: 29.2 };

const degrees = (radians: number) => (radians * 180) / Math.PI;

// The backgroundRotation/environmentRotation about Y (degrees) that shows the file's sun in conditions.ts's sunDirection; three turns the sky by the opposite angle.
export function skyYaw(timeOfDay: TimeOfDay, sunDirection: Vec3 = conditionsLook(timeOfDay, 'clear').sunDirection, weather: Weather = 'clear'): number {
  const world = degrees(Math.atan2(sunDirection.z, sunDirection.x));
  const yaw = SKY_SUN_AZIMUTH[skyFor(timeOfDay, weather)] - world;
  return (((yaw + 180) % 360) + 360) % 360 - 180;
}

const skies = new Map<SkyId, THREE.DataTexture>();
let skyPreload: Promise<void> | null = null;

export const SKY_COUNT = Object.keys(SKY_FILES).length;

export function hasSky(timeOfDay: TimeOfDay, weather: Weather = 'clear'): boolean {
  return skies.has(skyFor(timeOfDay, weather));
}

// Never rejects: a failed file logs once and its time of day keeps the flat sky colour.
export function preloadSkies(onProgress?: (done: number, total: number) => void): Promise<void> {
  skyPreload ??= (async () => {
    const loader = new HDRLoader();
    let done = 0;
    await Promise.all(
      (Object.keys(SKY_FILES) as SkyId[]).map(async (time) => {
        try {
          const texture = await loader.loadAsync(SKY_BASE_URL + SKY_FILES[time]);
          texture.mapping = THREE.EquirectangularReflectionMapping;
          texture.userData.shared = true;
          skies.set(time, texture);
        } catch (error) {
          console.warn(`sky ${SKY_FILES[time]} failed to load`, error);
        }
        onProgress?.(++done, SKY_COUNT);
      }),
    );
  })();
  return skyPreload;
}

// The files hold the sun at up to 60000; the lighting copy is capped so the sun disc, which conditions.ts's
// directional light stands for, is not counted twice, and averaged down 4x because light is low frequency.
const LIGHTING_CAP = 8;
const LIGHTING_SHRINK = 4;

function lightingCopy(sky: THREE.DataTexture): THREE.DataTexture {
  const source = sky.image.data as Uint16Array;
  const width = sky.image.width / LIGHTING_SHRINK;
  const height = sky.image.height / LIGHTING_SHRINK;
  const data = new Uint16Array(width * height * 4);
  const taps = LIGHTING_SHRINK * LIGHTING_SHRINK;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let channel = 0; channel < 4; channel++) {
        let sum = 0;
        for (let dy = 0; dy < LIGHTING_SHRINK; dy++) {
          for (let dx = 0; dx < LIGHTING_SHRINK; dx++) {
            const at = ((y * LIGHTING_SHRINK + dy) * sky.image.width + x * LIGHTING_SHRINK + dx) * 4 + channel;
            sum += Math.min(THREE.DataUtils.fromHalfFloat(source[at]!), LIGHTING_CAP * 4);
          }
        }
        data[(y * width + x) * 4 + channel] = THREE.DataUtils.toHalfFloat(Math.min(sum / taps, LIGHTING_CAP));
      }
    }
  }
  // Not sky.clone(): a clone shares its Source, so assigning the image would overwrite the sky itself.
  const copy = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  copy.mapping = THREE.EquirectangularReflectionMapping;
  copy.colorSpace = sky.colorSpace;
  copy.minFilter = THREE.LinearFilter;
  copy.magFilter = THREE.LinearFilter;
  copy.flipY = sky.flipY;
  copy.needsUpdate = true;
  return copy;
}

interface Prefiltered {
  generator: THREE.PMREMGenerator;
  time: SkyId | null;
  target: THREE.WebGLRenderTarget | null;
}

const prefiltered = new WeakMap<THREE.WebGLRenderer, Prefiltered>();

// One generator per renderer; only the current time of day's prefiltered map is kept.
function environmentMap(renderer: THREE.WebGLRenderer, time: SkyId): THREE.Texture | null {
  const sky = skies.get(time);
  if (!sky) return null;
  let entry = prefiltered.get(renderer);
  if (!entry) {
    entry = { generator: new THREE.PMREMGenerator(renderer), time: null, target: null };
    prefiltered.set(renderer, entry);
  }
  if (entry.time !== time || !entry.target) {
    entry.target?.dispose();
    const source = lightingCopy(sky);
    entry.target = entry.generator.fromEquirectangular(source);
    source.dispose();
    entry.target.texture.userData.shared = true;
    entry.time = time;
  }
  return entry.target.texture;
}

// Sets the sky as background and, unless `lighting` is off, as image-based light; false when the file is missing and the flat sky colour stays.
export function applySky(renderer: THREE.WebGLRenderer, scene: THREE.Scene, look: Look, timeOfDay: TimeOfDay, lighting = true, weather: Weather = 'clear'): boolean {
  const id = skyFor(timeOfDay, weather);
  const sky = skies.get(id);
  const environment = sky && lighting ? environmentMap(renderer, id) : null;
  if (!sky || (lighting && !environment)) return false;
  const yaw = (skyYaw(timeOfDay, look.sunDirection, weather) * Math.PI) / 180;
  scene.background = look.hdriBackground ? sky : toneMappedColour(look.sky, look.exposure);
  scene.backgroundIntensity = look.backgroundIntensity;
  scene.backgroundRotation.set(0, yaw, 0);
  scene.environment = environment;
  if (environment) {
    scene.environmentIntensity = look.environmentIntensity;
    scene.environmentRotation.set(0, yaw, 0);
  }
  return true;
}
