#!/usr/bin/env node

const path = require('path')
const express = require('express')
const axios = require('axios')
const fs = require('fs-extra')
const cors = require('cors')
const iconv = require('iconv-lite')

const app = express()

const PORT = Number(process.env.PORT || process.env.ADMIN_PORT || 3004)
const PRINT_SERVER_URL =
  (process.env.PRINT_AGENT_SERVER || process.env.PRINT_SERVER_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')
const derivedWsUrl =
  (PRINT_SERVER_URL.startsWith('https://')
    ? PRINT_SERVER_URL.replace('https://', 'wss://')
    : PRINT_SERVER_URL.replace('http://', 'ws://')) + '/print-agent'

const DEFAULT_WS_URL =
  process.env.PRINT_AGENT_WS_URL ||
  (/(127\.0\.0\.1|localhost)/.test(derivedWsUrl) ? 'wss://printer-hub.easyify.uk/print-agent' : derivedWsUrl)
const PUBLIC_BASE_URL = process.env.ADMIN_PUBLIC_BASE_URL || null

console.log('[admin] 默认 WebSocket 地址:', DEFAULT_WS_URL)

const DATA_DIR = path.join(__dirname, 'data')
const DATA_FILE = path.join(DATA_DIR, 'shops.json')
const HEARTBEAT_FILE = path.join(DATA_DIR, 'agent-heartbeats.json')
const NOTES_FILE = path.join(DATA_DIR, 'notes.json')
const HEARTBEAT_OFFLINE_THRESHOLD_MS = Number(process.env.HEARTBEAT_OFFLINE_THRESHOLD_MS || 90_000)
const UPDATES_DIR = path.join(__dirname, '..', 'updates')

function loadLocalAgentSource() {
  const candidates = [
    path.join(__dirname, '..', 'agent', 'local-print-agent.js'),
    path.join(__dirname, 'assets', 'local-print-agent.js'),
    path.join(__dirname, 'local-print-agent.js')
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf-8')
    }
  }

  console.warn('[admin] local-print-agent.js not found, using placeholder script')
  return `#!/usr/bin/env node
console.error('local-print-agent.js 缺失，请联系管理员更新部署脚本。')
process.exit(1)
`
}

const LOCAL_AGENT_SOURCE = loadLocalAgentSource()
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$\{/g, '\\${')

// Middleware
app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: false }))
app.use(express.static(path.join(__dirname, 'public')))
app.use(
  '/updates',
  express.static(UPDATES_DIR, {
    setHeaders(res, filePath) {
      res.setHeader('Access-Control-Allow-Origin', '*')
      if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
        res.type('text/yaml')
      }
      if (filePath.endsWith('.blockmap')) {
        res.type('application/octet-stream')
      }
    }
  })
)

/**
 * Ensure data directory and file exist
 */
async function ensureDataFile() {
  await fs.ensureDir(DATA_DIR)
  if (!(await fs.pathExists(DATA_FILE))) {
    await fs.writeJson(
      DATA_FILE,
      {
        shops: [],
        updatedAt: new Date().toISOString()
      },
      { spaces: 2 }
    )
  }
}

async function ensureHeartbeatFile() {
  await fs.ensureDir(DATA_DIR)
  if (!(await fs.pathExists(HEARTBEAT_FILE))) {
    await fs.writeJson(
      HEARTBEAT_FILE,
      {
        agents: {},
        updatedAt: new Date().toISOString()
      },
      { spaces: 2 }
    )
  }
}

async function ensureNotesFile() {
  await fs.ensureDir(DATA_DIR)
  if (!(await fs.pathExists(NOTES_FILE))) {
    await fs.writeJson(
      NOTES_FILE,
      {
        notes: [],
        updatedAt: new Date().toISOString()
      },
      { spaces: 2 }
    )
  }
}

/**
 * Load shops data
 */
async function loadData() {
  await ensureDataFile()
  try {
    const raw = await fs.readJson(DATA_FILE)
    let shops = []

    if (Array.isArray(raw?.shops)) {
      shops = raw.shops
    } else if (Array.isArray(raw)) {
      shops = raw
    } else if (raw && typeof raw === 'object') {
      // legacy format: { "shopId": { ... }, ... }
      const values = Object.values(raw).filter((item) => item && typeof item === 'object')
      if (values.length > 0 && !raw.updatedAt) {
        shops = values
      }
    }

    shops = shops.map((shop) => ({
      shopId: shop.shopId,
      name: shop.name || shop.shopId,
      managerCompanyId: shop.managerCompanyId || '',
      printers: Array.isArray(shop.printers) ? shop.printers : [],
      agentBaseUrl: shop.agentBaseUrl || '',
      backupAgentBaseUrls: parseStringArray(shop.backupAgentBaseUrls),
      allowSelfSigned: !!shop.allowSelfSigned
    }))

    return { shops }
  } catch (error) {
    console.error('[admin] Failed to read data file:', error)
    return { shops: [] }
  }
}

