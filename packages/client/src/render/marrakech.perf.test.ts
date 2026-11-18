import { corridorOf, getCourse, getCourseDef } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { createCorridorTerrain } from './corridorMesh';
import { buildCells } from './decorChunks';
import { scatterDecor, seedFromId } from './decorScatter';
import { groupBySurface, mergeBoxes } from './groundMerge';

const course = getCourse('marrakech');

test('T9: merging the 22 km ground takes under 2 s', () => {
  const start = performance.now();
  const groups = groupBySurface(course.ground);
  let triangles = 0;
  for (const boxes of Object.values(groups)) triangles += mergeBoxes(boxes!)!.indices.length / 3;
  const ms = performance.now() - start;
  console.info(`T9 groundMerge(marrakech): ${ms.toFixed(0)} ms, ${triangles} triangles`);
  expect(ms).toBeLessThan(2000);
});

test('T15: the corridor and the first tile meshes take under 3 s', () => {
  const start = performance.now();
  const corridor = corridorOf(course)!;
  const terrain = createCorridorTerrain(course, 350, { flat: true })!;
  const [x, z] = course.route[0]!;
  terrain.update({ x, z }, 0, true);
  const ms = performance.now() - start;
  console.info(`T15 corridor(marrakech): ${ms.toFixed(0)} ms for ${corridor.tiles.length} tiles, ${terrain.loaded} meshes`);
  expect(terrain.loaded).toBeGreaterThan(0);
  expect(ms).toBeLessThan(3000);
  terrain.dispose();
}, 20_000);

test('T9: scattering the decor of the 22 km course takes under 1.5 s and its cells under 1.5 s', () => {
  // The corridor is built once per course (timed above), not by the scatter.
  corridorOf(course);
  const start = performance.now();
  const placements = scatterDecor(course, getCourseDef('marrakech'), seedFromId('marrakech'));
  const scatter = performance.now() - start;
  const cellsStart = performance.now();
  buildCells(placements, course.route);
  const cells = performance.now() - cellsStart;
  console.info(`T9 scatterDecor(marrakech): ${scatter.toFixed(0)} ms for ${placements.length} placements; buildCells ${cells.toFixed(0)} ms`);
  expect(scatter).toBeLessThan(1500);
  expect(cells).toBeLessThan(1500);
}, 20_000);
