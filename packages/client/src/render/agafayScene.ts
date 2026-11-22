import type { BuiltCourse } from '@lodgy/shared';
import * as THREE from 'three';
import { ARCH, archPoses, type ArchPose } from './agafayLayout';
import { shadowed } from './models';
import { textSignTexture } from './signTexture';

export interface AgafayScene {
  group: THREE.Group;
  dispose(): void;
}

const STEEL = 0xf1e7d2;
const RED = 0xb8322a;
const solid = (colour: number, roughness = 0.9) => new THREE.MeshStandardMaterial({ color: colour, roughness, metalness: 0 });

// The banded pillar: sand and red blocks stacked from `sink` below the ground to the top of the arch.
function pillar(x: number, sink: number): THREE.Group {
  const group = new THREE.Group();
  const blocks = Math.round((ARCH.height + sink) / 0.9);
  const block = (ARCH.height + sink) / blocks;
  for (let i = 0; i < blocks; i++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(ARCH.pillar, block, ARCH.pillar), solid(i % 2 === 0 ? STEEL : RED));
    mesh.position.set(x, -sink + block * (i + 0.5), 0);
    group.add(mesh);
  }
  return group;
}

function archMesh(pose: ArchPose, text: string): THREE.Group {
  const arch = new THREE.Group();
  const half = ARCH.span / 2;
  // The ground may slope across the road: the pillars go well below it.
  arch.add(pillar(-half, 2), pillar(half, 2));
  const beamY = ARCH.height - ARCH.beam / 2;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(ARCH.span + ARCH.pillar, ARCH.beam, ARCH.thickness), solid(RED));
  beam.position.set(0, beamY, 0);
  arch.add(beam);
  // The banner on both faces, so it reads from either side.
  const texture = textSignTexture(text, { width: 1024, height: 160, background: '#b8322a', foreground: '#ffffff', border: '#f1e7d2' });
  if (texture) {
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    for (const side of [1, -1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(ARCH.span - 1.2, ARCH.beam - 0.3), material);
      sign.position.set(0, beamY, side * (ARCH.thickness / 2 + 0.02));
      if (side < 0) sign.rotation.y = Math.PI;
      arch.add(sign);
    }
  }
  arch.position.set(pose.x, pose.y, pose.z);
  arch.rotation.y = pose.yaw;
  return shadowed(arch);
}

// Agafay's dressing: an arch over the road at the start and another at the finish, built in code. The tents and camels beside the road are decor (decorScatter); the shared course owns every collision.
export function createAgafayScene(course: BuiltCourse): AgafayScene {
  const group = new THREE.Group();
  const { start, finish } = archPoses(course);
  group.add(archMesh(start, 'START'), archMesh(finish, 'FINISH'));
  return { group, dispose() {} };
}
