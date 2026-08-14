/**
 * preload.ts — 安全暴露后端端口给渲染进程。
 *
 * 渲染进程通过 window.yemu.backendPort 获取后端地址，
 * 无需直接访问 Node API。
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('yemu', {
  getBackendUrl: () => ipcRenderer.invoke('yemu:get-backend-url'),
  getBackendPort: () => ipcRenderer.invoke('yemu:get-backend-port'),
  onBackendReady: (callback: (url: string) => void) =>
    ipcRenderer.on('yemu:backend-ready', (_event, url) => callback(url)),
  onBackendStatus: (callback: (status: string) => void) =>
    ipcRenderer.on('yemu:backend-status', (_event, status) => callback(status)),
});
