const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
const logger = require('./logger');

const DEFAULT_FEED_URL = 'https://pa.easyify.uk/updates/local-usb-agent';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

let mainWindow = null;
let configStore = null;
let checkTimer = null;
let getI18n = null;

function setI18n(i18nGetter) {
  getI18n = i18nGetter;
}

function t(key, params = {}) {
  if (!getI18n) return key;
  const i18n = getI18n();
  if (!i18n) return key;
  return i18n.t(key, params);
}

const state = {
  enabled: false,
  status: app.isPackaged ? 'idle' : 'development',
  message: '', // Will be set by applyUpdaterConfig
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
    state.message = t('updates.message.feedUrlNotSet');
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
    state.message = t('updates.message.enabled');
    state.status = 'idle';
    state.error = null;
  } catch (error) {
    state.enabled = false;
    state.status = 'error';
    state.message = t('updates.message.configFailed');
    state.error = error?.message || String(error);
    state.resolvedFeedUrl = null;
    logger.error('Failed to configure auto-updater', error);
  }
  scheduleNextCheck();
}

function wireEvents() {
  autoUpdater.on('checking-for-update', () => {
    updateState({ status: 'checking', message: t('updates.message.checking'), lastCheckedAt: new Date().toISOString(), error: null });
  });

  autoUpdater.on('update-available', (info) => {
    updateState({
      status: 'available',
      message: t('updates.message.updateAvailable', { version: info?.version }),
      availableVersion: info?.version,
      releaseName: info?.releaseName || null,
      releaseNotes: info?.releaseNotes || null
    });
  });

  autoUpdater.on('update-not-available', () => {
    updateState({
      status: 'idle',
      message: t('updates.message.upToDate'),
      availableVersion: null,
      releaseName: null,
      releaseNotes: null
    });
    scheduleNextCheck();
  });

  autoUpdater.on('error', (error) => {
    let errorMessage = error?.message || String(error);
    let friendlyMessage = t('updates.message.error');
    
    // 检测是否是 YAML 解析错误（通常是服务器返回了 HTML 而不是 YAML）
    if (errorMessage.includes('Cannot parse update info') || 
        errorMessage.includes('YAMLException') ||
        errorMessage.includes('<!DOCTYPE html>')) {
      friendlyMessage = t('updates.message.parseError');
      // Keep the detailed error message for debugging, but use translated friendly message
    }
    
    updateState({
      status: 'error',
      message: friendlyMessage,
      error: errorMessage
    });
    scheduleNextCheck();
  });

  autoUpdater.on('download-progress', (progress) => {
    updateState({
      status: 'downloading',
      message: t('updates.message.downloading'),
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
      message: t('updates.message.downloaded'),
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
    updateState({ status: 'error', message: t('updates.message.checkFailed'), error: error?.message || String(error) });
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

async function init(window, store, getI18nFn) {
  mainWindow = window;
  configStore = store;
  if (getI18nFn) {
    setI18n(getI18nFn);
  }
  
  // Initialize state message with translation
  if (!state.message) {
    state.message = app.isPackaged ? t('updates.message.notChecked') : t('updates.message.development');
  }
  
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

function refreshState() {
  // Update messages with new locale without changing the current status
  const currentStatus = state.status;
  const currentProgress = state.progress;
  const currentAvailableVersion = state.availableVersion;
  const currentReleaseNotes = state.releaseNotes;
  const currentReleaseName = state.releaseName;
  const currentLastCheckedAt = state.lastCheckedAt;
  const currentError = state.error;
  
  // Update status-specific messages with new locale
  if (currentStatus === 'downloading' && currentProgress) {
    updateState({
      status: 'downloading',
      message: t('updates.message.downloading'),
      progress: currentProgress
    });
  } else if (currentStatus === 'downloaded') {
    updateState({
      status: 'downloaded',
      message: t('updates.message.downloaded'),
      availableVersion: currentAvailableVersion,
      releaseName: currentReleaseName,
      releaseNotes: currentReleaseNotes,
      progress: null
    });
  } else if (currentStatus === 'checking') {
    updateState({
      status: 'checking',
      message: t('updates.message.checking'),
      lastCheckedAt: currentLastCheckedAt || new Date().toISOString(),
      error: null
    });
  } else if (currentStatus === 'available' && currentAvailableVersion) {
    updateState({
      status: 'available',
      message: t('updates.message.updateAvailable', { version: currentAvailableVersion }),
      availableVersion: currentAvailableVersion,
      releaseName: currentReleaseName,
      releaseNotes: currentReleaseNotes
    });
  } else if (currentStatus === 'error') {
    // For error status, check if it's a parse error
    let friendlyMessage = t('updates.message.error');
    if (currentError && (
      currentError.includes('Cannot parse update info') || 
      currentError.includes('YAMLException') ||
      currentError.includes('<!DOCTYPE html>')
    )) {
      friendlyMessage = t('updates.message.parseError');
    }
    updateState({
      status: 'error',
      message: friendlyMessage,
      error: currentError
    });
  } else if (currentStatus === 'idle') {
    // Re-apply config to get the correct idle message
    applyUpdaterConfig(configStore.get('updates') || {});
  } else if (currentStatus === 'disabled') {
    updateState({
      status: 'disabled',
      message: t('updates.message.disabled')
    });
  } else if (currentStatus === 'development') {
    updateState({
      status: 'development',
      message: t('updates.message.development')
    });
  }
}

module.exports = {
  init,
  checkForUpdates,
  installUpdate,
  getState: () => state,
  resetTimer: scheduleNextCheck,
  setI18n,
  refreshState
};
