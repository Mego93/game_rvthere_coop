import { PLAYER_COLOURS, PLAYER_COLOUR_PATTERN, PLAYER_HEIGHT, PLAYER_RADIUS, type PlayerSnapshot } from '@lodgy/shared';
import * as THREE from 'three';

const HEAD_RADIUS = 0.2;
const LABEL_WIDTH = 256;
const LABEL_HEIGHT = 64;

function nameSprite(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_WIDTH;
  canvas.height = LABEL_HEIGHT;
  const context = canvas.getContext('2d');
  if (context) {
    context.font = 'bold 36px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = 6;
    context.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    context.strokeText(name, LABEL_WIDTH / 2, LABEL_HEIGHT / 2, LABEL_WIDTH - 8);
    context.fillStyle = '#fff';
    context.fillText(name, LABEL_WIDTH / 2, LABEL_HEIGHT / 2, LABEL_WIDTH - 8);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.position.y = PLAYER_HEIGHT + 0.35;
  return sprite;
}

// A capsule body and a sphere head in the player's colour, a dark visor on the front (-Z), and the name above.
export function createPlayerMesh(name: string, colour: string): THREE.Group {
  const safe = PLAYER_COLOUR_PATTERN.test(colour) ? colour : PLAYER_COLOURS[0];
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
    new THREE.BoxGeometry(0.28, 0.08, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x1f2937 }),
  );
  visor.position.set(0, PLAYER_HEIGHT - HEAD_RADIUS, -HEAD_RADIUS);
  group.add(visor);

  group.add(nameSprite(name));
  return group;
}

// A downed player lies on their back, rotated 90 degrees about the yaw-right axis; the capsule stays upright.
export function placePlayerMesh(mesh: THREE.Group, player: PlayerSnapshot): void {
  const downed = player.downed !== null;
  mesh.position.set(player.pos.x, player.pos.y + (downed ? PLAYER_RADIUS : 0), player.pos.z);
  mesh.rotation.order = 'YXZ';
  mesh.rotation.set(downed ? Math.PI / 2 : 0, player.yaw, 0);
}

// Frees the GPU resources of a mesh made by createPlayerMesh.
export function disposePlayerMesh(mesh: THREE.Group): void {
  mesh.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    } else if (object instanceof THREE.Sprite) {
      object.material.map?.dispose();
      object.material.dispose();
    }
  });
}
