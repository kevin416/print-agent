#!/usr/bin/env node
/**
 * 本地打印代理服务
 * 运行在分店 Windows 电脑上，通过 WebSocket 连接到服务器
 * 接收打印任务并转发到本地打印机
 * 
 * 使用方法：
 * 1. 配置 config.json（包含 shopId 和 serverUrl）
 * 2. 运行: node local-print-agent.js
 * 3. 或打包成可执行文件: pkg local-print-agent.js
 */

const WebSocket = require('ws')
const net = require('net')
const iconv = require('iconv-lite')
const fs = require('fs')
const path = require('path')
const os = require('os')

// ============================================
// 配置管理
// ============================================

const CONFIG_FILE = path.join(__dirname, 'config.json')
const DEFAULT_CONFIG = {
  shopId: 'shop1',
  serverUrl: 'wss://printer1.easyify.uk/print-agent',  // 修改为你的服务器地址（也可以使用 printer2.easyify.uk）
  reconnectInterval: 5000,
  heartbeatInterval: 30000,
  logLevel: 'info' // 'debug', 'info', 'warn', 'error'
}

let config = { ...DEFAULT_CONFIG }

// 加载配置文件
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const fileContent = fs.readFileSync(CONFIG_FILE, 'utf-8')
      const fileConfig = JSON.parse(fileContent)
      config = { ...DEFAULT_CONFIG, ...fileConfig }
      log('info', `✅ 已加载配置文件: ${CONFIG_FILE}`)
      log('info', `   分店ID: ${config.shopId}`)
      log('info', `   服务器URL: ${config.serverUrl}`)
    } else {
      log('warn', `⚠️  配置文件不存在: ${CONFIG_FILE}`)
      log('info', `   使用默认配置，创建配置文件...`)
      saveConfig()
    }
  } catch (error) {
    log('error', `❌ 加载配置文件失败: ${error.message}`)
    log('info', `   使用默认配置`)
  }
}

// 保存配置文件
function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
    log('info', `✅ 已创建配置文件: ${CONFIG_FILE}`)
  } catch (error) {
    log('error', `❌ 保存配置文件失败: ${error.message}`)
  }
}

// ============================================
// 日志系统
// ============================================

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

function log(level, message) {
  const levelNum = LOG_LEVELS[level] || 1
  const configLevelNum = LOG_LEVELS[config.logLevel] || 1
  
  if (levelNum < configLevelNum) return
  
  const timestamp = new Date().toISOString()
  const prefix = {
    debug: '🔍',
    info: 'ℹ️ ',
    warn: '⚠️ ',
    error: '❌'
  }[level] || 'ℹ️ '
  
  console.log(`[${timestamp}] ${prefix} ${message}`)
}

// ============================================
// WebSocket 连接管理
// ============================================

let ws = null
let reconnectTimer = null
let heartbeatTimer = null
let isConnecting = false
let isShuttingDown = false

function connect() {
  if (isConnecting || isShuttingDown) return
  
  isConnecting = true
  log('info', `正在连接到服务器: ${config.serverUrl}`)
  
  try {
    // WebSocket 选项
    const wsOptions = {
      headers: {
        'X-Shop-Id': config.shopId,
        'User-Agent': `LocalPrintAgent/2.0.0 (${os.platform()})`
      }
    }
    
    // 如果配置了 rejectUnauthorized: false，则禁用 SSL 验证（仅用于测试）
    if (config.rejectUnauthorized === false) {
      wsOptions.rejectUnauthorized = false
      log('warn', '⚠️  SSL 验证已禁用（仅用于测试）')
    }
    
    ws = new WebSocket(config.serverUrl, wsOptions)

    ws.on('open', () => {
      isConnecting = false
      log('info', '✅ 已连接到服务器')
      startHeartbeat()
      
      // 发送注册信息
      sendMessage({
        type: 'register',
        shopId: config.shopId,
        version: '2.0.0',
        platform: os.platform(),
        hostname: os.hostname()
      })
    })

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString())
        await handleMessage(message)
      } catch (error) {
        log('error', `处理消息失败: ${error.message}`)
        log('debug', `原始消息: ${data.toString().substring(0, 100)}`)
      }
    })

    ws.on('close', (code, reason) => {
      isConnecting = false
      stopHeartbeat()
      log('warn', `连接已关闭 (代码: ${code}, 原因: ${reason || '未知'})`)
      
      if (!isShuttingDown) {
        log('info', `${config.reconnectInterval / 1000}秒后尝试重连...`)
        reconnectTimer = setTimeout(connect, config.reconnectInterval)
      }
    })

    ws.on('error', (error) => {
      isConnecting = false
      log('error', `WebSocket 错误: ${error.message}`)
    })

    ws.on('pong', () => {
      log('debug', '收到服务器心跳响应')
    })

  } catch (error) {
    isConnecting = false
    log('error', `连接失败: ${error.message}`)
    
    if (!isShuttingDown) {
      reconnectTimer = setTimeout(connect, config.reconnectInterval)
    }
  }
}

function sendMessage(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(message))
      log('debug', `发送消息: ${message.type}`)
    } catch (error) {
      log('error', `发送消息失败: ${error.message}`)
    }
  } else {
    log('warn', `无法发送消息: WebSocket 未连接`)
  }
}

