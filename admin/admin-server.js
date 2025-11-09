#!/usr/bin/env node

const path = require('path')
const express = require('express')
const axios = require('axios')
const fs = require('fs-extra')
const cors = require('cors')

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
 * GET /api/shops/company-map
 * Returns mapping for manager_next environment generation
 */
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


