const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, shell } = require('electron');
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
const { getI18n, DEFAULT_LANGUAGE } = require('../i18n');

// 抑制 macOS 上 Electron 的 IMK 相关警告（不影响功能）
if (process.platform === 'darwin') {
  // 重定向 stderr 以过滤 IMK 相关错误
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = function(chunk, encoding, fd) {
    const message = chunk.toString();
    // 过滤 IMKCFRunLoopWakeUpReliable 相关错误
    if (message.includes('IMKCFRunLoopWakeUpReliable') || 
        message.includes('mach port for IMK')) {
      return true; // 抑制输出
    }
    return originalStderrWrite(chunk, encoding, fd);
  };
}

// 根据平台选择图标文件
const ICON_PATH_SVG = path.join(__dirname, '../assets/icon-512.svg');
const ICON_PATH_ICO = path.join(__dirname, '../assets/icon.ico');
const ICON_PATH = process.platform === 'win32' ? ICON_PATH_ICO : ICON_PATH_SVG;
const FALLBACK_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABG0lEQVQ4T6WTQU7DMBREnyCgDaAG0L4EtAcQbKAbwA6gG0AN0BHYBNAcxvWk5t6iIpK1l+RkhcePgjyTn3vnPGzCQlwJ2Y8aKZBEMswaNee5j3FAFSYBEd8sn7jCSoa6k5kBwh7XSwUVccAq1sm49XMwY9+xS3OAAxQyLP2Ni05DyuguSYwhNnhKe2mLUA3F6CrKeNOrP4kM/Cpsb5K60wk0LSdexM0haGMXGhYluuQsoS52sw84pwK1sJdD7ZN0+x93vHAKxOJ5f3i6yQmguSlJ3J6vNEvCYYJdC085nRx2SJdF/Q1FHdgCHZh9twmtIDAD7zNDCDg20xgiVeLtSzdoqQO55IFJGTfg9HvvU6HyEtTT8SYA9TPhnWe0bJIqM9ckRlQYLtY6w/9AcqbTjp3nslAAAAAElFTkSuQmCC';

function loadIcon({ template = false } = {}) {
  let image = null;
  
  // Windows 优先使用 ICO 文件
  if (process.platform === 'win32') {
    try {
      if (fs.existsSync(ICON_PATH_ICO)) {
        image = nativeImage.createFromPath(ICON_PATH_ICO);
        if (image && !image.isEmpty()) {
          // ICO 文件已经包含多尺寸，直接返回
          return image;
        }
      }
    } catch (error) {
      // ICO 加载失败，继续尝试其他格式
    }
  }
  
  // 尝试加载 SVG 或默认图标
  try {
    image = nativeImage.createFromPath(ICON_PATH_SVG);
    if (!image || image.isEmpty()) {
      const svgBuffer = fs.readFileSync(ICON_PATH_SVG);
      image = nativeImage.createFromBuffer(svgBuffer, { scaleFactor: 1 });
    }
  } catch (error) {
    // SVG 加载失败，使用 fallback
  }
  
  if (!image || image.isEmpty()) {
    image = nativeImage.createFromDataURL(FALLBACK_ICON_DATA_URL);
  }
  
  if (template && process.platform === 'darwin' && !image.isEmpty()) {
    image.setTemplateImage(true);
  }
  
  // Windows 上如果使用 SVG，需要 resize（ICO 文件已经包含多尺寸，不需要 resize）
  if (process.platform === 'win32' && !template && !image.isEmpty()) {
    // 如果图像尺寸很大（说明可能是 SVG 转换的），需要 resize
    const size = image.getSize();
    if (size.width > 64 || size.height > 64) {
      image = image.resize({ width: 32, height: 32 });
    }
  }
  
  return image;
}

