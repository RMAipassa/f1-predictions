import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = process.cwd();
const publicDir = path.join(root, 'public');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

let _crcTable = null;
function crcTable() {
  if (_crcTable) return _crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  _crcTable = table;
  return table;
}

function crc32(buf) {
  const table = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const d = data || Buffer.alloc(0);
  const len = u32(d.length);
  const crc = u32(crc32(Buffer.concat([t, d])));
  return Buffer.concat([len, t, d, crc]);
}

function pngRGBA(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type: RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[(stride + 1) * y] = 0; // filter: None
    rgba.copy(raw, (stride + 1) * y + 1, stride * y, stride * (y + 1));
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function fillRect(rgba, w, x, y, ww, hh, r, g, b, a) {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(w, x + ww);
  const h = Math.floor(rgba.length / (w * 4));
  const y1 = Math.min(h, y + hh);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * w + xx) * 4;
      rgba[i + 0] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = a;
    }
  }
}

function generateIcon(size) {
  const w = size;
  const h = size;
  const rgba = Buffer.alloc(w * h * 4);

  const n = (value) => Math.max(1, Math.round(size * value));
  const ink = [242, 240, 232, 255];
  const red = [216, 41, 32, 255];

  // Timing-board base and red datum lines.
  fillRect(rgba, w, 0, 0, w, h, 17, 18, 15, 255);
  fillRect(rgba, w, n(0.102), n(0.102), n(0.055), n(0.796), ...red);
  fillRect(rgba, w, n(0.157), n(0.789), n(0.741), n(0.109), ...red);

  // F monogram.
  fillRect(rgba, w, n(0.246), n(0.266), n(0.109), n(0.488), ...ink);
  fillRect(rgba, w, n(0.246), n(0.266), n(0.281), n(0.094), ...ink);
  fillRect(rgba, w, n(0.246), n(0.465), n(0.250), n(0.090), ...ink);

  // P monogram.
  fillRect(rgba, w, n(0.586), n(0.266), n(0.109), n(0.488), ...ink);
  fillRect(rgba, w, n(0.586), n(0.266), n(0.188), n(0.094), ...ink);
  fillRect(rgba, w, n(0.586), n(0.461), n(0.188), n(0.092), ...ink);
  fillRect(rgba, w, n(0.773), n(0.266), n(0.109), n(0.287), ...ink);

  // Small timing ticks.
  fillRect(rgba, w, n(0.219), n(0.164), n(0.070), n(0.023), 242, 240, 232, 140);
  fillRect(rgba, w, n(0.324), n(0.164), n(0.141), n(0.023), 242, 240, 232, 140);
  fillRect(rgba, w, n(0.500), n(0.164), n(0.035), n(0.023), 242, 240, 232, 140);
  fillRect(rgba, w, n(0.570), n(0.164), n(0.211), n(0.023), 242, 240, 232, 140);

  return pngRGBA(w, h, rgba);
}

function writeIcon(filename, size) {
  const outPath = path.join(publicDir, filename);
  const png = generateIcon(size);
  fs.writeFileSync(outPath, png);
  console.log('Wrote', outPath);
}

ensureDir(publicDir);

writeIcon('pwa-192.png', 192);
writeIcon('pwa-512.png', 512);
writeIcon('apple-touch-icon.png', 180);
