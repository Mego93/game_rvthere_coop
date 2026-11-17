import { CHARACTER_IDS, EYES_CHOICES, GLASSES_CHOICES, HAT_CHOICES, SKIN_CHOICES, SMILE_CHOICES, TOP_CHOICES, defaultAppearance, type Appearance } from '@lodgy/shared';
import * as THREE from 'three';
import { describe, expect, test, vi } from 'vitest';
import { CHARACTER_LOOKS, SKIN_TONES } from './characterLooks';
import { BEARD_BOXES, MOUSTACHE_BOX, applyLook } from './characterRig';

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
  test('legs take the trousers colour; torso and arms the top; the head is a flat skin colour', () => {
    for (const id of CHARACTER_IDS) {
      const model = built(defaultAppearance(id));
      const look = CHARACTER_LOOKS[id];
      expect('#' + colourOf(model, 'leg-left')).toBe(look.trousers);
      expect('#' + colourOf(model, 'leg-right')).toBe(look.trousers);
      for (const name of ['torso', 'arm-left', 'arm-right']) expect('#' + colourOf(model, name)).toBe(look.top);
      expect('#' + colourOf(model, 'head')).toBe(SKIN_TONES.default);
      expect((model.getObjectByName('head') as THREE.Mesh).material).not.toBe(textured);
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
    for (const skin of SKIN_CHOICES) for (const cuff of looks(built({ ...defaultAppearance('huu'), skin })).filter((mesh) => mesh.name === 'look-cuff')) expect('#' + (cuff.material as THREE.MeshStandardMaterial).color.getHexString()).toBe(SKIN_TONES[skin]);
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

  test('added meshes are bounded: defaults 6, any combination 10, across all six characters', () => {
    let most = 0;
    for (const id of CHARACTER_IDS) {
      expect(looks(built(defaultAppearance(id))).length).toBeLessThanOrEqual(6);
      for (const glasses of GLASSES_CHOICES) for (const top of TOP_CHOICES) for (const hat of HAT_CHOICES) for (const [skin, eyes, smile] of [['default', 'default', 'default'], ['dark', 'happy', 'grin']] as const) {
        const count = looks(built({ characterId: id, glasses, top, hat, skin, eyes, smile })).length;
        expect(count).toBeLessThanOrEqual(10);
        most = Math.max(most, count);
      }
    }
    expect(most).toBeLessThanOrEqual(10);
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

  test('the skin tones are the four from the spec and recolour the head', () => {
    expect(SKIN_TONES).toEqual({ default: '#f6d1a5', tan: '#d9a877', brown: '#a56b43', dark: '#6b4429' });
    for (const skin of SKIN_CHOICES) expect('#' + colourOf(built({ ...defaultAppearance('luiz'), skin }), 'head')).toBe(SKIN_TONES[skin]);
  });

  test('every character gets one merged eyes mesh and one merged mouth mesh on the head, casting no shadow', () => {
    for (const id of CHARACTER_IDS) {
      const model = built(defaultAppearance(id));
      for (const name of ['look-eyes', 'look-mouth']) {
        expect(names(model).filter((n) => n === name)).toHaveLength(1);
        const mesh = model.getObjectByName(name) as THREE.Mesh;
        expect(mesh.parent!.name).toBe('head');
        expect(mesh.castShadow).toBe(false);
        expect(mesh.geometry.userData.shared).toBe(true);
        expect(mesh.geometry.getAttribute('color')).toBeDefined();
      }
    }
  });

  const boundsOf = (model: THREE.Object3D, name: string) => {
    const geometry = (model.getObjectByName(name) as THREE.Mesh).geometry;
    geometry.computeBoundingBox();
    return geometry.boundingBox!;
  };
  const hasWhite = (model: THREE.Object3D, name: string) => {
    const colour = (model.getObjectByName(name) as THREE.Mesh).geometry.getAttribute('color');
    for (let i = 0; i < colour.count; i++) if (colour.getX(i) > 0.99 && colour.getY(i) > 0.99 && colour.getZ(i) > 0.99) return true;
    return false;
  };

  test('eyes and mouth stay on the +Z face of the head, inside its width and height', () => {
    for (const eyes of EYES_CHOICES) for (const smile of SMILE_CHOICES) {
      const model = built({ ...defaultAppearance('luiz'), eyes, smile });
      for (const name of ['look-eyes', 'look-mouth']) {
        const box = boundsOf(model, name);
        expect(box.min.x).toBeGreaterThanOrEqual(-4);
        expect(box.max.x).toBeLessThanOrEqual(4);
        expect(box.min.y).toBeGreaterThanOrEqual(0);
        expect(box.max.y).toBeLessThanOrEqual(8);
        expect(box.min.z).toBeGreaterThanOrEqual(3.9);
        expect(box.max.z).toBeLessThanOrEqual(4.5);
      }
    }
  });

  test('the four eye styles differ: sleepy sits lower and thinner, wide has a white part, happy is stepped', () => {
    const eyes = (style: (typeof EYES_CHOICES)[number]) => built({ ...defaultAppearance('luiz'), eyes: style });
    const base = boundsOf(eyes('default'), 'look-eyes');
    expect(boundsOf(eyes('sleepy'), 'look-eyes').max.y).toBeLessThan(base.max.y);
    expect(boundsOf(eyes('sleepy'), 'look-eyes').getSize(new THREE.Vector3()).y).toBeLessThan(base.getSize(new THREE.Vector3()).y);
    expect(boundsOf(eyes('wide'), 'look-eyes').getSize(new THREE.Vector3()).y).toBeGreaterThan(base.getSize(new THREE.Vector3()).y);
    expect(hasWhite(eyes('wide'), 'look-eyes')).toBe(true);
    expect(hasWhite(eyes('default'), 'look-eyes')).toBe(false);
    const count = (style: (typeof EYES_CHOICES)[number]) => (eyes(style).getObjectByName('look-eyes') as THREE.Mesh).geometry.getAttribute('position').count;
    expect(count('happy')).toBeGreaterThan(count('default'));
    for (const style of EYES_CHOICES) expect(boundsOf(eyes(style), 'look-eyes').min.x).toBeLessThan(-1);
  });

  test('the three smiles differ: grin is wider with a white teeth strip, neutral is flat', () => {
    const mouth = (style: (typeof SMILE_CHOICES)[number]) => built({ ...defaultAppearance('luiz'), smile: style });
    const size = (style: (typeof SMILE_CHOICES)[number]) => boundsOf(mouth(style), 'look-mouth').getSize(new THREE.Vector3());
    expect(size('grin').x).toBeGreaterThan(size('default').x);
    expect(hasWhite(mouth('grin'), 'look-mouth')).toBe(true);
    expect(hasWhite(mouth('default'), 'look-mouth')).toBe(false);
    expect(size('neutral').y).toBeLessThan(size('default').y);
    const count = (style: (typeof SMILE_CHOICES)[number]) => (mouth(style).getObjectByName('look-mouth') as THREE.Mesh).geometry.getAttribute('position').count;
    expect(count('default')).toBe(3 * 24);
  });

  test('the moustache sits above the mouth and the beard below it, for every smile', () => {
    for (const smile of SMILE_CHOICES) {
      const mouth = boundsOf(built({ ...defaultAppearance('rafael'), smile }), 'look-mouth');
      expect(MOUSTACHE_BOX[4] - MOUSTACHE_BOX[1] / 2).toBeGreaterThanOrEqual(mouth.max.y);
      for (const [, height, , , y] of BEARD_BOXES.filter((box) => box !== MOUSTACHE_BOX)) expect(y + height / 2).toBeLessThanOrEqual(mouth.min.y);
    }
  });

  test("rafael's beard is a small chin strip: at most two thirds of the head wide and 2 units tall, narrow sides", () => {
    const headWidth = 8;
    const parts = BEARD_BOXES.filter((box) => box !== MOUSTACHE_BOX);
    expect(parts.length).toBeGreaterThanOrEqual(1);
    const strip = parts[0]!;
    const sides = parts.slice(1);
    expect(strip[0]).toBeLessThanOrEqual((2 / 3) * headWidth);
    for (const box of parts) expect(box[1]).toBeLessThanOrEqual(2);
    for (const side of sides) expect(side[0]).toBeLessThan(strip[0] / 4);
    for (const box of BEARD_BOXES) expect(Math.abs(box[3]) + box[0] / 2).toBeLessThanOrEqual(4.4);
    expect(MOUSTACHE_BOX[0]).toBe(3.6);
  });
});
