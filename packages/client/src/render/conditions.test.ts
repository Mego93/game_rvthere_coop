import { MAX_PLAYERS, vec3, type PlayerSnapshot, type VehicleState } from '@lodgy/shared';
import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { applyConditions, conditionsLook, configureRenderer, ENVIRONMENT_INTENSITY, EXPOSURE, FOG, mixColour, RAIN_DROPS, RAIN_RADIUS, SANDSTORM_FOG, toneMappedColour, SHADOW_HALF_EXTENT, SHADOW_MAP_SIZE, type RendererLike } from './conditions';

const HALF = vec3(0.88, 0.55, 2.25);
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

describe('W4: conditionsLook', () => {
  test('midday and clear keep today\'s sky and light values and add distance fog', () => {
    const look = conditionsLook('midday', 'clear');
    expect(look.sky).toBe(0xcfe6f5);
    expect(look.sunColour).toBe(0xffffff);
    expect(look.sunIntensity).toBe(1.5);
    expect(look.ambient).toBe(1.2);
    const length = Math.hypot(30, 60, 20);
    near(look.sunDirection.x, 30 / length);
    near(look.sunDirection.y, 60 / length);
    near(look.sunDirection.z, 20 / length);
    expect(look.fog).toEqual({ colour: 0xb3bacd, near: 150, far: 900 });
    expect(look.rain).toBe(false);
  });

  test('each time of day gives the table values', () => {
    const dawn = conditionsLook('dawn', 'clear');
    expect([dawn.sky, dawn.sunColour, dawn.sunIntensity, dawn.ambient]).toEqual([0xf2c6a0, 0xffd2a1, 0.9, 0.7]);
    near(dawn.sunDirection.x, Math.cos(Math.PI / 18));
    near(dawn.sunDirection.y, Math.sin(Math.PI / 18));
    const sunset = conditionsLook('sunset', 'clear');
    expect([sunset.sky, sunset.sunColour, sunset.sunIntensity, sunset.ambient]).toEqual([0xe8875a, 0xff9a5c, 0.8, 0.6]);
    expect(sunset.sunDirection.x).toBeLessThan(0);
    const night = conditionsLook('night', 'clear');
    expect([night.sky, night.sunColour, night.sunIntensity, night.ambient]).toEqual([0x0b1530, 0x8fa3d6, 0.25, 0.25]);
    near(Math.hypot(night.sunDirection.x, night.sunDirection.y, night.sunDirection.z), 1);
    expect(night.sunDirection.y).toBeCloseTo(0.5, 3);
  });

  test('rain mixes the sky and dims the sun', () => {
    const look = conditionsLook('midday', 'rain');
    expect(look.sky).toBe(mixColour(0xcfe6f5, 0x7a8591, 0.5));
    expect(look.sky).toBe(0xa5b6c3);
    near(look.sunIntensity, 0.9);
    expect(look.rain).toBe(true);
  });

  test('a sandstorm sets fog and the sky', () => {
    const look = conditionsLook('midday', 'sandstorm');
    expect(look.fog).toEqual({ colour: 0xc9a46a, ...SANDSTORM_FOG });
    expect(look.sky).toBe(0xc9a46a);
    near(look.sunIntensity, 1.05);
    expect(look.rain).toBe(false);
  });

  test('lights are on only at night', () => {
    for (const time of ['dawn', 'midday', 'sunset'] as const) {
      expect(conditionsLook(time, 'clear')).toMatchObject({ headlights: false, playerLights: false });
    }
    expect(conditionsLook('night', 'clear')).toMatchObject({ headlights: true, playerLights: true });
  });
});

