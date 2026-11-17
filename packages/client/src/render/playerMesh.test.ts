import { CHARACTER_IDS, CHARACTER_SCALE, PLAYER_HEIGHT, PLAYER_RADIUS, defaultAppearance, type PlayerSnapshot } from '@lodgy/shared';
import * as THREE from 'three';
import { beforeAll, expect, test, vi } from 'vitest';
import { CHARACTER_LOOKS } from './characterLooks';
import { HEAD_RADIUS, NAME_TAG_OFFSET, createPlayerMesh, disposePlayerMesh, placePlayerMesh, setNameVisible } from './playerMesh';

const shared = { geometry: new THREE.BoxGeometry(1, 1, 1), material: new THREE.MeshStandardMaterial() };
shared.geometry.userData.shared = true;
shared.material.userData.shared = true;

vi.mock('./models', () => ({
  hasModel: () => true,
  animationsOf: () => [
    new THREE.AnimationClip('idle', 1, [new THREE.NumberKeyframeTrack('leg-left.position[y]', [0, 1], [0, 0])]),
    new THREE.AnimationClip('walk', 1, [new THREE.NumberKeyframeTrack('leg-left.rotation[x]', [0, 0.5, 1], [-1, 1, -1])]),
  ],
  instantiate: () => {
    const root = new THREE.Group();
    for (const name of ['torso', 'arm-left', 'arm-right', 'leg-left', 'head']) {
      const mesh = new THREE.Mesh(shared.geometry, shared.material);
      mesh.name = name;
      root.add(mesh);
    }
    return root;
  },
  shadowed: (root: THREE.Object3D) => {
    root.traverse((node) => {
      node.castShadow = true;
    });
    return root;
  },
}));

beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => null, width: 0, height: 0 }) });
});

const at = (x: number, z: number) => ({ pos: { x, y: 0, z }, yaw: 0, downed: null }) as unknown as PlayerSnapshot;
const leg = (mesh: THREE.Group) => mesh.getObjectByName('leg-left')!;

