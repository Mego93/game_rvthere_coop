import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { optimizeGlb } from './optimizeGlb.mjs';

const io = new NodeIO();

async function sample(dir, name, size, channels) {
  const raw = Buffer.alloc(size * size * channels);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7) % 256;
  const image = await sharp(raw, { raw: { width: size, height: size, channels } }).png().toBuffer();
  const doc = new Document();
  const buffer = doc.createBuffer();
  const texture = doc.createTexture('t').setImage(new Uint8Array(image)).setMimeType('image/png');
  const material = doc.createMaterial('m').setBaseColorTexture(texture);
  const position = doc.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])).setBuffer(buffer);
  const uv = doc.createAccessor().setType('VEC2').setArray(new Float32Array([0, 0, 1, 0, 0, 1])).setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute('POSITION', position).setAttribute('TEXCOORD_0', uv).setMaterial(material);
  const mesh = doc.createMesh('mesh').addPrimitive(prim);
  doc.createScene('s').addChild(doc.createNode('n').setMesh(mesh));
  const path = join(dir, name);
  writeFileSync(path, await io.writeBinary(doc));
  return path;
}

describe('optimizeGlb', () => {
  it('shrinks a large opaque texture to the limit and re-encodes it as JPEG', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'optglb-'));
    const input = await sample(dir, 'in.glb', 1024, 3);
    const output = join(dir, 'out.glb');
    const report = await optimizeGlb(input, output, { maxSize: 256 });
    const doc = await io.read(output);
    const [texture] = doc.getRoot().listTextures();
    expect(texture.getSize()).toEqual([256, 256]);
    expect(texture.getMimeType()).toBe('image/jpeg');
    expect(report.after).toBeLessThan(report.before);
  });

  it('keeps a texture that is already small and keeps one with real transparency as PNG', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'optglb-'));
    const small = await sample(dir, 'small.glb', 128, 3);
    await optimizeGlb(small, join(dir, 'small-out.glb'), { maxSize: 256 });
    const [kept] = (await io.read(join(dir, 'small-out.glb'))).getRoot().listTextures();
    expect(kept.getSize()).toEqual([128, 128]);
    const alpha = await sample(dir, 'alpha.glb', 512, 4);
    await optimizeGlb(alpha, join(dir, 'alpha-out.glb'), { maxSize: 256 });
    const [png] = (await io.read(join(dir, 'alpha-out.glb'))).getRoot().listTextures();
    expect(png.getSize()).toEqual([256, 256]);
    expect(png.getMimeType()).toBe('image/png');
  });

  it('is reproducible: the same input gives the same bytes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'optglb-'));
    const input = await sample(dir, 'in.glb', 512, 3);
    await optimizeGlb(input, join(dir, 'a.glb'), { maxSize: 128 });
    await optimizeGlb(input, join(dir, 'b.glb'), { maxSize: 128 });
    expect(readFileSync(join(dir, 'a.glb')).equals(readFileSync(join(dir, 'b.glb')))).toBe(true);
  });
});
