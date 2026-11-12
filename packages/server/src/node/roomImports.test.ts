import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// The room tsconfig alone cannot enforce this: importing "ws" type-checks and brings Node's types in with it.
const roomDir = fileURLToPath(new URL('../room', import.meta.url));
const roomFiles = readdirSync(roomDir, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.ts'))
  .sort();

const ALLOWED_EVERYWHERE = /^(\.{1,2}\/[\w./-]+|@lodgy\/shared)$/;
const ALLOWED_IN_TESTS = /^(vitest|@dimforge\/rapier3d-compat)$/;
const SPECIFIER = /\b(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g;

function specifiers(source: string): string[] {
  return [...source.matchAll(SPECIFIER)].map((match) => match[1]!);
}

test('the room layer has files to check', () => {
  expect(roomFiles).toContain('nouns.ts');
});

test.each(roomFiles)('room/%s imports only room files and @lodgy/shared', (file) => {
  const source = readFileSync(path.join(roomDir, file), 'utf8');
  const isTest = file.endsWith('.test.ts');
  const forbidden = specifiers(source).filter(
    (specifier) => !ALLOWED_EVERYWHERE.test(specifier) && !(isTest && ALLOWED_IN_TESTS.test(specifier)),
  );
  expect(forbidden).toEqual([]);
  // A relative import must not climb out of the room layer into the Node adapter.
  const outside = specifiers(source).filter(
    (specifier) => specifier.startsWith('.') && !path.resolve(roomDir, path.dirname(file), specifier).startsWith(roomDir + path.sep),
  );
  expect(outside).toEqual([]);
  // A triple-slash reference would bring Node or DOM types in without an import.
  expect(source).not.toMatch(/\/\/\/\s*<reference/);
});
