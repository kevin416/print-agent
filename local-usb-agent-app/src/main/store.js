const Store = require('electron-store');

const schema = {
  shopId: {
    type: ['string', 'null'],
    default: null
  },
  server: {
    type: 'object',
    properties: {
      port: {
        type: 'number',
        default: 40713
      }
    }
  },
  preferences: {
    type: 'object',
    properties: {
      autoLaunch: {
        type: 'boolean',
        default: false
      },
      allowSelfSigned: {
        type: 'boolean',
        default: false
      }
    }
  },
  printers: {
    type: 'array',
    default: []
  },
  printerMappings: {
    type: 'object',
    default: {}
  },
  printHistory: {
    type: 'array',
    default: []
  },
  logs: {
    type: 'object',
    properties: {
      retentionDays: {
        type: 'number',
        default: 7
      }
    }
  },
  updates: {
    type: 'object',
    default: {},
    properties: {
      feedUrl: {
        type: ['string', 'null'],
        default: 'https://pa.easyify.uk/updates/local-usb-agent'
      },
      channel: {
        type: 'string',
        default: 'stable'
      },
      autoDownload: {
        type: 'boolean',
        default: true
      },
      notifyOnSuccess: {
        type: 'boolean',
        default: true
      }
    }
  },
  telemetry: {
    type: 'object',
    default: {},
    properties: {
      enabled: {
        type: 'boolean',
        default: true
      },
      endpoint: {
        type: ['string', 'null'],
        default: 'https://pa.easyify.uk/api/agent-heartbeat'
      },
      intervalSeconds: {
        type: 'number',
        default: 30
      },
      includeLogs: {
        type: 'boolean',
        default: true
      },
      logLines: {
        type: 'number',
        default: 50
      },
      timeoutSeconds: {
        type: 'number',
        default: 7
      }
    }
  },
  onboarding: {
    type: 'object',
    default: {},
    properties: {
      completed: {
        type: 'boolean',
        default: false
      },
      lastStep: {
        type: 'number',
        default: 0
      },
      seenVersion: {
        type: ['string', 'null'],
        default: null
      },
      skipped: {
        type: 'boolean',
        default: false
      },
      updatedAt: {
        type: ['string', 'null'],
        default: null
      }
    }
  },
  remote: {
    type: 'object',
    default: {},
    properties: {
      enabled: {
        type: 'boolean',
        default: true
      },
      wsUrl: {
        type: ['string', 'null'],
        default: 'wss://printer-hub.easyify.uk/print-agent'
      },
      reconnect: {
        type: 'object',
        properties: {
          initialDelay: {
            type: 'number',
            default: 2000
          },
          maxDelay: {
            type: 'number',
            default: 30000
          }
        }
      }
    }
  }
};

const store = new Store({ schema, watch: true, migrations: {
  '0.1.0': (store) => {
    if (!store.get('server.port')) {
      store.set('server.port', 40713);
    }
  },
  '0.2.0': (store) => {
    if (!store.get('printerMappings')) {
      store.set('printerMappings', {});
    }
    if (!store.get('printHistory')) {
      store.set('printHistory', []);
    }
  },
  '0.3.0': (store) => {
    if (!store.get('onboarding')) {
      store.set('onboarding', {
        completed: false,
        lastStep: 0,
        seenVersion: null,
        skipped: false,
        updatedAt: new Date().toISOString()
      });
    }
  },
  '0.3.1': (store) => {
    const updates = store.get('updates') || {};
    if (!updates.feedUrl) {
      updates.feedUrl = 'https://pa.easyify.uk/updates/local-usb-agent';
    }
    if (updates.autoDownload === undefined) {
      updates.autoDownload = true;
    }
    store.set('updates', updates);
  },
  '0.3.2': (store) => {
    const remote = store.get('remote') || {};
    if (!remote.wsUrl) {
      remote.wsUrl = process.env.LOCAL_AGENT_WS_URL || 'wss://printer-hub.easyify.uk/print-agent';
    }
    if (remote.enabled === undefined) {
      remote.enabled = true;
    }
    store.set('remote', remote);
  },
  '0.4.0': (store) => {
    const mappings = store.get('printerMappings');
    if (!mappings || typeof mappings !== 'object') return;
    const next = {};
    Object.entries(mappings).forEach(([key, value]) => {
      const entry = typeof value === 'object' && value ? { ...value } : {};
      let newKey = key;
      if (key.startsWith('usb:')) {
        const [, vendorIdStr = '0', productIdStr = '0'] = key.split(':');
        entry.connectionType = 'usb';
        entry.vendorId = Number(entry.vendorId ?? vendorIdStr);
        entry.productId = Number(entry.productId ?? productIdStr);
        entry.manual = false;
      } else if (key.startsWith('tcp:')) {
        const [, ip = '', portStr = '9100'] = key.split(':');
        entry.connectionType = 'tcp';
        entry.ip = entry.ip || ip;
        entry.port = Number(entry.port || portStr || 9100);
        entry.manual = entry.manual !== false;
      } else {
        const parts = key.split(':');
        if (parts.length === 2) {
          const [vendorIdStr = '0', productIdStr = '0'] = parts;
          newKey = `usb:${vendorIdStr}:${productIdStr}`;
          entry.connectionType = 'usb';
          entry.vendorId = Number(entry.vendorId ?? vendorIdStr);
          entry.productId = Number(entry.productId ?? productIdStr);
          entry.manual = false;
        } else {
          newKey = key;
        }
      }
      if (newKey.startsWith('tcp:')) {
        entry.connectionType = 'tcp';
        const [, ip = '', portStr = '9100'] = newKey.split(':');
        entry.ip = entry.ip || ip;
        entry.port = Number(entry.port || portStr || 9100);
        entry.manual = entry.manual !== false;
      }
      next[newKey] = entry;
    });
    store.set('printerMappings', next);
  }
}});

module.exports = {
  ensureDefaults() {
    Object.entries(schema).forEach(([key, value]) => {
      if (store.get(key) === undefined && value && 'default' in value) {
        store.set(key, value.default);
      }
    });
  },
  getAll() {
    return store.store;
  },
  get(key) {
    return store.get(key);
  },
  set(key, value) {
    store.set(key, value);
  },
  merge(payload) {
    Object.entries(payload || {}).forEach(([key, value]) => {
      store.set(key, value);
    });
  },
  onDidChange(key, callback) {
    return store.onDidChange(key, callback);
  }
};
