import * as THREE from 'three';

export const TENT_CANVAS = 0xe6d3a8;
export const TENT_WOOD = 0xf3ecdc;
export const STRIPE_COLOUR = 0xb3261e;
// m, the stripe's width along the tent, and how far above the canopy's surface it floats.
const STRIPE_WIDTH = 0.55;
const STRIPE_LIFT = 0.025;
// Where the stripes cross the canopy, as fractions of its length from the middle.
const STRIPE_AT = [-0.32, 0, 0.32] as const;
const SAMPLES = 24;

const shared = (material: THREE.Material): THREE.Material => {
  material.userData.shared = true;
  return material;
};

// The tent file is plain white: the canopy takes sand, everything else a warm white, and red stripes run across the canopy's top (strips laid on the surface found by rays, so they follow its sag). Done once on the template, so every copy has it.
export function dressTent(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  let canopy: THREE.Mesh | null = null;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && (mesh.material as THREE.Material).name === 'Material') canopy = mesh;
  });
  const canvas = shared(new THREE.MeshStandardMaterial({ name: 'tent-canvas', color: TENT_CANVAS, roughness: 1, metalness: 0, side: THREE.DoubleSide }));
  const wood = shared(new THREE.MeshStandardMaterial({ name: 'tent-wood', color: TENT_WOOD, roughness: 1, metalness: 0, side: THREE.DoubleSide }));
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) mesh.material = mesh === canopy ? canvas : wood;
  });
  const top = canopy as THREE.Mesh | null;
  if (!top) return;
  const box = new THREE.Box3().setFromObject(top);
  const stripe = shared(new THREE.MeshStandardMaterial({ color: STRIPE_COLOUR, roughness: 1, metalness: 0, side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const length = box.max.x - box.min.x;
  const middle = (box.min.x + box.max.x) / 2;
  for (const [index, at] of STRIPE_AT.entries()) {
    const x = middle + at * length;
    // The surface height along the stripe, front to back; samples the ray misses are skipped.
    const points: { z: number; y: number }[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const z = box.min.z + ((box.max.z - box.min.z) * i) / SAMPLES;
      ray.set(new THREE.Vector3(x, box.max.y + 1, z), down);
      const hit = ray.intersectObject(top, false)[0];
      if (hit) points.push({ z, y: hit.point.y + STRIPE_LIFT });
    }
    if (points.length < 2) continue;
    const positions: number[] = [];
    for (const p of points) positions.push(x - STRIPE_WIDTH / 2, p.y, p.z, x + STRIPE_WIDTH / 2, p.y, p.z);
    const indices: number[] = [];
    for (let i = 0; i + 1 < points.length; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.userData.shared = true;
    const mesh = new THREE.Mesh(geometry, stripe);
    mesh.name = `tent-stripe-${index}`;
    mesh.castShadow = true;
    root.add(mesh);
  }
}
