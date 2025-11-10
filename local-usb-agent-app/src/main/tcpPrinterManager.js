const net = require('net');
const iconv = require('iconv-lite');
const logger = require('./logger');

const DEFAULT_TIMEOUT = 8000;

function normaliseEncoding({ data, encoding = 'base64', text }) {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (typeof text === 'string' && !data) {
    return iconv.encode(text, 'gb18030');
  }
  if (!data) {
    throw new Error('缺少打印数据');
  }
  if (encoding === 'buffer') {
    return Buffer.from(data);
  }
  if (encoding === 'utf8' || encoding === 'utf-8') {
    return iconv.encode(data, 'gb18030');
  }
  if (encoding === 'hex') {
    return Buffer.from(data, 'hex');
  }
  return Buffer.from(data, 'base64');
}

function createSocket({ host, port, timeout = DEFAULT_TIMEOUT }) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const finalize = (err) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      if (err) {
        reject(err);
      } else {
        resolve(socket);
      }
    };

    socket.setTimeout(timeout, () => {
      const error = new Error('TCP 打印连接超时');
      error.code = 'TCP_TIMEOUT';
      finalize(error);
      socket.destroy();
    });

    socket.once('error', (error) => {
      finalize(error);
    });

    socket.once('connect', () => finalize(null));

    socket.connect(Number(port) || 9100, host);
  });
}

async function sendBuffer({ host, port, buffer, timeout = DEFAULT_TIMEOUT }) {
  if (!host) {
    throw new Error('缺少打印机 IP 地址');
  }
  const socket = await createSocket({ host, port, timeout });
  return new Promise((resolve, reject) => {
    let resolved = false;
    socket.write(buffer, (err) => {
      if (err) {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          reject(err);
        }
        return;
      }
      socket.end(() => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      });
    });
    socket.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        reject(error);
      }
    });
    socket.on('close', () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    });
  });
}

async function print({ ip, host, port = 9100, data, encoding, text, timeout }) {
  const targetHost = host || ip;
  if (!targetHost) {
    throw new Error('缺少 TCP 打印机 IP 地址');
  }
  const buffer = normaliseEncoding({ data, encoding, text });
  const startedAt = Date.now();
  try {
    await sendBuffer({ host: targetHost, port, buffer, timeout });
    const duration = Date.now() - startedAt;
    logger.info('TCP print success', { host: targetHost, port, size: buffer.length, duration });
  } catch (error) {
    error.host = targetHost;
    error.port = port;
    logger.error('TCP print failed', { host: targetHost, port, message: error.message });
    throw error;
  }
}

module.exports = {
  print
};


