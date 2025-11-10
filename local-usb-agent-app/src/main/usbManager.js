const usb = require('usb');
const iconv = require('iconv-lite');
const logger = require('./logger');

const state = {
  devices: []
};

function describeDevice(device) {
  const descriptors = device.deviceDescriptor || {};
  const address = `${device.busNumber || 0}-${device.deviceAddress || 0}`;
  return {
    address,
    vendorId: descriptors.idVendor,
    productId: descriptors.idProduct,
    manufacturer: descriptors.iManufacturer,
    product: descriptors.iProduct,
    serialNumber: descriptors.iSerialNumber,
    portNumbers: device.portNumbers,
    deviceName: `VID_${descriptors.idVendor?.toString(16)}&PID_${descriptors.idProduct?.toString(16)}`
  };
}

async function refreshDevices() {
  const devices = usb.getDeviceList().map(describeDevice);
  state.devices = devices;
  logger.info('USB devices refreshed', { count: devices.length });
  return devices;
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

function dispose() {
  state.devices = [];
}

module.exports = {
  refreshDevices,
  getDevices,
  print,
  dispose
};
