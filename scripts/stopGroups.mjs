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

// The first stop wins and sets the parent's exit code; a child's own failure passes its code, a user's signal passes 0.
// SIGTERM each group, then SIGKILL after 2 s for stragglers; the pending timer keeps the parent alive until then.
export function makeStopAll(children) {
  let stopping = false;
  return (code = 0) => {
    if (stopping) return;
    stopping = true;
    for (const child of children) killGroup(child, 'SIGTERM');
    setTimeout(() => {
      for (const child of children) killGroup(child, 'SIGKILL');
      process.exit(code);
    }, 2000);
  };
}

export const exitCodeOf = (code, signal) => (signal ? 1 : (code ?? 1));
