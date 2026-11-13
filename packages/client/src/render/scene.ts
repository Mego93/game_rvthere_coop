import { ANCHOR_HEIGHT, type Box, type BuiltCourse, type Surface } from '@lodgy/shared';
import * as THREE from 'three';

const SKY = 0xcfe6f5;
const SURFACE_COLOURS: Record<Surface, number> = {
  road: 0x8a7f72,
  gravel: 0xa39a8c,
  riverbed: 0x7d8a8f,
  sand: 0xd9b77a,
};

function boxMesh(box: Box, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(box.halfExtents.x * 2, box.halfExtents.y * 2, box.halfExtents.z * 2),
    material,
  );
  mesh.position.set(box.center.x, box.center.y, box.center.z);
  mesh.quaternion.set(box.rot.x, box.rot.y, box.rot.z, box.rot.w);
  return mesh;
}

const solid = (colour: number) => new THREE.MeshLambertMaterial({ color: colour, flatShading: true });
const ghost = (colour: number) =>
  new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.25, depthWrite: false });

export function createScene(course: BuiltCourse): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(30, 60, 20);
  scene.add(sun);

  for (const ground of course.ground) scene.add(boxMesh(ground, solid(SURFACE_COLOURS[ground.surface])));
  for (const wall of course.walls) scene.add(boxMesh(wall, solid(0xc98a5a)));
  for (const checkpoint of course.checkpoints) scene.add(boxMesh(checkpoint.trigger, ghost(0x3b82f6)));
  scene.add(boxMesh(course.finish, ghost(0x22c55e)));

  for (const water of course.decor) {
    if (water.kind !== 'water' || !water.size) continue;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(water.size.x * 2, water.size.y * 2, water.size.z * 2),
      new THREE.MeshBasicMaterial({ color: 0x3b82c4, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    mesh.position.set(water.pose.pos.x, water.pose.pos.y, water.pose.pos.z);
    mesh.quaternion.set(water.pose.rot.x, water.pose.rot.y, water.pose.rot.z, water.pose.rot.w);
    scene.add(mesh);
  }

  for (const stop of course.stops) {
    scene.add(boxMesh(stop.zone, ghost(stop.kind === 'fuel' ? 0xf97316 : 0x3b82f6)));
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 0.3), solid(stop.kind === 'fuel' ? 0xf97316 : 0x3b82f6));
    post.position.set(stop.operatePoint.x, stop.operatePoint.y + 0.7, stop.operatePoint.z);
    scene.add(post);
    if (stop.shopCounter) {
      const counter = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 0.6), solid(0xf97316));
      counter.position.set(stop.shopCounter.x, stop.shopCounter.y + 0.5, stop.shopCounter.z);
      scene.add(counter);
    }
  }

  for (const anchor of course.anchors) {
    const { x, y, z } = anchor.pose.pos;
    if (anchor.kind === 'palm') {
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), solid(0x7a5230));
      trunk.position.set(x, y + 1.2, z);
      const crown = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 1.6), solid(0x3f8f3f));
      crown.position.set(x, y + 2.6, z);
      scene.add(trunk, crown);
      continue;
    }
    if (anchor.kind === 'boulder') {
      const rock = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.4), solid(0x808080));
      rock.position.set(x, y + 0.6, z);
      rock.quaternion.set(anchor.pose.rot.x, anchor.pose.rot.y, anchor.pose.rot.z, anchor.pose.rot.w);
      scene.add(rock);
      continue;
    }
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.4), solid(0xf59e0b));
    post.position.set(anchor.pose.pos.x, anchor.pose.pos.y + 0.6, anchor.pose.pos.z);
    scene.add(post);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.44), solid(0xf2f2f2));
    band.position.set(anchor.pose.pos.x, anchor.pose.pos.y + ANCHOR_HEIGHT, anchor.pose.pos.z);
    scene.add(band);
  }
  return scene;
}
