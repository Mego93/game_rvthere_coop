type Route = readonly (readonly [number, number])[];

const CELL = 32;

interface Index {
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
  cells: Map<number, number[]>;
  stamp: Int32Array;
  query: number;
}

const indexes = new WeakMap<Route, Index>();

function build(route: Route): Index {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of route) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const cols = Math.floor((maxX - minX) / CELL) + 1;
  const rows = Math.floor((maxZ - minZ) / CELL) + 1;
  const cells = new Map<number, number[]>();
  for (let i = 0; i < route.length - 1; i++) {
    const [x0, z0] = route[i]!;
    const [x1, z1] = route[i + 1]!;
    const c0 = Math.floor((Math.min(x0, x1) - minX) / CELL);
    const c1 = Math.floor((Math.max(x0, x1) - minX) / CELL);
    const r0 = Math.floor((Math.min(z0, z1) - minZ) / CELL);
    const r1 = Math.floor((Math.max(z0, z1) - minZ) / CELL);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const list = cells.get(r * cols + c);
        if (list) list.push(i);
        else cells.set(r * cols + c, [i]);
      }
    }
  }
  return { minX, minZ, cols, rows, cells, stamp: new Int32Array(route.length), query: 0 };
}

// The index of the segment nearest to (x, z) by `measure` (smaller is nearer; `squared` says it is a squared distance), the lowest index among equals, as a scan over every segment finds it. Searches grid rings outward and stops once no unsearched segment can be nearer.
export function nearestSegment(route: Route, x: number, z: number, measure: (i: number) => number, squared: boolean): number {
  let index = indexes.get(route);
  if (!index) {
    index = build(route);
    indexes.set(route, index);
  }
  const { minX, minZ, cols, rows, cells, stamp } = index;
  const query = ++index.query;
  const cx = Math.floor((x - minX) / CELL);
  const cz = Math.floor((z - minZ) / CELL);
  const farthest = Math.max(cx, cols - 1 - cx, cz, rows - 1 - cz, 0);
  let best = Infinity;
  let bestIndex = -1;
  const visit = (c: number, r: number) => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    const list = cells.get(r * cols + c);
    if (!list) return;
    for (const i of list) {
      if (stamp[i] === query) continue;
      stamp[i] = query;
      const value = measure(i);
      if (value < best || (value === best && i < bestIndex)) {
        best = value;
        bestIndex = i;
      }
    }
  };
  for (let ring = 0; ring <= farthest + 1; ring++) {
    if (ring === 0) visit(cx, cz);
    else {
      for (let c = cx - ring; c <= cx + ring; c++) {
        visit(c, cz - ring);
        visit(c, cz + ring);
      }
      for (let r = cz - ring + 1; r <= cz + ring - 1; r++) {
        visit(cx - ring, r);
        visit(cx + ring, r);
      }
    }
    if (bestIndex >= 0) {
      // Everything unsearched is at least this far from the point (outside the searched square of cells).
      const covered = Math.min(x - (minX + (cx - ring) * CELL), minX + (cx + ring + 1) * CELL - x, z - (minZ + (cz - ring) * CELL), minZ + (cz + ring + 1) * CELL - z);
      if (covered > 0 && (squared ? best < covered * covered : best < covered)) break;
    }
  }
  return bestIndex;
}
