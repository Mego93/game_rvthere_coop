import type { Box, BuiltCourse } from '@lodgy/shared';
import * as THREE from 'three';
import { DECK_TOP, BACKDROPS, BACKDROP_SINK, FLAGS, FOUNTAIN, GARAGE_BAND, GARAGE_PARTS, PARAPET_COLOUR, PODIUM_COLOUR, RENTAL_SIGN, buildingOf, coverPieces, garageFit, landmarkAvoids, officeContainers, palmAvenue, terminalPieces, type CoverKind } from './arrivalLayout';
import { PROP_BUDGET, dressMap, groundYAt } from './dressMap';
import { mergeBoxes, toGeometry } from './groundMerge';
import type { SceneOptions } from './groundTextures';
import { MODEL_MANIFEST } from './modelManifest';
import { fitted, hasModel, instantiate, shadowed, type FitSize } from './models';
import { createPropLayer, type PropLayer } from './propLayer';
import { textSignTexture } from './signTexture';

export interface ArrivalScene {
  group: THREE.Group;
  // Each frame: hides the dressing beyond the draw distance of the camera.
  update(camera: { x: number; z: number }): void;
  props: PropLayer | null;
}

export const ARRIVAL_SEED = 4301;

const solid = (colour: number, roughness = 0.9) => new THREE.MeshStandardMaterial({ color: colour, roughness, metalness: 0 });

const HALL_WALL = 0xdadfe3;
const FENCE = 0x4f5a63;
const SIGN_RED = '#b8322a';

// A model of the manifest fitted to a box and set on the ground at x, y, z; null when it did not load.
function modelAt(key: keyof typeof MODEL_MANIFEST, x: number, y: number, z: number, size: FitSize, yaw = 0): THREE.Group | null {
  if (!hasModel(key)) return null;
  const model = instantiate(key);
  if (!model) return null;
  const root = fitted(model, size, yaw);
  root.position.set(x, y, z);
  return shadowed(root);
}

// The materials of a model copied with clipping planes: the copies are this scene's own, the originals stay as they are.
function clippedTo<T extends THREE.Object3D>(root: T, planes: THREE.Plane[]): T {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const clip = (material: THREE.Material) => {
      const copy = material.clone();
      copy.clippingPlanes = planes;
      copy.clipShadows = true;
      copy.userData = { ...copy.userData, shared: false };
      return copy;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clip) : clip(mesh.material);
  });
  return root;
}

