import { type Box, type BuiltCourse, type GolfSnapshot, type Vec3 } from '@lodgy/shared';
import * as THREE from 'three';
import { scoreboard } from '../ui/golf/golfView';
import { BALL_MODEL_DIAMETER, BALL_VISUAL_DIAMETER, BAY_SCREEN, FLAG_HEIGHT, LABEL_HEIGHT, ringsInField } from './golfLayout';
import { BALL_TRAIL_LENGTH, pushTrail } from './golfCamera';
import { mergeBoxes, toGeometry } from './groundMerge';
import type { SceneOptions } from './groundTextures';
import { fitted, hasModel, instantiate, shadowed } from './models';
import { canvasTexture, textSignTexture } from './signTexture';

export interface GolfScene {
  group: THREE.Group;
  // Each frame: the aim to show at the tee (null hides the arrow), the ball (null hides it and its trail), and the game for the bay screen.
  update(args: { aim: number | null; ball: Vec3 | null; golf: GolfSnapshot | null }): void;
  dispose(): void;
}

const solid = (colour: number, roughness = 0.9) => new THREE.MeshStandardMaterial({ color: colour, roughness, metalness: 0 });

const LAWN = 0x4f9a45;
const LAWN_STRIPE = 0x468d3d;
const DECK = 0xb99a6b;
const HEDGE = 0x2f5a3a;
const BAY_WALL = 0xe6e0d2;
const RAIL_GLASS = 0xbfe3f0;
const MAT_GREEN = 0x1f6b3a;
const MAT_EDGE = 0xf2f2f0;
const ARROW = 0xffc400;
// m above the collision ground, so the lawn does not fight the far terrain.
const LAWN_LIFT = 0.02;
const MAT_TOP = 0.05;

function stripedLawn(): THREE.CanvasTexture | null {
  const texture = canvasTexture(2, 2, (context) => {
    context.fillStyle = '#4f9a45';
    context.fillRect(0, 0, 2, 1);
    context.fillStyle = '#468d3d';
    context.fillRect(0, 1, 2, 1);
  });
  if (!texture) return null;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function pointsLabel(points: number, colour: number): THREE.Sprite | null {
  const texture = canvasTexture(128, 64, (context, w, h) => {
    context.fillStyle = 'rgba(20, 16, 12, 0.75)';
    context.beginPath();
    context.roundRect(4, 4, w - 8, h - 8, 22);
    context.fill();
    context.strokeStyle = `#${colour.toString(16).padStart(6, '0')}`;
    context.lineWidth = 5;
    context.stroke();
    context.fillStyle = '#ffffff';
    context.font = '800 36px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(points), w / 2, h / 2 + 2);
  });
  if (!texture) return null;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(2.4, 1.2, 1);
  return sprite;
}

// The flag's cloth in the ring's colour; each flag gets its own copy of the material.
function colouredFlag(colour: number): THREE.Group | null {
  if (!hasModel('golf.flag')) return null;
  const model = instantiate('golf.flag');
  if (!model) return null;
  const copies = new Map<THREE.Material, THREE.Material>();
  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as THREE.MeshStandardMaterial;
    if (material.name !== 'Plane') return;
    let copy = copies.get(material);
    if (!copy) {
      copy = material.clone();
      (copy as THREE.MeshStandardMaterial).color.set(colour);
      (copy as THREE.MeshStandardMaterial).map = null;
      copy.userData.shared = false;
      copies.set(material, copy);
    }
    mesh.material = copy;
  });
  return shadowed(fitted(model, { y: FLAG_HEIGHT }));
}

// The scoreboard drawn on the bay screen.
function drawScreen(context: CanvasRenderingContext2D, width: number, height: number, golf: GolfSnapshot | null): void {
  context.fillStyle = '#0d2a1b';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#ffc400';
  context.font = '800 54px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('PrimeGolf', width / 2, 48);
  if (!golf) return;
  const rows = scoreboard(golf.scores, golf.turn);
  const top = 100;
  const step = Math.min(46, (height - top - 10) / Math.max(1, rows.length));
  context.textBaseline = 'middle';
  rows.forEach((row, index) => {
    const y = top + step * (index + 0.5);
    context.fillStyle = row.onTurn ? '#ffc400' : '#ffffff';
    context.font = `700 ${Math.round(step * 0.62)}px system-ui, sans-serif`;
    context.textAlign = 'left';
    context.fillText(`${row.rank}. ${row.name}`, 40, y);
    context.textAlign = 'right';
    context.fillText(String(row.total), width - 40, y);
    context.font = `600 ${Math.round(step * 0.42)}px system-ui, sans-serif`;
    context.fillStyle = 'rgba(255,255,255,0.7)';
    context.fillText(`${row.left} left`, width - 150, y);
  });
}

