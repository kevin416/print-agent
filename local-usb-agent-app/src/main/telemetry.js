const os = require('os');

const DEFAULT_ENDPOINT = 'https://pa.easyify.uk/api/agent-heartbeat';
const MIN_INTERVAL_MS = 15_000;
const DEFAULT_INTERVAL_MS = 30_000;

let appRef = null;
let mainWindow = null;
let configStore = null;
let usbManager = null;
let logger = null;
let getServerState = () => ({ running: false });
let getUpdateState = () => ({})
let timer = null;
let pending = false;

const state = {
  enabled: false,
  status: 'disabled',
  message: '尚未启用心跳上报',
  endpoint: DEFAULT_ENDPOINT,
  includeLogs: true,
  intervalMs: DEFAULT_INTERVAL_MS,
  timeoutMs: 7000,
  nextPlannedAt: null,
  lastSentAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  consecutiveFailures: 0,
  lastResponseCode: null,
  lastError: null,
  lastLogs: [],
  online: false
};

function notifyRenderer() {
  if (mainWindow?.webContents) {
    const payload = {
      ...state,
      lastLogs: state.lastLogs ? state.lastLogs.slice(-20) : []
    };
    mainWindow.webContents.send('agent:telemetry-status', payload);
  }
}

function updateState(patch) {
  Object.assign(state, patch);
  notifyRenderer();
}

function clearTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function scheduleNext(delayMs) {
  clearTimer();
  if (!state.enabled) {
    state.nextPlannedAt = null;
    return;
  }
  const delay = Math.max(MIN_INTERVAL_MS, delayMs ?? state.intervalMs ?? DEFAULT_INTERVAL_MS);
  state.nextPlannedAt = new Date(Date.now() + delay).toISOString();
  timer = setTimeout(() => {
    sendHeartbeat().catch((error) => {
      logger?.error('Telemetry heartbeat failure', error?.message || error);
    });
  }, delay);
}

function resolveFetch() {
  if (typeof fetch === 'function') {
    return fetch;
  }
  // Lazy load node-fetch when running in older environments
  return (...args) => import('node-fetch').then(({ default: nodeFetch }) => nodeFetch(...args));
}

async function buildPayload() {
  const shopId = configStore.get('shopId');
  const printers = configStore.get('printers') || [];
  const preferences = configStore.get('preferences') || {};
  const server = configStore.get('server') || {};
  const telemetryConfig = configStore.get('telemetry') || {};
  const updateState = getUpdateState ? getUpdateState() : {};
  const serverState = getServerState ? getServerState() : {};
  const devices = usbManager?.getDevices?.() || [];

  let recentLogs = [];
  if (telemetryConfig.includeLogs !== false && logger?.readRecent) {
    try {
      recentLogs = await logger.readRecent(Math.max(5, telemetryConfig.logLines || 50));
    } catch (error) {
      logger?.warn('Failed to read recent logs for telemetry', error?.message || error);
    }
  }

  const payload = {
    shopId,
    timestamp: new Date().toISOString(),
    agentVersion: appRef?.getVersion?.() || '0.0.0',
    platform: process.platform,
    arch: process.arch,
    system: {
      hostname: os.hostname(),
      release: os.release(),
      uptime: os.uptime(),
      memory: {
        total: os.totalmem(),
        free: os.freemem()
      }
    },
    preferences: {
      autoLaunch: !!preferences.autoLaunch,
      allowSelfSigned: !!preferences.allowSelfSigned
    },
    server: {
      port: server.port || 40713,
      running: !!serverState.running
    },
    devices,
    printers,
    update: updateState,
    telemetry: {
      endpoint: state.endpoint,
      intervalSeconds: Math.round((state.intervalMs || DEFAULT_INTERVAL_MS) / 1000),
      includeLogs: state.includeLogs
    }
  };

  if (recentLogs && recentLogs.length) {
    payload.logs = {
      recent: recentLogs.slice(-Math.max(5, Math.min(recentLogs.length, telemetryConfig.logLines || 50)))
    };
  }

  return payload;
}

