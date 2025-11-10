const usbModule = require('usb');
const usb = usbModule;
const usbEvents = typeof usbModule?.on === 'function' ? usbModule : usbModule?.usb;
const iconv = require('iconv-lite');
const logger = require('./logger');

const HOTPLUG_WINDOW_MS = 15_000;

const listeners = new Set();
const hotplugMarkers = new Map();

const state = {
  devices: [],
  refreshing: null
};

function buildKey(vendorId, productId) {
  return `usb:${Number(vendorId) || 0}:${Number(productId) || 0}`;
}

function mapPortPath(portNumbers) {
  if (!Array.isArray(portNumbers) || !portNumbers.length) return null;
  return portNumbers.join('.');
}

function detectPrinter(device, descriptor) {
  if (!descriptor) descriptor = device?.deviceDescriptor || {};
  if (!descriptor) return false;
  if (descriptor.bDeviceClass === 7) {
    return true;
  }
  const interfaces = device?.interfaces || [];
  return interfaces.some((iface) => iface?.descriptor?.bInterfaceClass === 7);
}

function readStringDescriptor(device, index) {
  return new Promise((resolve) => {
    if (!index) {
      resolve(null);
      return;
    }
    device.getStringDescriptor(index, (error, data) => {
      if (error) {
        resolve(null);
      } else if (typeof data === 'string') {
        resolve(data);
      } else if (Buffer.isBuffer(data)) {
        resolve(data.toString('utf8'));
      } else {
        resolve(String(data));
      }
    });
  });
}

async function describeDevice(device, { includeStrings = true } = {}) {
  if (!device || !device.deviceDescriptor) {
    return null;
  }

  const descriptor = device.deviceDescriptor;
  const vendorId = descriptor.idVendor;
  const productId = descriptor.idProduct;
  const key = buildKey(vendorId, productId);
  const base = {
    key,
    vendorId,
    productId,
    busNumber: device.busNumber ?? null,
    deviceAddress: device.deviceAddress ?? null,
    deviceName: `VID_${vendorId?.toString(16) ?? '0000'}&PID_${productId?.toString(16) ?? '0000'}`,
    manufacturerId: descriptor.iManufacturer || null,
    productIdString: descriptor.iProduct || null,
    serialNumberId: descriptor.iSerialNumber || null,
    maxPacketSize: descriptor.bMaxPacketSize0 || null,
    portNumbers: device.portNumbers || [],
    portPath: mapPortPath(device.portNumbers),
    classCode: descriptor.bDeviceClass ?? null,
    subclassCode: descriptor.bDeviceSubClass ?? null,
    protocolCode: descriptor.bDeviceProtocol ?? null,
    change: null,
    isPrinter: descriptor.bDeviceClass === 7
  };

  if (!includeStrings) {
    return base;
  }

  let openedHere = false;
  try {
    if (!device.interfaces || !device.interfaces.length) {
      device.open();
      openedHere = true;
    }

    const [manufacturerName, productName, serialNumber] = await Promise.all([
      readStringDescriptor(device, descriptor.iManufacturer),
      readStringDescriptor(device, descriptor.iProduct),
      readStringDescriptor(device, descriptor.iSerialNumber)
    ]);

    base.manufacturerName = manufacturerName || null;
    base.productName = productName || null;
    base.serialNumber = serialNumber || null;
    base.isPrinter = detectPrinter(device, descriptor);
  } catch (error) {
    logger.debug?.('Describe USB device failed', error);
  } finally {
    if (openedHere) {
      try {
        device.close();
      } catch (err) {
        logger.warn('关闭 USB 设备失败', err);
      }
    }
  }

  return base;
}

async function collectDevices() {
  const list = usb.getDeviceList();
  const mapped = await Promise.all(
    list.map(async (device) => {
      try {
        return await describeDevice(device, { includeStrings: true });
      } catch (error) {
        logger.warn('Failed to build USB device description', error);
        return await describeDevice(device, { includeStrings: false });
      }
    })
  );

  const now = Date.now();
  const enriched = mapped
    .filter(Boolean)
    .map((item) => {
      const marker = hotplugMarkers.get(item.key);
      if (marker && now - marker.timestamp <= HOTPLUG_WINDOW_MS) {
        return {
          ...item,
          change: marker
        };
      }
      if (marker) {
        hotplugMarkers.delete(item.key);
      }
      return item;
    });

  enriched.sort((a, b) => {
    if (a.change && !b.change) return -1;
    if (!a.change && b.change) return 1;
    return (a.deviceName || '').localeCompare(b.deviceName || '');
  });

  return enriched;
}

