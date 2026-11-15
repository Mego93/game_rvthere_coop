import { expect, test } from 'vitest';
import { createAdmission, exceedsMessageLimit, utf8Bytes } from './admission';

test('admits up to the per-room total, then answers full', () => {
  const admission = createAdmission({ perRoom: 3, perAddress: 10 });
  expect(admission.admit('a')).toBe('ok');
  expect(admission.admit('b')).toBe('ok');
  expect(admission.admit('c')).toBe('ok');
  expect(admission.admit('d')).toBe('full');
  expect(admission.count()).toBe(3);
});

test('answers busy past the per-address cap, other addresses unaffected', () => {
  const admission = createAdmission({ perRoom: 10, perAddress: 2 });
  expect(admission.admit('a')).toBe('ok');
  expect(admission.admit('a')).toBe('ok');
  expect(admission.admit('a')).toBe('busy');
  expect(admission.admit('b')).toBe('ok');
  expect(admission.count()).toBe(3);
});

test('release frees a slot and never goes below zero', () => {
  const admission = createAdmission({ perRoom: 1, perAddress: 1 });
  expect(admission.admit('a')).toBe('ok');
  expect(admission.admit('a')).toBe('full');
  admission.release('a');
  admission.release('a');
  admission.release('zzz');
  expect(admission.count()).toBe(0);
  expect(admission.admit('a')).toBe('ok');
  expect(admission.count()).toBe(1);
});

test('message size is measured in UTF-8 bytes', () => {
  expect(utf8Bytes('abc')).toBe(3);
  expect(utf8Bytes('é')).toBe(2);
  const multi = 'é'.repeat(2100);
  expect(multi.length).toBeLessThan(4096);
  expect(exceedsMessageLimit(multi)).toBe(true);
  expect(exceedsMessageLimit('a'.repeat(4096))).toBe(false);
  expect(exceedsMessageLimit('a'.repeat(4097))).toBe(true);
});