function wallMesh(boxes: readonly Box[], colour: number): THREE.Mesh | null {
  const merged = mergeBoxes(boxes, undefined, true);
  if (!merged) return null;
  const mesh = new THREE.Mesh(toGeometry(merged), solid(colour));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const COVER_FIT: Record<CoverKind, { key: keyof typeof MODEL_MANIFEST; yaw: number }> = {
  planter: { key: 'airport.planterUrn', yaw: 0 },
  desk: { key: 'airport.guardBooth', yaw: 0 },
  taxi: { key: 'airport.taxi', yaw: Math.PI / 2 },
  sedan: { key: 'airport.carSedan', yaw: Math.PI / 2 },
  hatch: { key: 'airport.carHatch', yaw: -Math.PI / 2 },
  minibus: { key: 'airport.minibus', yaw: -Math.PI / 2 },
};

// The airport district the friends arrive at, drawn over the shared course's boxes: the plain walls inside, the terminal, the car park and the rental office as models, a real model on every cover box, the fountain, flags and palms by hand, and the rest dressed by the rules of dressMap. Purely visual; the shared course owns every collision.
export function createArrivalScene(course: BuiltCourse, options: SceneOptions = {}): ArrivalScene {
  const group = new THREE.Group();
  const phone = options.lite === true || options.flat === true;
  const shadows = !phone;

  // Plain walls: every wall box that no model stands on. The tall ones are the hall's and the boundary, the low ones the lane's pen and the deck's parapet.
  const covered = new Set<Box>(coverPieces(course).map((p) => p.box));
  const office = buildingOf('rentalOffice');
  const isOffice = (box: Box) => box.center.x === office.center.x && box.center.z === office.center.z;
  const plain = course.walls.filter((box) => !covered.has(box) && !isOffice(box));
  const onDeck = (box: Box) => box.center.y - box.halfExtents.y > 1;
  const hall = wallMesh(plain.filter((box) => box.halfExtents.y > 1), HALL_WALL);
  const parapets = wallMesh(plain.filter((box) => box.halfExtents.y <= 1 && onDeck(box)), PARAPET_COLOUR);
  const fences = wallMesh(plain.filter((box) => box.halfExtents.y <= 1 && !onDeck(box)), FENCE);
  for (const mesh of [hall, parapets, fences]) if (mesh) group.add(mesh);

  // The terminal: five tiles of the model's body along it, each cut to the stretches of the front wall between the exits (clipping planes; they need the renderer's local clipping on), so the three exits stay open.
  if (hasModel('arrival.terminal')) {
    for (const piece of terminalPieces(course)) {
      const model = instantiate('arrival.terminal');
      if (!model) break;
      const root = new THREE.Group();
      root.add(model);
      root.scale.set(piece.scale.x, piece.scale.y, piece.scale.z);
      root.position.set(piece.position.x, piece.position.y, piece.position.z);
      shadowed(root);
      group.add(clippedTo(root, [new THREE.Plane(new THREE.Vector3(1, 0, 0), -piece.from), new THREE.Plane(new THREE.Vector3(-1, 0, 0), piece.to)]));
    }
  }

  // The car park: the garage model, its second-floor slab the deck, cut to the band from just under the deck to the parapet.
  const park = buildingOf('carPark');
  if (hasModel('airport.garage')) {
    const probe = instantiate('airport.garage')!;
    const { scaleY, offsetY } = garageFit();
    const height = new THREE.Box3().setFromObject(probe).getSize(new THREE.Vector3()).y;
    const garage = modelAt('airport.garage', park.center.x, offsetY, park.center.z, { x: park.size.x, y: height * scaleY, z: park.size.z });
    if (garage) {
      garage.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh && !GARAGE_PARTS.includes(mesh.name)) mesh.visible = false;
      });
      group.add(clippedTo(garage, [new THREE.Plane(new THREE.Vector3(0, 1, 0), -GARAGE_BAND.from), new THREE.Plane(new THREE.Vector3(0, -1, 0), GARAGE_BAND.to)]));
    }
  }
  // The deck's sides as a podium of light concrete.
  const podium = new THREE.Mesh(new THREE.BoxGeometry(park.size.x + 0.04, DECK_TOP - 0.04, park.size.z + 0.04), solid(PODIUM_COLOUR));
  podium.position.set(park.center.x, (DECK_TOP - 0.04) / 2 - 0.02, park.center.z);
  podium.receiveShadow = true;
  podium.castShadow = true;
  group.add(podium);

  // The rental office: shipping containers over its box, and the sign facing the stop.
  for (const c of officeContainers()) {
    const container = modelAt('airport.rentalOffice', c.x, c.y, c.z, c.size);
    if (container) group.add(container);
  }
  const sign = textSignTexture(RENTAL_SIGN.text, { width: 1024, height: 190, background: SIGN_RED, foreground: '#ffffff', border: '#ffffff' });
  if (sign) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(RENTAL_SIGN.width, RENTAL_SIGN.height), new THREE.MeshBasicMaterial({ map: sign, toneMapped: false }));
    plane.position.set(office.center.x, RENTAL_SIGN.y, office.center.z + office.size.z / 2 + 0.08);
    group.add(plane);
  }

  // A real model on every cover box, matched by size: three urns along a planter, two booths along a desk, one vehicle on each car box.
  for (const { kind, box } of coverPieces(course)) {
    const { key, yaw } = COVER_FIT[kind];
    const base = box.center.y - box.halfExtents.y;
    const w = box.halfExtents.x * 2;
    const h = box.halfExtents.y * 2;
    const d = box.halfExtents.z * 2;
    const parts = kind === 'planter' ? 3 : kind === 'desk' ? 2 : 1;
    for (let i = 0; i < parts; i++) {
      const x = box.center.x - w / 2 + ((i + 0.5) * w) / parts;
      const model = modelAt(key, x, base, box.center.z, { x: w / parts, y: h, z: d }, yaw);
      if (model) group.add(model);
    }
  }

  // The landmarks by hand: the fountain on the forecourt, flags at the exit and the stop, the palm avenue.
  const fountain = modelAt('airport.fountain', FOUNTAIN.x, groundYAt(course, FOUNTAIN.x, FOUNTAIN.z) ?? 0, FOUNTAIN.z, {});
  if (fountain) group.add(fountain);
  for (const f of FLAGS) {
    const flag = modelAt('airport.flagPole', f.x, groundYAt(course, f.x, f.z) ?? 0, f.z, {});
    if (flag) group.add(flag);
  }
  const palms = ['airport.palmTall', 'airport.palmSlim', 'airport.palmPair'] as const;
  palmAvenue(course).forEach((p, i) => {
    const palm = modelAt(palms[i % palms.length]!, p.x, groundYAt(course, p.x, p.z) ?? 0, p.z, {}, i * 2.1);
    if (palm) group.add(palm);
  });

  // A skyline beyond the boundary walls.
  for (const b of BACKDROPS) {
    const backdrop = modelAt(b.key, b.x, -BACKDROP_SINK, b.z, b.size);
    if (backdrop) group.add(backdrop);
  }

  // The rest: clutter, roadside props, wall signs and the crowd, dressed by the rules.
  const budget = phone ? PROP_BUDGET.phone : PROP_BUDGET.desktop;
  const placements = dressMap(course, 'airport', ARRIVAL_SEED, { phone, avoid: landmarkAvoids(course) });
  const props = createPropLayer(group, placements, MODEL_MANIFEST, { drawDistance: budget.drawDistance, shadows });
  return { group, props, update: (camera) => props.update(camera) };
}