async function loadHeartbeatData() {
  try {
    const { data } = await axios.get(`${PRINT_SERVER_URL}/api/agent/states`, { timeout: 5000 })
    const map = {}
    if (Array.isArray(data?.agents)) {
      data.agents.forEach((agent) => {
        if (agent?.shopId) {
          const lastSeen = agent.lastHeartbeatAt || agent.lastSeenAt || agent.timestamp || new Date().toISOString()
          agent.lastSeenAt = lastSeen
          agent.devicesCount = Array.isArray(agent.devices) ? agent.devices.length : Array.isArray(agent.printers) ? agent.printers.length : 0
          if (typeof agent.tcpPrinterCount !== 'number') {
            const printers = Array.isArray(agent.devices) ? agent.devices : Array.isArray(agent.printers) ? agent.printers : []
            agent.tcpPrinterCount = printers.filter((printer) => printer?.connectionType === 'tcp').length
          }
          map[agent.shopId] = agent
        }
      })
    }
    const payload = {
      agents: map,
      updatedAt: new Date().toISOString()
    }
    await saveHeartbeatData(payload)
    return payload
  } catch (error) {
    console.error('[admin] Failed to fetch heartbeat states:', error.message)
    const cached = await loadHeartbeatCache()
    return { ...cached, cached: true, error: '无法获取最新心跳数据' }
  }
}

async function saveHeartbeatData(data) {
  await ensureHeartbeatFile()
  const payload = {
    agents: data.agents || {},
    updatedAt: data.updatedAt || new Date().toISOString()
  }
  await fs.writeJson(HEARTBEAT_FILE, payload, { spaces: 2 })
  return payload
}

async function loadHeartbeatCache() {
  await ensureHeartbeatFile()
  try {
    const raw = await fs.readJson(HEARTBEAT_FILE)
    if (raw && typeof raw === 'object') {
      return {
        agents: raw.agents || {},
        updatedAt: raw.updatedAt || null
      }
    }
  } catch (error) {
    // ignore
  }
  return { agents: {}, updatedAt: null }
}

/**
 * Load notes data
 */
async function loadNotes() {
  await ensureNotesFile()
  try {
    const raw = await fs.readJson(NOTES_FILE)
    let notes = []

    if (Array.isArray(raw?.notes)) {
      notes = raw.notes
    } else if (Array.isArray(raw)) {
      notes = raw
    }

    // Ensure each note has required fields
    notes = notes.map((note) => ({
      id: note.id || String(Date.now() + Math.random()),
      title: note.title || '',
      content: note.content || '',
      createdAt: note.createdAt || new Date().toISOString(),
      updatedAt: note.updatedAt || new Date().toISOString()
    }))

    return { notes }
  } catch (error) {
    console.error('[admin] Failed to read notes file:', error)
    return { notes: [] }
  }
}

/**
 * Save notes data
 */
async function saveNotes(notes) {
  await ensureNotesFile()
  const payload = {
    notes: Array.isArray(notes) ? notes : [],
    updatedAt: new Date().toISOString()
  }
  await fs.writeJson(NOTES_FILE, payload, { spaces: 2 })
  return payload
}

function normaliseLogs(logs) {
  if (!logs) return []
  if (Array.isArray(logs?.recent)) {
    return logs.recent.filter((line) => typeof line === 'string').slice(-100)
  }
  if (Array.isArray(logs)) {
    return logs.filter((line) => typeof line === 'string').slice(-100)
  }
  if (typeof logs === 'string') {
    return logs.split('\n').slice(-100)
  }
  return []
}

function normaliseHeartbeatPayload(payload, req) {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const nowIso = new Date().toISOString()
  const shopId = String(payload.shopId || '').trim()
  if (!shopId) {
    return null
  }
  const system = payload.system && typeof payload.system === 'object' ? payload.system : {}
  const devices = Array.isArray(payload.devices) ? payload.devices.slice(0, 30) : []
  const printers = Array.isArray(payload.printers) ? payload.printers : []
  const preferences = payload.preferences && typeof payload.preferences === 'object' ? payload.preferences : {}
  const server = payload.server && typeof payload.server === 'object' ? payload.server : {}
  const update = payload.update && typeof payload.update === 'object' ? payload.update : {}
  const telemetry = payload.telemetry && typeof payload.telemetry === 'object' ? payload.telemetry : {}
  const remoteAddressHeader = req?.headers?.['x-forwarded-for']
  const remoteAddress = Array.isArray(remoteAddressHeader)
    ? remoteAddressHeader[0]
    : typeof remoteAddressHeader === 'string'
      ? remoteAddressHeader.split(',')[0].trim()
      : req?.ip

  return {
    shopId,
    companyId: payload.companyId || '',
    version: payload.agentVersion || payload.version || null,
    platform: payload.platform || system.platform || null,
    arch: payload.arch || system.arch || null,
    system: {
      ...system,
      hostname: system.hostname || payload.hostname || null
    },
    preferences: {
      autoLaunch: !!preferences.autoLaunch,
      allowSelfSigned: !!preferences.allowSelfSigned
    },
    server: {
      port: Number(server.port) || 40713,
      running: !!server.running
    },
    update,
    telemetry: {
      endpoint: telemetry.endpoint || null,
      intervalSeconds: telemetry.intervalSeconds || null,
      includeLogs: telemetry.includeLogs !== false
    },
    devices,
    printers,
    logs: normaliseLogs(payload.logs),
    timestamp: payload.timestamp || nowIso,
    lastSeenAt: nowIso,
    lastError: payload.lastError || null,
    message: payload.message || null,
    consecutiveFailures: payload.consecutiveFailures || 0,
    remoteAddress: remoteAddress || null
  }
}

function formatPrinterLabel(printer) {
  if (!printer) return '未知打印机';
  if (printer.connectionType === 'tcp') {
    const host = printer.ip || printer.host || '未知地址';
    const port = printer.port || 9100;
    return `${host}:${port} (TCP)`;
  }
  const vendor = typeof printer.vendorId === 'number' ? `0x${printer.vendorId.toString(16)}` : '未知';
  const product = typeof printer.productId === 'number' ? `0x${printer.productId.toString(16)}` : '未知';
  return `VID ${vendor} · PID ${product} (USB)`;
}

