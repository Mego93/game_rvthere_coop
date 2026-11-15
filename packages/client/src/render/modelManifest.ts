export type ModelTarget = number | { x: number; y: number; z: number };

// targetSize: a number is the longest side in metres (uniform scale); an object gives each axis in metres (non-uniform).
export interface ModelEntry {
  file: string;
  targetSize: ModelTarget;
  pack: string;
}

const model = (pack: string, name: string, targetSize: ModelTarget): ModelEntry => ({ file: `${pack}/${name}.glb`, targetSize, pack });

export const MODEL_MANIFEST = {
  // vehicle
  'vehicle.lodgy': model('car-kit', 'van', 4.5),
  'vehicle.rv': model('car-kit', 'delivery', 6.8),
  // prop
  'prop.crate': model('car-kit', 'box', 0.6),
  'prop.cart': model('city-roads', 'dumpster', 1.6),
  'prop.barrier': model('city-roads', 'construction-barrier', 2),
  'prop.cone': model('city-roads', 'construction-cone', 0.7),
  'prop.fence': model('city-roads', 'construction-fence', 2),
  'prop.light': model('city-roads', 'construction-light', 1.2),
  // anchor
  'anchor.palm': model('nature', 'tree_palm', 6),
  'anchor.boulder': model('nature', 'rock_largeA', 2.2),
  'anchor.milestone': model('nature', 'statue_obelisk', 2),
  // stop
  'stop.fuel': model('city-commercial', 'low-detail-building-wide-a', 12),
  'stop.garage': model('city-commercial', 'low-detail-building-wide-b', 12),
  'stop.awning': model('city-commercial', 'detail-awning-wide', 5),
  'stop.overhang': model('city-commercial', 'detail-overhang-wide', 5),
  'stop.parasol': model('city-commercial', 'detail-parasol-a', 3),
  // decor
  'decor.palm.a': model('nature', 'tree_palm', 7),
  'decor.palm.b': model('nature', 'tree_palmTall', 9),
  'decor.palm.c': model('nature', 'tree_palmBend', 7),
  'decor.palm.d': model('nature', 'tree_palmShort', 5.5),
  'decor.palm.e': model('nature', 'tree_palmDetailedTall', 9),
  'decor.cactus.short': model('nature', 'cactus_short', 1.2),
  'decor.cactus.tall': model('nature', 'cactus_tall', 2.8),
  'decor.rock.large.a': model('nature', 'rock_largeB', 2.5),
  'decor.rock.large.b': model('nature', 'rock_largeC', 2.5),
  'decor.rock.large.c': model('nature', 'rock_largeD', 2.5),
  'decor.rock.small.a': model('nature', 'rock_smallA', 0.8),
  'decor.rock.small.b': model('nature', 'rock_smallD', 0.8),
  'decor.rock.small.c': model('nature', 'rock_smallFlatA', 0.8),
  'decor.rock.tall.a': model('nature', 'rock_tallA', 4),
  'decor.rock.tall.b': model('nature', 'rock_tallC', 3.5),
  'decor.stone.large.a': model('nature', 'stone_largeA', 2),
  'decor.stone.large.b': model('nature', 'stone_largeC', 2),
  'decor.stone.small.a': model('nature', 'stone_smallA', 0.7),
  'decor.stone.small.b': model('nature', 'stone_smallE', 0.7),
  'decor.stone.tall': model('nature', 'stone_tallB', 3),
  'decor.bush.a': model('nature', 'plant_bush', 1.2),
  'decor.bush.large': model('nature', 'plant_bushLarge', 1.8),
  'decor.bush.small': model('nature', 'plant_bushSmall', 0.8),
  'decor.bush.detailed': model('nature', 'plant_bushDetailed', 1.4),
  'decor.scrub': model('nature', 'plant_flatTall', 0.8),
  'decor.grass.a': model('nature', 'grass', 0.7),
  'decor.grass.large': model('nature', 'grass_large', 1),
  'decor.grass.leafs': model('nature', 'grass_leafs', 0.6),
  'decor.crop.wheatA': model('nature', 'crops_wheatStageA', 1),
  'decor.crop.wheatB': model('nature', 'crops_wheatStageB', 1),
  'decor.crop.cornC': model('nature', 'crops_cornStageC', 1.4),
  'decor.crop.cornD': model('nature', 'crops_cornStageD', 1.6),
  'decor.tree.small': model('city-suburban', 'tree-small', 5),
  'decor.tree.large': model('city-suburban', 'tree-large', 8),
  'decor.tree.oak': model('nature', 'tree_oak', 7),
  'decor.building.a': model('city-commercial', 'low-detail-building-a', 10),
  'decor.building.b': model('city-commercial', 'low-detail-building-b', 10),
  'decor.building.c': model('city-commercial', 'low-detail-building-c', 10),
  'decor.building.d': model('city-commercial', 'low-detail-building-d', 10),
  'decor.building.e': model('city-commercial', 'low-detail-building-e', 10),
  'decor.building.h': model('city-commercial', 'low-detail-building-h', 10),
  'decor.building.k': model('city-commercial', 'low-detail-building-k', 10),
  'decor.building.n': model('city-commercial', 'low-detail-building-n', 10),
  'decor.house.a': model('city-suburban', 'building-type-a', 9),
  'decor.house.c': model('city-suburban', 'building-type-c', 9),
  'decor.house.h': model('city-suburban', 'building-type-h', 9),
  'decor.house.m': model('city-suburban', 'building-type-m', 9),
  'decor.fence.suburban': model('city-suburban', 'fence', 3),
  'decor.fence.low': model('city-suburban', 'fence-low', 3),
  'decor.fence.simple': model('nature', 'fence_simple', 2),
  'decor.fence.planks': model('nature', 'fence_planks', 2),
  'decor.pole': model('city-roads', 'electricity-pole', 9),
  'decor.pole.wide': model('city-roads', 'electricity-pole-wide', 9),
  'decor.pole.wires': model('city-roads', 'electricity-wires', 6),
  'decor.light.square': model('city-roads', 'light-square', 6),
  'decor.light.curved': model('city-roads', 'light-curved', 6),
  'decor.light.double': model('city-roads', 'light-square-double', 6),
  'decor.sign.warning': model('city-roads', 'road-sign-warning', 3),
  'decor.sign.highway': model('city-roads', 'sign-highway', 6),
  'decor.cliff.large': model('nature', 'cliff_large_rock', 40),
  'decor.cliff.plain': model('nature', 'cliff_rock', 40),
  'decor.cliff.half': model('nature', 'cliff_half_rock', 30),
  'decor.cliff.block': model('nature', 'cliff_block_rock', 30),
  'decor.cliff.top': model('nature', 'cliff_top_rock', 30),
  'decor.cliff.diagonal': model('nature', 'cliff_blockDiagonal_rock', 30),
  'decor.cliff.corner': model('nature', 'cliff_cornerLarge_rock', 40),
} as const satisfies Record<string, ModelEntry>;

export type ModelKey = keyof typeof MODEL_MANIFEST;

export const MODEL_KEYS = Object.keys(MODEL_MANIFEST) as ModelKey[];

export const MODELS_BASE_URL = '/models/';