test('M4: the shirt and sleeves take the player colour; the rest keeps the shared material', () => {
  const mesh = createPlayerMesh('Amal', '#e0a030');
  expect((mesh.getObjectByName('torso') as THREE.Mesh).material).not.toBe(shared.material);
  expect(((mesh.getObjectByName('arm-left') as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHexString()).toBe('e0a030');
  expect((leg(mesh) as THREE.Mesh).material).toBe(shared.material);
});

test('M4: a player standing stays idle and one that moves plays the walk', () => {
  const still = createPlayerMesh('A', '#e0a030');
  const mover = createPlayerMesh('B', '#e0a030');
  for (let i = 0; i < 20; i++) {
    placePlayerMesh(still, at(0, 0), 0.05);
    placePlayerMesh(mover, at(0, -i * 0.2), 0.05);
  }
  expect(Math.abs(leg(still).rotation.x)).toBeLessThan(1e-6);
  expect(Math.abs(leg(mover).rotation.x)).toBeGreaterThan(0.01);
});

test('U2: the name label can be hidden', () => {
  const mesh = createPlayerMesh('Amal', '#e0a030');
  expect(mesh.getObjectByName('label')!.visible).toBe(true);
  setNameVisible(mesh, false);
  expect(mesh.getObjectByName('label')!.visible).toBe(false);
});

test('A3: disposing a player leaves the shared geometry and material alone', () => {
  const mesh = createPlayerMesh('Amal', '#e0a030');
  const geometry = vi.spyOn(shared.geometry, 'dispose');
  const material = vi.spyOn(shared.material, 'dispose');
  disposePlayerMesh(mesh);
  expect(geometry).not.toHaveBeenCalled();
  expect(material).not.toHaveBeenCalled();
});

const stanced = (stance?: 'crouch' | 'slide') => ({ pos: { x: 0, y: 0, z: 0 }, yaw: 0, downed: null, ...(stance ? { stance } : {}) }) as unknown as PlayerSnapshot;

test('M9: a crouched player is drawn 0.6 as tall and a slider is tilted back 25 degrees', () => {
  const mesh = createPlayerMesh('Amal', '#e0a030');
  placePlayerMesh(mesh, stanced(), 0);
  expect(mesh.getObjectByName('torso')!.parent!.scale.y).toBe(1);
  placePlayerMesh(mesh, stanced('crouch'), 0);
  const body = mesh.children.find((child) => child.name !== 'label')!;
  expect(body.scale.y).toBeCloseTo(0.6, 9);
  expect(mesh.rotation.x).toBe(0);
  placePlayerMesh(mesh, stanced('slide'), 0);
  expect(body.scale.y).toBeCloseTo(0.6, 9);
  expect(mesh.rotation.x).toBeCloseTo((25 * Math.PI) / 180, 9);
});

test('M9: the stance change eases over about 0.1 s and the name label keeps its size', () => {
  const mesh = createPlayerMesh('Amal', '#e0a030');
  const label = mesh.getObjectByName('label')!;
  const labelScale = label.scale.y;
  placePlayerMesh(mesh, stanced(), 0);
  const body = mesh.children.find((child) => child.name !== 'label')!;
  placePlayerMesh(mesh, stanced('crouch'), 0.016);
  expect(body.scale.y).toBeLessThan(1);
  expect(body.scale.y).toBeGreaterThan(0.6);
  for (let i = 0; i < 30; i++) placePlayerMesh(mesh, stanced('crouch'), 0.016);
  expect(body.scale.y).toBeCloseTo(0.6, 2);
  expect(label.scale.y).toBe(labelScale);
  expect(label.position.y).toBeLessThan(PLAYER_HEIGHT + NAME_TAG_OFFSET);
  for (let i = 0; i < 80; i++) placePlayerMesh(mesh, stanced(), 0.016);
  expect(body.scale.y).toBeCloseTo(1, 2);
  expect(label.position.y).toBeCloseTo(PLAYER_HEIGHT + NAME_TAG_OFFSET, 2);
});

test('M9: a downed player is not also crouch-scaled', () => {
  const mesh = createPlayerMesh('Amal', '#e0a030');
  placePlayerMesh(mesh, { ...stanced('crouch'), downed: 5 } as unknown as PlayerSnapshot, 0);
  expect(mesh.rotation.x).toBeCloseTo(Math.PI / 2, 9);
});

test('T9: the name tag sits above the head at the scaled offset and the label keeps its size', () => {
  expect(NAME_TAG_OFFSET).toBeCloseTo(0.3 * CHARACTER_SCALE, 9);
  const mesh = createPlayerMesh('Amal', '#e0a030');
  const label = mesh.getObjectByName('label')!;
  expect(label.position.y).toBeGreaterThan(PLAYER_HEIGHT);
  expect(label.position.y).toBeCloseTo(PLAYER_HEIGHT + NAME_TAG_OFFSET, 9);
  expect(label.scale.x).toBe(1);
  expect(label.scale.y).toBe(0.25);
});

test('the fallback body scales with the character and stays positive', () => {
  expect(HEAD_RADIUS).toBeCloseTo(0.2 * CHARACTER_SCALE, 9);
  expect(PLAYER_HEIGHT - 2 * HEAD_RADIUS - 2 * PLAYER_RADIUS).toBeGreaterThan(0);
});

const shirtOf = (mesh: THREE.Group, name: string) => ((mesh.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHexString();

test('S31: with an appearance the figure wears the character look and the player colour no longer tints the shirt', () => {
  const look = CHARACTER_LOOKS.luiz;
  const mesh = createPlayerMesh('Amal', '#e0a030', defaultAppearance('luiz'));
  expect('#' + shirtOf(mesh, 'torso')).toBe(look.top);
  expect('#' + shirtOf(mesh, 'leg-left')).toBe(look.trousers);
  expect(mesh.getObjectByName('look-hair')).toBeDefined();
  expect(mesh.getObjectByName('label')).toBeDefined();
});

test('S31: without an appearance nothing is added to the figure', () => {
  const mesh = createPlayerMesh('Amal', '#e0a030');
  expect(mesh.getObjectByName('look-hair')).toBeUndefined();
  expect(shirtOf(mesh, 'torso')).toBe('e0a030');
});

test('S31: disposing one figure leaves the shared look materials and geometry of another live', () => {
  const a = createPlayerMesh('A', '#e0a030', { ...defaultAppearance('rafael'), top: 'suit', hat: 'fez', skin: 'default', eyes: 'default', smile: 'default' });
  const b = createPlayerMesh('B', '#30a0e0', { ...defaultAppearance('rafael'), top: 'suit', hat: 'fez', skin: 'default', eyes: 'default', smile: 'default' });
  const spies: Array<ReturnType<typeof vi.spyOn>> = [];
  b.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    spies.push(vi.spyOn(node.geometry, 'dispose'), vi.spyOn(node.material as THREE.Material, 'dispose'));
  });
  expect(spies.length).toBeGreaterThan(6);
  disposePlayerMesh(a);
  for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  expect((a.getObjectByName('look-hat') as THREE.Mesh).material).toBe((b.getObjectByName('look-hat') as THREE.Mesh).material);
});

test('S31: every character with every add-on stays within the mesh cap (10 added, 6 by default)', () => {
  const added = (mesh: THREE.Group) => {
    let count = 0;
    mesh.traverse((node) => {
      if (node instanceof THREE.Mesh && node.name.startsWith('look-')) count++;
    });
    return count;
  };
  for (const id of CHARACTER_IDS) {
    expect(added(createPlayerMesh('A', '#e0a030', defaultAppearance(id)))).toBeLessThanOrEqual(6);
    expect(added(createPlayerMesh('A', '#e0a030', { characterId: id, glasses: 'round', top: 'suit', hat: 'fez', skin: 'default', eyes: 'default', smile: 'default' }))).toBeLessThanOrEqual(10);
    expect(added(createPlayerMesh('A', '#e0a030', { characterId: id, glasses: 'round', top: 'default', hat: 'cap', skin: 'default', eyes: 'default', smile: 'default' }))).toBeLessThanOrEqual(10);
  }
});

test('S31: the look goes on after shadowed, so glasses and facial hair keep castShadow false', () => {
  const mesh = createPlayerMesh('Amal', '#e0a030', defaultAppearance('rafael'));
  expect((mesh.getObjectByName('look-glasses') as THREE.Mesh).castShadow).toBe(false);
  expect((mesh.getObjectByName('look-facial') as THREE.Mesh).castShadow).toBe(false);
  expect((mesh.getObjectByName('torso') as THREE.Mesh).castShadow).toBe(true);
});
