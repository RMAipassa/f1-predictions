const { app, BrowserWindow } = require('electron');
const path = require('node:path');
// cloudflared is started by the Next.js server (instrumentation).

async function waitForHttp(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function createWindow(url) {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
  });
  await win.loadURL(url);
}

function getPort() {
  return Number(process.env.PORT || 3210);
}

async function main() {
  const port = getPort();
  process.env.PORT = String(port);
  process.env.HOSTNAME = '0.0.0.0';
  process.env.ENABLE_BACKGROUND_JOBS = process.env.ENABLE_BACKGROUND_JOBS || '1';
  process.env.APP_DATA_DIR = process.env.APP_DATA_DIR || path.join(app.getPath('userData'), 'data');
  process.env.CLOUDFLARED_PATH = path.join(process.resourcesPath, 'cloudflared.exe');

  const serverJs = path.join(app.getAppPath(), '.next', 'standalone', 'server.js');
  process.chdir(path.dirname(serverJs));
  require(serverJs);

  await waitForHttp(`http://127.0.0.1:${port}/login`);
  await createWindow(`http://127.0.0.1:${port}/login`);
}

app.whenReady().then(main);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
