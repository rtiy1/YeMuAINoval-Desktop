// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========

import { exec, spawn } from 'child_process';
import { BrowserWindow, app } from 'electron';
import log from 'electron-log';
import fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import path from 'path';
import { promisify } from 'util';
import { PromiseReturnType } from './install-deps';
import { isBinaryExists } from './utils/process';

const execAsync = promisify(exec);

const DEFAULT_SERVER_URL = 'https://dev.eigent.ai';
// Starts after the backend process is spawned; uv/Python dependency repair runs before this.
const BACKEND_READY_TIMEOUT_MS = 5 * 60 * 1000;
const BACKEND_HEALTH_CHECK_INTERVAL_MS = 1000;
const BACKEND_HEALTH_REQUEST_TIMEOUT_MS = 1000;
const BACKEND_INITIAL_HEALTH_DELAY_MS = 2000;

function readEnvValue(filePath: string, key: string): string | undefined {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const line = lines.find((l) => {
      let trimmed = l.trim();
      if (!trimmed || trimmed.startsWith('#')) return false;
      // Handle lines with 'export' prefix (e.g. export SERVER_URL=value)
      if (trimmed.startsWith('export ')) {
        trimmed = trimmed.slice(7).trim();
      }
      return trimmed.startsWith(`${key}=`);
    });
    if (!line) return undefined;
    let raw = line.trim();
    // Strip 'export ' prefix before extracting value
    if (raw.startsWith('export ')) {
      raw = raw.slice(7).trim();
    }
    let value = raw.slice(key.length + 1).trim();
    // Strip surrounding quotes (single or double)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  } catch (error) {
    log.warn(`Failed to read ${key} from ${filePath}:`, error);
    return undefined;
  }
}

function buildLocalServerUrl(proxyUrl: string | undefined): string | undefined {
  if (!proxyUrl) return undefined;
  const trimmed = proxyUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return undefined;
  // Keep SERVER_URL as host/base only; API version belongs to concrete endpoints.
  return trimmed.replace(/\/api\/v[12]$/i, '');
}

// helper function to get main window
export function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows.length > 0 ? windows[0] : null;
}

export async function checkToolInstalled() {
  return new Promise<PromiseReturnType>(async (resolve, _reject) => {
    if (!(await isBinaryExists('uv'))) {
      resolve({ success: false, message: "uv doesn't exist" });
      return;
    }

    if (!(await isBinaryExists('bun'))) {
      resolve({ success: false, message: "Bun doesn't exist" });
      return;
    }

    resolve({ success: true, message: 'Tools exist already' });
  });
}

// export async function installDependencies() {
//     return new Promise<boolean>(async (resolve, reject) => {
//         console.log('start install dependencies')

//         // notify frontend start install
//         const mainWindow = getMainWindow();
//         if (mainWindow && !mainWindow.isDestroyed()) {
//             mainWindow.webContents.send('install-dependencies-start');
//         }

//         const isInstalCommandTool = await installCommandTool()
//         if (!isInstalCommandTool) {
//             resolve(false)
//             return
//         }
//         const uv_path = await getBinaryPath('uv')
//         const backendPath = getBackendPath()

//         // ensure backend directory exists and is writable
//         if (!fs.existsSync(backendPath)) {
//             fs.mkdirSync(backendPath, { recursive: true })
//         }

//         // touch installing lock file
//         const installingLockPath = path.join(backendPath, 'uv_installing.lock')
//         fs.writeFileSync(installingLockPath, '')
//         const proxy = ['--default-index', 'https://pypi.tuna.tsinghua.edu.cn/simple']
//         function isInChinaTimezone() {
//             const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
//             return timezone === 'Asia/Shanghai';
//         }
//         console.log('isInChinaTimezone', isInChinaTimezone())
//         const node_process = spawn(uv_path, ['sync', '--no-dev', ...(isInChinaTimezone() ? proxy : [])], { cwd: backendPath })
//         node_process.stdout.on('data', (data) => {
//             log.info(`Script output: ${data}`)
//             // notify frontend install log
//             const mainWindow = getMainWindow();
//             if (mainWindow && !mainWindow.isDestroyed()) {
//                 mainWindow.webContents.send('install-dependencies-log', { type: 'stdout', data: data.toString() });
//             }
//         })

//         node_process.stderr.on('data', (data) => {
//             log.error(`Script error: uv ${data}`)
//             // notify frontend install error log
//             const mainWindow = getMainWindow();
//             if (mainWindow && !mainWindow.isDestroyed()) {
//                 mainWindow.webContents.send('install-dependencies-log', { type: 'stderr', data: data.toString() });
//             }
//         })

