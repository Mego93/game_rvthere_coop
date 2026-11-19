import { ENEMY_HALF, PLAYER_HEIGHT, PLAYER_RADIUS, type EnemySnapshot, type EnemyState } from '@lodgy/shared';
import * as THREE from 'three';
import { colourMaterial, dressFace, unitBox } from './characterRig';
import { ENEMY_NODES, enemyPose, type EnemyNode } from './enemyPose';
import { holdInRightHand } from './handItem';
import { hasModel, instantiate, shadowed } from './models';

const JACKET = '#4a2f2b';
const TROUSERS = '#25252c';
const SKIN = '#a8754f';
const STUBBLE = '#241d1a';
const BEANIE = '#16161a';
const BANDANA = '#8f2b26';
// Run cycles per second; about two strides a second looks right at ENEMY_RUN_SPEED.
const RUN_RADIANS_PER_SECOND = 12;

type Box = readonly [number, number, number, number, number, number];
// Head-local units: a tenth of the model's; the head box is x and z within 4, y 0..8, the face on +Z.
const BEANIE_BOXES: readonly Box[] = [[9.0, 2.6, 9.0, 0, 9.0, 0], [9.6, 1.0, 9.6, 0, 7.8, 0]];
const BANDANA_BOX: Box = [8.4, 3.0, 0.7, 0, 1.8, 4.1];

const part = (name: string, geometry: THREE.BufferGeometry, colour: string, [w, h, d, x, y, z]: Box) => {
  const mesh = new THREE.Mesh(geometry, colourMaterial(colour));
  mesh.name = name;
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
};

interface Figure {
  root: THREE.Group;
  body: THREE.Group;
  nodes: Partial<Record<EnemyNode, THREE.Object3D>>;
}

// One enemy in local dress, feet at the origin, facing -z, the knife in the right hand; a plain box man when the character model did not load.
function createFigure(): Figure {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const nodes: Figure['nodes'] = {};
  if (hasModel('character.player')) {
    const model = instantiate('character.player')!;
    shadowed(model);
    const node = (name: string) => model.getObjectByName(name) as THREE.Mesh | undefined;
    for (const name of ['torso', 'arm-left', 'arm-right']) if (node(name)) node(name)!.material = colourMaterial(JACKET);
    for (const name of ['leg-left', 'leg-right']) if (node(name)) node(name)!.material = colourMaterial(TROUSERS);
    const head = node('head');
    dressFace(head, SKIN, STUBBLE);
    if (head) {
      BEANIE_BOXES.forEach((box, index) => head.add(part(`beanie-${index}`, unitBox(), BEANIE, box)));
      head.add(part('bandana', unitBox(), BANDANA, BANDANA_BOX));
    }
    for (const name of ENEMY_NODES) nodes[name] = model.getObjectByName(name) ?? undefined;
    body.add(model);
    // The file's front is +Z; enemies face -Z.
    model.rotation.y = Math.PI;
    const arm = nodes['arm-right'];
    if (arm && hasModel('enemy.knife')) holdInRightHand(arm, shadowed(instantiate('enemy.knife')!), 'knife');
  } else {
    const box = new THREE.Mesh(unitBox(), colourMaterial(JACKET));
    box.scale.set(PLAYER_RADIUS * 2, PLAYER_HEIGHT, PLAYER_RADIUS * 2);
    box.position.y = PLAYER_HEIGHT / 2;
    body.add(box);
  }
  return { root, body, nodes };
}

interface Entry extends Figure {
  state: EnemyState;
  // Seconds since the state began on this client, and the run cycle.
  since: number;
  phase: number;
}

export interface EnemyMeshes {
  // Creates figures for ids that appear, poses every one, and removes those no longer listed.
  update(enemies: readonly EnemySnapshot[], seconds: number): void;
  dispose(): void;
}

const euler = new THREE.Euler();

export function createEnemyMeshes(scene: THREE.Scene): EnemyMeshes {
  const entries = new Map<number, Entry>();
  const drop = (entry: Entry) => {
    scene.remove(entry.root);
    // Geometry, colours and the model's materials are shared.
  };
  return {
    update(enemies, seconds) {
      const present = new Set<number>();
      for (const enemy of enemies) {
        present.add(enemy.id);
        let entry = entries.get(enemy.id);
        if (!entry) {
          entry = { ...createFigure(), state: enemy.state, since: 0, phase: 0 };
          entries.set(enemy.id, entry);
          scene.add(entry.root);
        }
        if (entry.state !== enemy.state) {
          entry.state = enemy.state;
          entry.since = 0;
        }
        entry.since += seconds;
        entry.phase += RUN_RADIANS_PER_SECOND * seconds;
        const pose = enemyPose(entry.state, entry.since, entry.phase);
        for (const name of ENEMY_NODES) {
          const node = entry.nodes[name];
          const { x, y, z } = pose.nodes[name];
          if (node) node.quaternion.setFromEuler(euler.set(x, y, z));
        }
        entry.body.rotation.x = pose.pitch;
        entry.body.position.y = pose.lift;
        entry.root.position.set(enemy.x, enemy.y - ENEMY_HALF.y, enemy.z);
        entry.root.rotation.y = enemy.yaw;
      }
      for (const [id, entry] of entries) {
        if (present.has(id)) continue;
        drop(entry);
        entries.delete(id);
      }
    },
    dispose() {
      for (const entry of entries.values()) drop(entry);
      entries.clear();
    },
  };
}
