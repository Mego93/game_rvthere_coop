import { CHAT_BURST, CHAT_REFILL_SECONDS } from '@lodgy/shared';
import { expect, test } from 'vitest';
import { CHAT_LIMIT, CLIENT_REFILL_SECONDS, TOAST_COUNT, TOAST_SECONDS, createChatLog, createChatSender, isChatKey, submitChat } from './chat';

const line = (id: number, playerId = 'p1', text = `line ${id}`) => ({ id, playerId, name: `Name ${playerId}`, text, at: id * 10 });

test('the log keeps the last 50 lines in order', () => {
  const log = createChatLog();
  expect(CHAT_LIMIT).toBe(50);
  for (let id = 1; id <= 55; id += 1) log.add(line(id), 'me', 0);
  const lines = log.lines();
  expect(lines).toHaveLength(50);
  expect(lines[0]!.id).toBe(6);
  expect(lines[49]!.id).toBe(55);
});

test('a line carries its fields, stamped with the receive time, and own is set for the local player', () => {
  const log = createChatLog();
  log.add(line(1, 'me', 'hi'), 'me', 12.5);
  log.add(line(2, 'other'), 'me', 13);
  expect(log.lines()[0]).toEqual({ id: 1, playerId: 'me', name: 'Name me', text: 'hi', at: 10, own: true, receivedAt: 12.5 });
  expect(log.lines()[1]!.own).toBe(false);
});

test('a replayed history after a reconnect is ignored by id', () => {
  const log = createChatLog();
  for (let id = 1; id <= 3; id += 1) expect(log.add(line(id), 'me', 0)).toBe(true);
  for (let id = 1; id <= 3; id += 1) expect(log.add(line(id), 'me', 100)).toBe(false);
  expect(log.add(line(4), 'me', 100)).toBe(true);
  expect(log.lines().map((entry) => entry.id)).toEqual([1, 2, 3, 4]);
});

test('an id the log has dropped from its window is still not added again', () => {
  const log = createChatLog();
  for (let id = 1; id <= 60; id += 1) log.add(line(id), 'me', 0);
  expect(log.add(line(3), 'me', 0)).toBe(false);
  expect(log.lines()).toHaveLength(50);
});

test('unread counts other players\' lines since the panel was last read, and read resets it', () => {
  const log = createChatLog();
  log.add(line(1, 'other'), 'me', 0);
  log.add(line(2, 'me'), 'me', 0);
  log.add(line(3, 'other'), 'me', 0);
  expect(log.unread()).toBe(2);
  log.markRead();
  expect(log.unread()).toBe(0);
  log.add(line(4, 'other'), 'me', 0);
  expect(log.unread()).toBe(1);
});

test('unread never exceeds the lines held', () => {
  const log = createChatLog();
  for (let id = 1; id <= 70; id += 1) log.add(line(id, 'other'), 'me', 0);
  expect(log.unread()).toBe(50);
});

test('recent gives lines younger than 6 s, at most 3, oldest first', () => {
  const log = createChatLog();
  expect(TOAST_SECONDS).toBe(6);
  expect(TOAST_COUNT).toBe(3);
  log.add(line(1), 'me', 0);
  log.add(line(2), 'me', 4);
  log.add(line(3), 'me', 5);
  log.add(line(4), 'me', 5.5);
  log.add(line(5), 'me', 5.9);
  expect(log.recent(6).map((entry) => entry.id)).toEqual([3, 4, 5]);
  expect(log.recent(9.5).map((entry) => entry.id)).toEqual([3, 4, 5]);
  expect(log.recent(11.6).map((entry) => entry.id)).toEqual([5]);
  expect(log.recent(11.9)).toEqual([]);
});

test('a line exactly 6 s old is gone', () => {
  const log = createChatLog();
  log.add(line(1), 'me', 0);
  expect(log.recent(5.99)).toHaveLength(1);
  expect(log.recent(6)).toHaveLength(0);
});

test('clear forgets the lines, the unread count and the last id', () => {
  const log = createChatLog();
  log.add(line(1, 'other'), 'me', 0);
  log.clear();
  expect(log.lines()).toEqual([]);
  expect(log.unread()).toBe(0);
  expect(log.add(line(1, 'other'), 'me', 0)).toBe(true);
});

test('the sender lets a burst of 4 through and blocks the 5th', () => {
  const sender = createChatSender();
  expect(CHAT_BURST).toBe(4);
  for (let count = 0; count < CHAT_BURST; count += 1) expect(sender.take(0)).toBe(true);
  expect(sender.take(0)).toBe(false);
});

