const express = require('express');
const http = require('http');
const cors = require('cors');
const iconv = require('iconv-lite');

// i18n will be injected via getI18n parameter
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

async function startServer({ configStore, usbManager, tcpPrinterManager, printerMappings, logger, getI18n: i18nGetter }) {
  if (i18nGetter) {
    setI18n(i18nGetter);
  }
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
      logger.error(t('server.healthCheckFailed'), err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.post('/print', async (req, res) => {
    const { data, encoding, vendorId, productId, text, connectionType = 'usb', ip, host, port } = req.body || {};
    try {
      if (!data && !text) {
        throw new Error(t('server.missingPrintContent'));
      }
      const payload = data
        ? { data, encoding: encoding || 'base64' }
        : { data: iconv.encode(text, 'gb18030'), encoding: 'buffer' };
      if (connectionType === 'tcp') {
        const targetHost = host || ip;
        await tcpPrinterManager.print({ ...payload, ip: targetHost, port: port || 9100 });
        logger.info(t('server.tcpPrintCompleted'), { host: targetHost, port: port || 9100 });
      } else {
        await usbManager.print({ ...payload, vendorId, productId });
        logger.info(t('server.usbPrintCompleted'), { vendorId, productId });
      }
      res.json({ ok: true });
    } catch (err) {
      logger.error(t('server.printRequestFailed'), { message: err.message, stack: err.stack });
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  const port = configStore.get('server.port') || 40713;
  const server = http.createServer(app);

  await new Promise((resolve, reject) => {
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        const error = new Error(t('server.portInUse', { port }));
        error.code = 'EADDRINUSE';
        reject(error);
      } else {
        reject(err);
      }
    });
    
    server.listen(port, () => {
      logger.info(t('server.listening'), { port });
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
  stopServer,
  setI18n
};
