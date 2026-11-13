// Writes the web app icons: a blue square with a white L. Run by hand: node scripts/icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const BLUE = [0x2f, 0x6f, 0x9f, 0xff];
const WHITE = [0xff, 0xff, 0xff, 0xff];

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

function png(size) {
  const inStem = (x, y) => x >= 0.3 * size && x < 0.45 * size && y >= 0.2 * size && y < 0.8 * size;
  const inFoot = (x, y) => x >= 0.3 * size && x < 0.7 * size && y >= 0.65 * size && y < 0.8 * size;
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    rows[row] = 0;
    for (let x = 0; x < size; x++) {
      const colour = inStem(x, y) || inFoot(x, y) ? WHITE : BLUE;
      Buffer.from(colour).copy(rows, row + 1 + x * 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  // Colour type 6: RGBA.
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('packages/client/public', { recursive: true });
for (const size of [192, 512]) writeFileSync(`packages/client/public/icon-${size}.png`, png(size));
