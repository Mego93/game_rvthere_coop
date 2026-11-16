export interface MapView { scale: number; originX: number; originZ: number; size: number }

// originX/originZ is the world point drawn at the map centre.
export function mapViewFor(route: readonly [number, number][], size: number, margin: number): MapView {
  if (route.length === 0) return { scale: 1, originX: 0, originZ: 0, size };
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of route) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const originX = (minX + maxX) / 2;
  const originZ = (minZ + maxZ) / 2;
  const extent = Math.max(maxX - minX, maxZ - minZ);
  if (route.length < 2 || extent <= 0) return { scale: 1, originX, originZ, size };
  return { scale: Math.max(size - 2 * margin, 0) / extent, originX, originZ, size };
}

export function toMap(view: MapView, x: number, z: number): { x: number; y: number } {
  return {
    x: view.size / 2 + (x - view.originX) * view.scale,
    y: view.size / 2 + (z - view.originZ) * view.scale,
  };
}

export function routePath(view: MapView, route: readonly [number, number][]): string {
  if (route.length < 2) return '';
  let d = '';
  route.forEach(([x, z], i) => {
    const p = toMap(view, x, z);
    d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  });
  return d;
}

export function clampToMap(view: MapView, point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.min(Math.max(point.x, 0), view.size),
    y: Math.min(Math.max(point.y, 0), view.size),
  };
}

// Keeps a point within the circular map's radius (minus a 3 px inset) by scaling it toward the centre.
export function clampToCircle(view: MapView, point: { x: number; y: number }): { x: number; y: number } {
  const c = view.size / 2;
  const max = c - 3;
  const dx = point.x - c;
  const dy = point.y - c;
  const d = Math.hypot(dx, dy);
  if (d <= max) return { x: point.x, y: point.y };
  const k = max / d;
  return { x: c + dx * k, y: c + dy * k };
}

export const WINDOW_ROUTE_LENGTH = 3000;
export const WINDOW_RADIUS = 600;

export function routeLength(route: readonly [number, number][]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) total += Math.hypot(route[i]![0] - route[i - 1]![0], route[i]![1] - route[i - 1]![1]);
  return total;
}

export const isWindowed = (route: readonly [number, number][]): boolean => routeLength(route) > WINDOW_ROUTE_LENGTH;

// The circle's drawable radius (minus the 3 px inset clampToCircle uses) stands for `radius` metres.
export function windowViewFor(centre: { x: number; z: number }, size: number, radius = WINDOW_RADIUS): MapView {
  return { scale: (size / 2 - 3) / radius, originX: centre.x, originZ: centre.z, size };
}

// Runs of route points inside the window, each extended by its neighbour on either side so the line leaves the circle.
export function clipRouteToWindow(route: readonly [number, number][], centre: { x: number; z: number }, radius: number): [number, number][][] {
  const inside = route.map(([x, z]) => Math.hypot(x - centre.x, z - centre.z) <= radius);
  const runs: [number, number][][] = [];
  let run: [number, number][] | null = null;
  for (let i = 0; i < route.length; i++) {
    if (inside[i] || inside[i - 1] || inside[i + 1]) {
      if (!run) runs.push((run = []));
      run.push(route[i]!);
    } else run = null;
  }
  return runs;
}

export function routePathRuns(view: MapView, runs: readonly (readonly [number, number][])[]): string {
  return runs.map((run) => routePath(view, run)).join('');
}
