const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
const logger = require('./logger');

const DEFAULT_FEED_URL = 'https://pa.easyify.uk/updates/local-usb-agent';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

let mainWindow = null;
let configStore = null;
let checkTimer = null;

const state = {
  enabled: false,
  status: app.isPackaged ? 'idle' : 'development',
  message: app.isPackaged ? '尚未检测更新' : '开发模式下不执行更新',
  currentVersion: app.getVersion(),
  availableVersion: null,
  releaseName: null,
  releaseNotes: null,
  channel: 'stable',
  autoDownload: true,
  feedUrl: null,
  resolvedFeedUrl: null,
  lastCheckedAt: null,
  progress: null,
  error: null
};

function notifyRenderer() {
  if (mainWindow?.webContents) {
    mainWindow.webContents.send('agent:update-status', state);
  }
}

function updateState(patch) {
  Object.assign(state, patch);
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'progress')) {
    logger.debug('Auto-update progress', patch.progress);
  } else {
    logger.info('Auto-update status', patch);
  }
  notifyRenderer();
}

function clearTimer() {
  if (checkTimer) {
    clearTimeout(checkTimer);
    checkTimer = null;
  }
}

function scheduleNextCheck() {
  clearTimer();
  if (!state.enabled) return;
  checkTimer = setTimeout(() => {
    checkForUpdates();
  }, CHECK_INTERVAL_MS);
}

function applyUpdaterConfig(updatesConfig = {}) {
  if (!app.isPackaged) {
    return;
  }

  const feedUrl = updatesConfig.feedUrl || process.env.LOCAL_AGENT_UPDATE_BASE_URL || DEFAULT_FEED_URL;
  const channel = updatesConfig.channel || 'stable';
  const autoDownload = updatesConfig.autoDownload !== false;

  state.feedUrl = feedUrl;
  state.channel = channel;
  state.autoDownload = autoDownload;

  if (!feedUrl) {
    state.enabled = false;
    state.message = '未设置更新源';
    state.resolvedFeedUrl = null;
    scheduleNextCheck();
    return;
  }

  try {
    autoUpdater.autoDownload = autoDownload;
    autoUpdater.allowPrerelease = channel !== 'stable';
    autoUpdater.channel = channel;
    const resolvedUrl = /\.yml$/i.test(feedUrl)
      ? feedUrl
      : `${feedUrl.replace(/\/$/, '')}/${channel}`;
    state.resolvedFeedUrl = resolvedUrl;
    autoUpdater.setFeedURL({ provider: 'generic', url: resolvedUrl });
    state.enabled = true;
    state.message = '自动更新已启用';
    state.status = 'idle';
    state.error = null;
  } catch (error) {
    state.enabled = false;
    state.status = 'error';
    state.message = '配置自动更新失败';
    state.error = error?.message || String(error);
    state.resolvedFeedUrl = null;
    logger.error('Failed to configure auto-updater', error);
  }
  scheduleNextCheck();
}

function wireEvents() {
  autoUpdater.on('checking-for-update', () => {
    updateState({ status: 'checking', message: '正在检查更新…', lastCheckedAt: new Date().toISOString(), error: null });
  });

  autoUpdater.on('update-available', (info) => {
    updateState({
      status: 'available',
      message: `发现新版本 ${info?.version}`,
      availableVersion: info?.version,
      releaseName: info?.releaseName || null,
      releaseNotes: info?.releaseNotes || null
    });
  });

  autoUpdater.on('update-not-available', () => {
    updateState({
      status: 'idle',
      message: '已是最新版本',
      availableVersion: null,
      releaseName: null,
      releaseNotes: null
    });
    scheduleNextCheck();
  });

  autoUpdater.on('error', (error) => {
    updateState({
      status: 'error',
      message: '自动更新出错',
      error: error?.message || String(error)
    });
    scheduleNextCheck();
  });

  autoUpdater.on('download-progress', (progress) => {
    updateState({
      status: 'downloading',
      message: '正在下载更新…',
      progress: {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond
      }
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateState({
      status: 'downloaded',
      message: '更新已下载，准备安装',
      availableVersion: info?.version,
      releaseName: info?.releaseName || null,
      releaseNotes: info?.releaseNotes || null,
      progress: null
    });
  });
}

function checkForUpdates() {
  if (!app.isPackaged || !state.enabled) {
    return { started: false, reason: 'Auto updater disabled' };
  }
  try {
    autoUpdater.checkForUpdates();
    return { started: true };
  } catch (error) {
    updateState({ status: 'error', message: '检查更新失败', error: error?.message || String(error) });
    return { started: false, reason: error?.message || String(error) };
  }
}

function installUpdate() {
  if (!app.isPackaged) {
    return false;
  }
  if (state.status === 'downloaded') {
    autoUpdater.quitAndInstall();
    return true;
  }
  return false;
}

async function init(window, store) {
  mainWindow = window;
  configStore = store;
  notifyRenderer();

  if (!app.isPackaged) {
    logger.info('Skip auto-update setup in development mode');
    return;
  }

  wireEvents();
  applyUpdaterConfig(configStore.get('updates') || {});
  notifyRenderer();

  configStore.onDidChange('updates', (newValue) => {
    applyUpdaterConfig(newValue || {});
    notifyRenderer();
  });

  // perform background check shortly after startup
  if (state.enabled) {
    setTimeout(() => {
      checkForUpdates();
      scheduleNextCheck();
    }, 15_000);
  }
}

module.exports = {
  init,
  checkForUpdates,
  installUpdate,
  getState: () => state,
  resetTimer: scheduleNextCheck
};
