const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const iconv = require('iconv-lite');
const { startServer, stopServer } = require('./server');
const configStore = require('./store');
const usbManager = require('./usbManager');
const tcpPrinterManager = require('./tcpPrinterManager');
const logger = require('./logger');
const { getAutoLaunchEnabled, setAutoLaunchEnabled } = require('./startup');
const updater = require('./updater');
const telemetry = require('./telemetry');
const printerMappings = require('./printerMappings');
const printHistory = require('./printHistory');
const createWsClient = require('./wsClient');

const ICON_PATH = path.join(__dirname, '../assets/icon-512.svg');
const FALLBACK_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABG0lEQVQ4T6WTQU7DMBREnyCgDaAG0L4EtAcQbKAbwA6gG0AN0BHYBNAcxvWk5t6iIpK1l+RkhcePgjyTn3vnPGzCQlwJ2Y8aKZBEMswaNee5j3FAFSYBEd8sn7jCSoa6k5kBwh7XSwUVccAq1sm49XMwY9+xS3OAAxQyLP2Ni05DyuguSYwhNnhKe2mLUA3F6CrKeNOrP4kM/Cpsb5K60wk0LSdexM0haGMXGhYluuQsoS52sw84pwK1sJdD7ZN0+x93vHAKxOJ5f3i6yQmguSlJ3J6vNEvCYYJdC085nRx2SJdF/Q1FHdgCHZh9twmtIDAD7zNDCDg20xgiVeLtSzdoqQO55IFJGTfg9HvvU6HyEtTT8SYA9TPhnWe0bJIqM9ckRlQYLtY6w/9AcqbTjp3nslAAAAAElFTkSuQmCC';

function loadIcon({ template = false } = {}) {
  let image = nativeImage.createFromPath(ICON_PATH);
  if (!image || image.isEmpty()) {
    try {
      const svgBuffer = fs.readFileSync(ICON_PATH);
      image = nativeImage.createFromBuffer(svgBuffer, { scaleFactor: 1 });
    } catch (error) {
      image = nativeImage.createFromDataURL(FALLBACK_ICON_DATA_URL);
    }
  }
  if ((!image || image.isEmpty()) && FALLBACK_ICON_DATA_URL) {
    image = nativeImage.createFromDataURL(FALLBACK_ICON_DATA_URL);
  }
  if (template && process.platform === 'darwin' && !image.isEmpty()) {
    image.setTemplateImage(true);
  }
  if (process.platform === 'win32' && !template && !image.isEmpty()) {
    image = image.resize({ width: 32, height: 32 });
  }
  return image;
}

let mainWindow = null;
let tray = null;
let serverHandle = null;
let quitting = false;
let remoteClient = null;

function getMappingKey(vendorId, productId) {
  return printerMappings.buildUsbKey(vendorId, productId);
}

function emitPrinterMappings() {
  if (!mainWindow?.webContents) return;
  mainWindow.webContents.send('agent:printer-mappings-updated', {
    mappings: printerMappings.getMappings()
  });
  remoteClient?.forceHeartbeat();
}

function emitPrintHistory() {
  if (!mainWindow?.webContents) return;
  mainWindow.webContents.send('agent:print-history-updated', {
    history: printHistory.getHistory()
  });
  remoteClient?.forceHeartbeat();
}

