import { expect, test } from 'vitest';
import { socketUrl } from './socketUrl';

const https = { protocol: 'https:', host: 'play.example.com' };
const http = { protocol: 'http:', host: 'localhost:5173' };

test('the scheme follows the page and the path is the socket path', () => {
  expect(socketUrl(https, null)).toBe('wss://play.example.com/ws');
  expect(socketUrl(http, null)).toBe('ws://localhost:5173/ws');
  expect(socketUrl({ protocol: 'http:', host: '192.168.1.20:3000' }, null)).toBe('ws://192.168.1.20:3000/ws');
});

test('creating a room asks for create', () => {
  expect(socketUrl(https, { create: true })).toBe('wss://play.example.com/ws?create=1');
  expect(socketUrl(http, { create: true })).toBe('ws://localhost:5173/ws?create=1');
});

test('joining a room names its noun', () => {
  expect(socketUrl(https, { noun: 'camel' })).toBe('wss://play.example.com/ws?noun=camel');
  expect(socketUrl(http, { noun: 'tagine2' })).toBe('ws://localhost:5173/ws?noun=tagine2');
});

test('a noun that is not a valid room name leaves the query out', () => {
  for (const noun of ['', 'Camel', 'a b', 'a&b=1', '2camel', 'camel2x', '../x', 'camel%20']) {
    expect(socketUrl(https, { noun })).toBe('wss://play.example.com/ws');
  }
});
