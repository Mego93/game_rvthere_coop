import { getCourse } from '@lodgy/shared';
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { createCorridorTerrain } from './corridorMesh';
import { THEME_GROUND_TINT, tintFor, tinted } from './groundTextures';
import { createTerrainMesh } from './terrain';

const colourOf = (group: THREE.Group): number => ((group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHex();

test('only the valley and the mountain have a ground tint; the rest look as before', () => {
  expect(Object.keys(THEME_GROUND_TINT).sort()).toEqual(['mountain', 'valley']);
  for (const theme of [undefined, 'desert', 'city', 'airport']) expect(tintFor(theme)).toBeUndefined();
  expect(tinted(0xa65a3a, undefined)).toBe(0xa65a3a);
});

test('the valley tint is green, the mountain tint is a grey-brown', () => {
  const valley = new THREE.Color(tinted(0xffffff, tintFor('valley')));
  expect(valley.g).toBeGreaterThan(valley.r);
  expect(valley.g).toBeGreaterThan(valley.b);
  const rock = new THREE.Color(tinted(0xffffff, tintFor('mountain')));
  expect(rock.r).toBeGreaterThanOrEqual(rock.g);
  expect(rock.g).toBeGreaterThanOrEqual(rock.b);
  expect(rock.r - rock.b).toBeLessThan(0.2);
});

test('the terrain and the corridor land take the tint, and without one keep their colour', () => {
  const course = getCourse('valley');
  const plain = colourOf(createTerrainMesh(course, { flat: true }));
  const green = colourOf(createTerrainMesh(course, { flat: true, tint: tintFor('valley') }));
  expect(green).not.toBe(plain);
  expect(plain).toBe(tinted(0xa65a3a, undefined));
  const land = (tint?: number) => createCorridorTerrain(course, 100, { flat: true, tint })!;
  const a = land();
  const b = land(tintFor('valley'));
  a.update({ x: 0, z: 0 }, 0, true);
  b.update({ x: 0, z: 0 }, 0, true);
  const material = (t: ReturnType<typeof land>) => ((t.group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHex();
  expect(material(b)).not.toBe(material(a));
});
