// Dev only: resizes the embedded textures of a GLB and writes it out. Usage:
//   node scripts/assets/optimizeGlb.mjs <in.glb> <out.glb> [--max 512]
//   node scripts/assets/optimizeGlb.mjs --batch <sourceRoot> [--out packages/client/public/models/sketchfab]
// The batch reads scripts/assets/sketchfabModels.json: { name, from (relative to sourceRoot), max }.
import { readFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune } from '@gltf-transform/functions';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const JPEG_QUALITY = 80;

// A texture counts as transparent when any pixel has alpha below 255.
async function hasTransparency(buffer) {
  const meta = await sharp(buffer).metadata();
  if (!meta.hasAlpha) return false;
  const { channels } = await sharp(buffer).stats();
  return channels[channels.length - 1].min < 255;
}

export async function optimizeGlb(input, output, { maxSize = 512 } = {}) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(input);
  for (const texture of doc.getRoot().listTextures()) {
    const source = Buffer.from(texture.getImage());
    const { width, height } = await sharp(source).metadata();
    const transparent = await hasTransparency(source);
    let image = sharp(source).resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true });
    if (!transparent) image = image.flatten({ background: '#ffffff' });
    const bytes = await (transparent ? image.png({ compressionLevel: 9, palette: true }) : image.jpeg({ quality: JPEG_QUALITY, mozjpeg: true })).toBuffer();
    // A texture already inside the limit is kept when re-encoding would not make it smaller.
    if (Math.max(width, height) <= maxSize && bytes.length >= source.length) continue;
    texture.setImage(new Uint8Array(bytes)).setMimeType(transparent ? 'image/png' : 'image/jpeg');
  }
  await doc.transform(dedup(), prune());
  mkdirSync(dirname(output), { recursive: true });
  await io.write(output, doc);
  return { before: statSync(input).size, after: statSync(output).size };
}

async function main(args) {
  const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  if (args.includes('--batch')) {
    const root = resolve(flag('--batch'));
    const out = resolve(flag('--out', join(here, '../../packages/client/public/models/sketchfab')));
    const list = JSON.parse(readFileSync(join(here, 'sketchfabModels.json'), 'utf8'));
    let total = 0;
    for (const { name, from, max } of list) {
      const { before, after } = await optimizeGlb(join(root, from), join(out, `${name}.glb`), { maxSize: max });
      total += after;
      console.log(`${name.padEnd(10)} ${(before / 1024).toFixed(0).padStart(6)} KB -> ${(after / 1024).toFixed(0).padStart(6)} KB`);
    }
    console.log(`total ${(total / 1024 / 1024).toFixed(2)} MB`);
    return;
  }
  const [input, output] = args;
  if (!input || !output) throw new Error('usage: optimizeGlb.mjs <in.glb> <out.glb> [--max 512] | --batch <sourceRoot>');
  const { before, after } = await optimizeGlb(input, output, { maxSize: Number(flag('--max', 512)) });
  console.log(`${before} -> ${after} bytes`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
