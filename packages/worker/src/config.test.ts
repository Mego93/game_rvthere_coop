import { readFileSync } from 'node:fs';
import { SOCKET_PATH } from '@lodgy/shared';
import { expect, test } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const config = JSON.parse(
  read('../wrangler.jsonc')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,(\s*[}\]])/g, '$1'),
) as {
  main: string;
  assets: { binding: string; run_worker_first: string[]; not_found_handling: string };
  durable_objects: { bindings: { name: string; class_name: string }[] };
  migrations: { new_sqlite_classes: string[] }[];
};

test('the Worker runs first for the socket path only', () => {
  expect(config.assets.run_worker_first).toEqual([SOCKET_PATH]);
  expect(config.assets.not_found_handling).toBe('single-page-application');
});

test('binding and class names match the code', () => {
  const source = read('./index.ts');
  const routing = read('./route.ts');
  const [binding] = config.durable_objects.bindings;
  expect(source).toContain(`export class ${binding!.class_name} `);
  expect(routing).toMatch(new RegExp(`env\\.${binding!.name}\\.`));
  expect(routing).toContain(`env.${config.assets.binding}.fetch`);
  expect(config.migrations.flatMap((m) => m.new_sqlite_classes)).toContain(binding!.class_name);
  expect(config.main).toBe('src/index.ts');
});
