import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { courseIds, getCourse } from '@lodgy/shared';
import { startServer } from './listen';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`PORT must be a number from 1 to 65535, not "${process.env.PORT}".`);
  process.exit(1);
}

// COURSE=segment-demo runs every room on that course until the lobby (step 11) lets the admin choose.
const courseId = process.env.COURSE;
try {
  if (courseId !== undefined) getCourse(courseId);
} catch (error) {
  if (!(error instanceof Error) || !error.message.startsWith('Unknown course:')) throw error;
  const valid = courseIds().map((id) => `"${id}"`).join(' or ');
  console.error(`COURSE "${courseId}" is not a course. Use ${valid}, or leave it unset.`);
  process.exit(1);
}

const clientDir = fileURLToPath(new URL('../../../client/dist', import.meta.url));
// VEHICLE=rv runs every room with the RV until the lobby (step 11) lets the admin choose.
const server = await startServer({ port, clientDir, vehicleId: process.env.VEHICLE, courseId });

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
