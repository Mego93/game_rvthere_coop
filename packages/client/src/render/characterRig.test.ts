import { CHARACTER_IDS, GLASSES_CHOICES, HAT_CHOICES, TOP_CHOICES, defaultAppearance, type Appearance } from '@lodgy/shared';
import * as THREE from 'three';
import { describe, expect, test, vi } from 'vitest';
import { CHARACTER_LOOKS } from './characterLooks';
import { applyLook } from './characterRig';

const textured = new THREE.MeshStandardMaterial();
textured.userData.shared = true;

// The model's node tree: arms and head hang off the torso, as in character-c.glb.
function fakeModel(): THREE.Group {
  const root = new THREE.Group();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const part = (name: string) => {
    const mesh = new THREE.Mesh(box, textured);
    mesh.name = name;
    return mesh;
  };
  const torso = part('torso');
  torso.add(part('arm-left'), part('arm-right'), part('head'));
  root.add(part('leg-left'), part('leg-right'), torso);
  return root;
}

const looks = (model: THREE.Object3D) => {
  const found: THREE.Mesh[] = [];
  model.traverse((node) => {
    if (node.name.startsWith('look-') && node instanceof THREE.Mesh) found.push(node);
  });
  return found;
};
const names = (model: THREE.Object3D) => looks(model).map((mesh) => mesh.name);
const colourOf = (model: THREE.Object3D, name: string) => ((model.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHexString();
const built = (appearance: Appearance) => {
  const model = fakeModel();
  applyLook(model, appearance);
  return model;
};

describe('applyLook', () => {
  test('legs take the trousers colour; torso and arms the top; the head keeps its texture', () => {
    for (const id of CHARACTER_IDS) {
      const model = built(defaultAppearance(id));
      const look = CHARACTER_LOOKS[id];
      expect('#' + colourOf(model, 'leg-left')).toBe(look.trousers);
      expect('#' + colourOf(model, 'leg-right')).toBe(look.trousers);
      for (const name of ['torso', 'arm-left', 'arm-right']) expect('#' + colourOf(model, name)).toBe(look.top);
      expect((model.getObjectByName('head') as THREE.Mesh).material).toBe(textured);
    }
  });

  test('sweatshirt is grey and suit charcoal, on torso and arms', () => {
    expect(colourOf(built({ ...defaultAppearance('luiz'), top: 'sweatshirt' }), 'torso')).toBe('8a8f98');
    const suit = built({ ...defaultAppearance('luiz'), top: 'suit' });
    for (const name of ['torso', 'arm-left', 'arm-right']) expect(colourOf(suit, name)).toBe('2b2f3a');
  });

  test('suit adds a white collar and a tie on the torso', () => {
    const suit = built({ ...defaultAppearance('sounile'), top: 'suit' });
    expect(suit.getObjectByName('look-collar')!.parent!.name).toBe('torso');
    expect(colourOf(suit, 'look-collar')).toBe('ffffff');
    expect(suit.getObjectByName('look-tie')!.parent!.name).toBe('torso');
    expect(names(built(defaultAppearance('sounile')))).not.toContain('look-collar');
  });

  test('the own outfit parts are not built under a sweatshirt or suit, hair and face parts stay', () => {
    const extra = ['look-drawstring', 'look-cuff'];
    for (const top of ['sweatshirt', 'suit'] as const) for (const id of CHARACTER_IDS) for (const name of extra) expect(names(built({ ...defaultAppearance(id), top }))).not.toContain(name);
    const own = { jacket: 'look-under', halfzip: 'look-zip', cardigan: 'look-trim', hoodie: 'look-hood', sweater: 'look-hem' } as const;
    for (const id of CHARACTER_IDS) {
      const outfit = CHARACTER_LOOKS[id].outfit;
      if (outfit === 'tee') continue;
      expect(names(built(defaultAppearance(id)))).toContain(own[outfit]);
      for (const top of ['sweatshirt', 'suit'] as const) {
        const result = names(built({ ...defaultAppearance(id), top }));
        expect(result).not.toContain(own[outfit]);
        if (CHARACTER_LOOKS[id].hair.style !== 'bald') expect(result).toContain('look-hair');
        if (CHARACTER_LOOKS[id].facial !== 'none') expect(result).toContain('look-facial');
      }
    }
  });

  test("luiz's hoodie shows a light rim and drawstrings at the front", () => {
    const model = built(defaultAppearance('luiz'));
    expect(model.getObjectByName('look-drawstring')!.parent!.name).toBe('torso');
    expect(colourOf(model, 'look-drawstring')).not.toBe(colourOf(model, 'torso'));
  });

  test("huu's tee has skin-coloured forearms on both arms, and no other outfit has cuffs", () => {
    const model = built(defaultAppearance('huu'));
    const cuffs = looks(model).filter((mesh) => mesh.name === 'look-cuff');
    expect(cuffs.map((mesh) => mesh.parent!.name).sort()).toEqual(['arm-left', 'arm-right']);
    for (const cuff of cuffs) expect((cuff.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('f6d1a5');
    for (const id of CHARACTER_IDS) if (id !== 'huu') expect(names(built(defaultAppearance(id)))).not.toContain('look-cuff');
  });

  test("rafael's jacket and the tee under it differ clearly in lightness", () => {
    const { top, under } = CHARACTER_LOOKS.rafael;
    const lightness = (hex: string) => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace).l;
    expect(lightness(top) - lightness(under!)).toBeGreaterThan(0.05);
  });

  test("nandan's wavy hair has more boxes than short hair, so it reads uneven", () => {
    const count = (id: 'nandan' | 'alexander') => (built(defaultAppearance(id)).getObjectByName('look-hair') as THREE.Mesh).geometry.getAttribute('position').count;
    expect(count('nandan')).toBeGreaterThan(count('alexander'));
  });

  test('glasses temples stay within the head width', () => {
    const mesh = built(defaultAppearance('rafael')).getObjectByName('look-glasses') as THREE.Mesh;
    mesh.geometry.computeBoundingBox();
    expect(mesh.geometry.boundingBox!.max.x).toBeLessThanOrEqual(4.1 + 1e-6);
  });

  test('hair hangs off the head in the look colour; bald has none', () => {
    expect(names(built(defaultAppearance('rafael')))).not.toContain('look-hair');
    for (const id of CHARACTER_IDS) {
      if (id === 'rafael') continue;
      const model = built(defaultAppearance(id));
      expect(model.getObjectByName('look-hair')!.parent!.name).toBe('head');
      expect('#' + colourOf(model, 'look-hair')).toBe(CHARACTER_LOOKS[id].hair.colour);
    }
  });

  test('facial hair shows for sounile and rafael only, in the hair colour', () => {
    for (const id of CHARACTER_IDS) {
      const model = built(defaultAppearance(id));
      expect(names(model).includes('look-facial')).toBe(id === 'sounile' || id === 'rafael');
      if (id === 'sounile') expect('#' + colourOf(model, 'look-facial')).toBe(CHARACTER_LOOKS[id].hair.colour);
    }
  });

  test('glasses: default follows the character, none removes, round adds', () => {
    for (const id of CHARACTER_IDS) {
      const base = defaultAppearance(id);
      expect(names(built(base)).includes('look-glasses')).toBe(id === 'rafael' || id === 'huu');
      expect(names(built({ ...base, glasses: 'none' }))).not.toContain('look-glasses');
      const round = built({ ...base, glasses: 'round' });
      expect(round.getObjectByName('look-glasses')!.parent!.name).toBe('head');
    }
  });

  test('hats exist only when chosen and sit on the head', () => {
    for (const hat of HAT_CHOICES) {
      const model = built({ ...defaultAppearance('luiz'), hat });
      expect(names(model).includes('look-hat')).toBe(hat !== 'none');
      if (hat !== 'none') expect(model.getObjectByName('look-hat')!.parent!.name).toBe('head');
    }
  });

  test('a hat is at most 2.5 head units tall', () => {
    for (const hat of ['cap', 'fez'] as const) {
      const mesh = built({ ...defaultAppearance('luiz'), hat }).getObjectByName('look-hat') as THREE.Mesh;
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox!;
      expect((box.max.y - box.min.y) * mesh.scale.y).toBeLessThanOrEqual(2.5 + 1e-6);
    }
  });

  test('nothing added reuses the name of an original node', () => {
    const original = ['torso', 'head', 'arm-left', 'arm-right', 'leg-left', 'leg-right', 'label'];
    for (const id of CHARACTER_IDS) for (const name of names(built({ ...defaultAppearance(id), top: 'suit', hat: 'fez', glasses: 'round' }))) expect(original).not.toContain(name);
  });

  test('a model without a head or arms is accepted', () => {
    const root = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), textured);
    torso.name = 'torso';
    root.add(torso);
    expect(() => applyLook(root, { ...defaultAppearance('rafael'), hat: 'fez', skin: 'default', eyes: 'default', smile: 'default' })).not.toThrow();
  });

  test('added meshes are bounded: defaults 4, any combination 8, across all six characters', () => {
    for (const id of CHARACTER_IDS) {
      expect(looks(built(defaultAppearance(id))).length).toBeLessThanOrEqual(4);
      for (const glasses of GLASSES_CHOICES) for (const top of TOP_CHOICES) for (const hat of HAT_CHOICES) {
        expect(looks(built({ characterId: id, glasses, top, hat, skin: 'default', eyes: 'default', smile: 'default' })).length).toBeLessThanOrEqual(8);
      }
    }
  });

  test('all added meshes use shared geometry and shared materials, and are flat shaded', () => {
    const model = built({ ...defaultAppearance('rafael'), top: 'suit', hat: 'fez', glasses: 'round' });
    for (const mesh of looks(model)) {
      expect(mesh.geometry.userData.shared).toBe(true);
      expect((mesh.material as THREE.Material).userData.shared).toBe(true);
      expect((mesh.material as THREE.MeshStandardMaterial).flatShading).toBe(true);
    }
    for (const name of ['leg-left', 'torso', 'arm-left']) expect(((model.getObjectByName(name) as THREE.Mesh).material as THREE.Material).userData.shared).toBe(true);
  });

  test('two figures with the same colours share the same materials', () => {
    const a = built(defaultAppearance('luiz'));
    const b = built(defaultAppearance('luiz'));
    expect((a.getObjectByName('torso') as THREE.Mesh).material).toBe((b.getObjectByName('torso') as THREE.Mesh).material);
    expect((a.getObjectByName('look-hair') as THREE.Mesh).material).toBe((b.getObjectByName('look-hair') as THREE.Mesh).material);
  });

  test('small parts (glasses, facial hair) cast no shadow; hair and hats do', () => {
    const model = built({ ...defaultAppearance('rafael'), hat: 'cap', skin: 'default', eyes: 'default', smile: 'default' });
    expect((model.getObjectByName('look-glasses') as THREE.Mesh).castShadow).toBe(false);
    expect((model.getObjectByName('look-facial') as THREE.Mesh).castShadow).toBe(false);
    expect((model.getObjectByName('look-hat') as THREE.Mesh).castShadow).toBe(true);
    expect((built(defaultAppearance('luiz')).getObjectByName('look-hair') as THREE.Mesh).castShadow).toBe(true);
  });

  test('applying never disposes anything', () => {
    const spy = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    built({ ...defaultAppearance('alexander'), top: 'suit', hat: 'cap', glasses: 'round' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
