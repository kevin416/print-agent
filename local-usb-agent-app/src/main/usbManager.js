const usbModule = require('usb');
const usb = usbModule;
const usbEvents = typeof usbModule?.on === 'function' ? usbModule : usbModule?.usb;
const iconv = require('iconv-lite');
const logger = require('./logger');

// i18n will be injected via setI18n function
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
        logger.warn(t('print.closeUsbDeviceFailed'), err);
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
  const allDevices = usb.getDeviceList();
  const matchingDevices = allDevices.filter((device) => {
    const descriptor = device.deviceDescriptor || {};
    if (match.vendorId && descriptor.idVendor !== match.vendorId) return false;
    if (match.productId && descriptor.idProduct !== match.productId) return false;
    if (match.busNumber && device.busNumber !== match.busNumber) return false;
    if (match.deviceAddress && device.deviceAddress !== match.deviceAddress) return false;
    return true;
  });
  
  // 如果找到多个匹配的设备，记录警告
  if (matchingDevices.length > 1) {
    logger.warn('Multiple devices found with same VID/PID', {
      vid: match.vendorId?.toString(16),
      pid: match.productId?.toString(16),
      count: matchingDevices.length,
      devices: matchingDevices.map((d, i) => ({
        index: i,
        busNumber: d.busNumber,
        deviceAddress: d.deviceAddress,
        interfacesCount: d.interfaces?.length || 0
      }))
    });
  }
  
  // 尝试找到可以打开的设备（WinUSB 驱动）
  // 优先选择有接口的设备
  for (const device of matchingDevices) {
    try {
      // 尝试打开设备以检查是否可用
      const wasOpen = device.interfaces && device.interfaces.length > 0;
      if (!wasOpen) {
        device.open();
      }
      
      // 检查是否有接口
      if (device.interfaces && device.interfaces.length > 0) {
        if (!wasOpen) {
          device.close();
        }
        logger.debug('Selected USB device with interfaces', {
          vid: match.vendorId?.toString(16),
          pid: match.productId?.toString(16),
          busNumber: device.busNumber,
          deviceAddress: device.deviceAddress,
          interfacesCount: device.interfaces.length
        });
        return device;
      }
      
      if (!wasOpen) {
        device.close();
      }
    } catch (err) {
      // 如果无法打开，尝试下一个设备
      logger.debug('Device cannot be opened, trying next', {
        vid: match.vendorId?.toString(16),
        pid: match.productId?.toString(16),
        busNumber: device.busNumber,
        deviceAddress: device.deviceAddress,
        error: err?.message
      });
      continue;
    }
  }
  
  // 如果所有设备都无法打开，返回第一个匹配的设备
  if (matchingDevices.length > 0) {
    logger.warn('No accessible device found, returning first match', {
      vid: match.vendorId?.toString(16),
      pid: match.productId?.toString(16),
      selectedDevice: {
        busNumber: matchingDevices[0].busNumber,
        deviceAddress: matchingDevices[0].deviceAddress
      }
    });
    return matchingDevices[0];
  }
  
  return null;
}