function startHeartbeat() {
  stopHeartbeat()
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.ping()
      log('debug', '发送心跳')
    }
  }, config.heartbeatInterval)
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

// ============================================
// 消息处理
// ============================================

async function handleMessage(message) {
  log('debug', `收到消息: ${message.type}`)
  
  switch (message.type) {
    case 'print':
      await handlePrintTask(message)
      break
    
    case 'ping':
      sendMessage({ type: 'pong' })
      break
    
    case 'config':
      // 服务器更新配置
      if (message.config) {
        config = { ...config, ...message.config }
        saveConfig()
        log('info', '✅ 配置已更新')
      }
      break
    
    default:
      log('warn', `未知消息类型: ${message.type}`)
  }
}

// ============================================
// 打印任务处理
// ============================================

async function handlePrintTask(task) {
  const { taskId, printerIP, port, data, encoding = 'base64' } = task
  
  log('info', `📄 收到打印任务: ${taskId}`)
  log('info', `   打印机: ${printerIP}:${port || 9100}`)
  
  try {
    // 解码数据
    let printData
    if (typeof data === 'string') {
      if (encoding === 'base64') {
        // 从 base64 解码得到 UTF-8 Buffer
        const utf8Buffer = Buffer.from(data, 'base64')
        // 转换为 GBK
        printData = iconv.encode(utf8Buffer.toString('utf-8'), 'GBK')
      } else if (encoding === 'hex') {
        printData = Buffer.from(data, 'hex')
      } else {
        // UTF-8 字符串，转换为 GBK
        printData = iconv.encode(data, 'GBK')
      }
    } else if (Buffer.isBuffer(data)) {
      // 如果已经是 Buffer，假设是 UTF-8，转换为 GBK
      printData = iconv.encode(data.toString('utf-8'), 'GBK')
    } else {
      throw new Error('无效的数据格式')
    }
    
    log('debug', `   编码后大小: ${printData.length} 字节 (GBK)`)
    
    // 发送到打印机
    const result = await printToPrinter(printerIP, port || 9100, printData)
    
    // 发送成功响应
    sendMessage({
      type: 'print_result',
      taskId: taskId,
      success: true,
      bytesSent: result.bytesSent,
      timestamp: new Date().toISOString()
    })
    
    log('info', `✅ 打印任务完成: ${taskId}`)
    
  } catch (error) {
    log('error', `❌ 打印任务失败: ${taskId} - ${error.message}`)
    
    // 发送失败响应
    sendMessage({
      type: 'print_result',
      taskId: taskId,
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    })
  }
}

function printToPrinter(printerIP, port, data) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket()
    let connected = false
    let timeout
    
    timeout = setTimeout(() => {
      if (!connected) {
        client.destroy()
        reject(new Error('连接打印机超时'))
      }
    }, 10000) // 10秒超时
    
    client.connect(port, printerIP, () => {
      connected = true
      clearTimeout(timeout)
      log('debug', `✅ 已连接到打印机: ${printerIP}:${port}`)
      
      client.write(data, (err) => {
        if (err) {
          client.destroy()
          reject(err)
        } else {
          log('debug', `✅ 数据已发送: ${data.length} 字节`)
          client.end()
          resolve({ bytesSent: data.length })
        }
      })
    })
    
    client.on('error', (err) => {
      clearTimeout(timeout)
      log('error', `打印机连接错误: ${err.message}`)
      reject(err)
    })
    
    client.on('close', () => {
      clearTimeout(timeout)
      if (connected) {
        log('debug', `连接已关闭: ${printerIP}:${port}`)
      }
    })
  })
}

// ============================================
// 优雅关闭
// ============================================

function shutdown() {
  log('info', '正在关闭服务...')
  isShuttingDown = true
  
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
  }
  
  stopHeartbeat()
  
  if (ws) {
    ws.close()
  }
  
  setTimeout(() => {
    log('info', '服务已关闭')
    process.exit(0)
  }, 1000)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// ============================================
// 启动服务
// ============================================

function start() {
  console.log('')
  console.log('════════════════════════════════════════════════════════════')
  console.log('🖨️  本地打印代理服务')
  console.log('════════════════════════════════════════════════════════════')
  console.log('')
  
  loadConfig()
  
  console.log('')
  log('info', '正在启动服务...')
  connect()
  
  // 提供简单的 HTTP 状态接口（可选）
  if (config.enableStatusServer !== false) {
    const http = require('http')
    const statusServer = http.createServer((req, res) => {
      if (req.url === '/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          status: ws && ws.readyState === WebSocket.OPEN ? 'connected' : 'disconnected',
          shopId: config.shopId,
          serverUrl: config.serverUrl,
          uptime: process.uptime(),
          platform: os.platform(),
          hostname: os.hostname()
        }))
      } else {
        res.writeHead(404)
        res.end('Not Found')
      }
    })
    
    statusServer.listen(0, '127.0.0.1', () => {
      const port = statusServer.address().port
      log('info', `状态服务运行在: http://127.0.0.1:${port}/status`)
    })
  }
}

// 启动
start()

