import { ENEMY_CITY_SHARE } from '../constants';
import type { CourseDef } from './build';
import { MARRAKECH_SEGMENTS } from './marrakech.generated';

export const marrakech: CourseDef = {
  id: 'marrakech',
  label: 'Full route',
  segments: MARRAKECH_SEGMENTS,
  targetTime: 1800,
  ambient: true,
  corridor: true,
  enemyCityShare: ENEMY_CITY_SHARE,
};
