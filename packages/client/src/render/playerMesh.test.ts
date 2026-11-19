import { CHARACTER_IDS, CHARACTER_SCALE, PLAYER_HEIGHT, PLAYER_RADIUS, defaultAppearance, type PlayerSnapshot } from '@lodgy/shared';
import * as THREE from 'three';
import { beforeAll, expect, test, vi } from 'vitest';
import { CHARACTER_LOOKS } from './characterLooks';
import { HEAD_RADIUS, NAME_TAG_OFFSET, createPlayerMesh, disposePlayerMesh, placePlayerMesh, playEmote, setNameVisible } from './playerMesh';

const shared = { geometry: new THREE.BoxGeometry(1, 1, 1), material: new THREE.MeshStandardMaterial() };
shared.geometry.userData.shared = true;
shared.material.userData.shared = true;

// A clip that rotates the right arm, for the tests of an emote over a clipped node.
const clipped = { arm: false };
const ARM_CLIP = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0, 0));

vi.mock('./models', () => ({
  hasModel: () => true,
  animationsOf: () => [
    new THREE.AnimationClip('idle', 1, [
      new THREE.NumberKeyframeTrack('leg-left.position[y]', [0, 1], [0, 0]),
      ...(clipped.arm ? [new THREE.QuaternionKeyframeTrack('arm-right.quaternion', [0, 1], [...ARM_CLIP.toArray(), ...ARM_CLIP.toArray()])] : []),
    ]),
    new THREE.AnimationClip('walk', 1, [new THREE.NumberKeyframeTrack('leg-left.rotation[x]', [0, 0.5, 1], [-1, 1, -1])]),
  ],
  instantiate: (key: string) => {
    const root = new THREE.Group();
    // The handgun is one plain mesh, so its parts are not mistaken for the character's nodes.
    if (key !== 'character.player') return root.add(new THREE.Mesh(shared.geometry, shared.material));
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

const emoting = (x = 0, z = 0, extra: Record<string, unknown> = {}) => ({ pos: { x, y: 0, z }, yaw: 0, downed: null, seat: null, ...extra }) as unknown as PlayerSnapshot;
const armAngle = (mesh: THREE.Group, name: string) => new THREE.Euler().setFromQuaternion(mesh.getObjectByName(name)!.quaternion);

test('E1: an emote turns its nodes to the pose, ramping in over 0.2 s, and the mesh frame is restored afterwards', () => {
  const mesh = createPlayerMesh('Amal', '#e0a030');
  placePlayerMesh(mesh, emoting(), 0.016, 10);
  playEmote(mesh, 'wave', 10);
  placePlayerMesh(mesh, emoting(), 0.016, 10.1);
  const half = Math.abs(armAngle(mesh, 'arm-right').z);
  expect(half).toBeGreaterThan(0.5);
  expect(half).toBeLessThan(2.6);
  placePlayerMesh(mesh, emoting(), 0.016, 11);
  expect(armAngle(mesh, 'arm-right').z).toBeCloseTo(-2.6, 3);
  expect(armAngle(mesh, 'arm-left').z).toBeCloseTo(0, 6);
  placePlayerMesh(mesh, emoting(), 0.016, 12.6);
  expect(armAngle(mesh, 'arm-right').z).toBeCloseTo(0, 6);
});

test('E2: moving more than 1 m cancels the emote at once, and a smaller step does not', () => {
  const mesh = createPlayerMesh('Amal', '#e0a030');
  placePlayerMesh(mesh, emoting(), 0.016, 10);
  playEmote(mesh, 'wave', 10);
  placePlayerMesh(mesh, emoting(0.5, 0), 0.016, 11);
  expect(Math.abs(armAngle(mesh, 'arm-right').z)).toBeGreaterThan(2);
  placePlayerMesh(mesh, emoting(1.2, 0), 0.016, 11.1);
  expect(armAngle(mesh, 'arm-right').z).toBeCloseTo(0, 6);
  placePlayerMesh(mesh, emoting(1.2, 0), 0.016, 11.2);
  expect(armAngle(mesh, 'arm-right').z).toBeCloseTo(0, 6);
});

test('E3: boarding or going down cancels the emote', () => {
  for (const extra of [{ seat: 'driver' }, { downed: 5 }]) {
    const mesh = createPlayerMesh('Amal', '#e0a030');
    placePlayerMesh(mesh, emoting(), 0.016, 10);
    playEmote(mesh, 'dab', 10);
    placePlayerMesh(mesh, emoting(0, 0), 0.016, 11);
    expect(Math.abs(armAngle(mesh, 'arm-right').z)).toBeGreaterThan(2);
    placePlayerMesh(mesh, emoting(0, 0, extra), 0.016, 11.1);
    expect(armAngle(mesh, 'arm-right').z).toBeCloseTo(0, 6);
  }
});

test('E4: a second emote replaces the first and only its own nodes move', () => {
  const mesh = createPlayerMesh('Amal', '#e0a030');
  placePlayerMesh(mesh, emoting(), 0.016, 10);
  playEmote(mesh, 'dab', 10);
  placePlayerMesh(mesh, emoting(), 0.016, 11);
  expect(Math.abs(armAngle(mesh, 'head').y)).toBeGreaterThan(0.3);
  playEmote(mesh, 'wave', 11);
  placePlayerMesh(mesh, emoting(), 0.016, 12);
  expect(armAngle(mesh, 'head').y).toBeCloseTo(0, 6);
  expect(armAngle(mesh, 'arm-left').x).toBeCloseTo(0, 6);
});

test('E5: over a node the clip rotates, the arm returns to the clip value after the emote expires, is cancelled, or the mixer stands still', () => {
  clipped.arm = true;
  try {
    for (const seconds of [0.05, 0]) {
      for (const how of ['expire', 'move'] as const) {
        const mesh = createPlayerMesh('Amal', '#e0a030');
        placePlayerMesh(mesh, emoting(), 0.1, 10);
        expect(armAngle(mesh, 'arm-right').x).toBeCloseTo(0.3, 5);
        playEmote(mesh, 'wave', 10);
        placePlayerMesh(mesh, emoting(), seconds, 11);
        expect(armAngle(mesh, 'arm-right').z).toBeCloseTo(-2.6, 3);
        placePlayerMesh(mesh, emoting(), seconds, 11.5);
        placePlayerMesh(mesh, how === 'expire' ? emoting() : emoting(2, 0), seconds, how === 'expire' ? 12.6 : 12);
        expect(armAngle(mesh, 'arm-right').x).toBeCloseTo(0.3, 5);
        expect(armAngle(mesh, 'arm-right').z).toBeCloseTo(0, 5);
        placePlayerMesh(mesh, emoting(), seconds, 13);
        expect(armAngle(mesh, 'arm-right').x).toBeCloseTo(0.3, 5);
      }
    }
  } finally {
    clipped.arm = false;
  }
});

test('E6: a clip value that changes during the emote becomes the new base the ramp returns to', () => {
  clipped.arm = true;
  try {
    const mesh = createPlayerMesh('Amal', '#e0a030');
    placePlayerMesh(mesh, emoting(), 0.1, 10);
    playEmote(mesh, 'wave', 10);
    const arm = mesh.getObjectByName('arm-right')!;
    placePlayerMesh(mesh, emoting(), 0.05, 10.05);
    arm.quaternion.setFromEuler(new THREE.Euler(0.8, 0, 0));
    placePlayerMesh(mesh, emoting(), 0, 10.06);
    arm.quaternion.setFromEuler(new THREE.Euler(0.8, 0, 0));
    placePlayerMesh(mesh, emoting(), 0, 13);
    expect(armAngle(mesh, 'arm-right').x).toBeCloseTo(0.8, 5);
  } finally {
    clipped.arm = false;
  }
});


const armed = (over: Partial<PlayerSnapshot> = {}) => ({ pos: { x: 0, y: 0, z: 0 }, yaw: 0, downed: null, seat: null, hands: null, gun: true, ammo: 12, ...over }) as unknown as PlayerSnapshot;
const heldGun = (mesh: THREE.Group) => mesh.getObjectByName('held-gun')!;

test('step 39: the handgun is in the right hand and shows only on foot with a gun, free-handed and not downed', () => {
  const mesh = createPlayerMesh('Amal', '#e0a030');
  expect(heldGun(mesh).parent).toBe(mesh.getObjectByName('arm-right'));
  expect(heldGun(mesh).visible).toBe(false);
  placePlayerMesh(mesh, armed(), 0.05);
  expect(heldGun(mesh).visible).toBe(true);
  for (const over of [{ gun: undefined }, { seat: 'driver' }, { downed: 5 }, { hands: 'crate-1' }] as Partial<PlayerSnapshot>[]) {
    placePlayerMesh(mesh, armed(), 0.05);
    placePlayerMesh(mesh, armed(over), 0.05);
    expect(heldGun(mesh).visible, JSON.stringify(over)).toBe(false);
  }
  placePlayerMesh(mesh, armed({ hands: 'hook' }), 0.05);
  expect(heldGun(mesh).visible).toBe(true);
});

test('step 39: the arm holding the gun is raised forward (pointing along +z of its own frame), and goes back to the clip when the gun is put away', () => {
  clipped.arm = true;
  const mesh = createPlayerMesh('Amal', '#e0a030');
  const arm = mesh.getObjectByName('arm-right')!;
  placePlayerMesh(mesh, armed(), 0.05);
  const down = new THREE.Vector3(0, -1, 0).applyQuaternion(arm.quaternion);
  expect(down.z).toBeGreaterThan(0.9);
  placePlayerMesh(mesh, armed({ seat: 'driver' }), 0.05);
  expect(new THREE.Vector3(0, -1, 0).applyQuaternion(arm.quaternion).z).toBeLessThan(0.5);
  clipped.arm = false;
});
