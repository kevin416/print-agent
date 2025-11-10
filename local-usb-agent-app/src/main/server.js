const express = require('express');
const http = require('http');
const cors = require('cors');
const iconv = require('iconv-lite');

async function startServer({ configStore, usbManager, tcpPrinterManager, printerMappings, logger }) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(
    cors({
      origin: (_origin, callback) => callback(null, true),
      credentials: false
    })
  );
  app.options('*', cors());

  app.get('/health', async (_req, res) => {
    try {
      const devices = usbManager.getDevices();
      const tcpPrinters = printerMappings?.listEntries
        ? printerMappings.listEntries().filter((entry) => entry.connectionType === 'tcp')
        : [];
      res.json({ status: 'ok', devices, tcpPrinters });
    } catch (err) {
      logger.error('Health check failed', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.post('/print', async (req, res) => {
    const { data, encoding, vendorId, productId, text, connectionType = 'usb', ip, host, port } = req.body || {};
    try {
      if (!data && !text) {
        throw new Error('缺少打印内容');
      }
      const payload = data
        ? { data, encoding: encoding || 'base64' }
        : { data: iconv.encode(text, 'gb18030'), encoding: 'buffer' };
      if (connectionType === 'tcp') {
        const targetHost = host || ip;
        await tcpPrinterManager.print({ ...payload, ip: targetHost, port: port || 9100 });
        logger.info('TCP print request completed', { host: targetHost, port: port || 9100 });
      } else {
        await usbManager.print({ ...payload, vendorId, productId });
        logger.info('USB print request completed', { vendorId, productId });
      }
      res.json({ ok: true });
    } catch (err) {
      logger.error('Print request failed', { message: err.message, stack: err.stack });
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  const port = configStore.get('server.port') || 40713;
  const server = http.createServer(app);

  await new Promise((resolve, reject) => {
    server.listen(port, (err) => {
      if (err) {
        reject(err);
        return;
      }
      logger.info('Local agent server listening', { port });
      resolve();
    });
  });

  return server;
}

async function stopServer(server) {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
}

module.exports = {
  startServer,
  stopServer
};