//         node_process.on('close', async (code) => {
//             // delete installing lock file
//             if (fs.existsSync(installingLockPath)) {
//                 fs.unlinkSync(installingLockPath)
//             }

//             if (code === 0) {
//                 log.info('Script completed successfully')

//                 // touch installed lock file
//                 const installedLockPath = path.join(backendPath, 'uv_installed.lock')
//                 fs.writeFileSync(installedLockPath, '')
//                 console.log('end install dependencies')

//                 spawn(uv_path, ['run', 'task', 'babel'], { cwd: backendPath })
//                 resolve(true);
//                 // resolve(isSuccess);
//             } else {
//                 log.error(`Script exited with code ${code}`)
//                 // notify frontend install failed
//                 const mainWindow = getMainWindow();
//                 if (mainWindow && !mainWindow.isDestroyed()) {
//                     mainWindow.webContents.send('install-dependencies-complete', { success: false, code, error: `Script exited with code ${code}` });
//                     resolve(false);
//                 }
//             }
//         })
//     })
// }

export async function startBackend(
  setPort?: (port: number) => void,
  extraEnv: Record<string, string> = {}
): Promise<any> {
  const userData = app.getPath('userData');
  console.log('Starting YeMu bridge (replaces FastAPI backend)');
  // Try to find an available port, with aggressive cleanup if needed
  let port: number;
  const portFile = path.join(userData, 'port.txt');
  if (fs.existsSync(portFile)) {
    port = parseInt(fs.readFileSync(portFile, 'utf-8'));
    log.info(`Found port from file: ${port}`);
    await killProcessOnPort(port);
  }
  try {
    port = await findAvailablePort(5001);
    fs.writeFileSync(portFile, port.toString());
    log.info(`Found available port: ${port}`);
  } catch (error) {
    log.error('Failed to find available port, attempting cleanup...', error);

    // Last resort: try to kill all processes in the range
    for (let p = 5001; p <= 5050; p++) {
      await killProcessOnPort(p);
    }

    // Try once more
    port = await findAvailablePort(5001);
  }

  if (setPort) {
    setPort(port);
  }

  // ── YeMu bridge: replaces the Python (uvicorn) backend ──
  // The bridge implements the Eigent Brain REST+SSE contract and drives the
  // bundled mcode CLI as the agent engine. No Python, no venv, no uv.
  const bridgeEntry = app.isPackaged
    ? path.join(process.resourcesPath, 'bridge', 'bin', 'bridge.cjs')
    : path.join(app.getAppPath(), 'bridge', 'bin', 'bridge.cjs');

  // Forward a user-configured proxy to the bridge (and its mcode children).
  const proxyUrl = process.env.HTTP_PROXY || process.env.http_proxy;
  const proxyEnv = proxyUrl
    ? {
        HTTP_PROXY: proxyUrl,
        HTTPS_PROXY: proxyUrl,
        http_proxy: proxyUrl,
        https_proxy: proxyUrl,
      }
    : {};
  const resolvedServerUrl = process.env.SERVER_URL;

  const env = {
    ...process.env,
    ...proxyEnv,
    ...extraEnv,
    YEMU_BRIDGE_PORT: port.toString(),
    YEMU_BRIDGE_HOST: '127.0.0.1',
    SERVER_URL: resolvedServerUrl || DEFAULT_SERVER_URL,
    ...(app.isPackaged
      ? {
          // Packaged mode: the bridge (and the mcode CLI it spawns) live in
          // extraResources and run under Electron's embedded Node.
          ELECTRON_RUN_AS_NODE: '1',
          YEMU_MCODE_PACKAGE_DIR: path.join(process.resourcesPath, 'mcode'),
          YEMU_WORKSPACE_ROOT: path.join(app.getPath('userData'), 'workspace'),
        }
      : {}),
  };

  const displayFilteredLogs = (data: String) => {
    if (!data) return;
    const msg = data.toString().trimEnd();

    if (
      msg.toLowerCase().includes('error') ||
      msg.toLowerCase().includes('traceback')
    ) {
      log.error(`BRIDGE: ${msg}`);
    } else if (msg.toLowerCase().includes('warn')) {
      // Skip warnings
    } else if (msg.includes('DEBUG')) {
      log.debug(`BRIDGE: ${msg}`);
    } else {
      log.info(`BRIDGE: ${msg}`);
    }
  };

  return new Promise(async (resolve, reject) => {
    log.info(`Spawning YeMu bridge: ${bridgeEntry}`);

    const node_process = spawn(process.execPath, [bridgeEntry], {
      cwd: path.dirname(bridgeEntry),
      env: env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    node_process.stderr?.on('data', displayFilteredLogs);

    // NOTE: Do NOT use unref() - we need to maintain the process reference
    // to properly capture stdout/stderr and manage the process lifecycle

    log.info(`Backend process spawned with PID: ${node_process.pid}`);

    setTimeout(() => {
      if (node_process.killed) {
        log.error('Backend process was killed immediately after spawn');
      } else if (!node_process.pid) {
        log.error('Backend process has no PID');
      } else {
        log.info(
          `Backend process still running after 1s with PID ${node_process.pid}`
        );
      }
    }, 1000);

    let started = false;
    let healthCheckInterval: NodeJS.Timeout | null = null;

    const startTimeout = setTimeout(() => {
      if (!started) {
        started = true;
        if (healthCheckInterval) clearInterval(healthCheckInterval);
        killBackendProcess(node_process);
        reject(
          new Error(
            `Backend failed to start within ${Math.round(
              BACKEND_READY_TIMEOUT_MS / 1000
            )} seconds`
          )
        );
      }
    }, BACKEND_READY_TIMEOUT_MS);

    const initialDelay = setTimeout(() => {
      if (!started) {
        log.info('Starting backend health check polling...');
        pollHealthEndpoint();
      }
    }, BACKEND_INITIAL_HEALTH_DELAY_MS);

    const killBackendProcess = (proc: any) => {
      if (!proc || !proc.pid) return;

      log.info(`Killing backend process ${proc.pid} and its children...`);
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', proc.pid.toString(), '/T', '/F']);
        } else {
          try {
            process.kill(-proc.pid, 'SIGTERM');
            setTimeout(() => {
              try {
                process.kill(-proc.pid, 'SIGKILL');
              } catch (_error) {}
            }, 1000);
          } catch (e) {
            log.error(`Failed to kill process group: ${e}`);
            proc.kill('SIGKILL');
          }
        }
      } catch (e) {
        log.error(`Failed to kill backend process: ${e}`);
      }
    };

    const pollHealthEndpoint = (): void => {
      let attempts = 0;
      const maxAttempts = Math.ceil(
        BACKEND_READY_TIMEOUT_MS / BACKEND_HEALTH_CHECK_INTERVAL_MS
      );

      healthCheckInterval = setInterval(() => {
        attempts++;
        const healthUrl = `http://127.0.0.1:${port}/health`;
        log.debug(
          `Health check attempt ${attempts}/${maxAttempts}: ${healthUrl}`
        );

        const req = http.get(
          healthUrl,
          { timeout: BACKEND_HEALTH_REQUEST_TIMEOUT_MS },
          (res) => {
            if (res.statusCode === 200) {
              log.info(
                `Backend health check passed after ${attempts} attempts`
              );
              started = true;
              clearTimeout(startTimeout);
              if (healthCheckInterval) clearInterval(healthCheckInterval);
              resolve(node_process);
            } else {
              // Non-200 status (e.g., 404), continue polling unless max attempts reached
              if (attempts >= maxAttempts) {
                log.error(
                  `Backend health check failed after ${attempts} attempts with status ${res.statusCode}`
                );
                started = true;
                clearTimeout(startTimeout);
                if (healthCheckInterval) clearInterval(healthCheckInterval);
                killBackendProcess(node_process);
                reject(
                  new Error(
                    `Backend health check failed: HTTP ${res.statusCode}`
                  )
                );
              }
            }
          }
        );

        req.on('error', () => {
          // Connection error - backend might not be ready yet, continue polling
          if (attempts >= maxAttempts) {
            log.error(
              `Backend health check failed after ${attempts} attempts: unable to connect`
            );
            started = true;
            clearTimeout(startTimeout);
            if (healthCheckInterval) clearInterval(healthCheckInterval);
            killBackendProcess(node_process);
            reject(new Error('Backend health check failed: unable to connect'));
          }
        });

        req.on('timeout', () => {
          req.destroy();
          if (attempts >= maxAttempts) {
            log.error(
              `Backend health check timed out after ${attempts} attempts`
            );
            started = true;
            clearTimeout(startTimeout);
            if (healthCheckInterval) clearInterval(healthCheckInterval);
            killBackendProcess(node_process);
            reject(new Error('Backend health check timed out'));
          }
        });
      }, BACKEND_HEALTH_CHECK_INTERVAL_MS);
    };

    node_process.stderr.on('data', (data) => {
      displayFilteredLogs(data);

      if (
        data.toString().includes('Address already in use') ||
        data.toString().includes('bind() failed')
      ) {
        if (!started) {
          started = true;
          clearTimeout(startTimeout);
          clearTimeout(initialDelay);
          if (healthCheckInterval) clearInterval(healthCheckInterval);
          killBackendProcess(node_process);
          reject(new Error(`Port ${port} is already in use`));
        }
      }
    });

    node_process.on('error', (err) => {
      log.error(`Backend process error: ${err.message}`);
      if (!started) {
        started = true;
        clearTimeout(startTimeout);
        clearTimeout(initialDelay);
        if (healthCheckInterval) clearInterval(healthCheckInterval);
        reject(new Error(`Failed to spawn backend process: ${err.message}`));
      }
    });

    node_process.on('close', async (code, signal) => {
      log.info(`Backend process closed with code ${code}, signal ${signal}`);
      clearTimeout(startTimeout);
      clearTimeout(initialDelay);
      if (healthCheckInterval) clearInterval(healthCheckInterval);

      if (!started) {
        log.info(`Backend exited before ready, cleaning up port ${port}...`);
        await killProcessOnPort(port);
        reject(new Error(`Backend exited prematurely with code ${code}`));
      }
    });
  });
  // const node_process = spawn(
  //     uv_path,
  //     ["run", "uvicorn", "main:api", "--port", port.toString(), "--loop", "asyncio"],
  //     { cwd: backendPath, env: env, detached: false }
  // );

  // node_process.stdout.on('data', (data) => {
  //     log.info(`fastapi output: ${data}`)
  // })

  // node_process.stderr.on('data', (data) => {
  //     log.error(`fastapi stderr output: ${data}`)
  // })

  // node_process.on('close', (code) => {
  //     if (code === 0) {
  //         log.info('fastapi start success')
  //     } else {
  //         log.error(`fastapi exited with code ${code}`)

  //     }
  // })
  // return node_process
}

