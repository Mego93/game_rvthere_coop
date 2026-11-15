import { expect, test } from 'vitest';
import { roomFromPath } from './route';

test('the home page names no room', () => {
  expect(roomFromPath('/')).toBeNull();
  expect(roomFromPath('')).toBeNull();
});

test('a room address names its room, in lower case', () => {
  expect(roomFromPath('/camel')).toBe('camel');
  expect(roomFromPath('/Camel/')).toBe('camel');
  expect(roomFromPath('/tagine2')).toBe('tagine2');
});

test('an address that cannot be a room names none', () => {
  expect(roomFromPath('/a/b')).toBeNull();
  expect(roomFromPath('/index.html')).toBeNull();
  expect(roomFromPath('/camel%20x')).toBeNull();
});
