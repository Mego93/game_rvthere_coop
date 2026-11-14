// Runs the game server and the Vite dev server together, and stops both when either stops.
import { spawn } from 'node:child_process';
import { exitCodeOf, makeStopAll } from './stopGroups.mjs';

const windows = process.platform === 'win32';
const npm = windows ? 'npm.cmd' : 'npm';
const children = ['@lodgy/server', '@lodgy/client'].map((workspace) =>
  spawn(npm, ['run', 'dev', '-w', workspace], {
    stdio: windows ? 'inherit' : ['ignore', 'inherit', 'inherit'],
    detached: !windows,
    env: { ...process.env, LODGY_DEV: '1' },
  }),
);

// Each child leads its own process group, so killing the group frees the ports its grandchildren hold.
const stopAll = makeStopAll(children);
for (const child of children) {
  child.on('exit', (code, signal) => stopAll(exitCodeOf(code, signal)));
  child.on('error', (error) => {
    console.error(`Could not start a process: ${error.message}`);
    stopAll(1);
  });
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => stopAll(0));