function buildTestTicket(shopId, printer, mapping) {
  const now = new Date().toLocaleString()
  const printerLabel = formatPrinterLabel(printer)
  const lines = [
    '\x1B@', // initialize
    '\x1B!\x30',
    'LOCAL USB AGENT\n',
    '\x1B!\x00',
    '远程测试打印\n',
    '------------------------------\n',
    `分店: ${shopId}\n`,
    `打印机: ${printerLabel}\n`,
    mapping?.alias ? `别名: ${mapping.alias}\n` : '',
    mapping?.role ? `用途: ${mapping.role}\n` : '',
    `时间: ${now}\n`,
    '------------------------------\n',
    '如成功出纸表示远程联调正常。\n\n',
    '\x1DVA\x00'
  ]
  return lines.join('')
}

/**
 * Persist shops data
 */
async function saveData(shops) {
  await ensureDataFile()
  const payload = {
    shops,
    updatedAt: new Date().toISOString()
  }
  await fs.writeJson(DATA_FILE, payload, { spaces: 2 })
  return payload
}

/**
 * Fetch connected agents information from print server
 */
async function fetchAgents() {
  try {
    const { data } = await axios.get(`${PRINT_SERVER_URL}/api/print/agents`, {
      timeout: 5000
    })
    if (Array.isArray(data?.agents)) {
      return data.agents
    }
    if (Array.isArray(data)) {
      return data
    }
    return []
  } catch (error) {
    console.warn('[admin] Failed to fetch agents:', error.message)
    return []
  }
}

/**
 * Normalise printer payload
 */
function normalisePrinter(printer) {
  if (!printer || typeof printer !== 'object') {
    return null
  }

  const ip = String(printer.ip || printer.host || '').trim()
  if (!ip) {
    return null
  }

  const port = Number(printer.port || printer.tcpPort || 9100)
  return {
    ip,
    port: Number.isFinite(port) ? port : 9100,
    name: printer.name ? String(printer.name).trim() : '',
    type: printer.type ? String(printer.type).trim() : 'kitchen'
  }
}

/**
 * Helper: convert array-like / string to array
 */
function parseStringArray(value) {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0)
  }
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

/**
 * Compute base URL for deploy script command
 */
function resolvePublicBaseUrl(req) {
  if (PUBLIC_BASE_URL) {
    return PUBLIC_BASE_URL.replace(/\/$/, '')
  }
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http'
  const host = req.get('host') || `localhost:${PORT}`
  return `${protocol}://${host}`.replace(/\/$/, '')
}

function buildDeploymentScript(shopId, wsUrl, platform = 'wsl') {
  const isMac = ['mac', 'darwin', 'macos', 'osx'].includes(platform)
  const shebang = '#!/usr/bin/env bash'

  const header = `# 🖨️ Print Agent Local Deployment Script

${shebang}

set -e
`

  const envCheck = isMac
    ? `if [ "$(uname)" != "Darwin" ]; then
  echo "❌ 此脚本仅适用于 macOS"
  exit 1
fi
`
    : ''

  const installNodeSection = isMac
    ? `ensure_node() {
  if command -v node >/dev/null 2>&1; then
    return
  fi

  echo "⚠️  未检测到 Node.js，尝试使用 Homebrew 安装..."
  if command -v brew >/dev/null 2>&1; then
    brew update >/dev/null 2>&1 || true
    brew install node@18 || brew install node
  else
    echo "❌ 未检测到 Homebrew，请先安装 Homebrew 后再运行本脚本"
    echo "👉 安装命令: /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    exit 1
  fi

  if ! command -v node >/dev/null 2>&1; then
    echo "❌ Node.js 安装失败，请手动安装 Node.js 18 或以上版本"
    exit 1
  fi
}

ensure_node
`
    : `ensure_node() {
  if command -v node >/dev/null 2>&1; then
    return
  fi

  echo "⚠️  未检测到 Node.js，尝试自动安装 Node.js 18..."

  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - >/dev/null 2>&1
    sudo apt-get install -y nodejs >/dev/null 2>&1
  elif command -v yum >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash - >/dev/null 2>&1
    sudo yum install -y nodejs >/dev/null 2>&1
  else
    echo "❌ 未检测到受支持的包管理器 (apt / yum)，请手动安装 Node.js 18 或以上版本"
    exit 1
  fi

  if ! command -v node >/dev/null 2>&1; then
    echo "❌ Node.js 安装失败，请手动安装 Node.js 18 或以上版本"
    exit 1
  fi
}

ensure_node
`

  const installDir = isMac ? '${PRINT_AGENT_DIR:-$HOME/Library/PrintAgent}' : '${PRINT_AGENT_DIR:-$HOME/print-agent-local}'

  return `${header}${envCheck}${installNodeSection}
SHOP_ID="${shopId}"
SERVER_WS_URL="${wsUrl}"
INSTALL_DIR="${installDir}"

echo "🚀 正在为分店 \${SHOP_ID} 部署本地打印代理..."
echo "📂 安装目录：\${INSTALL_DIR}"
echo ""

mkdir -p "\${INSTALL_DIR}"
cd "\${INSTALL_DIR}"

if [ ! -f package.json ]; then
cat <<'PKG' > package.json
{
  "name": "print-agent-client",
  "version": "2.0.0",
  "description": "Print agent local connector",
  "main": "local-print-agent.js",
  "scripts": {
    "start": "node local-print-agent.js"
  },
  "dependencies": {
    "iconv-lite": "0.7.0",
    "ws": "8.18.3"
  }
}
PKG
fi

npm install --production >/dev/null

cat <<'CONFIG' > config.json
{
  "shopId": "${shopId}",
  "serverUrl": "${wsUrl}",
  "reconnectInterval": 5000,
  "heartbeatInterval": 30000,
  "logLevel": "info",
  "enableStatusServer": true,
  "rejectUnauthorized": false
}
CONFIG

cat <<'AGENT' > local-print-agent.js
${LOCAL_AGENT_SOURCE}
AGENT

echo ""
echo "✅ 配置完成。"
echo "👉 请在新的终端中运行以下命令启动代理："
echo ""
echo "   cd \${INSTALL_DIR}"
echo "   node local-print-agent.js"
echo ""
${isMac ? 'echo "💡 可选：配置 launchctl 让代理随 macOS 启动。"\n' : 'echo "💡 建议配置 systemd/pm2 实现自启动。"\n'}
`
}

