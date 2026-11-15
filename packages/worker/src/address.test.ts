import { expect, test } from 'vitest';
import { clientAddress, isValidIp } from './address';

test('valid IPv4 and IPv6 addresses', () => {
  for (const ip of ['1.2.3.4', '255.255.255.255', '::1', '::', '2001:db8::1', '2001:0db8:0000:0000:0000:0000:0000:0001', '::ffff:1.2.3.4', 'fe80::1']) {
    expect(isValidIp(ip), ip).toBe(true);
  }
});

test('invalid addresses', () => {
  for (const ip of ['', 'abc', '1.2.3', '1.2.3.4.5', '256.1.1.1', '01.2.3.4', '1.2.3.-4', '1:2:3', ':::', '1::2::3', '12345::1', 'g::1', '1.2.3.4::', '1:2:3:4:5:6:7:8:9', '::1.2.3']) {
    expect(isValidIp(ip), ip).toBe(false);
  }
});

test('the address is CF-Connecting-IP when valid, else 127.0.0.1', () => {
  expect(clientAddress('203.0.113.9')).toBe('203.0.113.9');
  expect(clientAddress(' 2001:db8::1 ')).toBe('2001:db8::1');
  expect(clientAddress(null)).toBe('127.0.0.1');
  expect(clientAddress('not an ip')).toBe('127.0.0.1');
  expect(clientAddress('1.2.3.4, 5.6.7.8')).toBe('127.0.0.1');
});
