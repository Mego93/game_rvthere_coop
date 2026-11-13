import { NEUTRAL_INPUT, SHOP_MENU_TELEPORT, getCourse, vec3, type InteractAction, type Vec3 } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { CLOSED, menuInput, shopMenuState, type ShopMenuInputs, type ShopMenuState } from './shopMenu';

const stops = getCourse('test').stops;
const counter = stops.find((stop) => stop.id === 'stop-fuel')!.shopCounter!;
const near = vec3(counter.x, 0.02, counter.z - 1);
const far = vec3(40, 0.02, 40);
const shop: InteractAction = { kind: 'shop', stopId: 'stop-fuel' };
const OPEN: ShopMenuState = { open: true, feet: near };

const at = (changes: Partial<ShopMenuInputs>): ShopMenuInputs => ({ feet: near, seated: false, downed: false, stops, press: null, dismiss: false, ...changes });

test('S17: an interact press that resolves to the shop in range opens the menu', () => {
  expect(shopMenuState(CLOSED, at({ press: shop })).open).toBe(true);
});

test('S17: it stays closed with no press, or when the press is out of range', () => {
  expect(shopMenuState(CLOSED, at({})).open).toBe(false);
  expect(shopMenuState(CLOSED, at({ feet: far, press: shop })).open).toBe(false);
});

test('M2: a press at a usable pump that resolves to operate does not open the menu', () => {
  expect(shopMenuState(CLOSED, at({ press: { kind: 'operate', stopId: 'stop-fuel' } })).open).toBe(false);
  expect(shopMenuState(CLOSED, at({ press: { kind: 'board', seatId: 'driver' } })).open).toBe(false);
});

test('S17: an open menu stays open while the player stays in range', () => {
  expect(shopMenuState(OPEN, at({ feet: vec3(near.x + 0.3, 0.02, near.z) })).open).toBe(true);
});

test('S17: it closes on leaving range, being downed, being seated, Esc, or no local player', () => {
  expect(shopMenuState(OPEN, at({ feet: vec3(near.x, 0.02, near.z - 4) })).open).toBe(false);
  expect(shopMenuState(OPEN, at({ downed: true })).open).toBe(false);
  expect(shopMenuState(OPEN, at({ seated: true })).open).toBe(false);
  expect(shopMenuState(OPEN, at({ dismiss: true })).open).toBe(false);
  expect(shopMenuState(OPEN, at({ feet: null })).open).toBe(false);
});

test('S17: it closes on a jump of more than SHOP_MENU_TELEPORT between updates, even into range', () => {
  const from: Vec3 = vec3(near.x, 0.02, near.z - 1.5);
  const to: Vec3 = vec3(near.x, 0.02, near.z - 1.5 + SHOP_MENU_TELEPORT + 0.1);
  expect(shopMenuState({ open: true, feet: from }, at({ feet: to })).open).toBe(false);
  expect(shopMenuState({ open: true, feet: from }, at({ feet: vec3(from.x, from.y, from.z + SHOP_MENU_TELEPORT - 0.1) })).open).toBe(true);
});

test('M9: an input sampled while the menu is open is neutral with the aim and slot kept; closed, it is unchanged', () => {
  const sampled = { ...NEUTRAL_INPUT, moveX: 1 as const, moveY: 1 as const, jump: true, interact: true, use: true, yaw: 1.2, pitch: -0.3, slot: 2 as const };
  expect(menuInput(true, sampled)).toEqual({ ...NEUTRAL_INPUT, yaw: 1.2, pitch: -0.3, slot: 2 });
  expect(menuInput(false, sampled)).toBe(sampled);
});