/**
 * GET /api/shops
 */
app.get('/api/shops', async (req, res) => {
  try {
    const [{ shops }, agents] = await Promise.all([loadData(), fetchAgents()])
    const connectedSet = new Set(agents.filter((agent) => agent.connected).map((agent) => agent.shopId))

    const result = shops.map((shop) => ({
      shopId: shop.shopId,
      name: shop.name || shop.shopId,
      managerCompanyId: shop.managerCompanyId || '',
      agentBaseUrl: shop.agentBaseUrl || '',
      backupAgentBaseUrls: parseStringArray(shop.backupAgentBaseUrls),
      allowSelfSigned: !!shop.allowSelfSigned,
      printers: Array.isArray(shop.printers) ? shop.printers : [],
      connected: connectedSet.has(shop.shopId)
    }))

    const connectedCount = result.filter((shop) => shop.connected).length

    res.json({
      success: true,
      total: result.length,
      connected: connectedCount,
      shops: result
    })
  } catch (error) {
    console.error('[admin] Failed to load shops:', error)
    res.status(500).json({ success: false, error: '无法获取分店数据' })
  }
})

/**
 * GET /api/agents (proxy upstream status)
 */
app.get('/api/agents', async (req, res) => {
  try {
    const { data } = await axios.get(`${PRINT_SERVER_URL}/api/print/agents`, {
      timeout: 5000
    })
    res.json({
      success: true,
      agents: data?.agents || [],
      total: data?.total ?? (data?.agents?.length || 0),
      connected: data?.connected ?? (data?.agents?.filter((a) => a.connected).length || 0)
    })
  } catch (error) {
    console.error('[admin] Failed to proxy /api/agents:', error.message)
    res.status(500).json({
      success: false,
      error: error.message,
      agents: []
    })
  }
})

app.post('/api/agent-heartbeat', async (req, res) => {
  try {
    const rawShopId = req.body?.shopId
    const shopId = rawShopId == null ? '' : String(rawShopId).trim()
    if (!shopId) {
      return res.status(400).json({ success: false, error: 'shopId 不能为空' })
    }

    const heartbeat = normaliseHeartbeatPayload({ ...req.body, shopId }, req)
    if (!heartbeat) {
      return res.status(400).json({ success: false, error: '心跳数据格式无效' })
    }

    const data = await loadHeartbeatCache()
    data.agents = data.agents || {}
    const previous = data.agents[shopId] || {}
    data.agents[shopId] = {
      ...previous,
      ...heartbeat,
      lastSeenAt: heartbeat.lastSeenAt,
      timestamp: heartbeat.timestamp || heartbeat.lastSeenAt
    }
    data.updatedAt = heartbeat.lastSeenAt
    await saveHeartbeatData(data)

    res.json({ success: true })
  } catch (error) {
    console.error('[admin] Failed to accept heartbeat:', error)
    res.status(500).json({ success: false, error: '无法保存心跳数据' })
  }
})

app.get('/api/agent-heartbeat', async (req, res) => {
  try {
    const data = await loadHeartbeatData()
    const now = Date.now()
    const agents = Object.values(data.agents || {}).map((entry) => {
      const lastSeen = entry.lastSeenAt ? Date.parse(entry.lastSeenAt) : NaN
      const online = Number.isFinite(lastSeen) ? now - lastSeen <= HEARTBEAT_OFFLINE_THRESHOLD_MS : false
      return {
        ...entry,
        devicesCount: Array.isArray(entry.devices) ? entry.devices.length : 0,
        online,
        lastSeenAgoMs: Number.isFinite(lastSeen) ? now - lastSeen : null
      }
    })

    agents.sort((a, b) => {
      const aTime = a.lastSeenAt || ''
      const bTime = b.lastSeenAt || ''
      return bTime.localeCompare(aTime)
    })

    const onlineCount = agents.filter((agent) => agent.online).length

    res.json({
      success: true,
      total: agents.length,
      online: onlineCount,
      offline: agents.length - onlineCount,
      thresholdMs: HEARTBEAT_OFFLINE_THRESHOLD_MS,
      updatedAt: data.updatedAt,
      agents
    })
  } catch (error) {
    console.error('[admin] Failed to load heartbeats:', error)
    res.status(500).json({ success: false, error: '无法获取心跳数据', agents: [] })
  }
})

app.get('/api/agent-heartbeat/:shopId', async (req, res) => {
  try {
    const shopId = String(req.params.shopId || '').trim()
    if (!shopId) {
      return res.status(400).json({ success: false, error: 'shopId 不能为空' })
    }
    const data = await loadHeartbeatData()
    const entry = data.agents?.[shopId]
    if (!entry) {
      return res.status(404).json({ success: false, error: '未找到心跳信息' })
    }
    res.json({ success: true, agent: entry })
  } catch (error) {
    console.error('[admin] Failed to load heartbeat detail:', error)
    res.status(500).json({ success: false, error: '无法获取心跳详情' })
  }
})

