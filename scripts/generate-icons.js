const fs = require("fs");
const path = require("path");

// This script generates a minimal icon set used by electron-builder.
// If you'd like to use your own logo, replace build/icon.png with your image (ideally 512x512 PNG)
// and build/icon.ico with a valid Windows icon file.

const buildDir = path.join(__dirname, "..", "build");
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// If icon files already exist (e.g. user-provided), do not overwrite them.
const iconPngPath = path.join(buildDir, "icon.png");
const iconIcoPath = path.join(buildDir, "icon.ico");
if (fs.existsSync(iconPngPath) && fs.existsSync(iconIcoPath)) {
  console.log("Using existing build/icon.png + build/icon.ico (user-provided)");
  process.exit(0);
}

// Generate a simple 256x256 purple PNG placeholder.
// Replace build/icon.png with your own logo (512x512 or higher recommended) for the best results.
const width = 256;
const height = 256;
const rgba = Buffer.alloc(width * height * 4);
for (let i = 0; i < width * height; i++) {
  const offset = i * 4;
  rgba[offset] = 0x5f; // R
  rgba[offset + 1] = 0x2c; // G
  rgba[offset + 2] = 0x8a; // B
  rgba[offset + 3] = 0xff; // A
}

function crc32(buffer) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[i] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = table[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const chunk = Buffer.alloc(8 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([chunk, crcBuf]);
}

function createPng(rgbaBuffer, width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type: RGBA
  ihdr.writeUInt8(0, 10); // compression method
  ihdr.writeUInt8(0, 11); // filter method
  ihdr.writeUInt8(0, 12); // interlace method

  const scanlines = Buffer.alloc((1 + width * 4) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    scanlines[rowStart] = 0; // no filter
    rgbaBuffer.copy(scanlines, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const zlib = require("zlib");
  const idat = zlib.deflateSync(scanlines);

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const iconPng = createPng(rgba, width, height);
fs.writeFileSync(path.join(buildDir, "icon.png"), iconPng);

// ICO file containing the PNG (modern Windows accepts PNG inside ICO).
const pngData = iconPng;
const icoHeader = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
const entry = Buffer.alloc(16);
entry.writeUInt8(width === 256 ? 0 : width, 0);
entry.writeUInt8(height === 256 ? 0 : height, 1);
entry.writeUInt8(0, 2); // color count
entry.writeUInt8(0, 3); // reserved
entry.writeUInt16LE(1, 4); // planes
entry.writeUInt16LE(32, 6); // bit count
entry.writeUInt32LE(pngData.length, 8);
entry.writeUInt32LE(icoHeader.length + entry.length, 12);
const icoBuffer = Buffer.concat([icoHeader, entry, pngData]);
fs.writeFileSync(path.join(buildDir, "icon.ico"), icoBuffer);

console.log("Generated build/icon.png and build/icon.ico (placeholder icons). Replace with your own logo if desired.");
