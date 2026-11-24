import { ARRIVAL_BUILDINGS, ARRIVAL_ROUTES, getCourse, surfaceYAt, terrainHeightAt } from '@lodgy/shared';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadManifestModel } from './modelTestHelper';
import { BACKDROPS, DECK_TOP, FLAGS, FOUNTAIN, GARAGE_BAND, GARAGE_FLOOR, GARAGE_PARTS, RENTAL_SIGN, buildingOf, coverPieces, garageFit, landmarkAvoids, officeContainers, palmAvenue, terminalDoors, terminalFit, terminalFront, terminalPieces, terminalSlices, TERMINAL_CORE, TERMINAL_TILES } from './arrivalLayout';
import { dressMap, slopeOk } from './dressMap';

const arrival = getCourse('arrival');

const distToRoutes = (x: number, z: number) => {
  let best = Infinity;
  for (const route of ARRIVAL_ROUTES) {
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1]!;
      const b = route.points[i]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
    }
  }
  return best;
};
const distToWalls = (x: number, z: number) =>
  Math.min(...arrival.walls.map((w) => Math.hypot(Math.max(Math.abs(x - w.center.x) - w.halfExtents.x, 0), Math.max(Math.abs(z - w.center.z) - w.halfExtents.z, 0))));

describe('arrival buildings', () => {
  it('the terminal is the collider walls\' outline: its front, back and side walls bound the box the model is fitted to', () => {
    const t = buildingOf('terminal');
    const tall = arrival.walls.filter((w) => w.halfExtents.y * 2 === t.size.y);
    expect(tall.length).toBeGreaterThanOrEqual(6);
    const x0 = Math.min(...tall.map((w) => w.center.x - w.halfExtents.x));
    const x1 = Math.max(...tall.map((w) => w.center.x + w.halfExtents.x));
    const z0 = Math.min(...tall.map((w) => w.center.z - w.halfExtents.z));
    const z1 = Math.max(...tall.map((w) => w.center.z + w.halfExtents.z));
    expect((x0 + x1) / 2).toBeCloseTo(t.center.x, 1);
    expect(x1 - x0).toBeCloseTo(t.size.x, 0);
    expect((z0 + z1) / 2).toBeCloseTo(t.center.z, 1);
    expect(z1 - z0).toBeCloseTo(t.size.z, 0);
    expect(terminalFit().size.x).toBeGreaterThan(t.size.x);
    expect(terminalFit().size.y).toBe(t.size.y);
  });

  it('the rental office is a wall box the model covers exactly, and the car park the deck box', () => {
    const office = buildingOf('rentalOffice');
    const wall = arrival.walls.find((w) => w.center.x === office.center.x && w.center.z === office.center.z)!;
    expect(wall.halfExtents.x * 2).toBeCloseTo(office.size.x, 9);
    expect(wall.halfExtents.y * 2).toBeCloseTo(office.size.y, 9);
    const park = buildingOf('carPark');
    const deck = arrival.ground.find((g) => Math.abs(g.center.x - park.center.x) < 1e-9 && Math.abs(g.center.z - park.center.z) < 1e-9 && g.center.y + g.halfExtents.y === DECK_TOP)!;
    expect(deck).toBeDefined();
    expect(ARRIVAL_BUILDINGS.map((b) => b.key).sort()).toEqual(['carPark', 'rentalOffice', 'terminal']);
  });

  it('the garage is scaled in height until its second-floor slab is the deck, a hair over it, and only that slab is drawn', () => {
    const { scaleY, offsetY } = garageFit();
    expect(GARAGE_FLOOR * scaleY + offsetY).toBeCloseTo(DECK_TOP, 1);
    expect(GARAGE_FLOOR * scaleY + offsetY).toBeGreaterThan(DECK_TOP);
    expect(GARAGE_BAND.from).toBeLessThan(DECK_TOP);
    expect(GARAGE_BAND.to).toBeGreaterThan(GARAGE_FLOOR * scaleY + offsetY);
    expect(GARAGE_BAND.to).toBeLessThan(DECK_TOP + 0.5);
  });

  it('the garage slab is the file\'s second floor: its top is 4.4 m in the manifest-sized model', async () => {
    const model = await loadManifestModel('airport.garage');
    model.updateMatrixWorld(true);
    const tops: number[] = [];
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !GARAGE_PARTS.includes(mesh.name)) return;
      const position = mesh.geometry.getAttribute('position');
      const v = new THREE.Vector3();
      for (let i = 0; i < position.count; i++) tops.push(v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).y);
    });
    expect(tops.length).toBeGreaterThan(0);
    expect(tops.some((y) => Math.abs(y - GARAGE_FLOOR) < 0.06)).toBe(true);
  });

  it('the terminal is drawn in slices that leave each of its three exits open', () => {
    const doors = terminalDoors(arrival);
    expect(doors).toHaveLength(3);
    const slices = terminalSlices(arrival);
    expect(slices).toHaveLength(4);
    for (const [a, b] of doors) {
      expect(b - a).toBeGreaterThanOrEqual(8 - 1e-9);
      for (const [from, to] of slices) expect(to <= a + 1e-9 || from >= b - 1e-9, `${from}..${to} vs door ${a}..${b}`).toBe(true);
    }
    // The slices are the front wall's own stretches.
    const front = terminalFront(arrival);
    expect(front).toHaveLength(4);
    slices.forEach(([from, to], i) => {
      expect(from).toBeLessThanOrEqual(front[i]!.center.x - front[i]!.halfExtents.x + 1e-9);
      expect(to).toBeGreaterThanOrEqual(front[i]!.center.x + front[i]!.halfExtents.x - 1e-9);
    });
  });

  it('the terminal is five tiles of the model\'s body, cut to the slices: no piece reaches into an exit and together they cover every slice', () => {
    const pieces = terminalPieces(arrival);
    const doors = terminalDoors(arrival);
    for (const piece of pieces) for (const [a, b] of doors) expect(piece.to <= a + 1e-9 || piece.from >= b - 1e-9).toBe(true);
    const covered = (x: number) => pieces.some((p) => x >= p.from - 1e-9 && x <= p.to + 1e-9);
    for (const [from, to] of terminalSlices(arrival)) for (let x = from + 0.05; x < to; x += 0.5) expect(covered(x), `${x}`).toBe(true);
    expect(new Set(pieces.map((p) => p.tile[0])).size).toBe(TERMINAL_TILES);
    const fit = terminalFit();
    for (const piece of pieces) {
      // The core lands on its tile: its left edge on the tile's, its width the tile's.
      expect(piece.position.x + TERMINAL_CORE.x0 * piece.scale.x).toBeCloseTo(piece.tile[0], 6);
      expect((TERMINAL_CORE.x1 - TERMINAL_CORE.x0) * piece.scale.x).toBeCloseTo(fit.size.x / TERMINAL_TILES, 6);
      expect(piece.position.z + TERMINAL_CORE.z0 * piece.scale.z).toBeCloseTo(fit.center.z - fit.size.z / 2, 6);
      expect(TERMINAL_CORE.height * piece.scale.y).toBeCloseTo(fit.size.y, 6);
      // A stretch under 3 in depth keeps the facade readable.
      expect(piece.scale.z).toBeLessThan(3);
    }
  });

  it('the core numbers are those of the terminal file: the stucco walls\' box in the manifest-sized model', async () => {
    const model = await loadManifestModel('arrival.terminal');
    model.updateMatrixWorld(true);
    let walls: THREE.Mesh | null = null;
    model.traverse((o) => { if (o.name.startsWith('Walls01')) walls = o as THREE.Mesh; });
    const box = new THREE.Box3().setFromObject(walls!);
    expect(box.min.x).toBeCloseTo(TERMINAL_CORE.x0, 1);
    expect(box.max.x).toBeCloseTo(TERMINAL_CORE.x1, 1);
    expect(box.min.z).toBeCloseTo(TERMINAL_CORE.z0, 1);
    expect(box.max.z).toBeCloseTo(TERMINAL_CORE.z1, 1);
    expect(box.min.y).toBeCloseTo(0, 1);
    expect(box.max.y).toBeCloseTo(TERMINAL_CORE.height, 1);
  });

  it('the rental office is a stack of containers that stays inside its box, two high', () => {
    const office = buildingOf('rentalOffice');
    const list = officeContainers();
    expect(list).toHaveLength(16);
    for (const c of list) {
      expect(c.x - c.size.x / 2).toBeGreaterThanOrEqual(office.center.x - office.size.x / 2 - 1e-9);
      expect(c.x + c.size.x / 2).toBeLessThanOrEqual(office.center.x + office.size.x / 2 + 1e-9);
      expect(c.z - c.size.z / 2).toBeGreaterThanOrEqual(office.center.z - office.size.z / 2 - 1e-9);
      expect(c.z + c.size.z / 2).toBeLessThanOrEqual(office.center.z + office.size.z / 2 + 1e-9);
      expect(c.y + c.size.y).toBeLessThanOrEqual(office.size.y + 1e-9);
    }
    expect(RENTAL_SIGN.text).toBe('Car Rental');
  });
});

