import { MAX_PLAYERS, vec3, type PlayerSnapshot, type VehicleState } from '@lodgy/shared';
import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { applyConditions, conditionsLook, mixColour, RAIN_DROPS, RAIN_RADIUS, SANDSTORM_FOG } from './conditions';

const HALF = vec3(0.88, 0.55, 2.25);
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

describe('W4: conditionsLook', () => {
  test('midday and clear equal today\'s scene values', () => {
    const look = conditionsLook('midday', 'clear');
    expect(look.sky).toBe(0xcfe6f5);
    expect(look.sunColour).toBe(0xffffff);
    expect(look.sunIntensity).toBe(1.5);
    expect(look.ambient).toBe(1.2);
    const length = Math.hypot(30, 60, 20);
    near(look.sunDirection.x, 30 / length);
    near(look.sunDirection.y, 60 / length);
    near(look.sunDirection.z, 20 / length);
    expect(look.fog).toBeNull();
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

describe('applyConditions', () => {
  const lights = (scene: THREE.Scene) => scene.children.filter((child) => (child as THREE.Light).isLight);
  const player = (seat: string | null): PlayerSnapshot => ({ playerId: 'p', pos: vec3(1, 0, 2), seat }) as PlayerSnapshot;
  const vehicle = { pos: vec3(0, 1, 0), rot: { x: 0, y: 0, z: 0, w: 1 } } as VehicleState;

  test('midday clear sets the scene as before', () => {
    const scene = new THREE.Scene();
    applyConditions(scene, conditionsLook('midday', 'clear'), false, HALF);
    expect((scene.background as THREE.Color).getHex()).toBe(0xcfe6f5);
    expect(scene.fog).toBeNull();
    expect(lights(scene)).toHaveLength(2);
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
    conditions.update(cam, 0.016);
    expect(points.geometry.attributes.position!.array).toBe(array);
    for (let i = 0; i < array.length; i += 3) {
      expect(Math.abs(array[i]! - cam.x)).toBeLessThanOrEqual(RAIN_RADIUS);
      expect(Math.abs(array[i + 1]! - cam.y)).toBeLessThanOrEqual(RAIN_RADIUS);
      expect(Math.abs(array[i + 2]! - cam.z)).toBeLessThanOrEqual(RAIN_RADIUS);
    }
  });
});
