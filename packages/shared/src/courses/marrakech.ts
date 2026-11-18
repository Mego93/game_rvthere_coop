import type { CourseDef } from './build';
import { MARRAKECH_SEGMENTS } from './marrakech.generated';

export const marrakech: CourseDef = {
  id: 'marrakech',
  segments: MARRAKECH_SEGMENTS,
  targetTime: 1800,
  ambient: true,
  corridor: true,
};
