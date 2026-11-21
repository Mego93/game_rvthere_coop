import { PLAYER_HEIGHT } from '@lodgy/shared';
import * as THREE from 'three';
import { BUBBLE_SECONDS, bubbleUp, wrapText } from './speechText';

const WIDTH = 384;
const ROW = 40;
const PAD = 16;
const CHARS_PER_ROW = 20;
const MAX_ROWS = 5;

interface Bubble {
  sprite: THREE.Sprite;
  since: number;
}

const bubbles = new WeakMap<THREE.Object3D, Bubble>();

function bubbleSprite(text: string): THREE.Sprite | null {
  const rows = wrapText(text, CHARS_PER_ROW).slice(0, MAX_ROWS);
  const canvas = document.createElement('canvas');
  const height = rows.length * ROW + PAD * 2 + 14;
  canvas.width = WIDTH;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = '#fff8ea';
  context.strokeStyle = '#1d1a17';
  context.lineWidth = 4;
  const body = height - 14;
  context.beginPath();
  context.roundRect(4, 4, WIDTH - 8, body - 8, 18);
  context.moveTo(WIDTH / 2 - 14, body - 4);
  context.lineTo(WIDTH / 2, height - 4);
  context.lineTo(WIDTH / 2 + 14, body - 4);
  context.fill();
  context.stroke();
  context.fillStyle = '#1d1a17';
  context.font = '600 30px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  rows.forEach((row, i) => context.fillText(row, WIDTH / 2, PAD + ROW / 2 + i * ROW + 4, WIDTH - 24));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.name = 'bubble';
  sprite.renderOrder = 10;
  const worldWidth = 1.2;
  sprite.scale.set(worldWidth, (worldWidth * height) / WIDTH, 1);
  // The tail's tip is the sprite's bottom centre.
  sprite.center.set(0.5, 0);
  sprite.position.y = PLAYER_HEIGHT + 0.25;
  return sprite;
}

const free = (bubble: Bubble) => {
  bubble.sprite.removeFromParent();
  bubble.sprite.material.map?.dispose();
  bubble.sprite.material.dispose();
};

// Puts a speech bubble with `text` above a player's figure; a new one replaces the old. `now` is in seconds on the clock tickBubble uses.
export function showBubble(mesh: THREE.Object3D, text: string, now: number): void {
  const old = bubbles.get(mesh);
  if (old) free(old);
  bubbles.delete(mesh);
  const sprite = bubbleSprite(text);
  if (!sprite) return;
  mesh.add(sprite);
  bubbles.set(mesh, { sprite, since: now });
}

// Removes a bubble once its time is up; call every frame for every figure that may have one.
export function tickBubble(mesh: THREE.Object3D, now: number): void {
  const bubble = bubbles.get(mesh);
  if (!bubble || bubbleUp(bubble.since, now)) return;
  free(bubble);
  bubbles.delete(mesh);
}

export const hasBubble = (mesh: THREE.Object3D): boolean => bubbles.has(mesh);
export { BUBBLE_SECONDS };