describe('arrival backdrops', () => {
  it('stand beyond the boundary walls, where nobody can walk', () => {
    const xs = arrival.walls.filter((w) => w.halfExtents.y * 2 === 3.5).flatMap((w) => [w.center.x - w.halfExtents.x, w.center.x + w.halfExtents.x]);
    const west = Math.min(...xs);
    const east = Math.max(...xs);
    expect(BACKDROPS).toHaveLength(2);
    for (const b of BACKDROPS) expect(b.x - b.size.x / 2 > east || b.x + b.size.x / 2 < west, b.key).toBe(true);
  });
});

describe('arrival cover', () => {
  it('every cover box gets a model: 6 planters, 2 desks, 3 taxis, 1 minibus and 8 cars on the deck', () => {
    const pieces = coverPieces(arrival);
    const count = (kind: string) => pieces.filter((p) => p.kind === kind).length;
    expect(count('planter')).toBe(6);
    expect(count('desk')).toBe(2);
    expect(count('taxi')).toBe(3);
    expect(count('minibus')).toBe(1);
    expect(count('sedan') + count('hatch')).toBe(8);
    expect(count('sedan')).toBe(4);
    for (const p of pieces.filter((q) => q.kind === 'sedan' || q.kind === 'hatch')) expect(p.box.center.y - p.box.halfExtents.y).toBeCloseTo(DECK_TOP, 9);
  });

  it('every other wall box is structure: a boundary, a terminal wall, a fence, a parapet or the office', () => {
    const covered = new Set(coverPieces(arrival).map((p) => p.box));
    for (const wall of arrival.walls) {
      if (covered.has(wall)) continue;
      const thin = 2 * Math.min(wall.halfExtents.x, wall.halfExtents.z) <= 0.4;
      const office = buildingOf('rentalOffice');
      expect(thin || (wall.center.x === office.center.x && wall.center.z === office.center.z), `${wall.center.x} ${wall.center.z}`).toBe(true);
    }
  });
});

