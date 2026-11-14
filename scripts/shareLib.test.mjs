import { describe, expect, it } from 'vitest';
import { parseShareArgs, tunnelUrl } from './shareLib.mjs';

describe('tunnelUrl', () => {
  it('finds the address in the box line', () => {
    const line = '2026-11-14T10:00:00Z INF |  https://quiet-river-fox-1234.trycloudflare.com                              |';
    expect(tunnelUrl(line)).toBe('https://quiet-river-fox-1234.trycloudflare.com');
  });
  it('ignores the requesting line', () => {
    expect(tunnelUrl('2026-11-14T10:00:00Z INF Requesting new quick Tunnel on trycloudflare.com...')).toBeNull();
  });
  it('ignores the api host', () => {
    expect(tunnelUrl('ERR Post "https://api.trycloudflare.com/tunnel": dial tcp: lookup failed')).toBeNull();
  });
  it('ignores an empty line', () => {
    expect(tunnelUrl('')).toBeNull();
  });
});

describe('parseShareArgs', () => {
  it('defaults to 3000', () => {
    expect(parseShareArgs([], {})).toEqual({ port: 3000 });
  });
  it('reads PORT from the environment', () => {
    expect(parseShareArgs([], { PORT: '4000' })).toEqual({ port: 4000 });
  });
  it('lets --port override PORT', () => {
    expect(parseShareArgs(['--port', '5000'], { PORT: '4000' })).toEqual({ port: 5000 });
  });
  it('rejects invalid ports', () => {
    for (const bad of ['0', '65536', 'abc', '3.5', '-1', '']) {
      expect(parseShareArgs(['--port', bad], {})).toHaveProperty('error');
    }
    expect(parseShareArgs([], { PORT: 'x' })).toHaveProperty('error');
    expect(parseShareArgs(['--port'], {})).toHaveProperty('error');
  });
});
