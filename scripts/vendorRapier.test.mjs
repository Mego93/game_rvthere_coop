import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { vendorRapier } from './vendorRapier.mjs';

const GLUE = `/* @ts-self-types="./rapier_wasm3d.d.ts" */
import * as wasm from "./rapier_wasm3d_bg.wasm";
import { __wbg_set_wasm } from "./rapier_wasm3d_bg.js";

__wbg_set_wasm(wasm);

export { version } from "./rapier_wasm3d_bg.js";
`;

function fixture(glue = GLUE) {
  const root = mkdtempSync(join(tmpdir(), 'vendor-'));
  const source = join(root, 'src');
  mkdirSync(source);
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: '@dimforge/rapier3d', version: '9.9.9' }));
  writeFileSync(join(source, 'rapier_wasm3d.js'), glue);
  writeFileSync(join(source, 'rapier_wasm3d_bg.wasm'), 'wasm');
  return { source, dest: join(root, 'out', 'rapier3d') };
}

describe('vendorRapier', () => {
  it('copies the package and patches the glue to take a precompiled module', () => {
    const { source, dest } = fixture();
    expect(vendorRapier({ source, dest })).toBe('9.9.9');
    const glue = readFileSync(join(dest, 'rapier_wasm3d.js'), 'utf8');
    expect(glue).toContain('import wasmModule from "./rapier_wasm3d_bg.wasm";');
    expect(glue).toContain('new WebAssembly.Instance(wasmModule, { "./rapier_wasm3d_bg.js": bg })');
    expect(glue).toContain('__wbg_set_wasm(instance.exports);');
    expect(glue).not.toContain('import * as wasm ');
    expect(glue).toContain('export { version }');
    expect(existsSync(join(dest, 'rapier_wasm3d_bg.wasm'))).toBe(true);
  });

  it('gives the same result when run twice', () => {
    const { source, dest } = fixture();
    vendorRapier({ source, dest });
    const first = readFileSync(join(dest, 'rapier_wasm3d.js'), 'utf8');
    vendorRapier({ source, dest });
    expect(readFileSync(join(dest, 'rapier_wasm3d.js'), 'utf8')).toBe(first);
    expect(first.split('__wbg_set_wasm(instance.exports)').length).toBe(2);
  });

  it('throws on a glue file of another shape', () => {
    const { source, dest } = fixture('import init from "./other.js";\n');
    expect(() => vendorRapier({ source, dest })).toThrow(/rapier_wasm3d\.js/);
    expect(existsSync(join(dest, 'rapier_wasm3d.js'))).toBe(false);
  });
});
