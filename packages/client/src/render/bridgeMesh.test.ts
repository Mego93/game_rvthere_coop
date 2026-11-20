import { BRIDGE_RAIL_HEIGHT, getCourse, ROAD_WIDTH } from '@lodgy/shared';
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { bridgeParts, createBridgeMeshes, PLANK_PITCH, plankBoxes, POST_SPACING, railPostBoxes } from './bridgeMesh';
import { createScene, visibleWalls } from './scene';

const valley = getCourse('valley');
const parts = bridgeParts(valley, visibleWalls(valley));

test('V5: the deck boxes and railings found are those of the three bridges, and nothing on a course without one', () => {
  expect(parts.deck.length).toBeGreaterThan(20);
  expect(parts.rails.length).toBeGreaterThanOrEqual(parts.deck.length);
  expect(parts.rails.length).toBeLessThanOrEqual(parts.deck.length * 2 + 4);
  for (const rail of parts.rails) expect(rail.halfExtents.y).toBeCloseTo(BRIDGE_RAIL_HEIGHT / 2, 9);
  const desert = getCourse('desert');
  expect(bridgeParts(desert, visibleWalls(desert))).toEqual({ deck: [], rails: [] });
});

test('V5: planks lie across the deck, one per pitch, just above it and inside its width', () => {
  const box = parts.deck[0]!;
  const planks = plankBoxes(box);
  expect(planks.length).toBe(Math.floor((box.halfExtents.z * 2) / PLANK_PITCH));
  for (const plank of planks) {
    expect(plank.halfExtents.x).toBeCloseTo(ROAD_WIDTH / 2, 6);
    expect(plank.halfExtents.z).toBeLessThan(PLANK_PITCH / 2);
    // Higher than the deck's top, by a few centimetres.
    const rise = plank.center.y + plank.halfExtents.y - (box.center.y + box.halfExtents.y);
    expect(rise).toBeGreaterThan(0);
    expect(rise).toBeLessThan(0.1);
    expect(plank.rot).toEqual(box.rot);
  }
});

test('V5: a railing becomes posts every POST_SPACING m, the ends included, and two rails', () => {
  const rail = parts.rails[0]!;
  const boxes = railPostBoxes(rail);
  const posts = boxes.filter((b) => b.halfExtents.z < 0.2);
  const beams = boxes.filter((b) => b.halfExtents.z >= 0.2);
  expect(beams).toHaveLength(2);
  expect(posts.length).toBeGreaterThanOrEqual(Math.floor((rail.halfExtents.z * 2) / POST_SPACING));
  for (const post of posts) expect(post.halfExtents.y).toBeCloseTo(rail.halfExtents.y, 9);
});

test('V5: the scene draws the bridge as wood and no longer as asphalt boxes or orange walls', () => {
  const group = createBridgeMeshes(parts);
  const standards = group.children.map((c) => (c as THREE.Mesh).material as THREE.MeshStandardMaterial);
  expect(standards.some((m) => m.vertexColors)).toBe(true);
  const scene = createScene(valley, { flat: true });
  const triangles = (s: THREE.Object3D) => {
    let n = 0;
    s.traverse((o) => { const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined; if (g?.index) n += g.index.count / 3; });
    return n;
  };
  const withBridge = triangles(scene);
  expect(withBridge).toBeGreaterThan(triangles(group));
});