function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    // Set a timeout to prevent hanging
    const timeout = setTimeout(() => {
      server.close();
      resolve(false);
    }, 1000);

    server.once('error', (err: any) => {
      clearTimeout(timeout);
      if (err.code === 'EADDRINUSE') {
        // Try to connect to the port to verify it's truly in use
        const client = new net.Socket();
        client.setTimeout(500);

        client.once('connect', () => {
          client.destroy();
          resolve(false); // Port is definitely in use
        });

        client.once('error', () => {
          client.destroy();
          // Port might be in a weird state, consider it unavailable
          resolve(false);
        });

        client.once('timeout', () => {
          client.destroy();
          resolve(false);
        });

        client.connect(port, '127.0.0.1');
      } else {
        resolve(false);
      }
    });

    server.once('listening', () => {
      clearTimeout(timeout);
      server.close(() => {
        console.log('try port', port);
        resolve(true);
      }); // port available, close then return
    });

    // force listen all addresses, prevent judgment
    server.listen({ port, host: '127.0.0.1', exclusive: true });
  });
}

export async function killProcessOnPort(port: number): Promise<boolean> {
  try {
    const platform = process.platform;

    if (platform === 'win32') {
      // 1. get pid of process listen on port
      const { stdout: netstatOut } = await execAsync(
        `netstat -ano | findstr LISTENING | findstr :${port}`
      );
      const lines = netstatOut.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length === 0) {
        console.log(`no process listen on port ${port}`);
        return true;
      }

      // get pid from last field
      const pid = lines[0].trim().split(/\s+/).pop();
      if (!pid || isNaN(Number(pid))) {
        console.log(`Invalid PID extracted for port ${port}: ${pid}`);
        return false;
      }

      console.log(`Killing PID: ${pid}`);
      await execAsync(`taskkill /F /PID ${pid}`);
    } else if (platform === 'darwin') {
      await execAsync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`);
    } else {
      await execAsync(`fuser -k ${port}/tcp 2>/dev/null || true`);
    }

    // Wait a bit for the process to be killed
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Check if port is now available
    return await checkPortAvailable(port);
  } catch (error) {
    log.error(`Failed to kill process on port ${port}:`, error);
    return false;
  }
}

export async function findAvailablePort(
  startPort: number,
  maxAttempts = 50
): Promise<number> {
  const triedPorts = new Set<number>();

  const tryPort = async (port: number): Promise<number | null> => {
    if (triedPorts.has(port)) return null;
    triedPorts.add(port);

    const available = await checkPortAvailable(port);
    if (available) {
      return port;
    }

    const killed = await killProcessOnPort(port);
    if (killed) {
      return port;
    }

    return null;
  };

  // return when found port
  for (let offset = 0; offset < maxAttempts; offset++) {
    const port = startPort + offset;
    const found = await tryPort(port);
    if (found) return found;
  }

  throw new Error(
    `No available port found in range ${startPort} ~ ${startPort + maxAttempts - 1}`
  );
}
