import { getCourse } from '@lodgy/shared';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { coverPieces } from './arrivalLayout';
import { PROP_BUDGET } from './dressMap';
import { createArrivalScene } from './arrivalScene';

const arrival = getCourse('arrival');

describe('arrival scene', () => {
  it('draws without any model loaded: the plain walls only, none for a cover box or the office, and a prop layer with nothing in it', () => {
    const scene = createArrivalScene(arrival, { flat: true });
    const meshes = scene.group.children.filter((child) => (child as THREE.Mesh).isMesh) as THREE.Mesh[];
    const vertices = meshes.reduce((sum, mesh) => sum + mesh.geometry.getAttribute('position').count, 0);
    const structure = arrival.walls.length - coverPieces(arrival).length - 1;
    // 6 faces of 4 vertices to a wall box, and the podium is one box of its own.
    expect(vertices).toBe(structure * 24 + 24);
    expect(scene.props?.stats.instances).toBe(0);
    scene.update({ x: 0, z: 0 });
  });

  it('dresses a phone (touch or software GL) from the 600 and 90 m budget and a desktop from 1500 and 220 m', () => {
    expect(PROP_BUDGET.phone.cap).toBeLessThan(PROP_BUDGET.desktop.cap);
    expect(createArrivalScene(arrival, { lite: true }).group).toBeDefined();
    expect(createArrivalScene(arrival, { flat: true }).group).toBeDefined();
  });
});
