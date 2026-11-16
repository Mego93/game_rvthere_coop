import { IDENTITY, PLAYER_CROUCH_EYE_HEIGHT, PLAYER_EYE_HEIGHT, getVehicleConfig, vec3, type PlayerSnapshot, type VehicleState } from '@lodgy/shared';
import { describe, expect, test } from 'vitest';
import { buildUseContext } from './useContext';

const local = {
  playerId: 'p1',
  pos: vec3(1, 2, 3),
  yaw: 0,
  seat: null,
  hands: null,
  ground: null,
  walk: { x: 0, z: 0 },
  carry: { x: 0, z: 0 },
  vy: 0,
  grounded: true,
  inventory: [null, null, null],
  slot: 0,
  hold: null,
  health: 100,
  downed: null,
} as PlayerSnapshot;
const vehicle = { pos: vec3(0, 1, 0), rot: IDENTITY, fuel: 50, health: 100 } as unknown as VehicleState;
const config = getVehicleConfig('lodgy');
const aim = { yaw: 0, pitch: 0 };

describe('buildUseContext', () => {
  test('the eye is at the standing height, or the crouch height for crouch and slide', () => {
    expect(buildUseContext(local, [local], vehicle, config, aim).self.eye.y).toBeCloseTo(2 + PLAYER_EYE_HEIGHT, 12);
    expect(buildUseContext({ ...local, stance: 'crouch' }, [local], vehicle, config, aim).self.eye.y).toBeCloseTo(2 + PLAYER_CROUCH_EYE_HEIGHT, 12);
    expect(buildUseContext({ ...local, stance: 'slide' }, [local], vehicle, config, aim).self.eye.y).toBeCloseTo(2 + PLAYER_CROUCH_EYE_HEIGHT, 12);
    expect(buildUseContext({ ...local, stance: 'roll' as 'slide' }, [local], vehicle, config, aim).self.eye.y).toBeCloseTo(2 + PLAYER_EYE_HEIGHT, 12);
  });
});
