/**
 * Electron 主进程 — 启动后端子进程 + 创建应用窗口。
 *
 * 流程：
 * 1. 找到可用端口
 * 2. spawn 后端（tsx 运行 backend/src/main.ts）
 * 3. 等待后端健康检查通过
 * 4. 创建 BrowserWindow 加载前端（开发：Vite dev server，生产：本地构建产物）
 *
 * 设计参考 OpenFic desktop/src/main/main.ts。
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(dirname(import.meta.url));
const isDev = !app.isPackaged;

let backendProcess: ChildProcess | null = null;
let backendPort = 8787;
let mainWindow: BrowserWindow | null = null;

/** 找到一个可用端口。 */
function findAvailablePort(start: number = 8787): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(start, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

/** 等待后端健康检查通过。 */
async function waitForBackend(port: number, maxRetries = 30): Promise<void> {
  const url = `http://127.0.0.1:${port}/api/health`;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return;
    } catch {
      // 后端尚未启动，继续重试
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`后端在 ${maxRetries} 次重试后仍未就绪`);
}

/** 启动后端子进程。 */
async function startBackend(): Promise<string> {
  backendPort = await findAvailablePort();

  // 数据目录放在用户数据目录下
  const dataDir = join(app.getPath('userData'), 'data');
  const env = {
    ...process.env,
    YEMU_PORT: String(backendPort),
    YEMU_HOST: '127.0.0.1',
    YEMU_DATA_DIR: dataDir,
    NODE_ENV: isDev ? 'development' : 'production',
    // 生产模式下静态托管前端构建产物
    YEMU_FRONTEND_DIST: isDev ? '' : join(__dirname, '..', 'frontend'),
  };

  if (isDev) {
    // 开发模式：用 tsx 运行后端源码
    const backendSrc = join(__dirname, '..', '..', 'backend', 'src', 'main.ts');
    backendProcess = spawn('npx', ['tsx', backendSrc], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: join(__dirname, '..', '..', 'backend'),
    });
  } else {
    // 生产模式：运行编译后的 JS
    const backendEntry = join(__dirname, '..', 'backend', 'main.js');
    backendProcess = spawn('node', [backendEntry], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  }

  // 转发后端日志到主进程 stdout/stderr
  backendProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[backend] ${data.toString().trim()}`);
  });
  backendProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[backend] ${data.toString().trim()}`);
  });

  backendProcess.on('exit', (code, signal) => {
    console.log(`后端进程退出: code=${code}, signal=${signal}`);
    backendProcess = null;
  });

  // 等待后端就绪
  await waitForBackend(backendPort);
  const url = `http://127.0.0.1:${backendPort}`;
  console.log(`后端已就绪: ${url}`);
  return url;
}

/** 创建主窗口。 */
function createWindow(backendUrl: string): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: '夜幕 · AI 小说工作台',
    backgroundColor: '#1a1b1e',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    // 开发模式：加载 Vite dev server，并注入后端地址
    mainWindow.loadURL('http://localhost:5173/');
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.executeJavaScript(
        `window.__YEMU_BACKEND_URL__ = ${JSON.stringify(backendUrl)};`,
      );
    });
    // 开发模式打开 DevTools
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // 生产模式：后端静态托管前端
    mainWindow.loadURL(backendUrl);
  }
}

// IPC 处理
ipcMain.handle('yemu:get-backend-url', () => `http://127.0.0.1:${backendPort}`);
ipcMain.handle('yemu:get-backend-port', () => backendPort);

// 应用生命周期
app.whenReady().then(async () => {
  try {
    const backendUrl = await startBackend();
    createWindow(backendUrl);
  } catch (err) {
    console.error('启动失败:', err);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(`http://127.0.0.1:${backendPort}`);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
});

// 确保子进程被清理
process.on('exit', () => {
  if (backendProcess) {
    backendProcess.kill('SIGTERM');
  }
});