async function sendHeartbeat(forced = false) {
  if (pending) {
    return { sent: false, reason: 'pending' };
  }

  const telemetryConfig = configStore.get('telemetry') || {};
  const shopId = configStore.get('shopId');
  const endpoint = telemetryConfig.endpoint || state.endpoint || DEFAULT_ENDPOINT;

  if (!state.enabled || telemetryConfig.enabled === false) {
    updateState({ status: 'disabled', message: '心跳未启用', online: false });
    return { sent: false, reason: 'disabled' };
  }

  if (!shopId) {
    updateState({
      status: 'disabled',
      message: '尚未配置分店 Shop ID，无法上报心跳',
      online: false
    });
    return { sent: false, reason: 'missing-shop-id' };
  }

  if (!endpoint) {
    updateState({
      status: 'error',
      message: '未设置上报地址',
      online: false
    });
    return { sent: false, reason: 'missing-endpoint' };
  }

  const fetchFn = resolveFetch();
  const intervalSeconds = Math.max(15, Number(telemetryConfig.intervalSeconds) || 30);
  const timeoutSeconds = Math.max(5, Number(telemetryConfig.timeoutSeconds) || 7);

  state.intervalMs = intervalSeconds * 1000;
  state.timeoutMs = timeoutSeconds * 1000;
  state.endpoint = endpoint;
  state.includeLogs = telemetryConfig.includeLogs !== false;

  const nowIso = new Date().toISOString();
  updateState({ status: 'sending', message: '正在发送心跳…', lastSentAt: nowIso });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), state.timeoutMs);
  pending = true;

  try {
    const payload = await buildPayload();
    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const successIso = new Date().toISOString();
    state.lastLogs = payload.logs?.recent || [];
    updateState({
      status: 'online',
      message: '心跳已上报',
      lastSuccessAt: successIso,
      consecutiveFailures: 0,
      lastResponseCode: response.status,
      lastError: null,
      online: true
    });
    scheduleNext(state.intervalMs);
    return { sent: true };
  } catch (error) {
    const failureIso = new Date().toISOString();
    updateState({
      status: 'error',
      message: error?.message || '心跳发送失败',
      lastFailureAt: failureIso,
      lastError: error?.message || String(error),
      consecutiveFailures: (state.consecutiveFailures || 0) + 1,
      online: false
    });
    scheduleNext(state.intervalMs * 1.5);
    return { sent: false, error: error?.message || String(error) };
  } finally {
    pending = false;
    clearTimeout(timeout);
  }
}

function applyConfig() {
  const telemetryConfig = configStore.get('telemetry') || {};
  const enabled = telemetryConfig.enabled !== false;
  const endpoint = telemetryConfig.endpoint || DEFAULT_ENDPOINT;
  const intervalSeconds = Math.max(15, Number(telemetryConfig.intervalSeconds) || 30);
  const timeoutSeconds = Math.max(5, Number(telemetryConfig.timeoutSeconds) || 7);

  state.enabled = enabled;
  state.endpoint = endpoint;
  state.intervalMs = intervalSeconds * 1000;
  state.timeoutMs = timeoutSeconds * 1000;
  state.includeLogs = telemetryConfig.includeLogs !== false;

  if (!enabled) {
    clearTimer();
    updateState({ status: 'disabled', message: '心跳未启用', online: false });
    return;
  }

  if (!configStore.get('shopId')) {
    updateState({ status: 'waiting', message: '等待配置分店 Shop ID', online: false });
    clearTimer();
    return;
  }

  updateState({
    status: 'idle',
    message: '心跳服务已启动',
    online: state.lastSuccessAt ? state.online : false
  });

  scheduleNext(telemetryConfig.initialDelayMs || 5_000);
}

async function init(options) {
  const { app, window, store, usb, log, getServerState: getServerStateFn, getUpdateState: getUpdateStateFn } = options;
  appRef = app;
  mainWindow = window;
  configStore = store;
  usbManager = usb;
  logger = log;
  getServerState = typeof getServerStateFn === 'function' ? getServerStateFn : getServerState;
  getUpdateState = typeof getUpdateStateFn === 'function' ? getUpdateStateFn : getUpdateState;

  notifyRenderer();
  applyConfig();

  configStore.onDidChange('telemetry', () => {
    applyConfig();
  });

  configStore.onDidChange('shopId', () => {
    applyConfig();
  });
}

function stop() {
  clearTimer();
}

module.exports = {
  init,
  stop,
  sendHeartbeat,
  getState: () => ({ ...state, lastLogs: state.lastLogs ? state.lastLogs.slice(-20) : [] })
};
