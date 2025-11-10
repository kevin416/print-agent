const fs = require('fs');
const path = require('path');
const os = require('os');

function resolveLogDir() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Logs', 'YeposAgent');
  }
  if (process.platform === 'win32') {
    const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(base, 'YeposAgent', 'Logs');
  }
  return path.join(os.homedir(), '.local', 'share', 'yepos-agent', 'logs');
}

const LOG_DIR = resolveLogDir();
const LOG_FILE = path.join(LOG_DIR, 'agent.log');
const RETENTION_MS = 24 * 60 * 60 * 1000; // 1 day
const RETENTION_CHECK_INTERVAL_MS = 60 * 1000;
let lastRetentionCheck = 0;

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function formatMessage(level, message, meta) {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (!meta) {
    return base;
  }
  try {
    const printable = typeof meta === 'string' ? meta : JSON.stringify(meta);
    return `${base} ${printable}`;
  } catch (err) {
    return base;
  }
}

function append(level, message, meta) {
  enforceRetention();
  const line = formatMessage(level, message, meta);
  fs.appendFileSync(LOG_FILE, `${line}\n`, 'utf8');
}

function enforceRetention() {
  const now = Date.now();
  if (now - lastRetentionCheck < RETENTION_CHECK_INTERVAL_MS) {
    return;
  }
  lastRetentionCheck = now;

  if (!fs.existsSync(LOG_FILE)) {
    return;
  }

  try {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    if (!content) return;

    const cutoff = now - RETENTION_MS;
    const lines = content.split('\n');
    const filtered = lines.filter((line) => {
      if (!line) return false;
      const match = line.match(/^\[(.*?)\]/);
      if (!match) return false;
      const ts = Date.parse(match[1]);
      if (Number.isNaN(ts)) return false;
      return ts >= cutoff;
    });

    if (filtered.length !== lines.filter(Boolean).length) {
      const output = filtered.length ? filtered.join('\n') + '\n' : '';
      fs.writeFileSync(LOG_FILE, output, 'utf8');
    }
  } catch (error) {
    // 忽略保留策略中的所有异常
  }
}

module.exports = {
  info(message, meta) {
    append('info', message, meta);
  },
  warn(message, meta) {
    append('warn', message, meta);
  },
  error(message, meta) {
    append('error', message, meta);
  },
  debug(message, meta) {
    if (process.env.NODE_ENV !== 'production') {
      append('debug', message, meta);
    }
  },
  getLogFile() {
    return LOG_FILE;
  },
  async readRecent(lines = 200) {
    try {
      const content = fs.readFileSync(LOG_FILE, 'utf8').split('\n');
      const recent = content.filter(Boolean).slice(-Math.abs(lines));
      return recent;
    } catch (err) {
      return [];
    }
  }
};
