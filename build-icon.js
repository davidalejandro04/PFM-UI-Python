// Generates build/icon.png (256x256) and build/icon.ico from it.
// Called by build.ps1 — requires only Node.js built-ins.
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const buildDir = path.join(__dirname, 'build');
fs.mkdirSync(buildDir, { recursive: true });

// ── Generate PNG ──────────────────────────────────────────────
const w = 256, h = 256;
const R = 0x4e, G = 0xc9, B = 0x00; // #4ec900

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const payload = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(payload) >>> 0);
  return Buffer.concat([lenBuf, payload, crcBuf]);
}

const rowSize = 1 + w * 3;
const raw = Buffer.alloc(rowSize * h);
for (let y = 0; y < h; y++) {
  raw[y * rowSize] = 0;
  for (let x = 0; x < w; x++) {
    const p = y * rowSize + 1 + x * 3;
    raw[p] = R; raw[p + 1] = G; raw[p + 2] = B;
  }
}

const ihdrData = Buffer.alloc(13);
ihdrData.writeUInt32BE(w, 0); ihdrData.writeUInt32BE(h, 4);
ihdrData[8] = 8; ihdrData[9] = 2;

const pngData = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdrData),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

const pngPath = path.join(buildDir, 'icon.png');
fs.writeFileSync(pngPath, pngData);
console.log('    Created build/icon.png (256x256 green)');

// ── Generate ICO ──────────────────────────────────────────────
// ICO format: ICONDIR + ICONDIRENTRY + image data (BMP or PNG for size >= 256)
// For 256x256 we can embed the PNG directly (Vista+ ICO format)
const icoPath = path.join(buildDir, 'icon.ico');

// ICO header: reserved(2) + type(2) + count(2)
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);   // reserved
header.writeUInt16LE(1, 2);   // type: 1 = icon
header.writeUInt16LE(1, 4);   // image count

// ICONDIRENTRY: width(1) + height(1) + colorCount(1) + reserved(1) +
//               planes(2) + bitCount(2) + bytesInRes(4) + imageOffset(4)
const entry = Buffer.alloc(16);
entry.writeUInt8(0, 0);                          // width  0 = 256
entry.writeUInt8(0, 1);                          // height 0 = 256
entry.writeUInt8(0, 2);                          // color count
entry.writeUInt8(0, 3);                          // reserved
entry.writeUInt16LE(1, 4);                       // planes
entry.writeUInt16LE(32, 6);                      // bit count
entry.writeUInt32LE(pngData.length, 8);          // size of image data
entry.writeUInt32LE(6 + 16, 12);                 // offset = header + one entry

const ico = Buffer.concat([header, entry, pngData]);
fs.writeFileSync(icoPath, ico);
console.log('    Created build/icon.ico (256x256 embedded PNG)');
