import type { ModelKey } from './modelManifest';

export type PropTheme = 'airport' | 'city' | 'souk' | 'desert' | 'forest' | 'mountain' | 'villa' | 'golf';
export type PropRole = 'clutter' | 'roadside' | 'wall' | 'crowd' | 'landmark' | 'building';

// The small luggage and cone models are finer than they need to be, so they are weighted low: the dressing is mostly bins, barriers, benches and palms.
// size: the longest side on the ground in metres, which the dressing keeps clear. weight: how often dressMap picks it within its role; 0 means it is placed by hand only. phone: also drawn on phones.
export interface PropEntry {
  key: ModelKey;
  role: PropRole;
  size: number;
  weight: number;
  phone: boolean;
}

const entry = (key: ModelKey, role: PropRole, size: number, weight: number, phone = true): PropEntry => ({ key, role, size, weight, phone });

const AIRPORT: PropEntry[] = [
  entry('airport.luggageTrolley', 'clutter', 1.1, 1.5),
  entry('airport.suitcaseRolling', 'clutter', 0.4, 2),
  entry('airport.suitcaseStack', 'clutter', 1, 1.5),
  entry('airport.baggageCart', 'clutter', 2.6, 1.5),
  entry('airport.cafeSet', 'clutter', 2, 1),
  entry('airport.bin', 'clutter', 0.55, 4),
  entry('airport.trafficCone', 'clutter', 0.5, 2),
  entry('airport.crowdBarrier', 'clutter', 2.1, 2),
  entry('airport.turnstile', 'clutter', 1.2, 2),
  entry('airport.bench', 'roadside', 1.8, 3),
  entry('airport.seatsRow', 'roadside', 2, 2, false),
  entry('airport.bollard', 'roadside', 0.2, 4),
  entry('airport.delineator', 'roadside', 0.3, 3),
  entry('airport.lampPost', 'roadside', 1.2, 3),
  entry('airport.palmTall', 'roadside', 3.3, 3),
  entry('airport.palmSlim', 'roadside', 2.6, 3),
  entry('airport.palmPair', 'roadside', 3.6, 2),
  entry('airport.planterUrn', 'roadside', 0.6, 3, false),
  entry('airport.flagPole', 'roadside', 3.2, 1, false),
  entry('airport.wayfindingTotem', 'roadside', 1.1, 2),
  entry('airport.busStopGlass', 'roadside', 3.5, 1, false),
  entry('airport.busStopShelter', 'roadside', 3.5, 1),
  entry('airport.kiosk', 'roadside', 3, 1),
  entry('airport.guardBooth', 'roadside', 3, 1),
  entry('airport.boomGate', 'roadside', 3.5, 1),
  entry('airport.taxi', 'roadside', 4.6, 0),
  entry('airport.minibus', 'roadside', 5.3, 0),
  entry('airport.carSedan', 'roadside', 4.5, 0, false),
  entry('airport.carHatch', 'roadside', 3.8, 0, false),
  entry('airport.signGate', 'wall', 2.4, 2),
  entry('airport.arrivalsBoard', 'wall', 2, 2),
  entry('airport.signWc', 'wall', 2.9, 1),
  entry('airport.personSuit', 'crowd', 0.6, 1),
  entry('airport.fountain', 'landmark', 5, 0),
  entry('arrival.terminal', 'building', 80, 0),
  entry('airport.garage', 'building', 42, 0),
  entry('airport.rentalOffice', 'building', 6, 0),
  entry('airport.concourse', 'building', 60, 0),
  entry('airport.shop', 'building', 24, 0),
];

// 43a fills the airport; the other themes come in 43c and 43d.
export const PROP_THEMES: Record<PropTheme, PropEntry[]> = {
  airport: AIRPORT,
  city: [],
  souk: [],
  desert: [],
  forest: [],
  mountain: [],
  villa: [],
  golf: [],
};
