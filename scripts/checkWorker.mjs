import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = mkdtempSync(join(tmpdir(), 'lodgy-worker-'));
const fail = (message) => {
  rmSync(out, { recursive: true, force: true });
  console.error(`check:worker FAILED: ${message}`);
  process.exit(1);
};

if (!existsSync('packages/client/dist')) fail('packages/client/dist is missing: run npm run build first');
const vendor = spawnSync('node', ['scripts/vendorRapier.mjs'], { encoding: 'utf8' });
if (vendor.status !== 0) fail(`vendorRapier failed\n${vendor.stdout}${vendor.stderr}`);

const run = spawnSync('npx', ['wrangler', 'deploy', '--dry-run', '--outdir', out], {
  cwd: 'packages/worker',
  encoding: 'utf8',
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
});
const log = `${run.stdout ?? ''}${run.stderr ?? ''}`;
if (run.status !== 0) fail(`wrangler deploy --dry-run exited with ${run.status}\n${log}`);

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
};
walk(out);
if (files.length === 0) fail('the dry run wrote no output');

// Source maps quote type-only imports in their sources; the code files are what runs.
const offenders = files.filter((file) => !file.endsWith('.map') && readFileSync(file).includes('rapier3d-compat'));
if (offenders.length > 0) fail(`the bundle contains rapier3d-compat: ${offenders.join(', ')}`);

const size = /Total Upload:.*$/m.exec(log)?.[0] ?? `${files.reduce((sum, file) => sum + statSync(file).size, 0)} bytes in ${files.length} files`;
console.log(log.trim());
console.log(`check:worker ok: no rapier3d-compat in the bundle. ${size}`);
rmSync(out, { recursive: true, force: true });
