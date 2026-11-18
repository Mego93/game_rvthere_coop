import { CORRIDOR_BERM_FADE, CORRIDOR_BERM_MARGIN, CORRIDOR_OUTER, corridorOf, rotate, routeFrame, segmentRanges, type BuiltCourse, type Box, type CourseDef, type Placed, type SegmentDef } from '@lodgy/shared';
import { MODEL_MANIFEST, type ModelKey } from './modelManifest';
import { landHeight, routeDistance, surfaceYAt, terrainHeight } from './terrain';

export interface DecorPlacement {
  model: ModelKey;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

export interface ScatterOptions {
  // Length of the built-up end of the route; courses shorter than twice this have no city.
  cityLength?: number;
}

export const CITY_LENGTH = 600;
const NEAR_MIN = 5;
const NEAR_MAX = 30;
const FAR_MIN = 31;
const STOP_MARGIN = 3;
const OBJECT_CLEARANCE = 3;
const WATER_MARGIN = 2;
const LIGHT_OFFSET = 7;
const BUILDING_MAX = 45;
// Near items are the only decor a vehicle drives over: nothing taller than this (metres, longest side).
export const NEAR_MAX_SIZE = 0.7;
const HILL_MIN = 60;
const HILL_MAX = 250;
const HILL_CLEARANCE = 70;
// The cliff models are 1:1:1 blocks; sunk into the ground they become mesas of this visible height (metres).
const HILL_RISE: readonly [number, number] = [8, 20];
// Height of each cliff model relative to its longest side.
const CLIFF_HEIGHT: Partial<Record<ModelKey, number>> = { 'decor.cliff.half': 0.5, 'decor.cliff.corner': 1 };
const SIGNATURE_MIN = 2;
// Corridor courses (step 32): the land beside the road is drawn from the shared heights; the hills move out beyond the ridge.
// Share of the table's scrub density the band adds beyond the shoulders.
export const BAND_SHRUBS = 0.12;
export const HILL_BEYOND = CORRIDOR_OUTER + 10;
export const BAND: readonly [number, number] = [FAR_MIN + 3, CORRIDOR_OUTER];
// Step 33 decor on corridor courses (distances from the centre line, metres).
export const VILLAGE_SPACING: readonly [number, number] = [1500, 2300];
export const VILLAGE_HALF = 120;
export const KASBAH_ZONE: readonly [number, number] = [48, 84];
export const MOSQUE_ZONE: readonly [number, number] = [50, 95];
export const STALL_ZONE: readonly [number, number] = [32.6, 37];
export const STALL_REACH = 24;
export const ROADSIDE_ZONE: readonly [number, number] = [32.6, 36];
export const CLIFFS_ZONE: readonly [number, number] = [CORRIDOR_OUTER + 12, 210];
export const MOUNTAINS_ZONE: readonly [number, number] = [450, 800];
// Rocks on the berms around obstacles: lateral band and how far past the berm they continue.
export const BERM_ROCK_ZONE: readonly [number, number] = [33.5, 38.5];
export const BERM_ROCK_REACH = CORRIDOR_BERM_MARGIN + CORRIDOR_BERM_FADE;

// Per 100 m of route per side; lights and poles alternate, 2 each = one structure per 25 m.
export const DECOR_DENSITY = {
  road: { scrub: 12, grass: 25, stones: 6, rocks: 2, palms: 1.2, cactus: 0.6, fields: 0.35, hills: 0.6 },
  sand: { scrub: 10, grass: 4, stones: 6, rocks: 1, palms: 4, cactus: 1.5, fields: 0, hills: 0.6 },
  ford: { scrub: 6, grass: 30, stones: 14, rocks: 4, palms: 1.5, cactus: 0, fields: 0, hills: 0.6 },
  pit: { scrub: 12, grass: 25, stones: 6, rocks: 2, palms: 1.2, cactus: 0.6, fields: 0.35, hills: 0.6 },
  bank: { scrub: 8, grass: 12, stones: 8, rocks: 4, palms: 0.6, cactus: 0.6, fields: 0, hills: 0.6 },
  roadworks: { scrub: 6, grass: 12, stones: 6, rocks: 1.5, palms: 0.6, cactus: 0, fields: 0, hills: 0.6 },
  city: { scrub: 6, grass: 8, stones: 2, palms: 2.5, trees: 1.2, buildings: 7, houses: 4, lights: 2, poles: 2, fences: 2, hills: 0.6 },
} as const;

type Density = Partial<Record<string, number>>;

const keys = <T extends string>(...list: T[]) => list;
const MODELS = {
  scrub: keys<ModelKey>('decor.scrub', 'decor.bush.small', 'decor.bush.a'),
  grass: keys<ModelKey>('decor.grass.a', 'decor.grass.large', 'decor.grass.leafs'),
  stones: keys<ModelKey>('decor.rock.small.a', 'decor.rock.small.b', 'decor.rock.small.c', 'decor.stone.small.a', 'decor.stone.small.b'),
  rocks: keys<ModelKey>('decor.rock.large.a', 'decor.rock.large.b', 'decor.rock.large.c', 'decor.rock.tall.a', 'decor.rock.tall.b', 'decor.stone.large.a', 'decor.stone.large.b', 'decor.stone.tall'),
  palms: keys<ModelKey>('decor.palm.a', 'decor.palm.b', 'decor.palm.c', 'decor.palm.d', 'decor.palm.e'),
  cactus: keys<ModelKey>('decor.cactus.short', 'decor.cactus.tall'),
  trees: keys<ModelKey>('decor.tree.small', 'decor.tree.large'),
  crops: keys<ModelKey>('decor.crop.wheatA', 'decor.crop.wheatB', 'decor.crop.cornC', 'decor.crop.cornD'),
  buildings: keys<ModelKey>('decor.building.a', 'decor.building.b', 'decor.building.c', 'decor.building.d', 'decor.building.e', 'decor.building.h', 'decor.building.k', 'decor.building.n'),
  houses: keys<ModelKey>('decor.house.a', 'decor.house.c', 'decor.house.h', 'decor.house.m'),
  hills: keys<ModelKey>('decor.cliff.large', 'decor.cliff.plain', 'decor.cliff.half', 'decor.cliff.block', 'decor.cliff.top', 'decor.cliff.diagonal', 'decor.cliff.corner'),
  lights: keys<ModelKey>('decor.light.square', 'decor.light.curved', 'decor.light.double'),
  poles: keys<ModelKey>('decor.pole', 'decor.pole.wide'),
  fences: keys<ModelKey>('decor.fence.suburban', 'decor.fence.low', 'decor.fence.simple', 'decor.fence.planks'),
};

export const NEAR_ALLOWED_MODELS: ReadonlySet<string> = new Set([...MODELS.scrub, ...MODELS.grass, ...MODELS.stones, ...MODELS.lights, ...MODELS.poles]);

type Facing = 'random' | 'face' | 'along';
interface Spec {
  keys: readonly ModelKey[];
  scale: readonly [number, number];
  // Collision spacing between decor, metres.
  radius: number;
  zone: readonly [min: number, max: number];
  facing: Facing;
}

const NEAR: readonly [number, number] = [NEAR_MIN + 0.5, NEAR_MAX - 0.5];
const SPECS: Record<string, Spec> = {
  hills: { keys: MODELS.hills, scale: [1, 2], radius: 0, zone: [HILL_MIN, HILL_MAX], facing: 'random' },
  buildings: { keys: MODELS.buildings, scale: [0.9, 1.4], radius: 7, zone: [FAR_MIN + 0.5, BUILDING_MAX - 1], facing: 'face' },
  houses: { keys: MODELS.houses, scale: [0.9, 1.3], radius: 6, zone: [FAR_MIN + 0.5, BUILDING_MAX - 1], facing: 'face' },
  trees: { keys: MODELS.trees, scale: [0.8, 1.2], radius: 3, zone: [FAR_MIN + 1, 60], facing: 'random' },
  rocks: { keys: MODELS.rocks, scale: [0.8, 1.8], radius: 2, zone: [FAR_MIN + 1, 130], facing: 'random' },
  palms: { keys: MODELS.palms, scale: [0.85, 1.25], radius: 2.2, zone: [FAR_MIN + 1, 110], facing: 'random' },
  cactus: { keys: MODELS.cactus, scale: [0.8, 1.3], radius: 1, zone: [FAR_MIN + 1, 90], facing: 'random' },
  scrub: { keys: MODELS.scrub, scale: [0.6, 1], radius: 0.6, zone: NEAR, facing: 'random' },
  grass: { keys: MODELS.grass, scale: [0.6, 1], radius: 0.4, zone: NEAR, facing: 'random' },
  stones: { keys: MODELS.stones, scale: [0.6, 1], radius: 0.4, zone: NEAR, facing: 'random' },
  fences: { keys: MODELS.fences, scale: [1, 1], radius: 1.2, zone: [FAR_MIN + 2, FAR_MIN + 8], facing: 'along' },
  crops: { keys: MODELS.crops, scale: [0.9, 1.2], radius: 0.6, zone: [FAR_MIN + 4, 90], facing: 'random' },
};
// Larger decor is placed first so smaller decor makes way for it.
const ORDER = ['hills', 'buildings', 'houses', 'trees', 'rocks', 'palms', 'cactus', 'fences', 'scrub', 'stones', 'grass'] as const;
const SIGNATURE: Record<string, string> = { sand: 'palms', ford: 'rocks', bank: 'rocks' };

const FENCE_RUN = 5;
const FIELD_ROWS = 5;
const FIELD_COLUMNS = 6;
const FIELD_SPACING = 2.4;

export function seedFromId(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return hash >>> 0;
}

// mulberry32
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sizeOf = (key: ModelKey): number => {
  const target = MODEL_MANIFEST[key].targetSize;
  return typeof target === 'number' ? target : Math.max(target.x, target.y, target.z);
};

interface Frame {
  x: number;
  z: number;
  // Unit tangent and the unit normal on the +side.
  tx: number;
  tz: number;
}

interface Zone {
  type: SegmentDef['type'];
  from: number;
  to: number;
  city: boolean;
}

function localBox(box: Box, x: number, z: number): { x: number; z: number } {
  const local = rotate({ x: -box.rot.x, y: -box.rot.y, z: -box.rot.z, w: box.rot.w }, { x: x - box.center.x, y: 0, z: z - box.center.z });
  return { x: local.x, z: local.z };
}

export function scatterDecor(course: BuiltCourse, def: CourseDef | null, seed: number, options: ScatterOptions = {}): DecorPlacement[] {
  if (!def || course.route.length < 2) return [];
  const corridor = corridorOf(course);
  const rng = prng(seed);
  const between = (a: number, b: number) => a + (b - a) * rng();

  const cumulative = [0];
  for (let i = 1; i < course.route.length; i++) {
    cumulative.push(cumulative[i - 1]! + Math.hypot(course.route[i]![0] - course.route[i - 1]![0], course.route[i]![1] - course.route[i - 1]![1]));
  }
  const total = cumulative[cumulative.length - 1]!;
  const frameAt = (along: number): Frame => {
    let lo = 0;
    let hi = cumulative.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cumulative[mid]! <= along) lo = mid;
      else hi = mid - 1;
    }
    const [x0, z0] = course.route[lo]!;
    const [x1, z1] = course.route[lo + 1]!;
    const length = cumulative[lo + 1]! - cumulative[lo]! || 1;
    const t = Math.min(1, Math.max(0, (along - cumulative[lo]!) / length));
    return { x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, tx: (x1 - x0) / length, tz: (z1 - z0) / length };
  };

  // Zones: each segment, split where the city begins; the finish pad counts as road.
  const cityLength = options.cityLength ?? CITY_LENGTH;
  const cityFrom = total >= 2 * cityLength ? total - cityLength : Infinity;
  const ranges = segmentRanges(def);
  const spans = [...ranges, { type: 'road' as const, from: ranges[ranges.length - 1]!.to, to: total }];
  const zones: Zone[] = [];
  for (const span of spans) {
    if (span.type === 'alley' || span.to - span.from < 1) continue;
    const city = span.type === 'road' || span.type === 'roadworks';
    if (city && span.to > cityFrom && span.from < cityFrom) {
      zones.push({ type: span.type, from: span.from, to: cityFrom, city: false }, { type: span.type, from: cityFrom, to: span.to, city: true });
    } else zones.push({ type: span.type, from: span.from, to: span.to, city: city && span.from >= cityFrom });
  }

  const blockers: { x: number; z: number }[] = [...course.props, ...course.pickups, ...course.anchors, ...course.coins].map((p: Placed) => ({ x: p.pose.pos.x, z: p.pose.pos.z }));
  const water = course.decor.filter((d) => d.kind === 'water' && d.size).map((d): Box => ({ center: d.pose.pos, halfExtents: d.size!, rot: d.pose.rot }));

  const out: DecorPlacement[] = [];
  const taken: { x: number; z: number; r: number }[] = [];
  const grid = new Map<string, { x: number; z: number; r: number }[]>();
  const CELL = 24;
  const cellKey = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  const BIG = 12;

  const crowded = (x: number, z: number, r: number): boolean => {
    for (const o of taken) if (Math.abs(x - o.x) < r + o.r && Math.hypot(x - o.x, z - o.z) < r + o.r) return true;
    if (r > BIG) {
      for (const list of grid.values()) for (const o of list) if (Math.abs(x - o.x) < r + o.r && Math.hypot(x - o.x, z - o.z) < r + o.r) return true;
      return false;
    }
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let i = cx - 1; i <= cx + 1; i++) {
      for (let j = cz - 1; j <= cz + 1; j++) {
        for (const o of grid.get(`${i},${j}`) ?? []) if (Math.hypot(x - o.x, z - o.z) < r + o.r) return true;
      }
    }
    return false;
  };
  const claim = (x: number, z: number, r: number) => {
    const entry = { x, z, r };
    if (r > BIG) taken.push(entry);
    else {
      const key = cellKey(x, z);
      const list = grid.get(key);
      if (list) list.push(entry);
      else grid.set(key, [entry]);
    }
  };

  // Tries one placement; `reach` is the distance band from the centre line the item's own rules allow.
  const place = (key: ModelKey, x: number, z: number, yaw: number, scale: number, reach: readonly [number, number], radius: number): boolean => {
    const { distance } = routeDistance(course, x, z);
    if (distance < reach[0] || distance > reach[1]) return false;
    for (const stop of course.stops) {
      const local = localBox(stop.zone, x, z);
      if (Math.abs(local.x) <= stop.zone.halfExtents.x + STOP_MARGIN && Math.abs(local.z) <= stop.zone.halfExtents.z + STOP_MARGIN) return false;
    }
    for (const b of blockers) if (Math.abs(x - b.x) < OBJECT_CLEARANCE && Math.hypot(x - b.x, z - b.z) < OBJECT_CLEARANCE) return false;
    for (const w of water) {
      const local = localBox(w, x, z);
      if (Math.abs(local.x) <= w.halfExtents.x + WATER_MARGIN && Math.abs(local.z) <= w.halfExtents.z + WATER_MARGIN) return false;
    }
    if (crowded(x, z, radius)) return false;
    const near = distance <= NEAR_MAX;
    const ground = corridor ? landHeight(course, x, z) : terrainHeight(course, x, z);
    const y = near ? (surfaceYAt(course, x, z) ?? ground) : ground;
    out.push({ model: key, x, y, z, yaw, scale });
    claim(x, z, radius);
    return true;
  };

  const pick = (list: readonly ModelKey[]) => list[Math.floor(rng() * list.length)]!;
  const count = (expected: number) => Math.floor(expected + rng());

  for (const zone of zones) {
    const table: Density = zone.city ? DECOR_DENSITY.city : (DECOR_DENSITY[zone.type as keyof typeof DECOR_DENSITY] ?? DECOR_DENSITY.road);
    const length = zone.to - zone.from;
    for (const side of [-1, 1]) {
      const at = (along: number, lateral: number) => {
        const f = frameAt(along);
        return { x: f.x - f.tz * lateral * side, z: f.z + f.tx * lateral * side, f };
      };
      const yawFor = (facing: Facing, f: Frame): number => {
        if (facing === 'random') return rng() * Math.PI * 2;
        // The model's front (+Z) looks at the route.
        if (facing === 'face') return Math.atan2(f.tz * side, -f.tx * side);
        return Math.atan2(-f.tz, f.tx);
      };

      for (const name of ORDER) {
        const spec = SPECS[name]!;
        const density = table[name] ?? 0;
        let n = count((density * length) / 100);
        if (n === 0 && SIGNATURE[zone.type] === name && !zone.city) n = SIGNATURE_MIN;
        else if (SIGNATURE[zone.type] === name && !zone.city) n = Math.max(n, SIGNATURE_MIN);
        for (let i = 0; i < n; i++) {
          if (name === 'fences') {
            const start = between(zone.from, Math.max(zone.from, zone.to - FENCE_RUN * 3));
            const lateral = between(spec.zone[0], spec.zone[1]);
            const key = pick(spec.keys);
            const step = sizeOf(key);
            for (let k = 0; k < FENCE_RUN; k++) {
              const along = start + k * step;
              if (along > zone.to) break;
              const p = at(along, lateral);
              place(key, p.x, p.z, yawFor('along', p.f), 1, [FAR_MIN, 80], spec.radius);
            }
            continue;
          }
          const key = pick(spec.keys);
          const along = between(zone.from, zone.to);
          let scale = between(spec.scale[0], spec.scale[1]);
          let [low, high] = spec.zone;
          let reach: [number, number] = name === 'buildings' || name === 'houses' ? [FAR_MIN, BUILDING_MAX + 1] : low < FAR_MIN ? [NEAR_MIN, NEAR_MAX] : [FAR_MIN, Infinity];
          let radius = spec.radius;
          if (low < FAR_MIN) scale *= Math.min(1, NEAR_MAX_SIZE / sizeOf(key));
          if (name === 'hills') {
            const half = (sizeOf(key) * scale) / 2;
            low = Math.max(HILL_MIN, half + HILL_CLEARANCE);
            high = Math.max(low, HILL_MAX);
            reach = [low - 5, Infinity];
            if (corridor) {
              low = HILL_BEYOND + half;
              high = low + HILL_MAX - HILL_MIN;
              reach = [HILL_BEYOND, Infinity];
            }
            radius = half * 0.8;
          }
          const p = at(along, between(low, high));
          const yaw = yawFor(spec.facing, p.f);
          if (name === 'hills') {
            // The visible face is a rock block: sink its base so it rises from the terrain.
            const placed = place(key, p.x, p.z, yaw, scale, reach, radius);
            if (placed) out[out.length - 1]!.y -= Math.max(0, sizeOf(key) * scale * (CLIFF_HEIGHT[key] ?? 1) - between(HILL_RISE[0], HILL_RISE[1]));
            continue;
          }
          place(key, p.x, p.z, yaw, scale, reach, radius);
        }
      }

      // Fields: a patch of one crop in rows beside rural roads.
      const fields = count(((table.fields ?? 0) * length) / 100);
      for (let i = 0; i < fields; i++) {
        const base = between(zone.from, zone.to);
        const lateral = between(SPECS.crops!.zone[0], SPECS.crops!.zone[1]);
        const key = pick(MODELS.crops);
        const origin = at(base, lateral);
        const f = origin.f;
        for (let r = 0; r < FIELD_ROWS; r++) {
          for (let c = 0; c < FIELD_COLUMNS; c++) {
            const x = origin.x + f.tx * c * FIELD_SPACING - f.tz * side * r * FIELD_SPACING;
            const z = origin.z + f.tz * c * FIELD_SPACING + f.tx * side * r * FIELD_SPACING;
            place(key, x, z, rng() * Math.PI * 2, between(0.9, 1.2), [FAR_MIN, Infinity], SPECS.crops!.radius);
          }
        }
      }

      // Street lights and poles at fixed spacing, 7 m off the centre line.
      for (const name of ['lights', 'poles'] as const) {
        const per100 = table[name] ?? 0;
        if (per100 <= 0) continue;
        const spacing = 100 / per100;
        const shift = name === 'poles' ? spacing / 2 : 0;
        for (let along = Math.ceil((zone.from - shift) / spacing) * spacing + shift; along < zone.to; along += spacing) {
          const p = at(along, LIGHT_OFFSET);
          const key = pick(MODELS[name]);
          place(key, p.x, p.z, yawFor('face', p.f), 1, [LIGHT_OFFSET - 0.5, LIGHT_OFFSET + 0.5], 0.5);
        }
      }
    }
  }
  if (corridor) scatterCorridor();
  return out;

  // The step 32 and 33 decor of a corridor course, from its own random stream so the rest of the scatter is unchanged.
  function scatterCorridor() {
    const rc = prng((seed ^ 0x5bd1e995) >>> 0);
    const betweenC = (a: number, b: number) => a + (b - a) * rc();
    const pickC = (list: readonly ModelKey[]) => list[Math.floor(rc() * list.length)]!;
    const countC = (expected: number) => Math.floor(expected + rc());
    const side = [-1, 1] as const;
    const spot = (along: number, lateral: number, s: number) => {
      const f = frameAt(Math.min(total, Math.max(0, along)));
      return { x: f.x - f.tz * lateral * s, z: f.z + f.tx * lateral * s, f };
    };
    const face = (f: Frame, s: number) => Math.atan2(f.tz * s, -f.tx * s);
    const sink = (placed: boolean, amount: number) => {
      if (placed) out[out.length - 1]!.y -= amount;
    };
    // Plain road, with neighbouring road segments joined into one run.
    const roadZones: { from: number; to: number }[] = [];
    for (const z of zones) {
      if (z.type !== 'road' || z.city) continue;
      const last = roadZones[roadZones.length - 1];
      if (last && z.from <= last.to + 0.5) last.to = z.to;
      else roadZones.push({ from: z.from, to: z.to });
    }
    const cityZones = zones.filter((z) => z.city);

    // Villages: clusters of kasbahs and a mosque on the plain road, and in the city stretch.
    const village = (from: number, to: number, mosques: number, kasbahs: number) => {
      for (let m = 0; m < mosques; m++) {
        const s = side[Math.floor(rc() * 2)]!;
        const p = spot(betweenC(from, to), betweenC(MOSQUE_ZONE[0], MOSQUE_ZONE[1]), s);
        sink(place('decor.mosque', p.x, p.z, face(p.f, s) + (rc() - 0.5) * 0.4, betweenC(0.8, 1.1), [FAR_MIN, Infinity], 17), 1);
      }
      for (const s of side) {
        for (let k = 0; k < kasbahs; k++) {
          const p = spot(betweenC(from, to), betweenC(KASBAH_ZONE[0], KASBAH_ZONE[1]), s);
          sink(place('decor.kasbah', p.x, p.z, face(p.f, s) + (rc() - 0.5) * 0.6, betweenC(0.8, 1.25), [FAR_MIN, Infinity], 14), 1);
        }
      }
    };
    let along = betweenC(800, 1400);
    while (along < total) {
      const zone = roadZones.find((z) => along - VILLAGE_HALF >= z.from && along + VILLAGE_HALF <= z.to);
      if (zone) {
        village(along - VILLAGE_HALF, along + VILLAGE_HALF, 1, 2 + Math.floor(rc() * 2));
        along += betweenC(VILLAGE_SPACING[0], VILLAGE_SPACING[1]);
      } else along += 150;
    }
    for (const zone of cityZones) village(zone.from, zone.to, 2, 2);

    // Stalls near each fuel stop, on its side of the road, behind the shoulders.
    const frame = routeFrame(course);
    for (const stop of course.stops) {
      if (stop.kind !== 'fuel') continue;
      const hit = frame.nearest(stop.operatePoint.x, stop.operatePoint.z);
      const f = frameAt(hit.along);
      const s = Math.sign(-f.tz * (stop.operatePoint.x - f.x) + f.tx * (stop.operatePoint.z - f.z)) || 1;
      for (const offset of [-STALL_REACH, -STALL_REACH / 2.5, STALL_REACH / 2.5, STALL_REACH]) {
        const p = spot(hit.along + offset + betweenC(-2, 2), betweenC(STALL_ZONE[0], STALL_ZONE[1]), s);
        place('decor.stall', p.x, p.z, face(p.f, s) + (rc() - 0.5) * 0.5, betweenC(0.9, 1.2), [FAR_MIN, Infinity], 2.6);
      }
    }

    // Rocks on the berms beside each obstacle.
    for (const span of course.corridor!.obstacles) {
      for (let a = Math.max(0, span.from - BERM_ROCK_REACH); a <= Math.min(total, span.to + BERM_ROCK_REACH); a += 5) {
        for (const s of side) {
          if (rc() > 0.75) continue;
          const p = spot(a + betweenC(-2, 2), betweenC(BERM_ROCK_ZONE[0], BERM_ROCK_ZONE[1]), s);
          place(pickC(MODELS.rocks), p.x, p.z, rc() * Math.PI * 2, betweenC(0.9, 1.7), [FAR_MIN, Infinity], 1.6);
        }
      }
    }

    // Per zone and side: the corridor band's own shrubs, rocks, palms and cacti (the table's density again, doubling the decor beyond the shoulders), agaves and tyres by the road edge, cliffs and mountains beyond the ridge.
    for (const zone of zones) {
      const table: Density = zone.city ? DECOR_DENSITY.city : (DECOR_DENSITY[zone.type as keyof typeof DECOR_DENSITY] ?? DECOR_DENSITY.road);
      const length = zone.to - zone.from;
      for (const s of side) {
        const scatter = (keys: readonly ModelKey[], density: number, zoneLateral: readonly [number, number], scale: readonly [number, number], radius: number, sunk = 0) => {
          for (let i = countC((density * length) / 100); i > 0; i--) {
            const p = spot(betweenC(zone.from, zone.to), betweenC(zoneLateral[0], zoneLateral[1]), s);
            sink(place(pickC(keys), p.x, p.z, rc() * Math.PI * 2, betweenC(scale[0], scale[1]), [zoneLateral[0] - 0.5, Infinity], radius), sunk);
          }
        };
        scatter(MODELS.rocks, table.rocks ?? 0, [BAND[0], 130], [0.8, 1.8], 2);
        scatter(MODELS.palms, table.palms ?? 0, [BAND[0], 110], [0.85, 1.25], 2.2);
        scatter(MODELS.cactus, table.cactus ?? 0, [BAND[0], 90], [0.8, 1.3], 1);
        scatter(MODELS.scrub, (table.scrub ?? 0) * BAND_SHRUBS, BAND, [0.9, 1.8], 1);
        if (!zone.city) {
          scatter(['decor.agave'], 0.8, ROADSIDE_ZONE, [0.9, 1.4], 0.8);
          for (let i = countC((0.35 * length) / 100); i > 0; i--) {
            const base = betweenC(zone.from, zone.to);
            const lateral = betweenC(ROADSIDE_ZONE[0], ROADSIDE_ZONE[1] - 1);
            for (let k = 0, stack = 1 + Math.floor(rc() * 3); k < stack; k++) {
              const p = spot(base + k * 1.1, lateral + (rc() - 0.5) * 0.4, s);
              place('decor.tyres', p.x, p.z, rc() * Math.PI * 2, betweenC(0.9, 1.2), [FAR_MIN, Infinity], 0.5);
            }
          }
        }
        scatter(['decor.cliffs'], 0.8, CLIFFS_ZONE, [1.5, 3], 8, 0.3);
        scatter(['decor.mountains'], 0.5, MOUNTAINS_ZONE, [7, 12], 120, 8);
      }
    }
  }
}
