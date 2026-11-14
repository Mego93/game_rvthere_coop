const parsePort = (text) => {
  if (!/^\d+$/.test(text)) return null;
  const port = Number(text);
  return port >= 1 && port <= 65535 ? port : null;
};

export function parseShareArgs(argv, env) {
  const at = argv.indexOf('--port');
  const text = at >= 0 ? argv[at + 1] : env.PORT ?? '3000';
  const port = text === undefined ? null : parsePort(text);
  if (port === null) return { error: `The port must be an integer from 1 to 65535, not "${text ?? ''}".` };
  return { port };
}

export function tunnelUrl(line) {
  const match = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/.exec(line);
  return match ? match[0] : null;
}
