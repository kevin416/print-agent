#!/usr/bin/env node
/**
 * 打印代理管理后台服务器
 * 运行在 https://pa.easyify.uk/
 * 
 * 功能：
 * - 管理分店和打印机
 * - 打印机连接测试
 * - 生成一键部署脚本
 * - 显示已连接的本地代理
 */

const express = require('express')
const path = require('path')
const http = require('http')
const axios = require('axios')

const app = express()
const PORT = process.env.PORT || 3004
const PRINT_SERVER_URL = process.env.PRINT_SERVER_URL || 'http://127.0.0.1:3000'

// ============================================
// 中间件配置
// ============================================

app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
    return
  }
  next()
})

// ============================================
// 数据存储（文件持久化存储）
// ============================================

const fs = require('fs')
const DATA_FILE = path.join(__dirname, 'data', 'shops.json')
const DATA_DIR = path.dirname(DATA_FILE)

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

// 分店配置：shopId -> { shopId, name, printers: [{ ip, port, name, type }] }
let shops = new Map()

// 加载数据
function loadShops() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
      shops = new Map(Object.entries(data))
      console.log(`✅ 已加载 ${shops.size} 个分店配置`)
    } else {
      // 默认数据（仅首次运行）
      shops.set('testclient', {
        shopId: 'testclient',
        name: '测试分店',
        printers: [
          { ip: '192.168.0.31', port: 9100, name: '厨房打印机1', type: 'kitchen' },
          { ip: '192.168.0.30', port: 9100, name: '前台打印机1', type: 'front' }
        ]
      })
      saveShops()
      console.log('✅ 已创建默认配置文件')
    }
  } catch (error) {
    console.error('❌ 加载数据失败:', error.message)
    shops = new Map()
  }
}

// 保存数据
function saveShops() {
  try {
    const data = Object.fromEntries(shops)
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error('❌ 保存数据失败:', error.message)
    return false
  }
}

// 初始化加载数据
loadShops()

// ============================================
// API 接口
// ============================================

/**
 * 获取所有分店列表
 */