describe('R2/R4: tables of the look', () => {
  const times = ['dawn', 'midday', 'sunset', 'night'] as const;

  test('exposure per time of day', () => {
    expect(EXPOSURE).toEqual({ dawn: 0.8, midday: 1, sunset: 0.9, night: 0.6 });
    for (const time of times) expect(conditionsLook(time, 'clear').exposure).toBe(EXPOSURE[time]);
  });

  test('environment intensity per time of day', () => {
    expect(ENVIRONMENT_INTENSITY).toEqual({ dawn: 0.6, midday: 0.9, sunset: 0.6, night: 0.25 });
    for (const time of times) expect(conditionsLook(time, 'clear').environmentIntensity).toBe(ENVIRONMENT_INTENSITY[time]);
  });

  test('distance fog is always on, near before far, far at most 900 and under the camera far plane', () => {
    expect(['dawn', 'midday', 'sunset', 'night'].map((time) => [FOG[time as 'dawn'].near, FOG[time as 'dawn'].far])).toEqual([[100, 700], [150, 900], [120, 800], [80, 500]]);
    for (const time of times) {
      for (const weather of ['clear', 'rain', 'sandstorm'] as const) {
        const fog = conditionsLook(time, weather).fog;
        expect(fog.near).toBeLessThan(fog.far);
        expect(fog.far).toBeLessThanOrEqual(900);
        expect(fog.far).toBeLessThan(1000);
      }
    }
  });

  test('rain multiplies the background intensity by 0.6 and darkens the fog; a sandstorm drops the HDRI background', () => {
    const clear = conditionsLook('sunset', 'clear');
    const rain = conditionsLook('sunset', 'rain');
    near(rain.backgroundIntensity, clear.backgroundIntensity * 0.6);
    expect(rain.environmentIntensity).toBe(clear.environmentIntensity);
    expect(rain.fog.colour).not.toBe(clear.fog.colour);
    expect(clear.hdriBackground).toBe(true);
    expect(rain.hdriBackground).toBe(true);
    expect(conditionsLook('sunset', 'sandstorm').hdriBackground).toBe(false);
  });

  test('configureRenderer sets ACES, the exposure, and PCF shadows only when asked for', () => {
    const renderer: RendererLike = { toneMapping: THREE.NoToneMapping, toneMappingExposure: 1, shadowMap: { enabled: false, type: THREE.BasicShadowMap } };
    configureRenderer(renderer, conditionsLook('night', 'clear'), true);
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(renderer.toneMappingExposure).toBe(0.6);
    expect(renderer.shadowMap).toEqual({ enabled: true, type: THREE.PCFShadowMap });
    configureRenderer(renderer, conditionsLook('midday', 'clear'), false);
    expect(renderer.toneMappingExposure).toBe(1);
    expect(renderer.shadowMap.enabled).toBe(false);
  });
});

describe('toneMappedColour', () => {
  test('matches three\'s ACES curve: black stays black, mid grey brightens a little, bright values compress below 1', () => {
    expect(toneMappedColour(0x000000, 1).getHex()).toBe(0);
    const grey = toneMappedColour(0x808080, 1);
    expect(grey.r).toBeGreaterThan(0.2);
    expect(grey.r).toBeLessThan(0.5);
    const white = toneMappedColour(0xffffff, 1);
    expect(white.r).toBeLessThanOrEqual(1);
    expect(white.r).toBeGreaterThan(0.7);
    expect(toneMappedColour(0x808080, 0.5).r).toBeLessThan(grey.r);
  });
});

