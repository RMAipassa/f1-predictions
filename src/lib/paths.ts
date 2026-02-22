import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function getDataDir() {
  const envDir = process.env.APP_DATA_DIR;
  const dir = envDir
    ? path.resolve(envDir)
    : process.platform === 'win32' && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'F1Predictions', 'data')
      : path.join(os.homedir(), '.f1-predictions', 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