async function refreshDevices() {
  if (!state.refreshing) {
    state.refreshing = collectDevices()
      .then((devices) => {
        state.devices = devices;
        logger.info('USB devices refreshed', { count: devices.length });
        state.refreshing = null;
        return devices;
      })
      .catch((error) => {
        state.refreshing = null;
        logger.error('USB refresh failed', error);
        return state.devices;
      });
  }
  return state.refreshing;
}

function getDevices() {
  return state.devices;
}

function findDevice(match) {
  return usb.getDeviceList().find((device) => {
    const descriptor = device.deviceDescriptor || {};
    if (match.vendorId && descriptor.idVendor !== match.vendorId) return false;
    if (match.productId && descriptor.idProduct !== match.productId) return false;
    if (match.busNumber && device.busNumber !== match.busNumber) return false;
    if (match.deviceAddress && device.deviceAddress !== match.deviceAddress) return false;
    return true;
  });
}

function openDevice(device) {
  if (!device) {
    throw new Error('设备未找到');
  }
  device.open();
  const iface = device.interfaces && device.interfaces[0];
  if (!iface) {
    throw new Error('无法读取打印机接口');
  }
  if (iface.isKernelDriverActive && iface.isKernelDriverActive()) {
    try {
      iface.detachKernelDriver();
    } catch (err) {
      logger.warn('无法卸载内核驱动', err);
    }
  }
  iface.claim();
  const endpoint = iface.endpoints.find((ep) => ep.direction === 'out');
  if (!endpoint) {
    throw new Error('未找到可写端点');
  }
  return { iface, endpoint };
}

async function writeBuffer(device, endpoint, buffer) {
  return new Promise((resolve, reject) => {
    endpoint.transfer(buffer, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function print({ data, encoding = 'base64', vendorId, productId }) {
  const device = findDevice({ vendorId, productId });
  if (!device) {
    const error = new Error('未找到匹配的 USB 打印机');
    error.code = 'USB_NOT_FOUND';
    error.vendorId = vendorId;
    error.productId = productId;
    throw error;
  }
  const payload = Buffer.isBuffer(data)
    ? data
    : encoding === 'base64'
      ? Buffer.from(data, 'base64')
      : iconv.encode(data, 'gbk');

  let handle;
  try {
    const { iface, endpoint } = openDevice(device);
    handle = { device, iface };
    await writeBuffer(device, endpoint, payload);
    logger.info('USB print success', { vendorId, productId, size: payload.length });
  } finally {
    if (handle?.iface) {
      try {
        handle.iface.release(true, () => {});
      } catch (err) {
        logger.warn('释放接口失败', err);
      }
    }
    if (handle?.device) {
      try {
        handle.device.close();
      } catch (err) {
        logger.warn('关闭设备失败', err);
      }
    }
  }
}

function notifyHotplug(event) {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      logger.warn('USB hotplug listener failed', error);
    }
  });
}

async function handleAttach(device) {
  const timestamp = Date.now();
  try {
    const info = (await describeDevice(device, { includeStrings: true })) || {
      key: buildKey(device?.deviceDescriptor?.idVendor, device?.deviceDescriptor?.idProduct),
      vendorId: device?.deviceDescriptor?.idVendor,
      productId: device?.deviceDescriptor?.idProduct
    };
    hotplugMarkers.set(info.key, { type: 'attach', timestamp });
    await refreshDevices();
    notifyHotplug({
      type: 'attach',
      timestamp,
      device: info
    });
  } catch (error) {
    logger.error('Failed to handle USB attach event', error);
  }
}

async function handleDetach(device) {
  const timestamp = Date.now();
  try {
    const descriptor = device?.deviceDescriptor;
    const info =
      (descriptor && {
        key: buildKey(descriptor.idVendor, descriptor.idProduct),
        vendorId: descriptor.idVendor,
        productId: descriptor.idProduct,
        deviceName: `VID_${descriptor.idVendor?.toString(16) ?? '0000'}&PID_${descriptor.idProduct?.toString(16) ?? '0000'}`
      }) ||
      null;
    if (info) {
      hotplugMarkers.set(info.key, { type: 'detach', timestamp });
    }
    await refreshDevices();
    notifyHotplug({
      type: 'detach',
      timestamp,
      device: info
    });
  } catch (error) {
    logger.error('Failed to handle USB detach event', error);
  }
}

if (usbEvents && typeof usbEvents.on === 'function') {
  usbEvents.on('attach', (device) => {
    handleAttach(device);
  });
  usbEvents.on('detach', (device) => {
    handleDetach(device);
  });
} else {
  logger.warn('USB hotplug events not supported by current usb module build');
}

function onHotplug(listener) {
  if (typeof listener === 'function') {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  return () => {};
}

function dispose() {
  state.devices = [];
  listeners.clear();
  hotplugMarkers.clear();
}

module.exports = {
  refreshDevices,
  getDevices,
  print,
  dispose,
  onHotplug
};