describe('applyConditions', () => {
  const lights = (scene: THREE.Scene) => scene.children.filter((child) => (child as THREE.Light).isLight);
  const player = (seat: string | null): PlayerSnapshot => ({ playerId: 'p', pos: vec3(1, 0, 2), seat }) as PlayerSnapshot;
  const vehicle = { pos: vec3(0, 1, 0), rot: { x: 0, y: 0, z: 0, w: 1 } } as VehicleState;

  test('midday clear sets the flat sky, the fog and two lights', () => {
    const scene = new THREE.Scene();
    applyConditions(scene, conditionsLook('midday', 'clear'), false, HALF);
    expect((scene.background as THREE.Color).getHex()).toBe(toneMappedColour(0xcfe6f5, 1).getHex());
    const fog = scene.fog as THREE.Fog;
    expect([fog.near, fog.far]).toEqual([150, 900]);
    expect(fog.color.getHex()).toBe(0xb3bacd);
    expect(lights(scene)).toHaveLength(2);
    expect((lights(scene)[0] as THREE.HemisphereLight).intensity).toBeCloseTo(1.2, 9);
  });

  test('night has a fixed pool of lights, zero when unused or seated, and dispose removes everything', () => {
    const scene = new THREE.Scene();
    const conditions = applyConditions(scene, conditionsLook('night', 'clear'), false, HALF);
    const all = lights(scene);
    expect(all).toHaveLength(2 + 2 + MAX_PLAYERS);
    conditions.setLights(null, []);
    conditions.setLights(vehicle, [player(null), player('driver')]);
    const points = all.filter((light) => (light as THREE.PointLight).isPointLight) as THREE.PointLight[];
    expect(points[0]!.intensity).toBeGreaterThan(0);
    expect(points.slice(1).every((light) => light.intensity === 0)).toBe(true);
    expect(lights(scene)).toHaveLength(all.length);
    conditions.dispose();
    expect(scene.children).toHaveLength(0);
  });

  test('headlights sit at the front corners, aim ahead and down, and both targets are in the scene', () => {
    const scene = new THREE.Scene();
    const conditions = applyConditions(scene, conditionsLook('night', 'clear'), false, HALF);
    conditions.setLights({ ...vehicle, pos: vec3(10, 2, -5) }, []);
    const spots = scene.children.filter((child) => (child as THREE.SpotLight).isSpotLight) as THREE.SpotLight[];
    expect(spots).toHaveLength(2);
    const xs = spots.map((spot) => spot.position.x - 10).sort((a, b) => a - b);
    near(xs[0]!, -0.7 * HALF.x);
    near(xs[1]!, 0.7 * HALF.x);
    for (const spot of spots) {
      near(spot.position.y, 2);
      near(spot.position.z, -5 - HALF.z);
      near(spot.target.position.x, spot.position.x);
      near(spot.target.position.y, 1);
      near(spot.target.position.z, -5 - HALF.z - 10);
      expect(scene.children).toContain(spot.target);
      expect(spot.intensity).toBeGreaterThan(0);
    }
  });

  test('rain drops stay within the volume around the camera and the buffer is reused', () => {
    const scene = new THREE.Scene();
    const conditions = applyConditions(scene, conditionsLook('midday', 'rain'), true, HALF);
    const points = scene.children.find((child) => (child as THREE.Points).isPoints) as THREE.Points;
    expect(points.frustumCulled).toBe(false);
    const attribute = points.geometry.attributes.position!;
    expect(attribute.count).toBe(RAIN_DROPS.touch);
    const array = attribute.array;
    const cam = vec3(100, 5, -40);
    conditions.update(cam, 0.016, cam);
    expect(points.geometry.attributes.position!.array).toBe(array);
    for (let i = 0; i < array.length; i += 3) {
      expect(Math.abs(array[i]! - cam.x)).toBeLessThanOrEqual(RAIN_RADIUS);
      expect(Math.abs(array[i + 1]! - cam.y)).toBeLessThanOrEqual(RAIN_RADIUS);
      expect(Math.abs(array[i + 2]! - cam.z)).toBeLessThanOrEqual(RAIN_RADIUS);
    }
  });

  test('the hemisphere light is 0.35 of its intensity while an HDRI is active', () => {
    const scene = new THREE.Scene();
    applyConditions(scene, conditionsLook('midday', 'clear'), false, HALF, true);
    near((lights(scene)[0] as THREE.HemisphereLight).intensity, 1.2 * 0.35);
  });

  test('the sun casts a 2048 shadow only on desktop, with the bias values', () => {
    const sunOf = (touch: boolean) => {
      const scene = new THREE.Scene();
      applyConditions(scene, conditionsLook('midday', 'clear'), touch, HALF);
      return scene.children.find((child) => (child as THREE.DirectionalLight).isDirectionalLight) as THREE.DirectionalLight;
    };
    const desktop = sunOf(false);
    expect(desktop.castShadow).toBe(true);
    expect(desktop.shadow.mapSize.x).toBe(SHADOW_MAP_SIZE);
    expect(desktop.shadow.bias).toBe(-0.0005);
    expect(desktop.shadow.normalBias).toBe(0.02);
    expect(desktop.shadow.camera.right).toBe(SHADOW_HALF_EXTENT);
    expect(sunOf(true).castShadow).toBe(false);
  });

  test('shadows can be switched off on desktop, for software GL', () => {
    const scene = new THREE.Scene();
    applyConditions(scene, conditionsLook('midday', 'clear'), false, HALF, false, false);
    const sun = scene.children.find((child) => (child as THREE.DirectionalLight).isDirectionalLight) as THREE.DirectionalLight;
    expect(sun.castShadow).toBe(false);
  });

  test('the shadow box follows the focus, keeps the sun direction, and the target is in the scene', () => {
    const scene = new THREE.Scene();
    const conditions = applyConditions(scene, conditionsLook('midday', 'clear'), false, HALF);
    const sun = scene.children.find((child) => (child as THREE.DirectionalLight).isDirectionalLight) as THREE.DirectionalLight;
    const focus = vec3(500, 3, -240);
    conditions.update(vec3(0, 0, 0), 0.016, focus);
    expect(scene.children).toContain(sun.target);
    const offset = sun.position.clone().sub(sun.target.position);
    near(offset.length(), 100);
    const direction = conditionsLook('midday', 'clear').sunDirection;
    near(offset.x / 100, direction.x);
    near(offset.y / 100, direction.y);
    near(offset.z / 100, direction.z);
    // The focus lies on the light's axis through the target, within a shadow texel of the snapped plane.
    const toFocus = new THREE.Vector3(focus.x, focus.y, focus.z).sub(sun.target.position);
    const across = toFocus.clone().addScaledVector(offset.clone().normalize(), -toFocus.dot(offset.clone().normalize()));
    expect(across.length()).toBeLessThan(0.1);
  });
});
