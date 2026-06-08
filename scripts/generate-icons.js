/**
 * Generates simple PNG icons for the Chrome extension.
 * Run: node scripts/generate-icons.js
 */
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([len, typeBytes, data, crc]);
}

function createPNG(size, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData.writeUInt8(8, 8);  // bit depth
  ihdrData.writeUInt8(2, 9);  // color type: RGB
  // compression=0, filter=0, interlace=0 already zeroed

  // Raw image data: filter byte (0) + RGB per row
  const row = Buffer.alloc(1 + size * 3);
  row[0] = 0; // filter: None
  for (let x = 0; x < size; x++) {
    row[1 + x * 3]     = r;
    row[1 + x * 3 + 1] = g;
    row[1 + x * 3 + 2] = b;
  }
  const rawData = Buffer.concat(Array(size).fill(row));
  const compressed = zlib.deflateSync(rawData);

  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdrData),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

const iconsDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(iconsDir, { recursive: true });

// Brand color: #1a73e8
const [r, g, b] = [0x1a, 0x73, 0xe8];

for (const size of [16, 48, 128]) {
  const png = createPNG(size, r, g, b);
  const outPath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Created ${outPath}`);
}
