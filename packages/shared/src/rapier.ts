import type RAPIER from '@dimforge/rapier3d-compat';

// The initialised Rapier module. Callers run `await RAPIER.init()` and pass it in; shared never loads it.
export type Rapier = typeof RAPIER;
export type RapierWorld = RAPIER.World;
export type RigidBody = RAPIER.RigidBody;