function buildTestPayload({ connectionType = 'usb', vendorId, productId, alias, role, ip, port }) {
  const ESC = '\x1B';
  const GS = '\x1D';
  const now = new Date().toLocaleString();
  const lines = [
    ESC + '@',
    ESC + '!' + '\x30',
    'LOCAL USB AGENT\n',
    ESC + '!' + '\x00',
    '测试打印任务\n',
    '------------------------------\n',
    `时间: ${now}\n`,
    connectionType === 'tcp'
      ? `TCP: ${ip || '未知地址'}:${port || 9100}\n`
      : `Vendor: 0x${Number(vendorId || 0).toString(16)}\nProduct: 0x${Number(productId || 0).toString(16)}\n`,
    alias ? `别名: ${alias}\n` : '',
    role ? `用途: ${role}\n` : '',
    '------------------------------\n',
    '打印成功即表示本地代理正常\n\n',
    GS + 'V' + '\x41' + '\x0A'
  ];
  return iconv.encode(lines.join(''), 'gb18030');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 640,
    show: false,
    autoHideMenuBar: true,
    icon: loadIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const startUrl = path.join(__dirname, '../renderer/index.html');
  mainWindow.loadFile(startUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('close', (event) => {
    if (quitting) {
      return;
    }
    const preferences = configStore.get('preferences') || {};
    const runInBackground = preferences.runInBackground !== false;
    if (runInBackground) {
      event.preventDefault();
      mainWindow?.hide();
      return;
    }
    quitting = true;
  });
}

function ensureTray() {
  if (tray) return;
  const icon = loadIcon({ template: process.platform === 'darwin' });
  tray = new Tray(icon);
  tray.setToolTip('Local USB Print Agent');
  tray.on('click', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开控制面板',
      click: () => {
        if (!mainWindow) return;
        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      label: '重新扫描设备',
      click: async () => {
        await usbManager.refreshDevices();
        mainWindow?.webContents.send('agent:devices-updated');
      }
    },
    {
      label: '测试默认打印机',
      click: async () => {
        try {
          const mappings = printerMappings.getMappings();
          const defaultEntry = Object.entries(mappings).find(([, value]) => value?.isDefault);
          if (!defaultEntry) {
            dialog.showMessageBox({
              type: 'warning',
              title: '未配置默认打印机',
              message: '请在应用界面中为设备勾选“默认”后再测试。'
            });
            return;
          }
          const [key, mapping] = defaultEntry;
          const parsed = printerMappings.parseKey(key);
          if (!parsed) {
            throw new Error('无法解析默认打印机配置');
          }

          if (parsed.connectionType === 'usb') {
            await usbManager.refreshDevices();
            const devices = usbManager.getDevices();
            const vendorId = Number(parsed.vendorId);
            const productId = Number(parsed.productId);
            if (!Number.isFinite(vendorId) || !Number.isFinite(productId)) {
              throw new Error('默认打印机配置无效');
            }
            const match = devices.find((device) => device.vendorId === vendorId && device.productId === productId);
            if (!match) {
              dialog.showMessageBox({
                type: 'error',
                title: '测试失败',
                message: '未找到默认打印机，请确认 USB 设备已连接。'
              });
              return;
            }
            const buffer = buildTestPayload({
              connectionType: 'usb',
              vendorId,
              productId,
              alias: mapping.alias,
              role: mapping.role
            });
            await usbManager.print({ data: buffer, encoding: 'buffer', vendorId, productId });
            printerMappings.updateMapping(key, {
              lastTest: {
                status: 'success',
                message: '托盘测试打印成功',
                timestamp: new Date().toISOString()
              }
            });
            printHistory.append({
              type: 'tray-test',
              connectionType: 'usb',
              vendorId,
              productId,
              alias: mapping.alias,
              role: mapping.role,
              status: 'success',
              message: '托盘菜单触发测试成功'
            });
          } else if (parsed.connectionType === 'tcp') {
            const buffer = buildTestPayload({
              connectionType: 'tcp',
              ip: parsed.ip,
              port: parsed.port,
              alias: mapping.alias,
              role: mapping.role
            });
            await tcpPrinterManager.print({
              ip: parsed.ip,
              port: parsed.port,
              data: buffer,
              encoding: 'buffer'
            });
            printerMappings.updateMapping(key, {
              lastTest: {
                status: 'success',
                message: '托盘测试打印成功',
                timestamp: new Date().toISOString()
              }
            });
            printHistory.append({
              type: 'tray-test',
              connectionType: 'tcp',
              ip: parsed.ip,
              port: parsed.port,
              alias: mapping.alias,
              role: mapping.role,
              status: 'success',
              message: '托盘菜单触发测试成功'
            });
          } else {
            dialog.showMessageBox({
              type: 'warning',
              title: '不支持的打印机类型',
              message: '当前默认打印机类型暂不支持托盘测试，请在应用内执行测试。'
            });
            return;
          }
          emitPrinterMappings();
          emitPrintHistory();
          dialog.showMessageBox({
            type: 'info',
            title: '测试完成',
            message: '测试打印已发送，请检查打印机是否出纸。'
          });
        } catch (error) {
          logger.error('Tray test default printer failed', error);
          dialog.showMessageBox({
            type: 'error',
            title: '测试失败',
            message: error?.message || '测试默认打印机失败，请查看日志。'
          });
        }
      }
    },
    {
      label: '默认打印机设置',
      submenu: [
        {
          label: '查看当前配置',
          click: () => {
            const mappings = printerMappings.getMappings();
            const defaultEntry = Object.entries(mappings).find(([, value]) => value?.isDefault);
            if (!defaultEntry) {
              dialog.showMessageBox({
                type: 'info',
                title: '默认打印机',
                message: '尚未设置默认打印机。'
              });
              return;
            }
            const [key, mapping] = defaultEntry;
            dialog.showMessageBox({
              type: 'info',
              title: '默认打印机',
              message: `当前默认打印机：\n${key}\n别名：${mapping.alias || '未设置'}\n用途：${mapping.role || '未设置'}`
            });
          }
        },
        {
          label: '清空默认设置',
          click: () => {
            const mappings = printerMappings.getMappings();
            let changed = false;
            Object.keys(mappings).forEach((key) => {
              if (mappings[key]?.isDefault) {
                printerMappings.updateMapping(key, { isDefault: false });
                changed = true;
              }
            });
            if (changed) {
              emitPrinterMappings();
              dialog.showMessageBox({
                type: 'info',
                title: '默认打印机',
                message: '已清除默认打印机设置。'
              });
            } else {
              dialog.showMessageBox({
                type: 'info',
                title: '默认打印机',
                message: '当前没有默认打印机。'
              });
            }
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: '查看日志',
      click: () => {
        const logPath = logger.getLogFile();
        dialog.showMessageBox({
          type: 'info',
          title: '日志文件位置',
          message: `日志文件位于:\n${logPath}`,
          buttons: ['确定']
        });
      }
    },
    {
      label: '打开日志目录',
      click: () => {
        const logPath = logger.getLogFile();
        const directory = path.dirname(logPath);
        shell.openPath(directory);
      }
    },
    {
      label: '最近测试记录',
      click: () => {
        const history = printHistory.getHistory();
        if (!history.length) {
          dialog.showMessageBox({
            type: 'info',
            title: '打印历史',
            message: '暂无测试记录。'
          });
          return;
        }
        const recent = history.slice(0, 5);
        const message = recent
          .map((item) => {
            const status = item.status === 'success' ? '✅ 成功' : '❌ 失败';
            const time = new Date(item.timestamp).toLocaleString();
            const alias = item.alias ? `别名: ${item.alias}` : '';
            const role = item.role ? `用途: ${item.role}` : '';
            const detail = item.message ? `说明: ${item.message}` : '';
            return `${status} ${time}\n${alias} ${role}\n${detail}`.trim();
          })
          .join('\n\n');
        dialog.showMessageBox({
          type: 'info',
          title: '最近打印记录',
          message
        });
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        quitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

async function bootstrap() {
  await app.whenReady();
  configStore.ensureDefaults();
  printerMappings.init(configStore);
  printHistory.init(configStore);
  global.sharedModules = { printerMappings, printHistory, tcpPrinterManager };
  await usbManager.refreshDevices();

  serverHandle = await startServer({ configStore, usbManager, tcpPrinterManager, printerMappings, logger });

  createWindow();
  ensureTray();
  await updater.init(mainWindow, configStore);
  await telemetry.init({
    app,
    window: mainWindow,
    store: configStore,
    usb: usbManager,
    log: logger,
    getServerState: () => ({ running: Boolean(serverHandle) }),
    getUpdateState: () => updater.getState()
  });

  configStore.onDidChange('printerMappings', () => emitPrinterMappings());
  configStore.onDidChange('printHistory', () => emitPrintHistory());
  configStore.onDidChange('onboarding', () => {
    mainWindow?.webContents.send('agent:onboarding-updated', configStore.get('onboarding'));
  });
  configStore.onDidChange('shopId', () => {
    if (remoteClient) {
      remoteClient.stop();
      remoteClient.start();
    }
  });
  configStore.onDidChange('remote', () => {
    if (remoteClient) {
      remoteClient.stop();
      remoteClient.start();
    }
  });
  usbManager.onHotplug((event) => {
    try {
      mainWindow?.webContents?.send('agent:usb-hotplug', event);
      mainWindow?.webContents?.send('agent:devices-updated');
      remoteClient?.forceHeartbeat?.();
    } catch (error) {
      logger.warn('Failed to forward USB hotplug event', error);
    }
  });
  emitPrinterMappings();
  emitPrintHistory();

  remoteClient = createWsClient({
    app,
    store: configStore,
    usbManager,
    tcpPrinterManager,
    logger,
    printerMappings,
    printHistory
  });
  remoteClient.start();

  if (process.platform === 'darwin') {
    app.dock.hide();
  }
}

app.on('before-quit', () => {
  quitting = true;
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.on('activate', () => {
  if (!mainWindow) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('quit', async () => {
  if (serverHandle) {
    await stopServer(serverHandle);
  }
  usbManager.dispose();
  telemetry.stop();
  remoteClient?.stop();
});

bootstrap().catch((err) => {
  logger.error('Agent bootstrap failed', err);
  dialog.showErrorBox('启动失败', err?.message || String(err));
  app.quit();
});

ipcMain.handle('agent:get-status', async () => {
  const entries = printerMappings.listEntries();
  return {
    config: configStore.getAll(),
    devices: usbManager.getDevices(),
    tcpPrinters: entries.filter((entry) => entry.connectionType === 'tcp'),
    server: {
      port: configStore.get('server.port'),
      running: Boolean(serverHandle)
    },
    autoLaunch: getAutoLaunchEnabled(),
    update: updater.getState(),
    telemetry: telemetry.getState(),
    printerMappings: printerMappings.getMappings(),
    printHistory: printHistory.getHistory(),
    onboarding: configStore.get('onboarding') || { completed: true },
    remote: remoteClient?.getState() || null
  };
});

ipcMain.handle('agent:save-config', async (_event, payload) => {
  configStore.merge(payload);
  logger.info('Configuration updated', payload);
  return configStore.getAll();
});

ipcMain.handle('agent:refresh-devices', async () => {
  await usbManager.refreshDevices();
  return usbManager.getDevices();
});

ipcMain.handle('agent:set-autostart', async (_event, enabled) => {
  setAutoLaunchEnabled(Boolean(enabled));
  configStore.set('preferences.autoLaunch', Boolean(enabled));
  return getAutoLaunchEnabled();
});

ipcMain.handle('agent:get-logs', async () => {
  return {
    logPath: logger.getLogFile(),
    recent: await logger.readRecent(200)
  };
});

ipcMain.handle('agent:get-version', async () => {
  return {
    version: app.getVersion(),
    update: updater.getState()
  };
});

ipcMain.handle('agent:updates-check', async () => {
  const result = updater.checkForUpdates();
  return { started: Boolean(result?.started), reason: result?.reason };
});

ipcMain.handle('agent:updates-install', async () => {
  const success = updater.installUpdate();
  return { ok: success };
});

ipcMain.handle('agent:telemetry-send', async () => {
  const result = await telemetry.sendHeartbeat(true);
  return result;
});

ipcMain.handle('agent:get-printer-mappings', async () => {
  return {
    mappings: printerMappings.getMappings(),
    history: printHistory.getHistory()
  };
});

ipcMain.handle('agent:update-printer-mapping', async (_event, payload) => {
  const { key, data, exclusiveDefault } = payload || {};
  if (!key || !data) {
    return { ok: false, error: 'invalid-payload' };
  }
  if (exclusiveDefault && data.isDefault) {
    const mappings = printerMappings.getMappings();
    Object.keys(mappings).forEach((mappingKey) => {
      if (mappingKey !== key && mappings[mappingKey]?.role === data.role) {
        printerMappings.updateMapping(mappingKey, { isDefault: false });
      }
    });
  }
  printerMappings.updateMapping(key, data);
  emitPrinterMappings();
  return { ok: true };
});

ipcMain.handle('agent:remove-printer-mapping', async (_event, payload) => {
  const { key } = payload || {};
  if (!key) {
    return { ok: false, error: 'invalid-key' };
  }
  printerMappings.removeMapping(key);
  emitPrinterMappings();
  return { ok: true };
});

ipcMain.handle('agent:get-print-history', async () => {
  return { history: printHistory.getHistory() };
});

ipcMain.handle('agent:clear-print-history', async () => {
  printHistory.clear();
  emitPrintHistory();
  return { ok: true };
});

ipcMain.handle('agent:get-onboarding', async () => {
  return configStore.get('onboarding') || { completed: true };
});

ipcMain.handle('agent:update-onboarding', async (_event, payload) => {
  const current = configStore.get('onboarding') || {};
  const next = {
    ...current,
    ...(payload || {}),
    updatedAt: new Date().toISOString()
  };
  configStore.set('onboarding', next);
  mainWindow?.webContents.send('agent:onboarding-updated', next);
  return next;
});

async function performTestPrint(payload = {}) {
  const { connectionType = 'usb', alias, role } = payload;
  const timestamp = new Date().toISOString();

  if (connectionType === 'tcp') {
    const { ip, port = 9100 } = payload;
    if (!ip) {
      return { ok: false, error: '缺少 TCP 打印机 IP 地址' };
    }
    const key = printerMappings.buildTcpKey(ip, port);
    try {
      const buffer = buildTestPayload({ connectionType: 'tcp', ip, port, alias, role });
      await tcpPrinterManager.print({ ip, port, data: buffer, encoding: 'buffer' });
      printerMappings.updateMapping(key, {
        alias,
        role,
        isDefault: payload.isDefault,
        lastTest: {
          status: 'success',
          message: '测试打印成功',
          timestamp
        }
      });
      printHistory.append({
        type: 'test',
        connectionType: 'tcp',
        ip,
        port,
        alias,
        role,
        status: 'success',
        message: '测试打印成功'
      });
      emitPrinterMappings();
      emitPrintHistory();
      return { ok: true };
    } catch (error) {
      const message = error?.message || '测试打印失败';
      printerMappings.updateMapping(key, {
        alias,
        role,
        isDefault: payload.isDefault,
        lastTest: {
          status: 'error',
          message,
          timestamp
        }
      });
      printHistory.append({
        type: 'test',
        connectionType: 'tcp',
        ip,
        port,
        alias,
        role,
        status: 'error',
        message
      });
      emitPrinterMappings();
      emitPrintHistory();
      return { ok: false, error: message };
    }
  }

  const { vendorId, productId } = payload;
  if (typeof vendorId !== 'number' || typeof productId !== 'number') {
    return { ok: false, error: '缺少 vendorId / productId' };
  }
  const key = getMappingKey(vendorId, productId);
  try {
    const buffer = buildTestPayload({ connectionType: 'usb', vendorId, productId, alias, role });
    await usbManager.print({ data: buffer, encoding: 'buffer', vendorId, productId });
    printerMappings.updateMapping(key, {
      alias,
      role,
      isDefault: payload.isDefault,
      lastTest: {
        status: 'success',
        message: '测试打印成功',
        timestamp
      }
    });
    printHistory.append({
      type: 'test',
      connectionType: 'usb',
      vendorId,
      productId,
      alias,
      role,
      status: 'success',
      message: '测试打印成功'
    });
    emitPrinterMappings();
    emitPrintHistory();
    return { ok: true };
  } catch (error) {
    const message = error?.message || '测试打印失败';
    printerMappings.updateMapping(key, {
      alias,
      role,
      isDefault: payload.isDefault,
      lastTest: {
        status: 'error',
        message,
        timestamp
      }
    });
    printHistory.append({
      type: 'test',
      connectionType: 'usb',
      vendorId,
      productId,
      alias,
      role,
      status: 'error',
      message
    });
    emitPrinterMappings();
    emitPrintHistory();
    return { ok: false, error: message };
  }
}

ipcMain.handle('agent:test-printer', async (_event, payload) => performTestPrint(payload));

ipcMain.handle('agent:test-usb-device', async (_event, payload) =>
  performTestPrint({ ...payload, connectionType: 'usb' })
);

ipcMain.handle('agent:quit-app', async () => {
  quitting = true;
  app.quit();
  return { ok: true };
});

ipcMain.handle('agent:restart-app', async () => {
  quitting = true;
  app.relaunch();
  app.exit(0);
  return { ok: true };
});
