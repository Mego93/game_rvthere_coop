import type { HudModel } from './hudModel';
import { clampToCircle, clipRouteToWindow, isWindowed, mapViewFor, routePath, routePathRuns, toMap, WINDOW_RADIUS, windowViewFor } from './minimap';
import type { MapView } from './minimap';

type HudEntity = HudModel['mapEntities'][number];
export type MapEntity = Omit<HudEntity, 'kind'> & { kind: HudEntity['kind'] | 'finish' };

export interface MapPlan {
  windowed: boolean;
  route: readonly [number, number][];
  finish: { x: number; z: number };
  size: number;
  staticView: MapView;
  staticPath: string;
}

export interface MapScene {
  view: MapView;
  path: string;
  items: { entity: MapEntity; x: number; y: number }[];
}

export function createMapPlan(route: readonly [number, number][], finish: { x: number; z: number }, size: number, margin: number): MapPlan {
  const staticView = mapViewFor(route, size, margin);
  return { windowed: isWindowed(route), route, finish, size, staticView, staticPath: routePath(staticView, route) };
}

// A route over 3 km shows a moving window: only the finish is pinned to the edge, everything else outside the circle is hidden.
export function mapScene(plan: MapPlan, entities: readonly HudEntity[]): MapScene {
  if (!plan.windowed) {
    const items: MapScene['items'] = [];
    for (const entity of entities) {
      const raw = toMap(plan.staticView, entity.x, entity.z);
      const p = clampToCircle(plan.staticView, raw);
      if (entity.kind === 'item' && (p.x !== raw.x || p.y !== raw.y)) continue;
      items.push({ entity, x: p.x, y: p.y });
    }
    return { view: plan.staticView, path: plan.staticPath, items };
  }
  const centre = entities.find((e) => e.kind === 'self') ?? entities.find((e) => e.kind === 'vehicle');
  const origin = centre ? { x: centre.x, z: centre.z } : { x: plan.route[0]?.[0] ?? 0, z: plan.route[0]?.[1] ?? 0 };
  const view = windowViewFor(origin, plan.size);
  const items: MapScene['items'] = [];
  for (const entity of entities) {
    if (entity.kind === 'checkpoint') continue;
    if (Math.hypot(entity.x - origin.x, entity.z - origin.z) > WINDOW_RADIUS) continue;
    const raw = toMap(view, entity.x, entity.z);
    const p = clampToCircle(view, raw);
    if (entity.kind === 'item' && (p.x !== raw.x || p.y !== raw.y)) continue;
    items.push({ entity, x: p.x, y: p.y });
  }
  const pin = clampToCircle(view, toMap(view, plan.finish.x, plan.finish.z));
  items.push({ entity: { id: 'finish', kind: 'finish', x: plan.finish.x, z: plan.finish.z }, x: pin.x, y: pin.y });
  return { view, path: routePathRuns(view, clipRouteToWindow(plan.route, origin, WINDOW_RADIUS)), items };
}