app.get('/api/shops', async (req, res) => {
  try {
    // 获取已连接的代理
    const agentsResponse = await axios.get(`${PRINT_SERVER_URL}/api/print/agents`)
    const connectedAgents = agentsResponse.data.agents || []
    const connectedShopIds = new Set(connectedAgents.filter(a => a.connected).map(a => a.shopId))

    // 合并数据
    const shopsList = Array.from(shops.values()).map(shop => ({
      ...shop,
      connected: connectedShopIds.has(shop.shopId)
    }))

    res.json({
      success: true,
      shops: shopsList,
      total: shopsList.length,
      connected: connectedShopIds.size
    })
  } catch (error) {
    console.error('获取分店列表失败:', error.message)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * 获取单个分店信息
 */
app.get('/api/shops/:shopId', (req, res) => {
  const { shopId } = req.params
  const shop = shops.get(shopId)

  if (!shop) {
    return res.status(404).json({
      success: false,
      error: '分店不存在'
    })
  }

  res.json({
    success: true,
    shop
  })
})

/**
 * 创建或更新分店
 */
app.post('/api/shops', (req, res) => {
  const { shopId, name, printers } = req.body

  if (!shopId) {
    return res.status(400).json({
      success: false,
      error: 'shopId 是必需的'
    })
  }

  const shop = {
    shopId,
    name: name || shopId,
    printers: printers || []
  }

  shops.set(shopId, shop)
  saveShops()

  res.json({
    success: true,
    shop
  })
})

/**
 * 更新分店
 */
app.put('/api/shops/:shopId', (req, res) => {
  const { shopId } = req.params
  const { name, printers } = req.body

  if (!shops.has(shopId)) {
    return res.status(404).json({
      success: false,
      error: '分店不存在'
    })
  }

  const shop = shops.get(shopId)
  if (name) shop.name = name
  if (printers) shop.printers = printers

  shops.set(shopId, shop)
  saveShops()

  res.json({
    success: true,
    shop
  })
})

/**
 * 删除分店
 */
app.delete('/api/shops/:shopId', (req, res) => {
  const { shopId } = req.params

  if (!shops.has(shopId)) {
    return res.status(404).json({
      success: false,
      error: '分店不存在'
    })
  }

  shops.delete(shopId)
  saveShops()

  res.json({
    success: true,
    message: '分店已删除'
  })
})

/**
 * 添加打印机
 */
app.post('/api/shops/:shopId/printers', (req, res) => {
  const { shopId } = req.params
  const { ip, port, name, type } = req.body

  if (!shopId || !ip) {
    return res.status(400).json({
      success: false,
      error: 'shopId 和 ip 是必需的'
    })
  }

  if (!shops.has(shopId)) {
    return res.status(404).json({
      success: false,
      error: '分店不存在'
    })
  }

  const shop = shops.get(shopId)
  const printer = {
    ip,
    port: port || 9100,
    name: name || `${ip}:${port || 9100}`,
    type: type || 'kitchen'
  }

  shop.printers.push(printer)
  shops.set(shopId, shop)
  saveShops()

  res.json({
    success: true,
    printer,
    shop
  })
})

/**
 * 删除打印机
 */
app.delete('/api/shops/:shopId/printers/:ip', (req, res) => {
  const { shopId, ip } = req.params

  if (!shops.has(shopId)) {
    return res.status(404).json({
      success: false,
      error: '分店不存在'
    })
  }

  const shop = shops.get(shopId)
  shop.printers = shop.printers.filter(p => p.ip !== ip)
  shops.set(shopId, shop)
  saveShops()

  res.json({
    success: true,
    shop
  })
})

/**
 * 测试打印机连接
 */
app.post('/api/shops/:shopId/printers/:ip/test', async (req, res) => {
  const { shopId, ip } = req.params
  const { port } = req.body

  if (!shops.has(shopId)) {
    return res.status(404).json({
      success: false,
      error: '分店不存在'
    })
  }

  const shop = shops.get(shopId)
  const printer = shop.printers.find(p => p.ip === ip)

  if (!printer) {
    return res.status(404).json({
      success: false,
      error: '打印机不存在'
    })
  }

  try {
    // 发送测试打印请求
    const testData = Buffer.from(`测试打印\n时间: ${new Date().toLocaleString('zh-CN')}\n打印机: ${ip}:${port || printer.port}\n`)
    
    const response = await axios.post(
      `${PRINT_SERVER_URL}/api/print?host=${ip}&port=${port || printer.port}`,
      testData,
      {
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Shop-Name': shopId
        },
        timeout: 10000
      }
    )

    res.json({
      success: true,
      message: '测试打印已发送',
      response: response.data
    })
  } catch (error) {
    console.error('测试打印失败:', error.message)
    res.status(500).json({
      success: false,
      error: error.response?.data?.error || error.message
    })
  }
})

/**
 * 获取已连接的代理列表
 */
app.get('/api/agents', async (req, res) => {
  try {
    const response = await axios.get(`${PRINT_SERVER_URL}/api/print/agents`)
    res.json({
      success: true,
      ...response.data
    })
  } catch (error) {
    console.error('获取代理列表失败:', error.message)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * 下载 local-print-agent.js 文件
 */
app.get('/api/download/agent', (req, res) => {
  const fs = require('fs')
  const agentPath = path.join(__dirname, '..', 'agent', 'local-print-agent.js')
  
  if (fs.existsSync(agentPath)) {
    res.setHeader('Content-Type', 'application/javascript')
    res.setHeader('Content-Disposition', 'attachment; filename="local-print-agent.js"')
    res.sendFile(agentPath)
  } else {
    res.status(404).json({ success: false, error: '文件不存在' })
  }
})

/**
 * 生成部署脚本（返回 JSON，包含 curl 命令）
 */
app.get('/api/shops/:shopId/deploy', (req, res) => {
  const { shopId } = req.params
  const shop = shops.get(shopId)

  if (!shop) {
    return res.status(404).json({
      success: false,
      error: '分店不存在'
    })
  }

  // 生成 curl 命令
  const protocol = req.protocol || 'https'
  const host = req.get('host') || 'pa.easyify.uk'
  const curlCommand = `curl -s ${protocol}://${host}/api/shops/${shopId}/deploy.sh | bash`

  res.json({
    success: true,
    shopId,
    curlCommand,
    deployUrl: `${protocol}://${host}/api/shops/${shopId}/deploy.sh`
  })
})

/**
 * 生成部署脚本（返回可执行的 bash 脚本）
 */
app.get('/api/shops/:shopId/deploy.sh', (req, res) => {
  const { shopId } = req.params
  const shop = shops.get(shopId)

  if (!shop) {
    return res.status(404).send('#!/bin/bash\necho "错误: 分店不存在"\nexit 1\n')
  }

  // 获取协议和主机
  const protocol = req.protocol || (req.get('x-forwarded-proto') || 'https')
  const host = req.get('host') || 'pa.easyify.uk'
  const baseUrl = `${protocol}://${host}`

  // 生成 WSL 一键部署脚本
  const deployScript = `#!/bin/bash
# 打印代理一键部署脚本 - ${shop.name} (${shopId})
# 适用于 Windows WSL (Ubuntu/Debian)

set -e

BASE_URL="${baseUrl}"

echo "════════════════════════════════════════════════════════════"
echo "🚀 打印代理一键部署"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "分店: ${shop.name} (${shopId})"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "📦 安装 Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo "✅ Node.js 安装完成"
else
    echo "✅ Node.js 已安装: $(node --version)"
fi

# 创建工作目录
WORK_DIR="$HOME/print-agent"
mkdir -p "$WORK_DIR/agent"
cd "$WORK_DIR"

echo ""
echo "📥 下载项目文件..."

# 下载 package.json
cat > agent/package.json << 'PKG_EOF'
{
  "name": "print-agent-client",
  "version": "2.0.0",
  "description": "本地打印代理客户端",
  "main": "local-print-agent.js",
  "scripts": {
    "start": "node local-print-agent.js"
  },
  "dependencies": {
    "iconv-lite": "0.7.0",
    "ws": "8.18.3"
  }
}
PKG_EOF

# 下载 local-print-agent.js
echo "📥 下载 local-print-agent.js..."
curl -fsSL $BASE_URL/api/download/agent -o agent/local-print-agent.js || {
    echo "⚠️  无法从 GitHub 下载，使用备用方法..."
    cat > agent/local-print-agent.js << 'AGENT_EOF'
#!/usr/bin/env node
const WebSocket = require('ws');
const net = require('net');
const iconv = require('iconv-lite');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_FILE = path.join(__dirname, 'config.json');
const DEFAULT_CONFIG = {
  shopId: 'shop1',
  serverUrl: 'ws://printer1.easyify.uk/print-agent',
  reconnectInterval: 5000,
  heartbeatInterval: 30000,
  logLevel: 'info'
};

let config = { ...DEFAULT_CONFIG };

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const fileContent = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const fileConfig = JSON.parse(fileContent);
      config = { ...DEFAULT_CONFIG, ...fileConfig };
      log('info', \`✅ 已加载配置文件: \${CONFIG_FILE}\`);
    } else {
      log('warn', \`⚠️  配置文件不存在: \${CONFIG_FILE}\`);
      saveConfig();
    }
  } catch (error) {
    log('error', \`❌ 加载配置文件失败: \${error.message}\`);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    log('error', \`❌ 保存配置文件失败: \${error.message}\`);
  }
}

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level, message) {
  const levelNum = LOG_LEVELS[level] || 1;
  const configLevelNum = LOG_LEVELS[config.logLevel] || 1;
  if (levelNum < configLevelNum) return;
  const timestamp = new Date().toISOString();
  const prefix = { debug: '🔍', info: 'ℹ️ ', warn: '⚠️ ', error: '❌' }[level] || 'ℹ️ ';
  console.log(\`[\${timestamp}] \${prefix} \${message}\`);
}

let ws = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let isConnecting = false;
let isShuttingDown = false;

function connect() {
  if (isConnecting || isShuttingDown) return;
  isConnecting = true;
  log('info', \`正在连接到服务器: \${config.serverUrl}\`);
  
  try {
    const wsOptions = {
      headers: {
        'X-Shop-Id': config.shopId,
        'User-Agent': \`LocalPrintAgent/2.0.0 (\${os.platform()})\`
      }
    };
    
    if (config.rejectUnauthorized === false) {
      wsOptions.rejectUnauthorized = false;
    }
    
    ws = new WebSocket(config.serverUrl, wsOptions);

    ws.on('open', () => {
      isConnecting = false;
      log('info', '✅ 已连接到服务器');
      startHeartbeat();
      sendMessage({
        type: 'register',
        shopId: config.shopId,
        version: '2.0.0',
        platform: os.platform(),
        hostname: os.hostname()
      });
    });

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await handleMessage(message);
      } catch (error) {
        log('error', \`处理消息失败: \${error.message}\`);
      }
    });

    ws.on('close', (code, reason) => {
      isConnecting = false;
      stopHeartbeat();
      log('warn', \`连接已关闭 (代码: \${code}, 原因: \${reason || '未知'})\`);
      if (!isShuttingDown) {
        log('info', \`\${config.reconnectInterval / 1000}秒后尝试重连...\`);
        reconnectTimer = setTimeout(connect, config.reconnectInterval);
      }
    });

    ws.on('error', (error) => {
      isConnecting = false;
      log('error', \`WebSocket 错误: \${error.message}\`);
    });

    ws.on('pong', () => {
      log('debug', '收到服务器心跳响应');
    });

  } catch (error) {
    isConnecting = false;
    log('error', \`连接失败: \${error.message}\`);
    if (!isShuttingDown) {
      reconnectTimer = setTimeout(connect, config.reconnectInterval);
    }
  }
}

function sendMessage(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(message));
      log('debug', \`发送消息: \${message.type}\`);
    } catch (error) {
      log('error', \`发送消息失败: \${error.message}\`);
    }
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.ping();
      log('debug', '发送心跳');
    }
  }, config.heartbeatInterval);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

async function handleMessage(message) {
  log('debug', \`收到消息: \${message.type}\`);
  
  switch (message.type) {
    case 'print':
      await handlePrintTask(message);
      break;
    case 'ping':
      sendMessage({ type: 'pong' });
      break;
  }
}

async function handlePrintTask(task) {
  const { taskId, printerIP, port, data, encoding = 'base64' } = task;
  log('info', \`📄 收到打印任务: \${taskId}\`);
  
  try {
    let printData;
    if (typeof data === 'string') {
      if (encoding === 'base64') {
        const utf8Buffer = Buffer.from(data, 'base64');
        printData = iconv.encode(utf8Buffer.toString('utf-8'), 'GBK');
      } else {
        printData = iconv.encode(data, 'GBK');
      }
    } else if (Buffer.isBuffer(data)) {
      printData = iconv.encode(data.toString('utf-8'), 'GBK');
    } else {
      throw new Error('无效的数据格式');
    }
    
    const result = await printToPrinter(printerIP, port || 9100, printData);
    
    sendMessage({
      type: 'print_result',
      taskId: taskId,
      success: true,
      bytesSent: result.bytesSent,
      timestamp: new Date().toISOString()
    });
    
    log('info', \`✅ 打印任务完成: \${taskId}\`);
    
  } catch (error) {
    log('error', \`❌ 打印任务失败: \${taskId} - \${error.message}\`);
    sendMessage({
      type: 'print_result',
      taskId: taskId,
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

function printToPrinter(printerIP, port, data) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let connected = false;
    let timeout;
    
    timeout = setTimeout(() => {
      if (!connected) {
        client.destroy();
        reject(new Error('连接打印机超时'));
      }
    }, 10000);
    
    client.connect(port, printerIP, () => {
      connected = true;
      clearTimeout(timeout);
      log('debug', \`✅ 已连接到打印机: \${printerIP}:\${port}\`);
      
      client.write(data, (err) => {
        if (err) {
          client.destroy();
          reject(err);
        } else {
          log('debug', \`✅ 数据已发送: \${data.length} 字节\`);
          client.end();
          resolve({ bytesSent: data.length });
        }
      });
    });
    
    client.on('error', (err) => {
      clearTimeout(timeout);
      log('error', \`打印机连接错误: \${err.message}\`);
      reject(err);
    });
    
    client.on('close', () => {
      clearTimeout(timeout);
    });
  });
}

function shutdown() {
  log('info', '正在关闭服务...');
  isShuttingDown = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  stopHeartbeat();
  if (ws) ws.close();
  setTimeout(() => {
    log('info', '服务已关闭');
    process.exit(0);
  }, 1000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function start() {
  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('🖨️  本地打印代理服务');
  console.log('════════════════════════════════════════════════════════════');
  console.log('');
  
  loadConfig();
  log('info', '正在启动服务...');
  connect();
  
  if (config.enableStatusServer !== false) {
    const http = require('http');
    const statusServer = http.createServer((req, res) => {
      if (req.url === '/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: ws && ws.readyState === WebSocket.OPEN ? 'connected' : 'disconnected',
          shopId: config.shopId,
          serverUrl: config.serverUrl,
          uptime: process.uptime(),
          platform: os.platform(),
          hostname: os.hostname()
        }));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });
    
    statusServer.listen(0, '127.0.0.1', () => {
      const port = statusServer.address().port;
      log('info', \`状态服务运行在: http://127.0.0.1:\${port}/status\`);
    });
  }
}

start();
AGENT_EOF
}

# 创建配置文件
cat > agent/config.json << CONFIG_EOF
{
  "shopId": "${shopId}",
  "serverUrl": "ws://printer1.easyify.uk/print-agent",
  "reconnectInterval": 5000,
  "heartbeatInterval": 30000,
  "logLevel": "info",
  "enableStatusServer": true,
  "rejectUnauthorized": false,
  "printers": [
${shop.printers.map(p => `    "${p.ip}"`).join(',\n')}
  ]
}
CONFIG_EOF

echo "✅ 配置文件已创建"

# 安装依赖
echo ""
echo "📦 安装依赖..."
cd agent
npm install

echo ""
echo "✅ 部署完成！"
echo ""

# 安装 PM2（如果未安装）
if ! command -v pm2 &> /dev/null; then
    echo "📦 安装 PM2..."

    INSTALL_OK=false

    if npm install -g pm2; then
        INSTALL_OK=true
    else
        echo "⚠️  无法以普通用户安装 PM2，尝试使用 sudo..."
        if command -v sudo &> /dev/null; then
            if sudo npm install -g pm2; then
                INSTALL_OK=true
            else
                echo "⚠️  使用 sudo 安装失败"
            fi
        else
            echo "⚠️  系统未提供 sudo"
        fi

        # 如果仍然失败，尝试安装到用户目录
        if [ "$INSTALL_OK" != true ]; then
            echo "⚠️  尝试安装到用户目录 ~/.npm-global ..."
            USER_NPM_PREFIX="$HOME/.npm-global"
            mkdir -p "$USER_NPM_PREFIX"
            npm config set prefix "$USER_NPM_PREFIX" >/dev/null 2>&1 || true
            if ! grep -q "npm-global" "$HOME/.bashrc" 2>/dev/null; then
                echo "export PATH=\$HOME/.npm-global/bin:\$PATH" >> "$HOME/.bashrc"
                echo "✅ 已将 ~/.npm-global/bin 添加到 ~/.bashrc"
            fi
            export PATH="$USER_NPM_PREFIX/bin:$PATH"

            if npm install -g pm2; then
                INSTALL_OK=true
                echo "✅ PM2 已安装到用户目录 ~/.npm-global/bin"
            else
                echo "❌  安装到用户目录仍失败"
            fi
        fi
    fi

    if [ "$INSTALL_OK" = true ]; then
        echo "✅ PM2 安装完成"
    else
        echo "❌ PM2 安装失败，无法继续部署"
        exit 1
    fi
else
    echo "✅ PM2 已安装: $(pm2 --version)"
fi

echo "🚀 启动服务（PM2）..."

# 停止旧进程（如果存在）
pm2 stop print-agent 2>/dev/null || true
pm2 delete print-agent 2>/dev/null || true

# 启动新进程
pm2 start local-print-agent.js --name print-agent --log-date-format "YYYY-MM-DD HH:mm:ss Z"

# 保存 PM2 配置
pm2 save

echo ""
echo "✅ 服务已启动！"
echo ""

# 配置开机自启动
echo "⚙️  配置开机自启动..."
echo ""

# 方法 1: 尝试使用 systemd（WSL2 支持）
if [ -d /run/systemd/system ] || [ -d /usr/lib/systemd ]; then
    echo "检测到 systemd，尝试自动配置 PM2 startup..."

    PM2_BIN=$(command -v pm2)
    SANITIZED_PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.npm-global/bin:$PATH"

    if sudo env "PATH=$SANITIZED_PATH" "$PM2_BIN" startup systemd -u "$USER" --hp "$HOME"; then
        echo "✅ PM2 startup 配置成功"
        sudo systemctl daemon-reload 2>/dev/null || true
        sudo systemctl enable pm2-$USER 2>/dev/null || true
        pm2 save
    else
        echo "❌ 自动配置 PM2 startup 失败"
        echo "   请手动执行以下命令："
        echo "   sudo env \"PATH=$SANITIZED_PATH\" $PM2_BIN startup systemd -u $USER --hp $HOME"
        echo "   pm2 save"
    fi
else
    echo "未检测到 systemd，跳过自动配置。"
    echo ""
    echo "📋 请在 Windows 中创建计划任务或启动脚本，执行以下命令："
    echo "   wsl.exe -d $(wsl.exe -l -v 2>/dev/null | grep -i 'running' | head -1 | awk '{print $1}' || echo "Ubuntu") -u $(whoami) bash -lc 'cd ~/print-agent/agent && pm2 resurrect'"
    echo ""
fi

    echo ""

    echo "📊 查看服务状态："
    echo "  pm2 status"
    echo ""
    echo "📋 查看日志："
    echo "  pm2 logs print-agent"
    echo ""
    echo "🛑 停止服务："
    echo "  pm2 stop print-agent"
    echo ""
    echo "🔄 重启服务："
    echo "  pm2 restart print-agent"
    echo ""
`

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Content-Disposition', `inline; filename="deploy-${shopId}.sh"`)
  res.send(deployScript)
})

/**
 * 下载 WSL 网络修复脚本
 */
app.get('/fix-wsl-network.sh', (req, res) => {
  const scriptPath = path.join(__dirname, 'public', 'fix-wsl-network.sh')
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Content-Disposition', 'inline; filename="fix-wsl-network.sh"')
  res.sendFile(scriptPath)
})

/**
 * 根路径 - 返回管理界面
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

// ============================================
// 启动服务器
// ============================================

app.listen(PORT, () => {
  console.log('')
  console.log('════════════════════════════════════════════════════════════')
  console.log('🚀 打印代理管理后台已启动')
  console.log('════════════════════════════════════════════════════════════')
  console.log(`   端口: ${PORT}`)
  console.log(`   访问: http://localhost:${PORT}`)
  console.log(`   生产环境: https://pa.easyify.uk`)
  console.log(`   打印服务器: ${PRINT_SERVER_URL}`)
  console.log('════════════════════════════════════════════════════════════\n')
})

