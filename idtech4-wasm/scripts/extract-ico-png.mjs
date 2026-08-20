#!/usr/bin/env node
import fs from 'node:fs';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error('usage: extract-ico-png.mjs INPUT.ico OUTPUT.png');

const icon = fs.readFileSync(inputPath);
if (icon.length < 22 || icon.readUInt16LE(0) !== 0 || icon.readUInt16LE(2) !== 1) {
  throw new Error(`${inputPath}: not an ICO file`);
}
const count = icon.readUInt16LE(4);
let best = null;
for (let index = 0; index < count; index += 1) {
  const entry = 6 + index * 16;
  if (entry + 16 > icon.length) throw new Error(`${inputPath}: truncated ICO directory`);
  const width = icon[entry] || 256;
  const height = icon[entry + 1] || 256;
  const length = icon.readUInt32LE(entry + 8);
  const offset = icon.readUInt32LE(entry + 12);
  if (offset + length > icon.length) throw new Error(`${inputPath}: invalid ICO image bounds`);
  const png = icon.subarray(offset, offset + length);
  const isPng = png.length >= 8 && png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (isPng && (!best || width * height > best.width * best.height)) best = { width, height, png };
}
if (!best) throw new Error(`${inputPath}: no embedded PNG icon found`);
fs.writeFileSync(outputPath, best.png);
process.stdout.write(`extracted ${best.width}x${best.height} PNG from ${inputPath}\n`);
