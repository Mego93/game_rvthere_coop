import { CHARACTER_SCALE, isCrouchedStance, PLAYER_COLOURS, PLAYER_COLOUR_PATTERN, PLAYER_HEIGHT, PLAYER_RADIUS, type PlayerSnapshot } from '@lodgy/shared';
import * as THREE from 'three';
import { animationsOf, hasModel, instantiate, shadowed } from './models';

export const HEAD_RADIUS = 0.2 * CHARACTER_SCALE;
export const NAME_TAG_OFFSET = 0.3 * CHARACTER_SCALE;
const LABEL_WIDTH = 256;
const LABEL_HEIGHT = 64;

function nameSprite(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_WIDTH;
  canvas.height = LABEL_HEIGHT;
  const context = canvas.getContext('2d');
  if (context) {
    context.font = '600 30px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = 'rgba(0, 0, 0, 0.85)';
    context.shadowBlur = 6;
    context.shadowOffsetY = 1;
    context.fillStyle = '#fff';
    context.fillText(name, LABEL_WIDTH / 2, LABEL_HEIGHT / 2, LABEL_WIDTH - 8);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(1.0, 0.25, 1);
  sprite.position.y = PLAYER_HEIGHT + NAME_TAG_OFFSET;
  sprite.name = 'label';
  return sprite;
}

// Other players' names show within this many metres.
export const LABEL_RANGE = 40;
const IDLE_SPEED = 0.3;
const WALK_SPEED_FOR_CLIP = 1.6;
const SPEED_SMOOTHING = 10;

interface Animation {
  mixer: THREE.AnimationMixer;
  idle: THREE.AnimationAction;
  walk: THREE.AnimationAction;
  x: number;
  z: number;
  speed: number;
  fresh: boolean;
}

const animations = new WeakMap<THREE.Object3D, Animation>();

const CROUCH_SCALE = 0.6;
const SLIDE_TILT = (25 * Math.PI) / 180;
// The drawn stance eases in about this long, like the camera eye.
const STANCE_EASE_SECONDS = 0.1;
// `height` scales the body's Y (1 standing); `tilt` leans it back (radians).
const stances = new WeakMap<THREE.Object3D, { height: number; tilt: number }>();

// Crouching squashes the body (not the name) and sliding leans it back; both ease, and snap when no time has passed.
function applyStance(mesh: THREE.Group, stance: PlayerSnapshot['stance'], seconds: number): number {
  const state = stances.get(mesh) ?? { height: 1, tilt: 0 };
  stances.set(mesh, state);
  const targetHeight = isCrouchedStance(stance) ? CROUCH_SCALE : 1;
  const targetTilt = stance === 'slide' ? SLIDE_TILT : 0;
  const k = seconds > 0 ? 1 - Math.exp(-seconds / STANCE_EASE_SECONDS) : 1;
  state.height += (targetHeight - state.height) * k;
  state.tilt += (targetTilt - state.tilt) * k;
  for (const child of mesh.children) {
    if (child.name === 'label') child.position.y = PLAYER_HEIGHT * state.height + NAME_TAG_OFFSET;
    else child.scale.y = state.height;
  }
  return state.tilt;
}

// The blocky character, its shirt and sleeves in the player's colour, turned to face -Z and fitted to the player's height; null when the model did not load.
function createCharacter(colour: string): THREE.Group | null {
  if (!hasModel('character.player')) return null;
  const model = instantiate('character.player');
  const clipList = animationsOf('character.player');
  const idleClip = clipList.find((clip) => clip.name === 'idle');
  const walkClip = clipList.find((clip) => clip.name === 'walk');
  if (!model || !idleClip || !walkClip) return null;
  const shirt = new THREE.MeshStandardMaterial({ color: colour, roughness: 1, metalness: 0 });
  model.traverse((node) => {
    if (node.name === 'torso' || node.name === 'arm-left' || node.name === 'arm-right') (node as THREE.Mesh).material = shirt;
  });
  const group = new THREE.Group();
  group.add(shadowed(model));
  // The file's front is +Z; players face -Z.
  model.rotation.y = Math.PI;
  const mixer = new THREE.AnimationMixer(model);
  const idle = mixer.clipAction(idleClip).play();
  const walk = mixer.clipAction(walkClip).play();
  walk.setEffectiveWeight(0);
  animations.set(group, { mixer, idle, walk, x: 0, z: 0, speed: 0, fresh: true });
  return group;
}

// A character model (or a capsule body and a sphere head in the player's colour, a dark visor on the front (-Z)), and the name above.
export function createPlayerMesh(name: string, colour: string): THREE.Group {
  const safe = PLAYER_COLOUR_PATTERN.test(colour) ? colour : PLAYER_COLOURS[0];
  const character = createCharacter(safe);
  if (character) {
    character.add(nameSprite(name));
    return character;
  }
  const material = new THREE.MeshStandardMaterial({ color: safe, flatShading: true, roughness: 1, metalness: 0 });
  const group = new THREE.Group();

  const bodyLength = PLAYER_HEIGHT - 2 * HEAD_RADIUS - 2 * PLAYER_RADIUS;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(PLAYER_RADIUS, bodyLength, 4, 12), material);
  body.position.y = PLAYER_RADIUS + bodyLength / 2;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_RADIUS, 16, 12), material);
  head.position.y = PLAYER_HEIGHT - HEAD_RADIUS;
  head.castShadow = true;
  group.add(head);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.28 * CHARACTER_SCALE, 0.08 * CHARACTER_SCALE, 0.1 * CHARACTER_SCALE),
    new THREE.MeshBasicMaterial({ color: 0x1f2937 }),
  );
  visor.position.set(0, PLAYER_HEIGHT - HEAD_RADIUS, -HEAD_RADIUS);
  group.add(visor);

  group.add(nameSprite(name));
  return group;
}

