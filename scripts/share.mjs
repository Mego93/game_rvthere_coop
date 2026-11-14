// Starts the server behind a Cloudflare quick tunnel and prints the public address.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { exitCodeOf, makeStopAll } from './stopGroups.mjs';
import { parseShareArgs, tunnelUrl } from './shareLib.mjs';

const parsed = parseShareArgs(process.argv.slice(2), process.env);
if ('error' in parsed) {
  console.error(parsed.error);
  process.exit(1);
}
const { port } = parsed;
const windows = process.platform === 'win32';

const installHelp = () => {
  console.error('cloudflared is not installed or not on the PATH.');
  console.error('  macOS:  brew install cloudflared');
  console.error('  Other:  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
  console.error('A quick tunnel refuses to start when ~/.cloudflared/config.yml exists; move it aside first.');
  process.exit(1);
};

const probe = spawn('cloudflared', ['--version'], { stdio: 'ignore' });
probe.on('error', (error) => {
  if (error.code === 'ENOENT') installHelp();
  console.error(`Could not run cloudflared: ${error.message}`);
  process.exit(1);
});
probe.on('exit', (code, signal) => {
  if (code === 0) return run();
  console.error(code === null ? `cloudflared --version was stopped by ${signal}.` : `cloudflared --version exited with code ${code}.`);
  process.exit(1);
});

function run() {
  const detached = !windows;
  const server = spawn('npm', ['start'], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, TRUST_PROXY: '1', PORT: String(port) },
    shell: windows,
    detached,
  });
  const tunnel = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached,
  });
  const children = [server, tunnel];

  const stopAll = makeStopAll(children);
  tunnel.on('exit', (code, signal) => {
    if (!stopAll.isStopping()) console.error(`cloudflared exited (${code ?? signal}).`);
  });
  for (const child of children) child.on('exit', (code, signal) => stopAll(exitCodeOf(code, signal)));
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => stopAll(0));
  for (const child of children) child.on('error', (error) => {
    console.error(`Could not start a process: ${error.message}`);
    stopAll(1);
  });

  let printed = false;
  for (const stream of [tunnel.stdout, tunnel.stderr]) {
    createInterface({ input: stream }).on('line', (line) => {
      const url = tunnelUrl(line);
      if (!url) {
        if (line.trim()) console.error(line);
      } else if (!printed) {
        printed = true;
        console.log(`\nShare this address: ${url}`);
        console.log('Friends can open it once the server says it is listening.\n');
      }
    });
  }
}
