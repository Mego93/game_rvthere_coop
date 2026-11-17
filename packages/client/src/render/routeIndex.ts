type Route = readonly (readonly [number, number])[];

const LEAF = 8;

// A binary tree over runs of consecutive segments; each node keeps the box around its run.
interface Tree {
  count: number;
  minX: Float64Array;
  maxX: Float64Array;
  minZ: Float64Array;
  maxZ: Float64Array;
}

const trees = new WeakMap<Route, Tree>();

function build(route: Route): Tree {
  const count = route.length - 1;
  const size = 4 * Math.max(1, Math.ceil(count / LEAF));
  const tree: Tree = { count, minX: new Float64Array(size), maxX: new Float64Array(size), minZ: new Float64Array(size), maxZ: new Float64Array(size) };
  const fill = (node: number, from: number, to: number) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    if (to - from <= LEAF) {
      for (let i = from; i < to + 1; i++) {
        minX = Math.min(minX, route[i]![0]);
        maxX = Math.max(maxX, route[i]![0]);
        minZ = Math.min(minZ, route[i]![1]);
        maxZ = Math.max(maxZ, route[i]![1]);
      }
    } else {
      const mid = (from + to) >> 1;
      fill(node * 2 + 1, from, mid);
      fill(node * 2 + 2, mid, to);
      for (const child of [node * 2 + 1, node * 2 + 2]) {
        minX = Math.min(minX, tree.minX[child]!);
        maxX = Math.max(maxX, tree.maxX[child]!);
        minZ = Math.min(minZ, tree.minZ[child]!);
        maxZ = Math.max(maxZ, tree.maxZ[child]!);
      }
    }
    tree.minX[node] = minX;
    tree.maxX[node] = maxX;
    tree.minZ[node] = minZ;
    tree.maxZ[node] = maxZ;
  };
  if (count > 0) fill(0, 0, count);
  return tree;
}

// The index of the segment nearest to (x, z) by `measure` (smaller is nearer; `squared` says it is a squared distance), the lowest index among equals, exactly as a scan over every segment finds it. Branch and bound over the tree; a box is skipped only when it is clearly farther than the best so far.
export function nearestSegment(route: Route, x: number, z: number, measure: (i: number) => number, squared: boolean): number {
  let tree = trees.get(route);
  if (!tree) {
    tree = build(route);
    trees.set(route, tree);
  }
  const { count, minX, maxX, minZ, maxZ } = tree;
  let best = Infinity;
  let bestIndex = -1;
  const bound = (node: number): number => {
    const dx = Math.max(minX[node]! - x, 0, x - maxX[node]!);
    const dz = Math.max(minZ[node]! - z, 0, z - maxZ[node]!);
    const sq = dx * dx + dz * dz;
    return squared ? sq : Math.sqrt(sq);
  };
  // Slack so rounding in the bound never discards a segment the scan would pick.
  const farther = (value: number) => value > best * (1 + 1e-9) + 1e-9;
  const visit = (node: number, from: number, to: number) => {
    if (to - from <= LEAF) {
      for (let i = from; i < to; i++) {
        const value = measure(i);
        if (value < best || (value === best && i < bestIndex)) {
          best = value;
          bestIndex = i;
        }
      }
      return;
    }
    const mid = (from + to) >> 1;
    const left = node * 2 + 1;
    const right = node * 2 + 2;
    const lb = bound(left);
    const rb = bound(right);
    if (lb <= rb) {
      if (!farther(lb)) visit(left, from, mid);
      if (!farther(rb)) visit(right, mid, to);
    } else {
      if (!farther(rb)) visit(right, mid, to);
      if (!farther(lb)) visit(left, from, mid);
    }
  };
  if (count > 0) visit(0, 0, count);
  return bestIndex;
}
