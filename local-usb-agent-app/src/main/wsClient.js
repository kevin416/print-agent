const WebSocket = require('ws');
const os = require('os');
const HEARTBEAT_INTERVAL = 30_000;

function resolveWsUrl(store) {
  const remote = store.get('remote') || {};
  const envUrl = process.env.LOCAL_AGENT_WS_URL;
  if (envUrl) return envUrl;
  if (remote.wsUrl) return remote.wsUrl;
  return 'wss://printer-hub.easyify.uk/print-agent';
}

module.exports = function createWsClient(options) {
  const {
    app,
    store,
    usbManager,
    tcpPrinterManager,
    logger,
    printerMappings,
    printHistory
  } = options;

  let socket = null;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let shuttingDown = false;
  let currentWsUrl = null;
  let reconnectDelay = 0;

  const state = {
    lastRegisterAt: null,
    lastHeartbeatAt: null,
    lastError: null
  };

  function getShopId() {
    return store.get('shopId') || null;
  }

  function buildDeviceSnapshot() {
    const devices = usbManager.getDevices() || [];
    const mappings = printerMappings.getMappings() || {};
    const snapshot = [];
    const seenKeys = new Set();

    devices.forEach((device) => {
      const key = printerMappings.buildUsbKey(device.vendorId, device.productId);
      const mapping = printerMappings.getMapping(key) || {};
      seenKeys.add(key);
      snapshot.push({
        connectionType: 'usb',
        vendorId: device.vendorId,
        productId: device.productId,
        address: device.address,
        alias: mapping.alias || '',
        role: mapping.role || '',
        isDefault: Boolean(mapping.isDefault),
        lastTest: mapping.lastTest || null,
        manual: Boolean(mapping.manual)
      });
    });

    Object.entries(mappings).forEach(([key, value]) => {
      const parsed = printerMappings.parseKey(key);
      if (!parsed) return;
      if (parsed.connectionType === 'usb') {
        if (!seenKeys.has(key)) {
          const mapping = printerMappings.getMapping(key) || {};
          snapshot.push({
            connectionType: 'usb',
            vendorId: parsed.vendorId,
            productId: parsed.productId,
            address: null,
            alias: mapping.alias || '',
            role: mapping.role || '',
            isDefault: Boolean(mapping.isDefault),
            lastTest: mapping.lastTest || null,
            manual: Boolean(mapping.manual)
          });
        }
      } else if (parsed.connectionType === 'tcp') {
        const mapping = printerMappings.getMapping(key) || {};
        snapshot.push({
          connectionType: 'tcp',
          ip: parsed.ip,
          port: parsed.port,
          alias: mapping.alias || '',
          role: mapping.role || '',
          isDefault: Boolean(mapping.isDefault),
          lastTest: mapping.lastTest || null,
          manual: mapping.manual !== false
        });
      }
    });

    return snapshot;
  }

  function buildHeartbeatPayload() {
    const config = store.getAll ? store.getAll() : store.store;
    const history = printHistory.getHistory().slice(0, 20);
    return {
      shopId: getShopId(),
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
      uptime: process.uptime(),
      devices: buildDeviceSnapshot(),
      telemetry: {
        lastSuccessAt: config?.telemetry?.lastSuccessAt || null,
        enabled: config?.telemetry?.enabled !== false
      },
      history,
      timestamp: new Date().toISOString()
    };
  }

  function sendMessage(message) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error('WS send failed', error);
      return false;
    }
  }

  function sendRegister() {
    const shopId = getShopId();
    if (!shopId) {
      logger.warn('WS register skipped: shopId not configured');
      return;
    }
    const payload = {
      type: 'register',
      payload: {
        shopId,
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        hostname: os.hostname(),
        capabilities: ['usb', 'tcp', 'remote-test', 'config-sync']
      }
    };
    if (sendMessage(payload)) {
      state.lastRegisterAt = new Date().toISOString();
      logger.info('WS register sent', { shopId });
    }
  }

  function sendHeartbeat() {
    const shopId = getShopId();
    if (!shopId) return;
    const payload = {
      type: 'heartbeat',
      payload: buildHeartbeatPayload()
    };
    if (sendMessage(payload)) {
      state.lastHeartbeatAt = new Date().toISOString();
    }
  }

  function scheduleHeartbeat() {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(() => {
      sendHeartbeat();
      scheduleHeartbeat();
    }, HEARTBEAT_INTERVAL);
  }

  async function handleTaskPrint(message) {
    const { id, payload } = message;
    const { printer, data, encoding, connectionType: payloadConnectionType } = payload || {};
    if (!printer || data == null) {
      return sendMessage({
        type: 'task_result',
        id,
        payload: { status: 'error', message: '缺少打印机信息或打印数据' }
      });
    }

    const connectionType =
      payloadConnectionType ||
      printer.connectionType ||
      (typeof printer.vendorId === 'number' ? 'usb' : 'tcp');

    try {
      const buffer = encoding === 'base64' ? Buffer.from(data, 'base64') : Buffer.from(data);
      if (connectionType === 'tcp') {
        const host = printer.ip || printer.host;
        if (!host) {
          throw new Error('缺少 TCP 打印机 IP 地址');
        }
        await tcpPrinterManager.print({
          ip: host,
          port: printer.port || 9100,
          data: buffer,
          encoding: 'buffer'
        });
      } else {
        await usbManager.print({
          data: buffer,
          encoding: 'buffer',
          vendorId: Number(printer.vendorId),
          productId: Number(printer.productId)
        });
      }
      const successRecord = {
        type: 'remote-test',
        connectionType,
        alias: printer.alias,
        role: printer.role,
        status: 'success',
        message: '远程任务打印成功'
      };
      if (connectionType === 'tcp') {
        successRecord.ip = printer.ip || printer.host;
        successRecord.port = printer.port || 9100;
      } else {
        successRecord.vendorId = Number(printer.vendorId);
        successRecord.productId = Number(printer.productId);
      }
      printHistory.append(successRecord);
      if (connectionType === 'usb') {
        const key = printerMappings.buildUsbKey(printer.vendorId, printer.productId);
        printerMappings.updateMapping(key, {
          lastTest: {
            status: 'success',
            timestamp: new Date().toISOString(),
            message: '远程任务打印成功'
          }
        });
      } else if (connectionType === 'tcp' && printer.ip) {
        const key = printerMappings.buildTcpKey(printer.ip || printer.host, printer.port || 9100);
        printerMappings.updateMapping(key, {
          lastTest: {
            status: 'success',
            timestamp: new Date().toISOString(),
            message: '远程任务打印成功'
          }
        });
      }
      sendMessage({
        type: 'task_result',
        id,
        payload: { status: 'success', message: 'Printed' }
      });
    } catch (error) {
      logger.error('WS remote print failed', error);
      const errorRecord = {
        type: 'remote-test',
        connectionType,
        alias: printer.alias,
        role: printer.role,
        status: 'error',
        message: error?.message || '远程任务打印失败'
      };
      if (connectionType === 'tcp') {
        errorRecord.ip = printer.ip || printer.host;
        errorRecord.port = printer.port || 9100;
      } else {
        errorRecord.vendorId = Number(printer.vendorId);
        errorRecord.productId = Number(printer.productId);
      }
      printHistory.append(errorRecord);
      if (connectionType === 'usb') {
        const key = printerMappings.buildUsbKey(printer.vendorId, printer.productId);
        printerMappings.updateMapping(key, {
          lastTest: {
            status: 'error',
            timestamp: new Date().toISOString(),
            message: error?.message || '远程任务打印失败'
          }
        });
      } else if (connectionType === 'tcp' && (printer.ip || printer.host)) {
        const key = printerMappings.buildTcpKey(printer.ip || printer.host, printer.port || 9100);
        printerMappings.updateMapping(key, {
          lastTest: {
            status: 'error',
            timestamp: new Date().toISOString(),
            message: error?.message || '远程任务打印失败'
          }
        });
      }
      sendMessage({
        type: 'task_result',
        id,
        payload: { status: 'error', message: error?.message || '打印失败' }
      });
    }
  }

  async function handleTaskConfig(message) {
    const { id, payload } = message;
    if (!payload || typeof payload !== 'object') {
      sendMessage({ type: 'task_result', id, payload: { status: 'error', message: '无效配置' } });
      return;
    }
    try {
      store.merge(payload);
      sendMessage({ type: 'task_result', id, payload: { status: 'success', message: '配置已更新' } });
    } catch (error) {
      logger.error('WS config update failed', error);
      sendMessage({ type: 'task_result', id, payload: { status: 'error', message: error?.message || '配置失败' } });
    }
  }

  function handleTaskPing(message) {
    sendMessage({
      type: 'task_result',
      id: message.id,
      payload: { status: 'success', message: 'pong' }
    });
  }

  function handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch (error) {
      logger.warn('WS received invalid JSON', { raw: String(raw) });
      return;
    }

    switch (message.type) {
      case 'ack':
        return;
      case 'print':
        return handleLegacyPrint(message);
      case 'task_print':
        return handleTaskPrint(message);
      case 'task_config':
        return handleTaskConfig(message);
      case 'task_ping':
        return handleTaskPing(message);
      default:
        logger.debug('WS received message', message);
    }
  }

  async function handleLegacyPrint(message) {
    const taskId = message.taskId || message.id || `legacy_${Date.now().toString(36)}`;
    const host = message.printerIP || message.ip || message.host;
    const port = message.port || 9100;
    const encoding = message.encoding || 'base64';
    const payload = message.data;
    if (!host || !payload) {
      sendLegacyPrintResult({
        taskId,
        success: false,
        error: '缺少打印机地址或数据'
      });
      return;
    }
    try {
      const buffer =
        encoding === 'base64'
          ? Buffer.from(payload, 'base64')
          : encoding === 'hex'
            ? Buffer.from(payload, 'hex')
            : Buffer.from(payload);
      await tcpPrinterManager.print({ ip: host, port, data: buffer, encoding: 'buffer' });
      printHistory.append({
        type: 'print',
        connectionType: 'tcp',
        ip: host,
        port,
        status: 'success',
        message: '本地代理打印成功'
      });
      sendLegacyPrintResult({
        taskId,
        success: true,
        bytesSent: buffer.length
      });
    } catch (error) {
      logger.error('Legacy print task failed', error);
      printHistory.append({
        type: 'print',
        connectionType: 'tcp',
        ip: host,
        port,
        status: 'error',
        message: error?.message || '本地代理打印失败'
      });
      sendLegacyPrintResult({
        taskId,
        success: false,
        error: error?.message || '打印失败'
      });
    }
  }

  function sendLegacyPrintResult(result) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(
        JSON.stringify({
          type: 'print_result',
          ...result
        })
      );
    } catch (error) {
      logger.warn('Failed to send legacy print result', error);
    }
  }

  function cleanupSocket() {
    if (socket) {
      try {
        socket.removeAllListeners();
        socket.terminate();
      } catch (error) {
        logger.warn('WS cleanup error', error);
      }
    }
    socket = null;
    clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
  }

  async function connect() {
    if (shuttingDown) return;
    const remote = store.get('remote') || {};
    if (remote.enabled === false) {
      logger.info('WS remote disabled by config');
      return;
    }
    const shopId = getShopId();
    if (!shopId) {
      logger.info('WS connect skipped: shopId not configured');
      return;
    }
    const wsUrl = resolveWsUrl(store);
    if (!wsUrl) {
      logger.warn('WS url not configured');
      return;
    }
    currentWsUrl = wsUrl;
    logger.info('WS connecting', { wsUrl });
    socket = new WebSocket(wsUrl, {
      headers: {
        'x-shop-id': shopId,
        'x-agent-version': app.getVersion()
      }
    });

    socket.on('open', () => {
      logger.info('WS connected');
      reconnectDelay = 0;
      sendRegister();
      sendHeartbeat();
      scheduleHeartbeat();
    });

    socket.on('message', handleMessage);

    socket.on('close', (code) => {
      logger.warn('WS closed', { code });
      cleanupSocket();
      scheduleReconnect();
    });

    socket.on('error', (error) => {
      logger.error('WS error', error);
      state.lastError = error?.message || String(error);
    });
  }

  function scheduleReconnect() {
    if (shuttingDown) return;
    clearTimeout(reconnectTimer);
    const remote = store.get('remote') || {};
    const initial = remote.reconnect?.initialDelay || 2000;
    const max = remote.reconnect?.maxDelay || 30000;
    reconnectDelay = reconnectDelay ? Math.min(reconnectDelay * 1.5, max) : initial;
    reconnectTimer = setTimeout(connect, reconnectDelay + Math.random() * 1000);
  }

  function start() {
    shuttingDown = false;
    connect();
  }

  function stop() {
    shuttingDown = true;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    cleanupSocket();
  }

  function forceHeartbeat() {
    sendHeartbeat();
  }

  return {
    start,
    stop,
    forceHeartbeat,
    getState: () => ({ ...state, currentWsUrl })
  };
};