function openDevice(device) {
  if (!device) {
    throw new Error(t('print.deviceNotFound'));
  }
  
  const vid = device.deviceDescriptor?.idVendor?.toString(16) || 'xxxx';
  const pid = device.deviceDescriptor?.idProduct?.toString(16) || 'xxxx';
  
  try {
    device.open();
    logger.debug('USB device opened successfully', { vid, pid, busNumber: device.busNumber, deviceAddress: device.deviceAddress });
  } catch (err) {
    // 记录详细错误信息
    const errorMessage = err?.message || String(err);
    const errorCode = err?.errno || err?.code || 'UNKNOWN';
    logger.error('USB device open failed', { 
      vid, 
      pid, 
      error: errorMessage, 
      code: errorCode,
      busNumber: device.busNumber,
      deviceAddress: device.deviceAddress,
      stack: err?.stack
    });
    
    // 检测 Windows 驱动错误
    if (errorMessage.includes('LIBUSB_ERROR_NOT_SUPPORTED') || 
        errorMessage.includes('not supported') ||
        errorMessage.includes('NOT_SUPPORTED') ||
        errorCode === 'LIBUSB_ERROR_NOT_SUPPORTED') {
      const driverError = new Error(t('print.windowsDriverNotSupported', { vid, pid }));
      driverError.code = 'LIBUSB_ERROR_NOT_SUPPORTED';
      driverError.isDriverError = true;
      driverError.originalError = errorMessage;
      throw driverError;
    }
    throw err;
  }
  
  const iface = device.interfaces && device.interfaces[0];
  if (!iface) {
    logger.error('No USB interface found', { vid, pid, interfacesCount: device.interfaces?.length || 0 });
    throw new Error(t('print.cannotReadPrinterInterface'));
  }
  
  logger.debug('USB interface found', { 
    vid, 
    pid, 
    interfaceNumber: iface.descriptor?.bInterfaceNumber,
    interfaceClass: iface.descriptor?.bInterfaceClass,
    endpointsCount: iface.endpoints?.length || 0
  });
  
  // 在 Windows 上，WinUSB 设备不需要 detach kernel driver
  // 但某些情况下可能需要
  if (iface.isKernelDriverActive && iface.isKernelDriverActive()) {
    try {
      logger.debug('Attempting to detach kernel driver', { vid, pid });
      iface.detachKernelDriver();
      logger.debug('Kernel driver detached successfully', { vid, pid });
    } catch (err) {
      // 在 Windows 上，WinUSB 设备通常没有 kernel driver，这个错误可以忽略
      logger.warn(t('print.cannotDetachKernelDriver'), { vid, pid, error: err?.message });
    }
  }
  
  try {
    iface.claim();
    logger.debug('USB interface claimed successfully', { vid, pid });
  } catch (err) {
    // 记录详细错误信息
    const errorMessage = err?.message || String(err);
    const errorCode = err?.errno || err?.code || 'UNKNOWN';
    logger.error('USB interface claim failed', { 
      vid, 
      pid, 
      error: errorMessage, 
      code: errorCode,
      interfaceNumber: iface.descriptor?.bInterfaceNumber,
      stack: err?.stack
    });
    
    // 检测 Windows 驱动错误（claim 时也可能出现）
    if (errorMessage.includes('LIBUSB_ERROR_NOT_SUPPORTED') || 
        errorMessage.includes('not supported') ||
        errorMessage.includes('NOT_SUPPORTED') ||
        errorCode === 'LIBUSB_ERROR_NOT_SUPPORTED') {
      const driverError = new Error(t('print.windowsDriverNotSupported', { vid, pid }));
      driverError.code = 'LIBUSB_ERROR_NOT_SUPPORTED';
      driverError.isDriverError = true;
      driverError.originalError = errorMessage;
      throw driverError;
    }
    throw err;
  }
  
  const endpoint = iface.endpoints.find((ep) => ep.direction === 'out');
  if (!endpoint) {
    logger.error('No writable endpoint found', { 
      vid, 
      pid, 
      endpoints: iface.endpoints?.map(ep => ({
        direction: ep.direction,
        address: ep.address,
        type: ep.type
      })) || []
    });
    throw new Error(t('print.noWritableEndpoint'));
  }
  
  logger.debug('Writable endpoint found', { 
    vid, 
    pid, 
    endpointAddress: endpoint.address,
    endpointDirection: endpoint.direction,
    endpointType: endpoint.type
  });
  
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
  const vid = vendorId?.toString(16) || 'xxxx';
  const pid = productId?.toString(16) || 'xxxx';
  
  logger.debug('Attempting to print', { vendorId, productId, vid, pid, dataSize: data?.length || 0 });
  
  const device = findDevice({ vendorId, productId });
  if (!device) {
    logger.error('USB device not found', { vendorId, productId, vid, pid });
    const error = new Error(t('print.usbPrinterNotFound'));
    error.code = 'USB_NOT_FOUND';
    error.vendorId = vendorId;
    error.productId = productId;
    throw error;
  }
  
  logger.debug('USB device found', { 
    vendorId, 
    productId, 
    vid, 
    pid, 
    busNumber: device.busNumber,
    deviceAddress: device.deviceAddress,
    interfacesCount: device.interfaces?.length || 0
  });
  const payload = Buffer.isBuffer(data)
    ? data
    : encoding === 'base64'
      ? Buffer.from(data, 'base64')
      : iconv.encode(data, 'gb18030');

  let handle;
  try {
    const { iface, endpoint } = openDevice(device);
    handle = { device, iface };
    await writeBuffer(device, endpoint, payload);
    logger.info('USB print success', { vendorId, productId, size: payload.length });
  } catch (err) {
    // 如果错误已经包含 isDriverError 标记，直接抛出
    if (err.isDriverError) {
      throw err;
    }
    // 检查错误消息中是否包含驱动相关错误
    const errorMessage = err?.message || String(err);
    if (errorMessage.includes('LIBUSB_ERROR_NOT_SUPPORTED') || 
        errorMessage.includes('not supported') ||
        errorMessage.includes('NOT_SUPPORTED')) {
      const driverError = new Error(t('print.windowsDriverNotSupported', {
        vid: vendorId?.toString(16) || 'xxxx',
        pid: productId?.toString(16) || 'xxxx'
      }));
      driverError.code = 'LIBUSB_ERROR_NOT_SUPPORTED';
      driverError.isDriverError = true;
      throw driverError;
    }
    // 其他错误直接抛出
    throw err;
  } finally {
    if (handle?.iface) {
      try {
        handle.iface.release(true, () => {});
      } catch (err) {
        logger.warn(t('print.releaseInterfaceFailed'), err);
      }
    }
    if (handle?.device) {
      try {
        handle.device.close();
      } catch (err) {
        logger.warn(t('print.closeDeviceFailed'), err);
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
  onHotplug,
  setI18n
};
