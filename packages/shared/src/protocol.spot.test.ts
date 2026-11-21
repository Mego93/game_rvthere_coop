import { describe, expect, test } from 'vitest';
import { EVENT_KINDS, parseServerMessage } from './protocol';
import { SPOT_KINDS } from './story/days';

const parse = (value: unknown) => parseServerMessage(JSON.stringify(value));
const spot = { type: 'event', kind: 'spot', tick: 5, playerId: 'p1', pos: { x: 1, y: 0, z: 2 }, spotId: 'laptop-0', spotKind: 'laptop' };

describe('the spot event message', () => {
  test('spot is an event kind', () => {
    expect(EVENT_KINDS).toContain('spot');
  });

  test('parses with its spot id and kind', () => {
    expect(parse(spot)).toEqual(spot);
  });

  test.each(SPOT_KINDS)('accepts spot kind %s', (spotKind) => {
    expect(parse({ ...spot, spotKind })).toEqual({ ...spot, spotKind });
  });

  test.each([
    ['an unknown spot kind', { ...spot, spotKind: 'jacuzzi' }],
    ['a spot kind that is a number', { ...spot, spotKind: 3 }],
    ['a spot id that is a number', { ...spot, spotId: 3 }],
  ])('rejects %s', (_label, message) => {
    expect(parse(message)).toBeNull();
  });
});
