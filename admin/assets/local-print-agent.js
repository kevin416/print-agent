#!/usr/bin/env node
/**
 * 本地打印代理服务 (通用版)
 * 适用于 Windows / WSL / Linux / macOS
 * 通过 WebSocket 与云端 print-agent 通信，并将打印数据转发到局域网打印机
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const WebSocket = require('ws')
const net = require('net')
const iconv = require('iconv-lite')

// =============================
// 配置
// =============================

const CONFIG_FILE = path.join(__dirname, 'config.json')
const DEFAULT_CONFIG = {
  shopId: 'shop1',
  serverUrl: 'wss://printer-hub.easyify.uk/print-agent',
  reconnectInterval: 5000,
  heartbeatInterval: 30000,
  logLevel: 'info',
  rejectUnauthorized: false
}

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

let config = { ...DEFAULT_CONFIG }
let ws = null
let reconnectTimer = null
let heartbeatTimer = null
let shuttingDown = false

function log(level, message) {
  const levelValue = LOG_LEVELS[level] !== undefined ? LOG_LEVELS[level] : 1
  const configValue = LOG_LEVELS[config.logLevel] !== undefined ? LOG_LEVELS[config.logLevel] : 1
  if (levelValue < configValue) return
  const timestamp = new Date().toISOString()
  console.log('[' + timestamp + '] [' + level.toUpperCase() + '] ' + message)
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
      const parsed = JSON.parse(raw)
      config = { ...DEFAULT_CONFIG, ...parsed }
      log('info', '已加载配置: ' + CONFIG_FILE)
      log('info', '分店 ID: ' + config.shopId)
      log('info', '服务器 URL: ' + config.serverUrl)
    } else {
      log('warn', '未找到配置文件，使用默认配置并自动生成: ' + CONFIG_FILE)
      saveConfig()
    }
  } catch (error) {
    log('error', '加载配置失败: ' + error.message)
    log('warn', '仍使用默认配置')
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
    log('info', '已写入配置文件: ' + CONFIG_FILE)
  } catch (error) {
    log('error', '保存配置失败: ' + error.message)
  }
}

function scheduleReconnect() {
  if (shuttingDown) return
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(connectWebSocket, config.reconnectInterval)
}

function startHeartbeat() {
  stopHeartbeat()
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.ping()
      } catch (error) {
        log('warn', '发送心跳失败: ' + error.message)
      }
    }
  }, config.heartbeatInterval)
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

function sendMessage(payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return
  }
  try {
    ws.send(JSON.stringify(payload))
  } catch (error) {
    log('warn', '发送消息失败: ' + error.message)
  }
}

function connectWebSocket() {
  if (shuttingDown) return
  if (!config.shopId || !config.serverUrl) {
    log('error', '配置不完整，缺少 shopId 或 serverUrl')
    return
  }

  const headers = {
    'X-Shop-Id': config.shopId,
    'User-Agent': 'LocalPrintAgent/2.0.0 (' + os.platform() + ')'
  }

  const options = {
    headers,
    rejectUnauthorized: config.rejectUnauthorized !== false
  }

  log('info', '正在连接服务器: ' + config.serverUrl)

  ws = new WebSocket(config.serverUrl, options)

  ws.on('open', () => {
    log('info', 'WebSocket 已连接')
    startHeartbeat()
    sendMessage({
      type: 'register',
      shopId: config.shopId,
      hostname: os.hostname(),
      platform: os.platform(),
      version: '2.0.0'
    })
  })

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString())
      handleMessage(message)
    } catch (error) {
      log('error', '解析服务器消息失败: ' + error.message)
    }
  })

  ws.on('error', (error) => {
    log('error', 'WebSocket 错误: ' + error.message)
  })

  ws.on('close', (code, reason) => {
    log('warn', 'WebSocket 连接关闭。代码: ' + code + '，原因: ' + (reason || '无'))
    stopHeartbeat()
    scheduleReconnect()
  })
}

async function handleMessage(message) {
  const type = message.type || ''
  if (type === 'print') {
    await handlePrintTask(message)
  } else if (type === 'config' && message.config) {
    config = { ...config, ...message.config }
    saveConfig()
    log('info', '已接收并保存服务器下发的配置更新')
  } else if (type === 'ping') {
    sendMessage({ type: 'pong' })
  } else {
    log('debug', '收到未知消息类型: ' + type)
  }
}

async function handlePrintTask(task) {
  const printerIP = task.printerIP
  const port = task.port || 9100
  const encoding = task.encoding || 'base64'
  const data = task.data
  const taskId = task.taskId || Date.now().toString()

  log('info', '收到打印任务，打印机: ' + printerIP + ':' + port)

  try {
    let payload
    if (typeof data === 'string') {
      if (encoding === 'base64') {
        const utf8Buffer = Buffer.from(data, 'base64')
        payload = iconv.encode(utf8Buffer.toString('utf-8'), 'GBK')
      } else if (encoding === 'hex') {
        payload = Buffer.from(data, 'hex')
      } else {
        payload = iconv.encode(data, 'GBK')
      }
    } else if (Buffer.isBuffer(data)) {
      payload = iconv.encode(data.toString('utf-8'), 'GBK')
    } else {
      throw new Error('无法识别的打印数据格式')
    }

    await sendToPrinter(printerIP, port, payload)

    sendMessage({
      type: 'print_result',
      success: true,
      bytesSent: payload.length,
      taskId
    })

    log('info', '打印任务完成，字节数: ' + payload.length)
  } catch (error) {
    log('error', '打印失败: ' + error.message)
    sendMessage({
      type: 'print_result',
      success: false,
      error: error.message,
      taskId
    })
  }
}

function sendToPrinter(printerIP, port, buffer) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: printerIP, port }, () => {
      socket.write(buffer, (err) => {
        if (err) {
          reject(err)
        } else {
          socket.end()
          resolve({ bytesSent: buffer.length })
        }
      })
    })

    socket.on('error', (error) => {
      reject(error)
    })
  })
}

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  log('info', '正在关闭本地打印代理...')
  if (reconnectTimer) clearTimeout(reconnectTimer)
  stopHeartbeat()
  if (ws) {
    try {
      ws.close()
    } catch (error) {
      log('warn', '关闭 WebSocket 时出错: ' + error.message)
    }
  }
  setTimeout(() => process.exit(0), 1000)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

function main() {
  console.log('')
  console.log('============================================================')
  console.log(' Local Print Agent (跨平台版)')
  console.log('============================================================')
  console.log('工作目录: ' + __dirname)
  console.log('系统平台: ' + os.platform())
  console.log('Node.js 版本: ' + process.version)
  console.log('============================================================')
  console.log('')

  loadConfig()
  connectWebSocket()
}

main()

