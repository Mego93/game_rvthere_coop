import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { startServer } from './listen';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`PORT must be a number from 1 to 65535, not "${process.env.PORT}".`);
  process.exit(1);
}

const clientDir = fileURLToPath(new URL('../../../client/dist', import.meta.url));
// Optional overrides of the connection and create limits; the end-to-end run raises them.
const positiveInteger = (name: string): number | undefined => {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    console.error(`${name} must be a whole number of at least 1, not "${raw}".`);
    process.exit(1);
  }
  return value;
};
const limits = {
  createPerMinute: positiveInteger('CREATE_PER_MINUTE'),
  perAddress: positiveInteger('MAX_CONNECTIONS_PER_ADDRESS'),
};
// TRUST_PROXY=1 behind the Cloudflare Tunnel: the client address then comes from CF-Connecting-IP.
const trustProxy = process.env.TRUST_PROXY === '1';
// AUTOSTART=1 starts every room's run on creation, for the end-to-end run only. Remove in step 11 task 4a, when the e2e flows press Start.
const autostart = process.env.AUTOSTART === '1';
const server = await startServer({ port, clientDir, autostart, trustProxy, limits });
console.log(`Proxy trust is ${trustProxy ? 'on (CF-Connecting-IP decides the client address)' : 'off'}.`);

if (process.env.LODGY_DEV) {
  // Under "npm run dev" the page comes from Vite, which prints its own addresses.
  console.log(`Game server is running on port ${server.port}. Open the Vite address, not this port.`);
} else {
  console.log('Lodgy Co-op server is running.');
  console.log(`  On this machine:   http://localhost:${server.port}/`);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        console.log(`  On the same Wi-Fi: http://${address.address}:${server.port}/`);
      }
    }
  }
}