app.post('/api/agent-heartbeat/:shopId/test-default', async (req, res) => {
  try {
    const shopId = String(req.params.shopId || '').trim()
    if (!shopId) {
      return res.status(400).json({ success: false, error: 'shopId 不能为空' })
    }

    const data = await loadHeartbeatData()
    const agent = data.agents?.[shopId]
    if (!agent) {
      return res.status(404).json({ success: false, error: '未找到心跳信息或代理离线' })
    }

    const printers = Array.isArray(agent.printers) ? agent.printers : []
    const defaultPrinter = printers.find((printer) => printer && printer.isDefault)
    if (!defaultPrinter) {
      return res.status(400).json({ success: false, error: '尚未设置默认打印机' })
    }

    const mapping = printers.find((printer) => printer && printer.isDefault) || defaultPrinter
    const connectionType =
      defaultPrinter.connectionType ||
      (defaultPrinter.ip || defaultPrinter.host ? 'tcp' : 'usb')
    const payload = buildTestTicket(shopId, { ...defaultPrinter, connectionType }, mapping)
    const printerPayload = {
      connectionType,
      alias: mapping?.alias || '',
      role: mapping?.role || '',
      port: defaultPrinter.port || 9100
    }

    if (connectionType === 'tcp') {
      const host = defaultPrinter.ip || defaultPrinter.host
      if (!host) {
        return res.status(400).json({ success: false, error: '默认 TCP 打印机缺少 IP 地址' })
      }
      printerPayload.ip = host
    } else {
      if (typeof defaultPrinter.vendorId !== 'number' || typeof defaultPrinter.productId !== 'number') {
        return res.status(400).json({ success: false, error: '默认 USB 打印机缺少 VID/PID' })
      }
      printerPayload.vendorId = defaultPrinter.vendorId
      printerPayload.productId = defaultPrinter.productId
    }

    const response = await axios.post(
      `${PRINT_SERVER_URL}/api/agent/tasks`,
      {
        shopId,
        type: 'print-test',
        payload: {
          printer: printerPayload,
          data: iconv.encode(payload, 'gb18030').toString('base64'),
          encoding: 'base64',
          charset: 'GB18030',
          reason: 'remote-test'
        }
      },
      {
        timeout: 10000
      }
    )

    res.json({ success: true, message: '测试打印任务已发送', task: response.data?.task || null })
  } catch (error) {
    console.error('[admin] Failed to trigger remote test:', error.message)
    res.status(500).json({ success: false, error: error?.response?.data?.error || error.message || '远程测试失败' })
  }
})

/**
 * POST /api/shops
 */
app.post('/api/shops', async (req, res) => {
  const shopId = String(req.body?.shopId || '').trim()
  if (!shopId) {
    return res.status(400).json({ success: false, error: 'shopId 不能为空' })
  }

  const name = String(req.body?.name || '').trim()
  const managerCompanyId = req.body?.managerCompanyId
    ? String(req.body.managerCompanyId).trim()
    : ''

  try {
    const data = await loadData()
    if (data.shops.some((shop) => shop.shopId === shopId)) {
      return res.status(409).json({ success: false, error: '该 shopId 已存在' })
    }

    const newShop = {
      shopId,
      name: name || shopId,
      managerCompanyId,
      printers: [],
      agentBaseUrl: req.body?.agentBaseUrl ? String(req.body.agentBaseUrl).trim() : '',
      backupAgentBaseUrls: parseStringArray(req.body?.backupAgentBaseUrls),
      allowSelfSigned: !!req.body?.allowSelfSigned
    }

    data.shops.push(newShop)
    await saveData(data.shops)

    res.json({ success: true, shop: newShop })
  } catch (error) {
    console.error('[admin] Failed to create shop:', error)
    res.status(500).json({ success: false, error: '创建分店失败' })
  }
})

/**
 * PUT /api/shops/:shopId
 */
app.put('/api/shops/:shopId', async (req, res) => {
  const targetId = String(req.params.shopId || '').trim()
  if (!targetId) {
    return res.status(400).json({ success: false, error: 'shopId 无效' })
  }

  try {
    const data = await loadData()
    const shop = data.shops.find((item) => item.shopId === targetId)
    if (!shop) {
      return res.status(404).json({ success: false, error: '分店不存在' })
    }

    if (req.body?.name !== undefined) {
      shop.name = String(req.body.name || '').trim() || shop.shopId
    }

    if (req.body?.managerCompanyId !== undefined) {
      const managerCompanyId = String(req.body.managerCompanyId || '').trim()
      shop.managerCompanyId = managerCompanyId
    }

    if (req.body?.agentBaseUrl !== undefined) {
      shop.agentBaseUrl = String(req.body.agentBaseUrl || '').trim()
    }

    if (req.body?.backupAgentBaseUrls !== undefined) {
      shop.backupAgentBaseUrls = parseStringArray(req.body.backupAgentBaseUrls)
    }

    if (req.body?.allowSelfSigned !== undefined) {
      shop.allowSelfSigned = !!req.body.allowSelfSigned
    }

    if (Array.isArray(req.body?.printers)) {
      const printers = req.body.printers
        .map(normalisePrinter)
        .filter(Boolean)
      shop.printers = printers
    }

    await saveData(data.shops)

    res.json({ success: true, shop })
  } catch (error) {
    console.error('[admin] Failed to update shop:', error)
    res.status(500).json({ success: false, error: '更新分店失败' })
  }
})

