import type { World } from '@lodgy/shared';

const fixed = (value: number, digits = 1) => value.toFixed(digits).padStart(7);

// The debug text shown until the real HUD exists.
export function overlayText(world: World, fps: number): string {
  const { tick, vehicle } = world.snapshot();
  const { forwardSpeed, wheelSurfaces } = world.debug();
  return [
    `vehicle  ${world.vehicleConfig.id}   course ${world.course.id}`,
    `tick     ${tick}   fps ${Math.round(fps)}`,
    `speed    ${fixed(forwardSpeed * 3.6)} km/h`,
    `pos      ${fixed(vehicle.pos.x)} ${fixed(vehicle.pos.y)} ${fixed(vehicle.pos.z)}`,
    `throttle ${fixed(vehicle.throttle, 2)}   steer ${fixed(vehicle.steer, 2)}`,
    `wheels   ${wheelSurfaces.map((surface) => surface ?? 'air').join(' ')}`,
    '',
    'WASD drive   Space brake   ?vehicle=rv for the RV',
  ].join('\n');
}
