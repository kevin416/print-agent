let configStore = null;

function init(store) {
  configStore = store;
}

function getMappings() {
  if (!configStore) return {};
  return configStore.get('printerMappings') || {};
}

function setMappings(mappings) {
  if (!configStore) return;
  configStore.set('printerMappings', mappings || {});
}

function buildUsbKey(vendorId, productId) {
  return `usb:${Number(vendorId)}:${Number(productId)}`;
}

function buildTcpKey(ip, port = 9100) {
  return `tcp:${ip}:${Number(port)}`;
}

function parseKey(key) {
  if (!key) return null;
  if (key.startsWith('usb:')) {
    const [, vendorIdStr = '0', productIdStr = '0'] = key.split(':');
    return {
      connectionType: 'usb',
      vendorId: Number(vendorIdStr),
      productId: Number(productIdStr)
    };
  }
  if (key.startsWith('tcp:')) {
    const [, ip = '', portStr = '9100'] = key.split(':');
    return {
      connectionType: 'tcp',
      ip,
      port: Number(portStr || 9100)
    };
  }
  return null;
}

function normalizeEntry(key, value = {}) {
  const parsed = parseKey(key) || {};
  const entry = { ...value };
  if ('isDefault' in value) {
    entry.isDefault = Boolean(value.isDefault);
  }
  if (parsed.connectionType === 'usb') {
    entry.connectionType = 'usb';
    entry.vendorId = Number(entry.vendorId ?? parsed.vendorId ?? 0);
    entry.productId = Number(entry.productId ?? parsed.productId ?? 0);
    entry.manual = false;
  } else if (parsed.connectionType === 'tcp') {
    entry.connectionType = 'tcp';
    entry.ip = entry.ip || parsed.ip || '';
    entry.port = Number(entry.port ?? parsed.port ?? 9100);
    entry.manual = entry.manual !== false;
  }
  if (entry.connectionType === 'tcp') {
    entry.alias = entry.alias || '';
    entry.role = entry.role || '';
  }
  return entry;
}

function updateMapping(key, value = {}) {
  if (!configStore || !key) return;
  const mappings = getMappings();
  const current = mappings[key] || {};
  mappings[key] = normalizeEntry(key, { ...current, ...value });
  if (key.startsWith('usb:')) {
    const parts = key.split(':');
    if (parts.length === 3) {
      const legacyKey = `${Number(parts[1])}:${Number(parts[2])}`;
      if (legacyKey !== key && legacyKey in mappings) {
        delete mappings[legacyKey];
      }
    }
  }
  setMappings(mappings);
}

function getMapping(key) {
  const mappings = getMappings();
  const value = mappings[key];
  if (!value) return null;
  return normalizeEntry(key, value);
}

function removeMapping(key) {
  if (!configStore || !key) return;
  const mappings = getMappings();
  delete mappings[key];
  setMappings(mappings);
}

function clear() {
  if (!configStore) return;
  setMappings({});
}

function listEntries() {
  const mappings = getMappings();
  return Object.entries(mappings).map(([key, value]) => ({
    key,
    ...normalizeEntry(key, value)
  }));
}

function upsertUsbMapping(vendorId, productId, value = {}) {
  const key = buildUsbKey(vendorId, productId);
  updateMapping(key, { connectionType: 'usb', vendorId, productId, ...value });
  return key;
}

function upsertTcpMapping(ip, port = 9100, value = {}) {
  const key = buildTcpKey(ip, port);
  updateMapping(key, { connectionType: 'tcp', ip, port, manual: value.manual !== false, ...value });
  return key;
}

module.exports = {
  init,
  getMappings,
  getMapping,
  setMappings,
  updateMapping,
  removeMapping,
  clear,
  listEntries,
  buildUsbKey,
  buildTcpKey,
  parseKey,
  upsertUsbMapping,
  upsertTcpMapping
};
