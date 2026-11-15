import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMPORT = 'import * as wasm from "./rapier_wasm3d_bg.wasm";';
const SET = '__wbg_set_wasm(wasm);';
// workerd refuses to compile wasm at run time, so the module is imported precompiled and instantiated here.
const PATCHED_IMPORT = 'import wasmModule from "./rapier_wasm3d_bg.wasm";\nimport * as bg from "./rapier_wasm3d_bg.js";';
const PATCHED_SET = [
  'const instance = new WebAssembly.Instance(wasmModule, { "./rapier_wasm3d_bg.js": bg });',
  '__wbg_set_wasm(instance.exports);',
  'if (instance.exports.__wbindgen_start) instance.exports.__wbindgen_start();',
].join('\n');

// Copies the non-compat Rapier build and patches its glue for Workers; returns the version.
export function vendorRapier({
  source = join(ROOT, 'node_modules/@dimforge/rapier3d'),
  dest = join(ROOT, 'packages/worker/vendor/rapier3d'),
} = {}) {
  const glue = readFileSync(join(source, 'rapier_wasm3d.js'), 'utf8');
  if (glue.split(IMPORT).length !== 2 || glue.split(SET).length !== 2) {
    throw new Error('rapier_wasm3d.js does not have the expected text; the Rapier version changed, so update scripts/vendorRapier.mjs.');
  }
  const version = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')).version;
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(source, dest, { recursive: true });
  writeFileSync(join(dest, 'rapier_wasm3d.js'), glue.replace(IMPORT, PATCHED_IMPORT).replace(SET, PATCHED_SET));
  return version;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`Vendored @dimforge/rapier3d ${vendorRapier()} for Workers.`);
}