/**
 * DELETE /api/shops/:shopId
 */
app.delete('/api/shops/:shopId', async (req, res) => {
  const targetId = String(req.params.shopId || '').trim()
  if (!targetId) {
    return res.status(400).json({ success: false, error: 'shopId 无效' })
  }

  try {
    const data = await loadData()
    const filtered = data.shops.filter((shop) => shop.shopId !== targetId)
    if (filtered.length === data.shops.length) {
      return res.status(404).json({ success: false, error: '分店不存在' })
    }
    await saveData(filtered)
    res.json({ success: true })
  } catch (error) {
    console.error('[admin] Failed to delete shop:', error)
    res.status(500).json({ success: false, error: '删除分店失败' })
  }
})

/**
 * POST /api/shops/:shopId/printers
 */
app.post('/api/shops/:shopId/printers', async (req, res) => {
  const targetId = String(req.params.shopId || '').trim()
  if (!targetId) {
    return res.status(400).json({ success: false, error: 'shopId 无效' })
  }

  const printer = normalisePrinter(req.body)
  if (!printer) {
    return res.status(400).json({ success: false, error: '打印机信息无效' })
  }

  try {
    const data = await loadData()
    const shop = data.shops.find((item) => item.shopId === targetId)
    if (!shop) {
      return res.status(404).json({ success: false, error: '分店不存在' })
    }

    const existingIndex = Array.isArray(shop.printers)
      ? shop.printers.findIndex((item) => item.ip === printer.ip)
      : -1

    if (existingIndex >= 0) {
      shop.printers[existingIndex] = printer
    } else {
      shop.printers = Array.isArray(shop.printers) ? shop.printers : []
      shop.printers.push(printer)
    }

    await saveData(data.shops)
    res.json({ success: true, printer })
  } catch (error) {
    console.error('[admin] Failed to add printer:', error)
    res.status(500).json({ success: false, error: '添加打印机失败' })
  }
})

/**
 * DELETE /api/shops/:shopId/printers/:ip
 */
app.delete('/api/shops/:shopId/printers/:ip', async (req, res) => {
  const targetId = String(req.params.shopId || '').trim()
  const printerIp = String(req.params.ip || '').trim()

  if (!targetId || !printerIp) {
    return res.status(400).json({ success: false, error: '参数无效' })
  }

  try {
    const data = await loadData()
    const shop = data.shops.find((item) => item.shopId === targetId)
    if (!shop) {
      return res.status(404).json({ success: false, error: '分店不存在' })
    }

    const before = Array.isArray(shop.printers) ? shop.printers.length : 0
    shop.printers = Array.isArray(shop.printers)
      ? shop.printers.filter((printer) => printer.ip !== printerIp)
      : []

    if (shop.printers.length === before) {
      return res.status(404).json({ success: false, error: '打印机不存在' })
    }

    await saveData(data.shops)
    res.json({ success: true })
  } catch (error) {
    console.error('[admin] Failed to delete printer:', error)
    res.status(500).json({ success: false, error: '删除打印机失败' })
  }
})

/**
 * POST /api/shops/:shopId/printers/:ip/test
 */
app.post('/api/shops/:shopId/printers/:ip/test', async (req, res) => {
  const targetId = String(req.params.shopId || '').trim()
  const printerIp = String(req.params.ip || '').trim()
  const port = Number(req.body?.port || 9100)

  if (!targetId || !printerIp) {
    return res.status(400).json({ success: false, error: '参数无效' })
  }

  try {
    // Build a simple ESC/POS test receipt
    const testContent = Buffer.from(
      '\x1B@\x1B!\x38PRINT AGENT TEST\n\x1B!\x00\n🖨️ 打印测试成功\n\n\x1B!\x01Shop: ' +
        targetId +
        '\nPrinter: ' +
        printerIp +
        ':' +
        port +
        '\n\n\x1DVA\x00',
      'binary'
    )

    await axios.post(`${PRINT_SERVER_URL}/api/print`, testContent, {
      params: {
        host: printerIp,
        port: Number.isFinite(port) ? port : 9100
      },
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Shop-Name': targetId
      },
      timeout: 15000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    })

    res.json({ success: true })
  } catch (error) {
    console.error('[admin] Failed to test printer:', error.message)
    const errorMessage = error.response?.data?.error || error.message || '测试失败'
    res.status(500).json({ success: false, error: errorMessage })
  }
})

/**
 * GET /api/shops/:shopId/deploy
 * Returns a curl command for auto deployment script
 */
app.get('/api/shops/:shopId/deploy', async (req, res) => {
  const targetId = String(req.params.shopId || '').trim()
  if (!targetId) {
    return res.status(400).json({ success: false, error: 'shopId 无效' })
  }

  try {
    const data = await loadData()
    const shop = data.shops.find((item) => item.shopId === targetId)
    if (!shop) {
      return res.status(404).json({ success: false, error: '分店不存在' })
    }

    const baseUrl = resolvePublicBaseUrl(req)
    const deployUrl = `${baseUrl}/api/deploy-script?shopId=${encodeURIComponent(targetId)}`

    const macDeployUrl = `${deployUrl}&platform=mac`

    res.json({
      success: true,
      shopId: shop.shopId,
      curlCommand: `curl -s ${deployUrl} | bash`,
      linuxCommand: `curl -s ${deployUrl} | bash`,
      macCommand: `curl -s ${macDeployUrl} | bash`,
      commands: {
        default: `curl -s ${deployUrl} | bash`,
        mac: `curl -s ${macDeployUrl} | bash`
      }
    })
  } catch (error) {
    console.error('[admin] Failed to build deploy command:', error)
    res.status(500).json({ success: false, error: '生成部署脚本失败' })
  }
})