describe('arrival landmarks', () => {
  it('stand on the forecourt, on flat ground, clear of every walk line and wall', () => {
    expect(FOUNTAIN.z).toBeLessThan(-24);
    expect(FOUNTAIN.z).toBeGreaterThan(-62);
    for (const p of [FOUNTAIN, ...FLAGS, ...palmAvenue(arrival)]) {
      expect(slopeOk(arrival, p.x, p.z), `${p.x} ${p.z}`).toBe(true);
      expect(Math.max(surfaceYAt(arrival, p.x, p.z) ?? -Infinity, terrainHeightAt(arrival, p.x, p.z) ?? -Infinity), `${p.x} ${p.z}`).toBeGreaterThan(-0.01);
    }
    expect(distToRoutes(FOUNTAIN.x, FOUNTAIN.z)).toBeGreaterThanOrEqual(FOUNTAIN.size / 2 + 1.5);
    expect(distToWalls(FOUNTAIN.x, FOUNTAIN.z)).toBeGreaterThanOrEqual(FOUNTAIN.size / 2 + 1.5);
    for (const f of FLAGS) {
      expect(distToRoutes(f.x, f.z), `${f.x}`).toBeGreaterThanOrEqual(1.7 + 1.5);
      expect(distToWalls(f.x, f.z), `${f.x}`).toBeGreaterThanOrEqual(1.7 + 1.5);
    }
    for (const p of palmAvenue(arrival)) {
      expect(distToRoutes(p.x, p.z), `${p.x} ${p.z}`).toBeGreaterThanOrEqual(1.6 + 1.5);
      expect(distToWalls(p.x, p.z), `${p.x} ${p.z}`).toBeGreaterThanOrEqual(1.6 + 1.5);
    }
  });

  it('the palm avenue has a good number of palms, and the dressing keeps clear of every landmark', () => {
    expect(palmAvenue(arrival).length).toBeGreaterThanOrEqual(10);
    const avoid = landmarkAvoids(arrival);
    expect(avoid.length).toBe(1 + FLAGS.length + palmAvenue(arrival).length);
    for (const p of dressMap(arrival, 'airport', 1, { phone: false, avoid })) for (const a of avoid) expect(Math.hypot(p.x - a.x, p.z - a.z), p.key).toBeGreaterThanOrEqual(a.r + 1.5);
  });
});
