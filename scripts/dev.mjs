// Runs the game server and the Vite dev server together, and stops both when either stops.
import { spawn } from 'node:child_process';

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
const stopAll = () => {
  for (const child of children) {
    try {
      if (windows) child.kill();
      else process.kill(-child.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
};
for (const child of children) child.on('exit', stopAll);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, stopAll);