/**
 * GET /api/deploy-script
 * Returns a shell script customised for the given shop
 */
app.get('/api/deploy-script', async (req, res) => {
  const shopId = String(req.query.shopId || '').trim()
  if (!shopId) {
    return res.status(400).send('# 错误：缺少 shopId 参数\nexit 1\n')
  }

  const data = await loadData()
  const shop = data.shops.find((item) => item.shopId === shopId)
  if (!shop) {
    return res.status(404).send(`# 错误：未找到分店 ${shopId}\nexit 1\n`)
  }

  const wsUrl =
    shop.agentBaseUrl && shop.agentBaseUrl.startsWith('http')
      ? shop.agentBaseUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/print-agent'
      : DEFAULT_WS_URL

  const platform = String(req.query.platform || 'wsl').toLowerCase()
  const script = buildDeploymentScript(shopId, wsUrl, platform)

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.send(script)
})

/**
 * Get latest client download links
 */
app.get('/api/client-downloads', async (req, res) => {
  try {
    const updatesPath = path.join(UPDATES_DIR, 'local-usb-agent')
    const downloads = {
      win: { exe: null, zip: null, version: null },
      mac: { dmg: null, zip: null, version: null },
      linux: { appimage: null, deb: null, version: null }
    }

    // Scan Windows files
    const winDir = path.join(updatesPath, 'win')
    if (await fs.pathExists(winDir)) {
      const winFiles = await fs.readdir(winDir)
      // Sort files by modification time (newest first)
      const winFilesWithStats = await Promise.all(
        winFiles.map(async (file) => {
          const filePath = path.join(winDir, file)
          try {
            const stats = await fs.stat(filePath)
            return { file, mtime: stats.mtime }
          } catch {
            return { file, mtime: new Date(0) }
          }
        })
      )
      winFilesWithStats.sort((a, b) => b.mtime - a.mtime)
      
      for (const { file } of winFilesWithStats) {
        // 只处理 ZIP 文件（便携版），不处理 EXE 文件（安装版）
        if (file.endsWith('.zip') && (file.includes('win') || file.includes('win64'))) {
          if (!downloads.win.zip) {
            downloads.win.zip = `/updates/local-usb-agent/win/${file}`
            if (!downloads.win.version) {
              // Support both space and dash separators
              const versionMatch = file.match(/(?:[\s-])(\d+\.\d+\.\d+)(?:[\s-]win|\.win)/i)
              if (versionMatch) {
                downloads.win.version = versionMatch[1]
              }
            }
          }
        }
      }
    }

    // Scan macOS files
    const macDir = path.join(updatesPath, 'mac')
    if (await fs.pathExists(macDir)) {
      const macFiles = await fs.readdir(macDir)
      // Sort files by modification time (newest first)
      const macFilesWithStats = await Promise.all(
        macFiles.map(async (file) => {
          const filePath = path.join(macDir, file)
          try {
            const stats = await fs.stat(filePath)
            return { file, mtime: stats.mtime }
          } catch {
            return { file, mtime: new Date(0) }
          }
        })
      )
      macFilesWithStats.sort((a, b) => b.mtime - a.mtime)
      
      for (const { file } of macFilesWithStats) {
        if (file.endsWith('.dmg')) {
          if (!downloads.mac.dmg) {
            downloads.mac.dmg = `/updates/local-usb-agent/mac/${file}`
            // Extract version from filename (e.g., "Yepos Agent-0.2.2.dmg")
            const versionMatch = file.match(/-(\d+\.\d+\.\d+)\.dmg$/i)
            if (versionMatch && !downloads.mac.version) {
              downloads.mac.version = versionMatch[1]
            }
          }
        } else if (file.endsWith('.zip') && (file.includes('mac') || file.includes('arm64') || file.includes('x64'))) {
          if (!downloads.mac.zip) {
            downloads.mac.zip = `/updates/local-usb-agent/mac/${file}`
            if (!downloads.mac.version) {
              const versionMatch = file.match(/-(\d+\.\d+\.\d+)-/i)
              if (versionMatch) {
                downloads.mac.version = versionMatch[1]
              }
            }
          }
        }
      }
    }

    // Scan Linux files
    const linuxDir = path.join(updatesPath, 'linux')
    if (await fs.pathExists(linuxDir)) {
      const linuxFiles = await fs.readdir(linuxDir)
      for (const file of linuxFiles) {
        if (file.endsWith('.AppImage')) {
          downloads.linux.appimage = `/updates/local-usb-agent/linux/${file}`
          const versionMatch = file.match(/-(\d+\.\d+\.\d+)-/)
          if (versionMatch && !downloads.linux.version) {
            downloads.linux.version = versionMatch[1]
          }
        } else if (file.endsWith('.deb')) {
          downloads.linux.deb = `/updates/local-usb-agent/linux/${file}`
          if (!downloads.linux.version) {
            const versionMatch = file.match(/-(\d+\.\d+\.\d+)-/)
            if (versionMatch) {
              downloads.linux.version = versionMatch[1]
            }
          }
        }
      }
    }

    // Try to get version from YAML files
    const stableDir = path.join(updatesPath, 'stable')
    if (await fs.pathExists(stableDir)) {
      try {
        const yamlFiles = await fs.readdir(stableDir)
        for (const yamlFile of yamlFiles) {
          if (yamlFile.endsWith('.yml') || yamlFile.endsWith('.yaml')) {
            const yamlPath = path.join(stableDir, yamlFile)
            const yamlContent = await fs.readFile(yamlPath, 'utf-8')
            const versionMatch = yamlContent.match(/version:\s*['"]?(\d+\.\d+\.\d+)['"]?/i)
            if (versionMatch) {
              const version = versionMatch[1]
              if (yamlFile.includes('mac') && !downloads.mac.version) {
                downloads.mac.version = version
              } else if (yamlFile.includes('linux') && !downloads.linux.version) {
                downloads.linux.version = version
              } else if (!yamlFile.includes('mac') && !yamlFile.includes('linux') && !downloads.win.version) {
                downloads.win.version = version
              }
            }
          }
        }
      } catch (error) {
        console.warn('[admin] Failed to read YAML files:', error.message)
      }
    }

    res.json({ success: true, downloads })
  } catch (error) {
    console.error('[admin] Failed to get client downloads:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

app.get('/api/shops/company-map', async (req, res) => {
  try {
    const data = await loadData()
    const map = {}

    data.shops.forEach((shop) => {
      if (!shop.managerCompanyId) return
      const key = String(shop.managerCompanyId).trim()
      if (!key) return

      map[key] = {
        shopId: shop.shopId,
        agentBaseUrl: shop.agentBaseUrl || undefined,
        backupAgentBaseUrls:
          Array.isArray(shop.backupAgentBaseUrls) && shop.backupAgentBaseUrls.length > 0
            ? shop.backupAgentBaseUrls
            : undefined,
        allowSelfSigned: shop.allowSelfSigned || undefined
      }
    })

    res.json({ success: true, map })
  } catch (error) {
    console.error('[admin] Failed to build company map:', error)
    res.status(500).json({ success: false, error: '生成映射失败' })
  }
})

/**
 * GET /api/notes
 */
app.get('/api/notes', async (req, res) => {
  try {
    const data = await loadNotes()
    res.json({
      success: true,
      notes: data.notes,
      total: data.notes.length
    })
  } catch (error) {
    console.error('[admin] Failed to load notes:', error)
    res.status(500).json({ success: false, error: '无法获取笔记数据' })
  }
})

/**
 * POST /api/notes
 */
app.post('/api/notes', async (req, res) => {
  const title = String(req.body?.title || '').trim()
  const content = String(req.body?.content || '').trim()

  if (!title) {
    return res.status(400).json({ success: false, error: '标题不能为空' })
  }

  try {
    const data = await loadNotes()
    const now = new Date().toISOString()
    const newNote = {
      id: String(Date.now() + Math.random()),
      title,
      content,
      createdAt: now,
      updatedAt: now
    }

    data.notes.push(newNote)
    await saveNotes(data.notes)

    res.json({ success: true, note: newNote })
  } catch (error) {
    console.error('[admin] Failed to create note:', error)
    res.status(500).json({ success: false, error: '创建笔记失败' })
  }
})

/**
 * PUT /api/notes/:id
 */
app.put('/api/notes/:id', async (req, res) => {
  const noteId = String(req.params.id || '').trim()
  if (!noteId) {
    return res.status(400).json({ success: false, error: '笔记ID无效' })
  }

  const title = req.body?.title !== undefined ? String(req.body.title).trim() : undefined
  const content = req.body?.content !== undefined ? String(req.body.content).trim() : undefined

  if (title !== undefined && !title) {
    return res.status(400).json({ success: false, error: '标题不能为空' })
  }

  try {
    const data = await loadNotes()
    const noteIndex = data.notes.findIndex((note) => note.id === noteId)

    if (noteIndex === -1) {
      return res.status(404).json({ success: false, error: '笔记不存在' })
    }

    const note = data.notes[noteIndex]
    if (title !== undefined) {
      note.title = title
    }
    if (content !== undefined) {
      note.content = content
    }
    note.updatedAt = new Date().toISOString()

    await saveNotes(data.notes)

    res.json({ success: true, note })
  } catch (error) {
    console.error('[admin] Failed to update note:', error)
    res.status(500).json({ success: false, error: '更新笔记失败' })
  }
})

/**
 * DELETE /api/notes/:id
 */
app.delete('/api/notes/:id', async (req, res) => {
  const noteId = String(req.params.id || '').trim()
  if (!noteId) {
    return res.status(400).json({ success: false, error: '笔记ID无效' })
  }

  try {
    const data = await loadNotes()
    const filtered = data.notes.filter((note) => note.id !== noteId)

    if (filtered.length === data.notes.length) {
      return res.status(404).json({ success: false, error: '笔记不存在' })
    }

    await saveNotes(filtered)
    res.json({ success: true })
  } catch (error) {
    console.error('[admin] Failed to delete note:', error)
    res.status(500).json({ success: false, error: '删除笔记失败' })
  }
})

/**
 * Fallback for SPA history mode
 */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.listen(PORT, () => {
  console.log('════════════════════════════════════════════════════════════')
  console.log('🚀 Print Agent Admin server started')
  console.log('════════════════════════════════════════════════════════════')
  console.log(`   Port            : http://localhost:${PORT}`)
  console.log(`   Print Agent API : ${PRINT_SERVER_URL}`)
  console.log(`   WS Default URL  : ${DEFAULT_WS_URL}`)
  if (PUBLIC_BASE_URL) {
    console.log(`   Public Base URL : ${PUBLIC_BASE_URL}`)
  }
  console.log('════════════════════════════════════════════════════════════')
})


