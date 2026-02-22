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

  // Background
  fillRect(rgba, w, 0, 0, w, h, 11, 15, 20, 255);

  // Red track stripe
  const stripeH = Math.max(10, Math.floor(size * 0.14));
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const xCenter = Math.floor(w * (0.20 + t * 0.65));
    const x0 = xCenter - Math.floor(stripeH * 1.6);
    const x1 = xCenter + Math.floor(stripeH * 1.6);
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || x >= w) continue;
      const yy = y;
      const i = (yy * w + x) * 4;
      rgba[i + 0] = 214;
      rgba[i + 1] = 31;
      rgba[i + 2] = 44;
      rgba[i + 3] = 255;
    }
  }

  // Checkers block
  const bx = Math.floor(size * 0.62);
  const by = Math.floor(size * 0.18);
  const bw = Math.floor(size * 0.26);
  const cell = Math.max(6, Math.floor(bw / 5));
  fillRect(rgba, w, bx, by, bw, bw, 15, 20, 32, 235);
  for (let cy = 0; cy < 5; cy++) {
    for (let cx = 0; cx < 5; cx++) {
      if ((cx + cy) % 2 === 0) {
        fillRect(
          rgba,
          w,
          bx + cx * cell + Math.floor(cell * 0.2),
          by + cy * cell + Math.floor(cell * 0.2),
          Math.floor(cell * 0.75),
          Math.floor(cell * 0.75),
          247,
          245,
          240,
          235
        );
      }
    }
  }

  // Simple "F1" glyph bars
  const gx = Math.floor(size * 0.16);
  const gy = Math.floor(size * 0.26);
  const gh = Math.floor(size * 0.18);
  const gw = Math.floor(size * 0.54);
  fillRect(rgba, w, gx, gy, gw, Math.floor(gh * 0.30), 247, 245, 240, 240);
  fillRect(rgba, w, gx, gy, Math.floor(gw * 0.12), gh, 247, 245, 240, 240);
  fillRect(
    rgba,
    w,
    gx + Math.floor(gw * 0.22),
    gy + Math.floor(gh * 0.55),
    Math.floor(gw * 0.78),
    Math.floor(gh * 0.30),
    247,
    245,
    240,
    240
  );

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
