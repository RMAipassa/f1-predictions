import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
const outDir = path.join(process.cwd(), 'bin');
const outFile = path.join(outDir, 'cloudflared.exe');

fs.mkdirSync(outDir, { recursive: true });

if (fs.existsSync(outFile) && fs.statSync(outFile).size > 1024 * 1024) {
  console.log('cloudflared already present:', outFile);
  process.exit(0);
}

console.log('Downloading cloudflared...');

function get(u) {
  return new Promise((resolve, reject) => {
    https
      .get(u, (res) => {
        const code = res.statusCode || 0;
        if (code >= 300 && code < 400 && res.headers.location) {
          res.resume();
          resolve(get(res.headers.location));
          return;
        }
        if (code !== 200) {
          res.resume();
          reject(new Error(`Download failed: ${code}`));
          return;
        }
        resolve(res);
      })
      .on('error', reject);
  });
}

const res = await get(url);
await new Promise((resolve, reject) => {
  const file = fs.createWriteStream(outFile);
  res.pipe(file);
  file.on('finish', () => file.close(resolve));
  file.on('error', reject);
});

console.log('Saved:', outFile);