let mainWindow = null;
let tray = null;
let serverHandle = null;
let quitting = false;
let remoteClient = null;
// 检查是否以隐藏模式启动（系统自启动时）
const shouldStartHidden = process.argv.includes('--hidden');
let i18n = null;

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
  if (!i18n) {
    i18n = getI18n(configStore.get('locale') || DEFAULT_LANGUAGE);
  }
  const ESC = '\x1B';
  const GS = '\x1D';
  const now = new Date().toLocaleString();
  const lines = [
    ESC + '@',
    ESC + '!' + '\x30',
    'YEPOS AGENT\n',
    ESC + '!' + '\x00',
    i18n.t('print.testTask') + '\n',
    '------------------------------\n',
    `${i18n.t('print.time')}: ${now}\n`,
    connectionType === 'tcp'
      ? `${i18n.t('print.tcp')}: ${ip || i18n.t('print.unknownAddress')}:${port || 9100}\n`
      : `${i18n.t('print.vendor')}: 0x${Number(vendorId || 0).toString(16)}\n${i18n.t('print.product')}: 0x${Number(productId || 0).toString(16)}\n`,
    alias ? `${i18n.t('print.alias')}: ${alias}\n` : '',
    role ? `${i18n.t('print.role')}: ${role}\n` : '',
    '------------------------------\n',
    i18n.t('print.successMessage') + '\n\n',
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
    // 如果是以隐藏模式启动（系统自启动），不显示窗口
    if (!shouldStartHidden) {
      mainWindow.show();
      mainWindow.focus();
    }
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

function updateTrayMenu() {
  if (!tray || !i18n) return;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: i18n.t('tray.openPanel'),
      click: () => {
        if (!mainWindow) return;
        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      label: i18n.t('tray.rescanDevices'),
      click: async () => {
        await usbManager.refreshDevices();
        mainWindow?.webContents.send('agent:devices-updated');
      }
    },
    {
      label: i18n.t('tray.testDefaultPrinter'),
      click: async () => {
        try {
          const mappings = printerMappings.getMappings();
          const defaultEntry = Object.entries(mappings).find(([, value]) => value?.isDefault);
          if (!defaultEntry) {
            dialog.showMessageBox({
              type: 'warning',
              title: i18n.t('dialogs.noDefaultPrinter.title'),
              message: i18n.t('dialogs.noDefaultPrinter.message')
            });
            return;
          }
          const [key, mapping] = defaultEntry;
          const parsed = printerMappings.parseKey(key);
          if (!parsed) {
            throw new Error(i18n.t('dialogs.invalidConfig'));
          }

          if (parsed.connectionType === 'usb') {
            await usbManager.refreshDevices();
            const devices = usbManager.getDevices();
            const vendorId = Number(parsed.vendorId);
            const productId = Number(parsed.productId);
            if (!Number.isFinite(vendorId) || !Number.isFinite(productId)) {
              throw new Error(i18n.t('dialogs.invalidDefaultPrinter'));
            }
            const match = devices.find((device) => device.vendorId === vendorId && device.productId === productId);
            if (!match) {
              dialog.showMessageBox({
                type: 'error',
                title: i18n.t('dialogs.testFailed.title'),
                message: i18n.t('dialogs.testFailed.message')
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
            try {
              await usbManager.print({ data: buffer, encoding: 'buffer', vendorId, productId });
              const trayTestMessage = i18n.t('print.testSuccess');
              printerMappings.updateMapping(key, {
                lastTest: {
                  status: 'success',
                  message: trayTestMessage,
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
                message: trayTestMessage
              });
              emitPrinterMappings();
              emitPrintHistory();
            } catch (printError) {
              // 抛出错误，让外层 catch 处理
              throw printError;
            }
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
            const trayTestMessage = i18n.t('print.testSuccess');
            printerMappings.updateMapping(key, {
              lastTest: {
                status: 'success',
                message: trayTestMessage,
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
              message: trayTestMessage
            });
          } else {
            dialog.showMessageBox({
              type: 'warning',
              title: i18n.t('dialogs.unsupportedPrinter.title'),
              message: i18n.t('dialogs.unsupportedPrinter.message')
            });
            return;
          }
          emitPrinterMappings();
          emitPrintHistory();
          dialog.showMessageBox({
            type: 'info',
            title: i18n.t('dialogs.testComplete.title'),
            message: i18n.t('dialogs.testComplete.message')
          });
        } catch (error) {
          logger.error('Tray test default printer failed', error);
          const errorMessage = error?.message || String(error);
          const isDriverError = error?.isDriverError || error?.code === 'LIBUSB_ERROR_NOT_SUPPORTED' || 
                                (typeof errorMessage === 'string' && (
                                  errorMessage.includes('LIBUSB_ERROR_NOT_SUPPORTED') ||
                                  errorMessage.includes('not supported') ||
                                  errorMessage.includes('NOT_SUPPORTED') ||
                                  errorMessage.includes('Windows USB 驱动不支持')
                                ));
          
          if (isDriverError) {
            const driverHelpMessage = i18n ? i18n.t('print.windowsDriverHelpMessage', {
              vid: parsed?.vendorId?.toString(16) || 'xxxx',
              pid: parsed?.productId?.toString(16) || 'xxxx'
            }) : `检测到 LIBUSB_ERROR_NOT_SUPPORTED 错误。该打印机需要使用 WinUSB/libusbK 驱动才能正常工作。\n\n解决步骤：\n1. 下载 Zadig 工具：https://zadig.akeo.ie/\n2. 以管理员身份运行 Zadig\n3. 菜单 Options 勾选 List All Devices\n4. 选择设备并切换驱动\n5. 重新插拔打印机并重试\n\n详细步骤请查看 README.md 中的 Windows USB 驱动提示章节。`;
            
            dialog.showMessageBox({
              type: 'warning',
              title: i18n ? i18n.t('print.windowsDriverHelpTitle') : 'Windows USB 驱动问题',
              message: driverHelpMessage,
              buttons: ['确定', '查看帮助'],
              defaultId: 0,
              cancelId: 0
            }).then((result) => {
              if (result.response === 1) {
                // 用户点击了"查看帮助"，打开 README 或显示更详细的帮助
                dialog.showMessageBox({
                  type: 'info',
                  title: i18n ? i18n.t('print.windowsDriverHelpTitle') : 'Windows USB 驱动问题',
                  message: driverHelpMessage + '\n\n更多信息请查看应用 README.md 文件。'
                });
              }
            });
          } else {
            dialog.showMessageBox({
              type: 'error',
              title: i18n.t('dialogs.testError.title'),
              message: i18n.t('dialogs.testError.message', { error: errorMessage })
            });
          }
        }
      }
    },
    {
      label: i18n.t('tray.defaultPrinterSettings'),
      submenu: [
        {
          label: i18n.t('tray.viewConfig'),
          click: () => {
            const mappings = printerMappings.getMappings();
            const defaultEntry = Object.entries(mappings).find(([, value]) => value?.isDefault);
            if (!defaultEntry) {
              dialog.showMessageBox({
                type: 'info',
                title: i18n.t('dialogs.defaultPrinter.title'),
                message: i18n.t('dialogs.defaultPrinter.noDefault')
              });
              return;
            }
            const [key, mapping] = defaultEntry;
            dialog.showMessageBox({
              type: 'info',
              title: i18n.t('dialogs.defaultPrinter.title'),
              message: i18n.t('dialogs.defaultPrinter.current', {
                key,
                alias: mapping.alias || i18n.t('common.notSet'),
                role: mapping.role || i18n.t('common.notSet')
              })
            });
          }
        },
        {
          label: i18n.t('tray.clearDefault'),
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
                title: i18n.t('dialogs.defaultPrinter.title'),
                message: i18n.t('dialogs.defaultPrinter.cleared')
              });
            } else {
              dialog.showMessageBox({
                type: 'info',
                title: i18n.t('dialogs.defaultPrinter.title'),
                message: i18n.t('dialogs.defaultPrinter.noDefaultMessage')
              });
            }
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: i18n.t('tray.viewLogs'),
      click: () => {
        const logPath = logger.getLogFile();
        dialog.showMessageBox({
          type: 'info',
          title: i18n.t('dialogs.logLocation.title'),
          message: i18n.t('dialogs.logLocation.message', { path: logPath }),
          buttons: [i18n.t('common.ok')]
        });
      }
    },
    {
      label: i18n.t('tray.openLogDir'),
      click: () => {
        const logPath = logger.getLogFile();
        const directory = path.dirname(logPath);
        shell.openPath(directory);
      }
    },
    {
      label: i18n.t('tray.recentTests'),
      click: () => {
        const history = printHistory.getHistory();
        if (!history.length) {
          dialog.showMessageBox({
            type: 'info',
            title: i18n.t('dialogs.printHistory.title'),
            message: i18n.t('dialogs.printHistory.noRecords')
          });
          return;
        }
        const recent = history.slice(0, 5);
        const message = recent
          .map((item) => {
            const status = item.status === 'success' ? `✅ ${i18n.t('history.success')}` : `❌ ${i18n.t('history.failed')}`;
            const time = new Date(item.timestamp).toLocaleString();
            const alias = item.alias ? `${i18n.t('devices.alias')}: ${item.alias}` : '';
            const role = item.role ? `${i18n.t('devices.role')}: ${item.role}` : '';
            const detail = item.message ? `${i18n.t('history.details')}: ${item.message}` : '';
            return `${status} ${time}\n${alias} ${role}\n${detail}`.trim();
          })
          .join('\n\n');
        dialog.showMessageBox({
          type: 'info',
          title: i18n.t('dialogs.recentPrintHistory.title'),
          message
        });
      }
    },
    { type: 'separator' },
    {
      label: i18n.t('tray.quit'),
      click: () => {
        quitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

function ensureTray() {
  if (tray) {
    updateTrayMenu();
    return;
  }
  const icon = loadIcon({ template: process.platform === 'darwin' });
  tray = new Tray(icon);
  tray.setToolTip(i18n ? i18n.t('app.name') : 'Yepos Agent');
  tray.on('click', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });
  updateTrayMenu();
}

async function bootstrap() {
  await app.whenReady();
  configStore.ensureDefaults();
  
  // Initialize i18n
  const locale = configStore.get('locale') || DEFAULT_LANGUAGE;
  i18n = getI18n(locale);
  
  printerMappings.init(configStore);
  printHistory.init(configStore);
  global.sharedModules = { printerMappings, printHistory, tcpPrinterManager };
  await usbManager.refreshDevices();

  // Windows 首次启动时自动设置自启动
  if (process.platform === 'win32') {
    const preferences = configStore.get('preferences') || {};
    const autoLaunch = preferences.autoLaunch;
    const hasSetAutoLaunch = configStore.get('_hasSetAutoLaunch');
    
    // 如果用户没有手动设置过，且当前未启用自启动，则自动启用
    if (autoLaunch === undefined && !hasSetAutoLaunch) {
      setAutoLaunchEnabled(true);
      configStore.set('preferences.autoLaunch', true);
      configStore.set('_hasSetAutoLaunch', true);
      logger.info('Windows auto-launch enabled on first run');
    }
  }

  serverHandle = await startServer({ 
    configStore, 
    usbManager, 
    tcpPrinterManager, 
    printerMappings, 
    logger,
    getI18n: () => i18n
  });
  
  // Inject i18n into modules
  if (usbManager.setI18n) {
    usbManager.setI18n(() => i18n);
  }
  if (tcpPrinterManager.setI18n) {
    tcpPrinterManager.setI18n(() => i18n);
  }

  createWindow();
  ensureTray();
  await updater.init(mainWindow, configStore, () => i18n);
  await telemetry.init({
    app,
    window: mainWindow,
    store: configStore,
    usb: usbManager,
    log: logger,
    getServerState: () => ({ running: Boolean(serverHandle) }),
    getUpdateState: () => updater.getState(),
    getI18n: () => i18n
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
    printHistory,
    getI18n: () => i18n
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

app.on('activate', async () => {
  // 确保应用已就绪
  await app.whenReady();
  if (!mainWindow) {
    createWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
});

// 单实例锁定：确保只有一个应用实例运行
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // 如果已经有实例在运行，退出当前实例
  app.quit();
} else {
  // 处理第二个实例启动事件（用户再次打开应用）
  app.on('second-instance', async () => {
    // 确保应用已就绪
    await app.whenReady();
    // 如果窗口已存在，显示并聚焦
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    } else {
      // 如果窗口不存在，创建新窗口
      createWindow();
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
    const errorTitle = i18n ? i18n.t('dialogs.bootstrapError.title') : '启动失败';
    dialog.showErrorBox(errorTitle, err?.message || String(err));
    app.quit();
  });
}

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
  configStore.set('_hasSetAutoLaunch', true); // 标记用户已手动设置
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
      const errorMsg = i18n ? i18n.t('print.missingTcpIp') : '缺少 TCP 打印机 IP 地址';
      return { ok: false, error: errorMsg };
    }
    const key = printerMappings.buildTcpKey(ip, port);
    try {
      const buffer = buildTestPayload({ connectionType: 'tcp', ip, port, alias, role });
      await tcpPrinterManager.print({ ip, port, data: buffer, encoding: 'buffer' });
      const successMessage = i18n ? i18n.t('print.testSuccess') : '测试打印成功';
      printerMappings.updateMapping(key, {
        alias,
        role,
        isDefault: payload.isDefault,
        lastTest: {
          status: 'success',
          message: successMessage,
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
        message: successMessage
      });
      emitPrinterMappings();
      emitPrintHistory();
      return { ok: true };
    } catch (error) {
      const failMessage = i18n ? i18n.t('print.testFailed') : '测试打印失败';
      const message = error?.message || failMessage;
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
    return { ok: false, error: i18n ? i18n.t('print.missingVendorProduct') : '缺少 vendorId / productId' };
  }
  const key = getMappingKey(vendorId, productId);
  try {
    const buffer = buildTestPayload({ connectionType: 'usb', vendorId, productId, alias, role });
    await usbManager.print({ data: buffer, encoding: 'buffer', vendorId, productId });
    const successMessage = i18n ? i18n.t('print.testSuccess') : '测试打印成功';
    printerMappings.updateMapping(key, {
      alias,
      role,
      isDefault: payload.isDefault,
      lastTest: {
        status: 'success',
        message: successMessage,
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
      message: successMessage
    });
    emitPrinterMappings();
    emitPrintHistory();
    return { ok: true };
  } catch (error) {
    const failMessage = i18n ? i18n.t('print.testFailed') : '测试打印失败';
    const message = error?.message || failMessage;
    const isDriverError = error?.isDriverError || error?.code === 'LIBUSB_ERROR_NOT_SUPPORTED' || 
                          (typeof message === 'string' && (
                            message.includes('LIBUSB_ERROR_NOT_SUPPORTED') ||
                            message.includes('not supported') ||
                            message.includes('NOT_SUPPORTED') ||
                            message.includes('Windows USB 驱动不支持')
                          ));
    
    printerMappings.updateMapping(key, {
      alias,
      role,
      isDefault: payload.isDefault,
      lastTest: {
        status: 'error',
        message,
        timestamp,
        isDriverError
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
      message,
      isDriverError
    });
    emitPrinterMappings();
    emitPrintHistory();
    return { 
      ok: false, 
      error: message,
      isDriverError,
      driverHelp: isDriverError ? {
        title: i18n ? i18n.t('print.windowsDriverHelpTitle') : 'Windows USB 驱动问题',
        message: i18n ? i18n.t('print.windowsDriverHelpMessage', {
          vid: vendorId?.toString(16) || 'xxxx',
          pid: productId?.toString(16) || 'xxxx'
        }) : `检测到 LIBUSB_ERROR_NOT_SUPPORTED 错误。该打印机需要使用 WinUSB/libusbK 驱动才能正常工作。\n\n解决步骤：\n1. 下载 Zadig 工具：https://zadig.akeo.ie/\n2. 以管理员身份运行 Zadig\n3. 菜单 Options 勾选 List All Devices\n4. 选择设备 VID_${vendorId?.toString(16) || 'xxxx'} & PID_${productId?.toString(16) || 'xxxx'}\n5. 右侧选择 WinUSB (v6.x) 或 libusbK\n6. 点击 Replace Driver\n7. 重新插拔打印机并重试\n\n注意：切换驱动后，该打印机将不再走 Windows 默认打印队列。`
      } : null
    };
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

ipcMain.handle('agent:get-translations', async (_event, locale) => {
  if (!locale) {
    locale = configStore.get('locale') || DEFAULT_LANGUAGE;
  }
  if (i18n) {
    i18n.setLocale(locale);
  } else {
    i18n = getI18n(locale);
  }
  const { LANGUAGES } = require('../i18n');
  return {
    locale: i18n.getLocale(),
    translations: LANGUAGES[i18n.getLocale()] || LANGUAGES[DEFAULT_LANGUAGE]
  };
});

ipcMain.handle('agent:get-locale', async () => {
  return configStore.get('locale') || DEFAULT_LANGUAGE;
});

ipcMain.handle('agent:set-locale', async (_event, locale) => {
  if (locale && (locale === 'zh-CN' || locale === 'en-US')) {
    configStore.set('locale', locale);
    if (i18n) {
      i18n.setLocale(locale);
    } else {
      i18n = getI18n(locale);
    }
    updateTrayMenu();
    // Refresh state messages in telemetry and updater modules with new locale
    if (telemetry && typeof telemetry.refreshState === 'function') {
      telemetry.refreshState();
    }
    if (updater && typeof updater.refreshState === 'function') {
      updater.refreshState();
    }
    if (mainWindow?.webContents) {
      mainWindow.webContents.send('agent:locale-changed', { locale });
    }
    return { ok: true, locale };
  }
  return { ok: false, error: 'invalid-locale' };
});

// Watch for locale changes
configStore.onDidChange('locale', () => {
  const locale = configStore.get('locale') || DEFAULT_LANGUAGE;
  if (i18n) {
    i18n.setLocale(locale);
    updateTrayMenu();
    // Refresh state messages in telemetry and updater modules
    if (telemetry && typeof telemetry.refreshState === 'function') {
      telemetry.refreshState();
    }
    if (updater && typeof updater.refreshState === 'function') {
      updater.refreshState();
    }
  }
  if (mainWindow?.webContents) {
    mainWindow.webContents.send('agent:locale-changed', { locale });
  }
});
