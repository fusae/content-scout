import { app, BrowserWindow, Menu, dialog, shell } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import { createServer, get as httpGet } from 'http';
import { createWriteStream, mkdirSync } from 'fs';
import { join } from 'path';

let mainWindow: BrowserWindow | null = null;
let adminProcess: ChildProcess | null = null;
let adminUrl = '';
let adminLogPath = '';
let adminPort = 0;
let restartAttempts = 0;
let isQuitting = false;

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate local port')));
        return;
      }

      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

function waitForHttp(url: string, timeoutMs = 30000): Promise<void> {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = (): void => {
      const request = httpGet(url, (response) => {
        response.resume();
        if ((response.statusCode || 0) < 500) {
          resolve();
          return;
        }

        retry();
      });

      request.on('error', retry);
      request.setTimeout(2000, () => {
        request.destroy();
        retry();
      });
    };

    const retry = (): void => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error('Spark 后台启动超时'));
        return;
      }

      setTimeout(check, 500);
    };

    check();
  });
}

function runtimeEnv(port: number): NodeJS.ProcessEnv {
  const env = { ...process.env };
  env.ADMIN_HOST = '127.0.0.1';
  env.ADMIN_PORT = String(port);

  if (app.isPackaged) {
    const runtimeDir = join(app.getPath('userData'), 'runtime');
    mkdirSync(runtimeDir, { recursive: true });
    adminLogPath = join(runtimeDir, 'desktop-admin.log');
    env.DB_PATH ||= join(runtimeDir, 'scout.db');
    env.LOG_FILE ||= join(runtimeDir, 'app.log');
    env.LOCAL_LOGIN_PROFILE_DIR ||= join(runtimeDir, 'browser-profiles');
  }

  return env;
}

function serverScriptPath(): string {
  return join(app.getAppPath(), 'dist', 'web', 'admin-server.js');
}

function appIconPath(): string {
  return join(app.getAppPath(), 'assets', 'spark-icon.png');
}

function startAdminServer(port: number): void {
  const env = runtimeEnv(port);
  const command = app.isPackaged ? process.execPath : 'node';
  const childEnv = app.isPackaged
    ? { ...env, ELECTRON_RUN_AS_NODE: '1' }
    : env;

  adminProcess = spawn(command, [serverScriptPath()], {
    cwd: app.isPackaged ? app.getPath('userData') : app.getAppPath(),
    env: childEnv,
    stdio: app.isPackaged ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (app.isPackaged && adminLogPath) {
    const logStream = createWriteStream(adminLogPath, { flags: 'a' });
    logStream.write(`\n--- ${new Date().toISOString()} ---\n`);
    adminProcess.stdout?.pipe(logStream, { end: false });
    adminProcess.stderr?.pipe(logStream, { end: false });
    adminProcess.once('exit', () => {
      logStream.end();
    });
  }

  adminProcess.once('exit', (code) => {
    adminProcess = null;
    if (!isQuitting) {
      if (restartAttempts < 3 && adminPort) {
        restartAttempts += 1;
        setTimeout(() => {
          startAdminServer(adminPort);
          void waitForHttp(adminUrl)
            .then(async () => {
              await mainWindow?.loadURL(adminUrl);
            })
            .catch((error: Error) => showBackendExitDialog(code, error.message));
        }, 1000);
        return;
      }

      showBackendExitDialog(code);
    }
  });
}

function showBackendExitDialog(code: number | null, extraDetail = ''): void {
  void dialog.showMessageBox({
    type: 'error',
    title: 'Spark',
    message: '后台服务已退出',
    detail: [
      code === null ? '进程被终止。' : `退出码：${code}`,
      extraDetail,
      adminLogPath ? `日志：${adminLogPath}` : '',
    ].filter(Boolean).join('\n'),
  });
}

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Spark',
      submenu: [
        {
          label: '在浏览器打开',
          click: () => {
            if (adminUrl) {
              void shell.openExternal(adminUrl);
            }
          },
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow(): Promise<void> {
  const port = await findFreePort();
  adminPort = port;
  adminUrl = `http://127.0.0.1:${port}`;
  startAdminServer(port);
  await waitForHttp(adminUrl);
  restartAttempts = 0;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    title: 'Spark',
    icon: appIconPath(),
    backgroundColor: '#f5f7fb',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await mainWindow.loadURL(adminUrl);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function stopAdminServer(): void {
  if (adminProcess && !adminProcess.killed) {
    adminProcess.kill();
  }
}

app.on('before-quit', () => {
  isQuitting = true;
  stopAdminServer();
});

app.whenReady()
  .then(async () => {
    if (process.platform === 'darwin') {
      app.dock?.setIcon(appIconPath());
    }
    createMenu();
    await createWindow();
  })
  .catch((error: Error) => {
    void dialog.showErrorBox('Spark 启动失败', error.message);
    app.quit();
  });

app.on('activate', () => {
  if (!mainWindow) {
    void createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
