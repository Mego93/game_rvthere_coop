// Runs the game server and the Vite dev server together, and stops both when either stops.
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = ['@lodgy/server', '@lodgy/client'].map((workspace) =>
  spawn(npm, ['run', 'dev', '-w', workspace], { stdio: 'inherit', env: { ...process.env, LODGY_DEV: '1' } }),
);

const stopAll = () => {
  for (const child of children) child.kill();
};
for (const child of children) child.on('exit', stopAll);
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