const group = (): THREE.Group => new THREE.Group();

// PrimeGolf's range: the lawn with its ring targets and flags, the bay with its mat, screen and walls, the ball with its trail and the aim arrow. Purely visual; the shared course owns every collision.
export function createGolfScene(course: BuiltCourse, options: SceneOptions = {}): GolfScene {
  const root = group();
  const tee = course.golf?.tee ?? { x: 0, y: 0, z: 0 };

  // The lawn over the field and the bay's sides, striped every 10 m; the waiting area's deck on top at the middle.
  const lawnTexture = options.flat ? null : stripedLawn();
  const lawnMaterial = new THREE.MeshStandardMaterial({ color: lawnTexture ? 0xffffff : LAWN, map: lawnTexture, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(80, 270), lawnMaterial);
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(0, LAWN_LIFT, -240 + 135);
  lawn.receiveShadow = true;
  if (lawnTexture) {
    // A stripe is 5 m.
    lawnTexture.repeat.set(1, 27);
    lawnTexture.offset.set(0, 0);
  } else lawnMaterial.color.set(LAWN_STRIPE);
  root.add(lawn);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(40, 0.04, 33), solid(DECK));
  deck.position.set(0, 0.015, 13.5);
  deck.receiveShadow = true;
  root.add(deck);

  // The hitting mat, a flat box with a white border, and the tee peg.
  const mat = new THREE.Mesh(new THREE.BoxGeometry(4, MAT_TOP, 4), solid(MAT_EDGE));
  mat.position.set(tee.x, MAT_TOP / 2, tee.z);
  mat.receiveShadow = true;
  const matInner = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.01, 3.6), solid(MAT_GREEN));
  matInner.position.set(tee.x, MAT_TOP + 0.003, tee.z);
  matInner.receiveShadow = true;
  const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.008, 0.07, 8), solid(MAT_EDGE));
  peg.position.set(tee.x, MAT_TOP + 0.04, tee.z);
  root.add(mat, matInner, peg);

  // Hedges round the field, the bay's walls, and its low rail in glass so the field can be seen over and through it.
  const hedges: Box[] = [];
  const bayWalls: Box[] = [];
  const rail: Box[] = [];
  for (const box of course.walls) {
    const perimeter = Math.abs(box.center.x) >= 39.8 || box.center.z <= -239.8 || box.center.z >= 29.8;
    (perimeter ? hedges : box.halfExtents.y < 1 ? rail : bayWalls).push(box);
  }
  const glass = new THREE.MeshStandardMaterial({ color: RAIL_GLASS, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.25, depthWrite: false });
  for (const [boxes, material] of [[hedges, solid(HEDGE)], [bayWalls, solid(BAY_WALL)], [rail, glass]] as const) {
    const merged = mergeBoxes(boxes, undefined, true);
    if (!merged) continue;
    const mesh = new THREE.Mesh(toGeometry(merged), material);
    mesh.castShadow = material !== glass;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  // The ring targets: a coloured disc, a bright bullseye, a rim, a flag and the points.
  for (const { ring, colour } of ringsInField()) {
    const at = new THREE.Vector3(tee.x + ring.x, 0, tee.z + ring.z);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(ring.radius, 48), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(at.x, 0.04, at.z);
    const rim = new THREE.Mesh(new THREE.RingGeometry(ring.radius * 0.93, ring.radius, 48), new THREE.MeshBasicMaterial({ color: colour, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(at.x, 0.05, at.z);
    const bull = new THREE.Mesh(new THREE.CircleGeometry(ring.radius / 3, 32), new THREE.MeshBasicMaterial({ color: colour, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    bull.rotation.x = -Math.PI / 2;
    bull.position.set(at.x, 0.05, at.z);
    root.add(disc, rim, bull);
    const flag = colouredFlag(colour);
    if (flag) {
      flag.position.set(at.x, 0, at.z);
      root.add(flag);
    }
    const label = pointsLabel(ring.points, colour);
    if (label) {
      label.position.set(at.x, LABEL_HEIGHT, at.z);
      root.add(label);
    }
  }

  // The bay screen on the back wall, facing the tee, with the scoreboard drawn on a plane in front of it.
  const screen = hasModel('golf.screen') ? instantiate('golf.screen') : null;
  if (screen) {
    // Turned a quarter so its face looks toward the tee; the size is in the turned frame.
    const placed = fitted(screen, { x: BAY_SCREEN.width + 0.5, y: BAY_SCREEN.height + 0.5, z: 0.35 }, Math.PI / 2);
    placed.position.set(BAY_SCREEN.x, BAY_SCREEN.lift - 0.25, BAY_SCREEN.wallZ);
    root.add(shadowed(placed));
  }
  let screenTexture: THREE.CanvasTexture | null = null;
  let screenContext: CanvasRenderingContext2D | null = null;
  let screenKey = '';
  const screenPlane = new THREE.Mesh(new THREE.PlaneGeometry(BAY_SCREEN.width, BAY_SCREEN.height), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  screenTexture = canvasTexture(640, 360, (context, w, h) => {
    screenContext = context;
    drawScreen(context, w, h, null);
  });
  if (screenTexture) (screenPlane.material as THREE.MeshBasicMaterial).map = screenTexture;
  // PlaneGeometry looks along +z; turned half round it looks toward the tee.
  screenPlane.rotation.y = Math.PI;
  screenPlane.position.set(BAY_SCREEN.x, BAY_SCREEN.lift + BAY_SCREEN.height / 2, BAY_SCREEN.wallZ - 0.3);
  root.add(screenPlane);
  const bannerTexture = textSignTexture('PrimeGolf', { width: 1024, height: 190, background: '#0d2a1b', foreground: '#ffc400', border: '#ffc400' });
  if (bannerTexture) {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.7), new THREE.MeshBasicMaterial({ map: bannerTexture, toneMapped: false }));
    banner.rotation.y = Math.PI;
    banner.position.set(9, 3.5, BAY_SCREEN.wallZ - 0.2);
    root.add(banner);
  }

  // The aim arrow: a flat shaft with a head, lying from the tee along the aim, turned by the aim yaw (positive turns left, like the shot).
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(-0.25, 0);
  arrowShape.lineTo(-0.25, -9);
  arrowShape.lineTo(-0.8, -9);
  arrowShape.lineTo(0, -11);
  arrowShape.lineTo(0.8, -9);
  arrowShape.lineTo(0.25, -9);
  arrowShape.lineTo(0.25, 0);
  arrowShape.closePath();
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), new THREE.MeshBasicMaterial({ color: ARROW, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  // The shape lies in x-y with the head toward -y; laid flat it points toward -z.
  arrow.rotation.x = -Math.PI / 2;
  const arrowPivot = group();
  arrowPivot.add(arrow);
  arrowPivot.position.set(tee.x, MAT_TOP + 0.02, tee.z - 1.2);
  arrowPivot.visible = false;
  root.add(arrowPivot);

  // The ball, drawn larger than life, with a short trail of fading spheres.
  const ball = new THREE.Group();
  const model = hasModel('golf.ball') ? instantiate('golf.ball') : null;
  if (model) {
    const scale = BALL_VISUAL_DIAMETER / BALL_MODEL_DIAMETER;
    const inner = fitted(model, {});
    inner.scale.multiplyScalar(scale);
    // fitted() leaves the origin at the bottom; lift it to the centre.
    inner.position.y = -BALL_VISUAL_DIAMETER / 2;
    ball.add(inner);
  } else ball.add(new THREE.Mesh(new THREE.SphereGeometry(BALL_VISUAL_DIAMETER / 2, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })));
  ball.visible = false;
  root.add(ball);
  const trailGeometry = new THREE.SphereGeometry(1, 8, 6);
  const trailMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
  const trailMeshes = Array.from({ length: BALL_TRAIL_LENGTH }, () => {
    const mesh = new THREE.Mesh(trailGeometry, trailMaterial);
    mesh.visible = false;
    root.add(mesh);
    return mesh;
  });
  let trail: Vec3[] = [];

  return {
    group: root,
    update({ aim, ball: at, golf }) {
      arrowPivot.visible = aim !== null;
      if (aim !== null) arrowPivot.rotation.y = aim;
      ball.visible = at !== null;
      if (at) ball.position.set(at.x, at.y, at.z);
      trail = pushTrail(trail, at);
      trailMeshes.forEach((mesh, index) => {
        const point = trail[index - (BALL_TRAIL_LENGTH - trail.length)];
        mesh.visible = point !== undefined && index < BALL_TRAIL_LENGTH - 1;
        if (!point) return;
        mesh.position.set(point.x, point.y, point.z);
        mesh.scale.setScalar(0.05 + (0.2 * (index + 1)) / BALL_TRAIL_LENGTH);
      });
      const key = golf ? JSON.stringify([golf.turn, golf.scores]) : '';
      if (screenTexture && screenContext && key !== screenKey) {
        screenKey = key;
        drawScreen(screenContext, 640, 360, golf);
        screenTexture.needsUpdate = true;
      }
    },
    dispose() {
      trailGeometry.dispose();
      trailMaterial.dispose();
    },
  };
}

