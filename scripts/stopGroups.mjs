const windows = process.platform === 'win32';

const killGroup = (child, signal) => {
  if (child.pid === undefined) return;
  try {
    if (windows) child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
};

// SIGTERM each group, then SIGKILL after 2 s for stragglers; the pending timer keeps the parent alive until then.
export function makeStopAll(children) {
  let stopping = false;
  return () => {
    if (stopping) return;
    stopping = true;
    for (const child of children) killGroup(child, 'SIGTERM');
    setTimeout(() => {
      for (const child of children) killGroup(child, 'SIGKILL');
      process.exit(process.exitCode ?? 0);
    }, 2000);
  };
}
