import { app, BrowserWindow } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const DASHBOARD_PORT = 3200;
const DASHBOARD_URL = `http://localhost:${DASHBOARD_PORT}`;

let serverProcess = null;

function checkServerRunning() {
  return new Promise((resolve) => {
    const req = http.get(DASHBOARD_URL, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

function startDashboardServer() {
  return new Promise((resolve, reject) => {
    serverProcess = spawn('npx', ['tsx', 'src/cli.ts', 'dashboard', '-p', PROJECT_ROOT, '--port', String(DASHBOARD_PORT)], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let output = '';
    serverProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    serverProcess.stderr.on('data', (data) => {
      output += data.toString();
    });

    serverProcess.on('error', (err) => {
      console.error('Failed to start dashboard server:', err.message);
      reject(err);
    });

    serverProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error('Dashboard server exited with code:', code, output);
      }
    });

    // poll until server is ready
    let attempts = 0;
    const maxAttempts = 50;
    const poll = () => {
      attempts++;
      const req = http.get(DASHBOARD_URL, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else if (attempts < maxAttempts) {
          setTimeout(poll, 200);
        } else {
          reject(new Error('Dashboard server not responding'));
        }
      });
      req.on('error', () => {
        if (attempts < maxAttempts) {
          setTimeout(poll, 200);
        } else {
          reject(new Error('Dashboard server not reachable after ' + maxAttempts + ' attempts'));
        }
      });
      req.setTimeout(1000, () => { req.destroy(); if (attempts < maxAttempts) setTimeout(poll, 200); });
    };
    setTimeout(poll, 500);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Milens Dashboard',
    webPreferences: {
      nodeIntegration: false,
    },
    icon: join(__dirname, 'icon.png'),
  });

  win.loadURL(DASHBOARD_URL);

  if (process.argv.includes('--dev')) {
    win.webContents.openDevTools();
  }

  win.on('closed', () => {
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
  });
}

app.whenReady().then(async () => {
  try {
    const alreadyRunning = await checkServerRunning();
    if (!alreadyRunning) {
      await startDashboardServer();
    }
    createWindow();
  } catch (e) {
    console.error('Failed to start dashboard:', e.message);
  }
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
