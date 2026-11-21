import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SEATED_POSE, applySeatedPose } from './seatedPose';

const figure = () => {
  const group = new THREE.Group();
  for (const name of ['leg-left', 'leg-right', 'torso', 'arm-left', 'arm-right', 'head']) {
    const node = new THREE.Object3D();
    node.name = name;
    group.add(node);
  }
  return group;
};

describe('applySeatedPose', () => {
  it('puts the thighs forward, the forearms out and the head down, and leaves the torso upright', () => {
    const group = figure();
    expect(applySeatedPose(group)).toBe(true);
    expect(group.getObjectByName('leg-left')!.rotation.x).toBe(SEATED_POSE.legs);
    expect(group.getObjectByName('leg-right')!.rotation.x).toBe(SEATED_POSE.legs);
    expect(group.getObjectByName('arm-left')!.rotation.x).toBe(SEATED_POSE.arms);
    expect(group.getObjectByName('arm-right')!.rotation.x).toBe(SEATED_POSE.arms);
    expect(group.getObjectByName('head')!.rotation.x).toBe(SEATED_POSE.head);
    expect(group.getObjectByName('torso')!.rotation.x).toBe(0);
  });

  it('leaves a figure with no limbs alone', () => {
    expect(applySeatedPose(new THREE.Group())).toBe(false);
  });

  it('sinks the body onto a seat about as high as a couch cushion', () => {
    expect(SEATED_POSE.sink).toBeGreaterThan(0.3);
    expect(SEATED_POSE.sink).toBeLessThan(0.6);
  });
});
