const WebSocket = require('ws');
const os = require('os');
const iconv = require('iconv-lite');
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
    printHistory,
    getI18n
  } = options;
  
  function t(key, params) {
    const i18n = getI18n ? getI18n() : null;
    if (!i18n) return key;
    return i18n.t(key, params);
  }

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
      logger.warn(t('websocket.registerSkippedNoShopId'));
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
      logger.info(t('websocket.registerSent'), { shopId });
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
    const { printer, data, encoding, connectionType: payloadConnectionType, charset } = payload || {};
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
      let buffer = encoding === 'base64' ? Buffer.from(data, 'base64') : Buffer.from(data);
      
      // 🔥 修复：如果指定了 charset 为 'utf8'，需要将 UTF-8 转换为 GBK
      if (charset === 'utf8' || charset === 'utf-8') {
        // 解析 ESC/POS 数据流，只转换文本部分
        buffer = convertEscPosUtf8ToGbk(buffer);
        logger.info('Converted UTF-8 to GBK for print task', { 
          originalSize: buffer.length,
          charset: charset,
          connectionType: connectionType
        });
      }
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
        message: t('print.remoteTaskSuccess')
      };
      if (connectionType === 'tcp') {
        successRecord.ip = printer.ip || printer.host;
        successRecord.port = printer.port || 9100;
      } else {
        successRecord.vendorId = Number(printer.vendorId);
        successRecord.productId = Number(printer.productId);
      }
      printHistory.append(successRecord);
      const successMessage = t('print.remoteTaskSuccess');
      if (connectionType === 'usb') {
        const key = printerMappings.buildUsbKey(printer.vendorId, printer.productId);
        printerMappings.updateMapping(key, {
          lastTest: {
            status: 'success',
            timestamp: new Date().toISOString(),
            message: successMessage
          }
        });
      } else if (connectionType === 'tcp' && printer.ip) {
        const key = printerMappings.buildTcpKey(printer.ip || printer.host, printer.port || 9100);
        printerMappings.updateMapping(key, {
          lastTest: {
            status: 'success',
            timestamp: new Date().toISOString(),
            message: successMessage
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
      const errorMessage = error?.message || t('print.remoteTaskFailed');
      const errorRecord = {
        type: 'remote-test',
        connectionType,
        alias: printer.alias,
        role: printer.role,
        status: 'error',
        message: errorMessage
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
            message: errorMessage
          }
        });
      } else if (connectionType === 'tcp' && (printer.ip || printer.host)) {
        const key = printerMappings.buildTcpKey(printer.ip || printer.host, printer.port || 9100);
        printerMappings.updateMapping(key, {
          lastTest: {
            status: 'error',
            timestamp: new Date().toISOString(),
            message: errorMessage
          }
        });
      }
      sendMessage({
        type: 'task_result',
        id,
        payload: { status: 'error', message: errorMessage }
      });
    }
  }

  async function handleTaskConfig(message) {
    const { id, payload } = message;
    if (!payload || typeof payload !== 'object') {
      sendMessage({ type: 'task_result', id, payload: { status: 'error', message: t('websocket.invalidConfig') } });
      return;
    }
    try {
      store.merge(payload);
      sendMessage({ type: 'task_result', id, payload: { status: 'success', message: t('websocket.configUpdated') } });
    } catch (error) {
      logger.error('WS config update failed', error);
      sendMessage({ type: 'task_result', id, payload: { status: 'error', message: error?.message || t('websocket.configFailed') } });
    }
  }

  /**
   * 将 ESC/POS 数据流从 UTF-8 转换为 GBK
   * 
   * 策略：使用状态机解析 ESC/POS 数据流
   * 1. 识别 ESC/POS 命令（ESC 0x1B, GS 0x1D, 1C 0x1C）
   * 2. 保留命令字节不变，但移除 0x1C 0x43 0x01 (GBK编码设置命令)，因为数据已经是 GBK
   * 3. 提取文本部分，从 UTF-8 转换为 GBK
   * 
   * 注意：文本中可能包含控制字符（如换行 0x0A），这些应该保留
   */
  function convertEscPosUtf8ToGbk(buffer) {
    const result = [];
    let textBuffer = [];
    let i = 0;
    
    while (i < buffer.length) {
      const byte = buffer[i];
      
      // 检测 ESC/POS 命令开始
      if (byte === 0x1B || byte === 0x1D || byte === 0x1C) {
        // 先处理积累的文本
        if (textBuffer.length > 0) {
          convertTextBuffer(textBuffer, result);
          textBuffer = [];
        }
        
        // 检查是否是 0x1C 0x43 0x01 (GBK编码设置命令)
        // 如果是，跳过这个命令（因为转换后的数据已经是 GBK，不需要这个命令）
        if (byte === 0x1C && i + 2 < buffer.length && buffer[i + 1] === 0x43 && buffer[i + 2] === 0x01) {
          // 跳过 GBK 编码设置命令
          i += 3;
          continue;
        }
        
        // 提取并保留其他命令
        const commandInfo = extractEscPosCommand(buffer, i);
        result.push(...commandInfo.commandBytes);
        i = commandInfo.nextIndex;
        continue;
      }
      
      // 文本数据：添加到文本缓冲区
      // 包括：ASCII 可打印字符 (0x20-0x7E)、控制字符 (0x0A, 0x0D, 0x09)、UTF-8 多字节字符
      textBuffer.push(byte);
      i++;
    }
    
    // 处理剩余的文本
    if (textBuffer.length > 0) {
      convertTextBuffer(textBuffer, result);
    }
    
    return Buffer.from(result);
  }
  
  /**
   * 转换文本缓冲区从 UTF-8 到 GBK
   */
  function convertTextBuffer(textBuffer, result) {
    if (textBuffer.length === 0) return;
    
    try {
      // 将 UTF-8 字节解码为字符串
      const text = Buffer.from(textBuffer).toString('utf8');
      // 编码为 GBK
      const gbkBytes = iconv.encode(text, 'gb18030');
      result.push(...Array.from(gbkBytes));
    } catch (err) {
      // 转换失败，可能是二进制数据或损坏的 UTF-8，直接使用原字节
      logger.warn('UTF-8 to GBK conversion failed', { 
        error: err.message, 
        bufferLength: textBuffer.length,
        firstBytes: textBuffer.slice(0, 10).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')
      });
      result.push(...textBuffer);
    }
  }

  /**
   * 提取 ESC/POS 命令
   * 返回命令字节和下一个索引位置
   */
  function extractEscPosCommand(buffer, startIndex) {
    const commandBytes = [];
    let i = startIndex;
    
    if (i >= buffer.length) {
      return { commandBytes: [], nextIndex: i };
    }
    
    const firstByte = buffer[i];
    commandBytes.push(firstByte);
    i++;
    
    if (i >= buffer.length) {
      return { commandBytes, nextIndex: i };
    }
    
    const secondByte = buffer[i];
    
    // ESC 命令 (0x1B)
    if (firstByte === 0x1B) {
      commandBytes.push(secondByte);
      i++;
      
      // ESC @ (初始化) - 2字节
      if (secondByte === 0x40) {
        return { commandBytes, nextIndex: i };
      }
      
      // ESC a n (对齐) - 3字节
      if (secondByte === 0x61 && i < buffer.length) {
        commandBytes.push(buffer[i]);
        i++;
        return { commandBytes, nextIndex: i };
      }
      
      // ESC E n (粗体) - 3字节
      if (secondByte === 0x45 && i < buffer.length) {
        commandBytes.push(buffer[i]);
        i++;
        return { commandBytes, nextIndex: i };
      }
      
      // ESC ! n (字体大小) - 3字节
      if (secondByte === 0x21 && i < buffer.length) {
        commandBytes.push(buffer[i]);
        i++;
        return { commandBytes, nextIndex: i };
      }
      
      // ESC d n (换行) - 3字节
      if (secondByte === 0x64 && i < buffer.length) {
        commandBytes.push(buffer[i]);
        i++;
        return { commandBytes, nextIndex: i };
      }
      
      // ESC D n1 n2 ... NUL (制表符) - 可变长度，直到找到 NUL
      if (secondByte === 0x44) {
        while (i < buffer.length && buffer[i] !== 0x00) {
          commandBytes.push(buffer[i]);
          i++;
        }
        if (i < buffer.length) {
          commandBytes.push(buffer[i]); // NUL
          i++;
        }
        return { commandBytes, nextIndex: i };
      }
      
      // 其他已知的2字节 ESC 命令
      if (secondByte === 0x32 || secondByte === 0x33 || secondByte === 0x70) {
        // ESC 2, ESC 3 n, ESC p - 需要根据具体命令处理
        // 为了安全，先提取2字节
        return { commandBytes, nextIndex: i };
      }
      
      // 其他 ESC 命令，保守处理：提取2字节
      return { commandBytes, nextIndex: i };
    }
    
    // GS 命令 (0x1D)
    if (firstByte === 0x1D) {
      commandBytes.push(secondByte);
      i++;
      
      // GS ! n (字符大小) - 3字节
      if (secondByte === 0x21 && i < buffer.length) {
        commandBytes.push(buffer[i]);
        i++;
        return { commandBytes, nextIndex: i };
      }
      
      // GS v 0 m xL xH yL yH d1...dk (位图打印) - 可变长度
      if (secondByte === 0x76 && i < buffer.length) {
        commandBytes.push(buffer[i]); // 0
        i++;
        if (i < buffer.length) {
          commandBytes.push(buffer[i]); // m
          i++;
          // xL xH yL yH - 4字节
          for (let j = 0; j < 4 && i < buffer.length; j++) {
            commandBytes.push(buffer[i]);
            i++;
          }
          // 位图数据长度 = (xL + xH * 256) * (yL + yH * 256) * (m + 1)
          // 这里我们保守地提取更多字节，但实际数据应该在文本缓冲区中处理
          // 为了简化，我们只提取命令头，数据部分作为文本处理
        }
        return { commandBytes, nextIndex: i };
      }
      
      // GS ( k ... (功能命令) - 可变长度
      if (secondByte === 0x28 && i < buffer.length) {
        commandBytes.push(buffer[i]); // k
        i++;
        // 根据功能代码提取参数（这里简化处理）
        let paramCount = 0;
        while (i < buffer.length && paramCount < 10) {
          commandBytes.push(buffer[i]);
          i++;
          paramCount++;
          if (buffer[i - 1] === 0x00) {
            break;
          }
        }
        return { commandBytes, nextIndex: i };
      }
      
      // 其他 GS 命令，保守处理：提取2字节
      return { commandBytes, nextIndex: i };
    }
    
    // 1C 命令 (0x1C)
    if (firstByte === 0x1C) {
      commandBytes.push(secondByte);
      i++;
      
      // 1C 43 n (编码设置) - 3字节
      if (secondByte === 0x43 && i < buffer.length) {
        commandBytes.push(buffer[i]);
        i++;
        return { commandBytes, nextIndex: i };
      }
      
      // 其他 1C 命令，保守处理：提取2字节
      return { commandBytes, nextIndex: i };
    }
    
    // 未知命令，保守处理：只提取第一个字节
    return { commandBytes, nextIndex: i };
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
        logger.warn(t('websocket.invalidJson'), { raw: String(raw) });
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
        message: t('print.localAgentSuccess')
      });
      sendLegacyPrintResult({
        taskId,
        success: true,
        bytesSent: buffer.length
      });
    } catch (error) {
      logger.error('Legacy print task failed', error);
      const errorMessage = error?.message || t('print.localAgentFailed');
      printHistory.append({
        type: 'print',
        connectionType: 'tcp',
        ip: host,
        port,
        status: 'error',
        message: errorMessage
      });
      sendLegacyPrintResult({
        taskId,
        success: false,
        error: errorMessage
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
      logger.warn(t('websocket.sendResultFailed'), error);
    }
  }

  function cleanupSocket() {
    if (socket) {
      try {
        socket.removeAllListeners();
        socket.terminate();
      } catch (error) {
        logger.warn(t('websocket.cleanupError'), error);
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
      logger.info(t('websocket.remoteDisabled'));
      return;
    }
    const shopId = getShopId();
    if (!shopId) {
      logger.info(t('websocket.connectSkippedNoShopId'));
      return;
    }
    const wsUrl = resolveWsUrl(store);
    if (!wsUrl) {
      logger.warn(t('websocket.urlNotConfigured'));
      return;
    }
    currentWsUrl = wsUrl;
    logger.info(t('websocket.connecting'), { wsUrl });
    socket = new WebSocket(wsUrl, {
      headers: {
        'x-shop-id': shopId,
        'x-agent-version': app.getVersion()
      }
    });

    socket.on('open', () => {
      logger.info(t('websocket.connected'));
      reconnectDelay = 0;
      sendRegister();
      sendHeartbeat();
      scheduleHeartbeat();
    });

    socket.on('message', handleMessage);

    socket.on('close', (code) => {
      logger.warn(t('websocket.closed'), { code });
      cleanupSocket();
      scheduleReconnect();
    });

    socket.on('error', (error) => {
      logger.error(t('websocket.error'), error);
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
