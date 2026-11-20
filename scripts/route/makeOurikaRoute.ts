// One-off. Run: npx tsx scripts/route/makeOurikaRoute.ts <osrm.json> <profile.json>
// Turns the public Ourika road geometry (OSRM, OpenStreetMap contributors) and its SRTM heights (OpenTopoData) into ourika.route.ts: the last KEEP m of the road as local metres, one point every 20 m, the first point at the origin, the first 60 m toward -Z.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const KEEP = 3500;
const STEP = 20;
const [osrmPath, profilePath] = process.argv.slice(2);
if (!osrmPath || !profilePath) throw new Error('Usage: makeOurikaRoute.ts <osrm.json> <profile.json>');

const osrm = JSON.parse(readFileSync(osrmPath, 'utf8')) as { routes: { geometry: { coordinates: [number, number][] } }[] };
const profile = JSON.parse(readFileSync(profilePath, 'utf8')) as { s: number; lon: number; lat: number; z: number }[];
const coords = osrm.routes[0]!.geometry.coordinates;

const lat0 = coords[0]![1];
const mPerDegLat = 111_320 * 1;
const mPerDegLon = 111_320 * Math.cos((lat0 * Math.PI) / 180);
// East is +x, north is -z.
const flat = coords.map(([lon, lat]) => ({ x: (lon - coords[0]![0]) * mPerDegLon, z: -(lat - lat0) * mPerDegLat }));

// Arc length of the geometry, and the profile's height by its own arc length (linear between samples).
const cum = [0];
for (let i = 1; i < flat.length; i++) cum.push(cum[i - 1]! + Math.hypot(flat[i]!.x - flat[i - 1]!.x, flat[i]!.z - flat[i - 1]!.z));
const total = cum[cum.length - 1]!;
const scale = profile[profile.length - 1]!.s / total;
const heightAt = (s: number): number => {
  const t = s * scale;
  let i = 1;
  while (i < profile.length - 1 && profile[i]!.s < t) i++;
  const a = profile[i - 1]!;
  const b = profile[i]!;
  return a.z + ((b.z - a.z) * (t - a.s)) / (b.s - a.s);
};
const pointAt = (s: number): { x: number; z: number } => {
  let i = 1;
  while (i < cum.length - 1 && cum[i]! < s) i++;
  const u = (s - cum[i - 1]!) / (cum[i]! - cum[i - 1]!);
  return { x: flat[i - 1]!.x + (flat[i]!.x - flat[i - 1]!.x) * u, z: flat[i - 1]!.z + (flat[i]!.z - flat[i - 1]!.z) * u };
};

const from = total - KEEP;
const raw: { x: number; z: number; y: number }[] = [];
for (let s = from; s <= total + 1e-6; s += STEP) raw.push({ ...pointAt(s), y: heightAt(s) });
// Smooth the heights over three samples (SRTM is in whole metres).
const smooth = raw.map((p, i) => ({ ...p, y: (raw[Math.max(0, i - 1)]!.y + p.y + raw[Math.min(raw.length - 1, i + 1)]!.y) / 3 }));
// Rotate so the first 60 m run toward -Z, then shift the first point to the origin.
const head = smooth[Math.min(3, smooth.length - 1)]!;
const turn = Math.atan2(head.x - smooth[0]!.x, -(head.z - smooth[0]!.z));
const cos = Math.cos(turn);
const sin = Math.sin(turn);
const r1 = (v: number): number => Math.round(v * 10) / 10;
const rows = smooth.map((p) => {
  const dx = p.x - smooth[0]!.x;
  const dz = p.z - smooth[0]!.z;
  return [r1(dx * cos + dz * sin), r1(-dx * sin + dz * cos), r1(p.y - smooth[0]!.y)];
});
const text = [
  `// Local metres, one point every ${STEP} m, first point at the origin, the first 60 m run toward -Z (x is east); y is the height above the first point. Route: OpenStreetMap contributors (ODbL); heights: SRTM via OpenTopoData.`,
  'export const OURIKA_ROUTE: readonly (readonly [x: number, z: number, y: number])[] = [',
  ...rows.map((r) => `  [${r.join(', ')}],`),
  '];',
  '',
].join('\n');
writeFileSync(fileURLToPath(new URL('../../packages/shared/src/courses/ourika.route.ts', import.meta.url)), text);
console.log(`points ${rows.length}, from ${from.toFixed(0)} of ${total.toFixed(0)} m, rise ${(rows[rows.length - 1]![2]!).toFixed(1)} m`);