// A downed player lies on their back, rotated 90 degrees about the yaw-right axis; the capsule stays upright.
export function placePlayerMesh(mesh: THREE.Group, player: PlayerSnapshot, seconds = 0): void {
  const downed = player.downed !== null;
  const animation = animations.get(mesh);
  if (animation && seconds > 0 && mesh.visible) {
    // Horizontal speed from the drawn movement, smoothed; a restart's jump counts as standing.
    const raw = animation.fresh ? 0 : Math.hypot(player.pos.x - animation.x, player.pos.z - animation.z) / seconds;
    animation.speed += ((raw > 20 ? 0 : raw) - animation.speed) * Math.min(1, seconds * SPEED_SMOOTHING);
    const walking = Math.min(1, Math.max(0, (animation.speed - IDLE_SPEED) / IDLE_SPEED));
    animation.walk.setEffectiveWeight(walking);
    animation.idle.setEffectiveWeight(1 - walking);
    animation.walk.setEffectiveTimeScale(Math.max(0.6, animation.speed / WALK_SPEED_FOR_CLIP));
    animation.mixer.update(seconds);
  }
  if (animation) {
    animation.x = player.pos.x;
    animation.z = player.pos.z;
    animation.fresh = false;
  }
  mesh.position.set(player.pos.x, player.pos.y + (downed ? PLAYER_RADIUS : 0), player.pos.z);
  mesh.rotation.order = 'YXZ';
  const tilt = applyStance(mesh, downed ? undefined : player.stance, seconds);
  mesh.rotation.set(downed ? Math.PI / 2 : tilt, player.yaw, 0);
}

// Names show only for other players near the camera.
export function setNameVisible(mesh: THREE.Group, visible: boolean): void {
  const label = mesh.getObjectByName('label');
  if (label) label.visible = visible;
}

// Frees the GPU resources of a mesh made by createPlayerMesh; the model's shared geometry and textures stay.
export function disposePlayerMesh(mesh: THREE.Group): void {
  animations.get(mesh)?.mixer.stopAllAction();
  mesh.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      if (object.geometry.userData.shared !== true) object.geometry.dispose();
      const material = object.material as THREE.Material;
      if (material.userData.shared !== true) material.dispose();
    } else if (object instanceof THREE.Sprite) {
      object.material.map?.dispose();
      object.material.dispose();
    }
  });
}