test('the client refills slower than the server, so the server never drops what the client sent', () => {
  expect(CLIENT_REFILL_SECONDS).toBeGreaterThan(CHAT_REFILL_SECONDS);
});

test('one token is back after the client refill time, and a blocked try does not delay it', () => {
  const sender = createChatSender();
  for (let count = 0; count < CHAT_BURST; count += 1) sender.take(0);
  expect(sender.take(CLIENT_REFILL_SECONDS - 0.01)).toBe(false);
  expect(sender.take(CLIENT_REFILL_SECONDS)).toBe(true);
  expect(sender.take(CLIENT_REFILL_SECONDS)).toBe(false);
});

test('the bucket never holds more than the burst however long it rests', () => {
  const sender = createChatSender();
  expect(sender.take(0)).toBe(true);
  let passed = 0;
  for (let count = 0; count < 10; count += 1) if (sender.take(1000)) passed += 1;
  expect(passed).toBe(CHAT_BURST);
});

test('reset fills the bucket again', () => {
  const sender = createChatSender();
  for (let count = 0; count < CHAT_BURST; count += 1) sender.take(0);
  sender.reset();
  expect(sender.take(0)).toBe(true);
});

test('submitChat trims, counts code points and refuses blank (empty) or forbidden (invalid) text without using a token', () => {
  const sender = createChatSender();
  const sent: string[] = [];
  const send = (text: string) => sent.push(text);
  expect(submitChat('  hello  ', sender, 0, send)).toBe('sent');
  expect(sent).toEqual(['hello']);
  expect(submitChat('   ', sender, 0, send)).toBe('empty');
  expect(submitChat('a\nb', sender, 0, send)).toBe('invalid');
  expect(submitChat('x'.repeat(121), sender, 0, send)).toBe('invalid');
  expect(submitChat('😀'.repeat(120), sender, 0, send)).toBe('sent');
  expect(sent).toHaveLength(2);
  // Two tokens used so far; the empty tries took none.
  expect(submitChat('c', sender, 0, send)).toBe('sent');
  expect(submitChat('d', sender, 0, send)).toBe('sent');
});

test('submitChat reports slow and sends nothing when blocked', () => {
  const sender = createChatSender();
  const sent: string[] = [];
  const send = (text: string) => sent.push(text);
  for (let count = 0; count < CHAT_BURST; count += 1) submitChat('hi', sender, 0, send);
  expect(submitChat('again', sender, 0, send)).toBe('slow');
  expect(sent).toHaveLength(CHAT_BURST);
  expect(submitChat('later', sender, CLIENT_REFILL_SECONDS, send)).toBe('sent');
});

const plain = { code: 'KeyT', repeat: false, ctrlKey: false, metaKey: false, altKey: false };

test('T opens chat, except on repeat, with a modifier or while typing in a field', () => {
  expect(isChatKey(plain, 'CANVAS')).toBe(true);
  expect(isChatKey(plain, null)).toBe(true);
  expect(isChatKey({ ...plain, code: 'KeyH' }, null)).toBe(false);
  expect(isChatKey({ ...plain, repeat: true }, null)).toBe(false);
  expect(isChatKey({ ...plain, ctrlKey: true }, null)).toBe(false);
  expect(isChatKey({ ...plain, metaKey: true }, null)).toBe(false);
  expect(isChatKey({ ...plain, altKey: true }, null)).toBe(false);
  for (const tag of ['INPUT', 'input', 'SELECT', 'TEXTAREA']) expect(isChatKey(plain, tag)).toBe(false);
});

test('a replayed line is stored and deduped but gives no toast and no unread', () => {
  const log = createChatLog();
  log.add({ ...line(1, 'other'), replay: true }, 'me', 50);
  log.add(line(2, 'other'), 'me', 50);
  expect(log.lines().map((entry) => entry.id)).toEqual([1, 2]);
  expect(log.unread()).toBe(1);
  expect(log.recent(50).map((entry) => entry.id)).toEqual([2]);
  expect(log.add(line(1, 'other'), 'me', 60)).toBe(false);
});

test('the version changes with every added line and every clear, not with a refused line', () => {
  const log = createChatLog();
  const start = log.version();
  log.add(line(1), 'me', 0);
  expect(log.version()).toBe(start + 1);
  log.add(line(1), 'me', 0);
  expect(log.version()).toBe(start + 1);
  log.clear();
  expect(log.version()).toBe(start + 2);
});
