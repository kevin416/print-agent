#!/usr/bin/env node
/**
 * 打印代理服务器 - 本地代理模式（无VPN）
 * 
 * 架构：
 * 浏览器 → HTTP → 服务器 → WebSocket → 本地代理 → 打印机
 * 
 * 特点：
 * - 无需 VPN 配置
 * - 通过 WebSocket 与本地代理通信
 * - 支持多分店管理
 * - 自动编码转换（UTF-8 → GBK）
 */

const express = require('express')
const http = require('http')
const WebSocket = require('ws')
const iconv = require('iconv-lite')

const app = express()
const PORT = process.env.PORT || 3000
const NODE_ENV = process.env.NODE_ENV || 'production'

// WebSocket 服务器（用于本地代理服务连接）
let wss = null
const localAgents = new Map() // shopId -> WebSocket
const agentStates = new Map() // shopId -> state object
const taskHistory = new Map() // taskId -> task details
const recentTasks = []
const TASK_TIMEOUT_MS = 30_000
const MAX_RECENT_TASKS = 200

function generateTaskId() {
  return `task_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function serializeTask(task) {
  if (!task) return null
  const { timeoutHandle, ...rest } = task
  return rest
}

function serializeAgentState(state) {
  if (!state) return null
  const devices = Array.isArray(state.devices) ? state.devices : []
  const tcpCount = devices.filter((device) => device && device.connectionType === 'tcp').length
  return {
    shopId: state.shopId,
    connected: Boolean(state.ws && state.ws.readyState === WebSocket.OPEN),
    readyState: state.ws ? state.ws.readyState : WebSocket.CLOSED,
    online: Boolean(state.ws && state.ws.readyState === WebSocket.OPEN),
    connectedAt: state.connectedAt,
    disconnectedAt: state.disconnectedAt,
    lastHeartbeatAt: state.lastHeartbeatAt,
    lastHeartbeat: state.lastHeartbeat,
    version: state.version,
    platform: state.platform,
    arch: state.arch,
    hostname: state.hostname,
    remoteAddress: state.remoteAddress,
    telemetry: state.telemetry || null,
    devices,
    printers: devices,
    devicesCount: devices.length,
    tcpPrinterCount: tcpCount,
    history: state.history || [],
    lastTask: state.lastTask || null,
    lastError: state.lastError || null
  }
}

// ============================================
// 中间件配置
// ============================================

// CORS 支持
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Shop-Name')
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
    return
  }
  next()
})

// 请求体解析
app.use(express.json({ limit: '50mb' }))
app.use(express.raw({ limit: '50mb', type: 'application/octet-stream' }))

// ============================================
// 工具函数
// ============================================

/**
 * 验证打印请求
 * 要求：必须通过 X-Shop-Name 头指定分店，且该分店的本地代理已连接
 */
function validatePrintRequest(req, printerHost) {
  const shopName = req.headers['x-shop-name']
  
  if (!shopName) {
    throw new Error('缺少 X-Shop-Name 请求头。请指定分店名称。')
  }
  
  const localAgent = localAgents.get(shopName)
  if (!localAgent || localAgent.readyState !== WebSocket.OPEN) {
    throw new Error(`分店 ${shopName} 的本地代理未连接。请确保本地代理服务正在运行。`)
  }
  
  return {
    name: shopName,
    displayName: shopName,
    agent: localAgent
  }
}

/**
 * 编码转换：UTF-8 → GBK
 */
function convertToGBK(utf8Buffer) {
  try {
    const textString = utf8Buffer.toString('utf-8')
    const gbkBuffer = iconv.encode(textString, 'GB18030')
    return gbkBuffer
  } catch (error) {
    console.error('编码转换失败:', error.message)
    return utf8Buffer
  }
}

function getAgentState(shopId) {
  let state = agentStates.get(shopId)
  if (!state) {
    state = {
      shopId,
      ws: null,
      connectedAt: null,
      disconnectedAt: null,
      lastHeartbeatAt: null,
      lastHeartbeat: null,
      version: null,
      platform: null,
      arch: null,
      hostname: null,
      remoteAddress: null,
      telemetry: null,
      devices: [],
      history: [],
      lastTask: null,
      lastError: null
    }
    agentStates.set(shopId, state)
  }
  return state
}

function attachWebSocketToState(shopId, ws, remoteAddress) {
  const state = getAgentState(shopId)
  if (state.ws && state.ws !== ws) {
    try {
      state.ws.terminate()
    } catch (error) {
      // ignore
    }
  }
  state.ws = ws
  state.connectedAt = new Date().toISOString()
  state.disconnectedAt = null
  state.remoteAddress = remoteAddress || null
  state.lastError = null
  return state
}

function markAgentDisconnected(shopId) {
  const state = agentStates.get(shopId)
  if (!state) return
  state.disconnectedAt = new Date().toISOString()
  state.ws = null
}

function recordTask(task) {
  taskHistory.set(task.id, task)
  recentTasks.unshift(task)
  if (recentTasks.length > MAX_RECENT_TASKS) {
    const removed = recentTasks.pop()
    if (removed && removed.id && removed !== task) {
      taskHistory.delete(removed.id)
    }
  }
}

function updateTask(taskId, updates) {
  const task = taskHistory.get(taskId)
  if (!task) return null
  Object.assign(task, updates)
  return task
}

function dispatchTask(shopId, type, payload = {}) {
  const state = getAgentState(shopId)
  if (!state || !state.ws || state.ws.readyState !== WebSocket.OPEN) {
    throw new Error(`分店 ${shopId} 的本地代理未连接`)
  }

  const id = generateTaskId()
  const createdAt = new Date().toISOString()
  const task = {
    id,
    shopId,
    type,
    status: 'pending',
    payload,
    createdAt,
    sentAt: null,
    completedAt: null,
    error: null,
    result: null
  }

  recordTask(task)

  let messageType = type
  switch (type) {
    case 'print':
    case 'print-test':
      messageType = 'task_print'
      break
    case 'config':
      messageType = 'task_config'
      break
    case 'ping':
      messageType = 'task_ping'
      break
    default:
      messageType = type
  }

  const message = {
    type: messageType,
    id,
    payload
  }

  try {
    state.ws.send(JSON.stringify(message))
    task.status = 'sent'
    task.sentAt = new Date().toISOString()
    task.timeoutHandle = setTimeout(() => {
      updateTask(id, {
        status: 'timeout',
        error: 'Agent 未响应',
        completedAt: new Date().toISOString()
      })
    }, TASK_TIMEOUT_MS)
    state.lastTask = { id, type, status: 'sent', sentAt: task.sentAt }
  } catch (error) {
    task.status = 'error'
    task.error = error.message || '发送任务失败'
    task.completedAt = new Date().toISOString()
    state.lastTask = { id, type, status: 'error', error: task.error, sentAt: task.sentAt }
    throw error
  }

  return serializeTask(task)
}

function handleTaskResult(message, state) {
  const { id, payload } = message
  const task = updateTask(id, {
    status: payload?.status || 'success',
    result: payload || null,
    error: payload?.status === 'success' ? null : payload?.message || null,
    completedAt: new Date().toISOString()
  })
  if (task && task.timeoutHandle) {
    clearTimeout(task.timeoutHandle)
    delete task.timeoutHandle
  }
  if (state) {
    state.lastTask = {
      id,
      type: task?.type || '',
      status: task?.status,
      completedAt: task?.completedAt,
      error: task?.error || null
    }
    if (task?.error) {
      state.lastError = task.error
    }
  }
}

function ack(ws, message) {
  try {
    ws.send(
      JSON.stringify({
        type: 'ack',
        id: message?.id || undefined,
        payload: { message: 'ok' }
      })
    )
  } catch (error) {
    // ignore
  }
}

// ============================================
// API 接口
// ============================================

/**
 * 打印接口
 * POST /api/print?host=192.168.0.172&port=9100
 * Headers: 
 *   - X-Shop-Name: shop-name (必需)
 *   - X-Charset: utf8 (可选，如果数据是 UTF-8 编码则设置，否则数据已经是 GBK)
 * Body: 打印数据（二进制）
 */
app.post('/api/print', async (req, res) => {
  const printerHost = req.query.host
  const printerPort = parseInt(req.query.port || '9100')
  
  try {
    // 验证请求
    if (!printerHost) {
      return res.status(400).json({ error: '缺少打印机IP参数 (host)' })
    }
    
    const shopConfig = validatePrintRequest(req, printerHost)
    const shopName = shopConfig.name
    
    // 🔥 检查 X-Charset 头，判断数据编码
    const charset = req.headers['x-charset'] || req.headers['X-Charset']
    const isUTF8 = charset === 'utf8' || charset === 'utf-8'
    
    // 获取打印数据
    const printData = req.body instanceof Buffer ? req.body : Buffer.from(req.body)
    
    // 🔥 调试：检查数据的前几个字节，确认是否是 GBK 编码的中文
    const sampleBytes = printData.slice(0, Math.min(20, printData.length))
    const sampleHex = Array.from(sampleBytes).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')
    
    console.log(`\n📄 收到打印请求: ${printerHost}:${printerPort}`)
    console.log(`   分店: ${shopName}`)
    console.log(`   数据大小: ${printData.length} 字节`)
    console.log(`   数据编码: ${isUTF8 ? 'UTF-8 (需要转换)' : 'GBK (直接使用)'}`)
    console.log(`   X-Charset: ${charset || 'none (假设是 GBK)'}`)
    console.log(`   数据样本 (前20字节): ${sampleHex}`)
    console.log(`   req.body 类型: ${typeof req.body}, 是否为 Buffer: ${Buffer.isBuffer(req.body)}`)
    
    // 通过本地代理发送
    const result = await sendViaLocalAgent(
      shopConfig.agent,
      shopName,
      printerHost,
      printerPort,
      printData,
      isUTF8 // 🔥 传递编码标志
    )
    
    res.json({
      success: true,
      bytesSent: result.bytesSent,
      printer: `${printerHost}:${printerPort}`,
      shop: shopName,
      mode: 'local_agent',
      encoding: isUTF8 ? 'UTF-8 → GBK (已转换)' : 'GBK (直接使用)'
    })
    
  } catch (error) {
    console.error(`❌ 打印失败:`, error.message)
    if (!res.headersSent) {
      return res.status(error.message.includes('未连接') ? 503 : 500).json({ 
        error: error.message, 
        success: false
      })
    }
  }
})

/**
 * 通过本地代理发送打印任务
 * @param {WebSocket} agent - 本地代理 WebSocket 连接
 * @param {string} shopName - 分店名称
 * @param {string} printerHost - 打印机IP
 * @param {number} printerPort - 打印机端口
 * @param {Buffer} printData - 打印数据
 * @param {boolean} isUTF8 - 数据是否为 UTF-8 编码（需要转换为 GBK）
 */
function sendViaLocalAgent(agent, shopName, printerHost, printerPort, printData, isUTF8 = false) {
  return new Promise((resolve, reject) => {
    const taskId = Date.now().toString() + Math.random().toString(36).substr(2, 9)
    const timeout = setTimeout(() => {
      console.error(`❌ 本地代理响应超时: ${taskId}`)
      reject(new Error('本地代理响应超时'))
    }, 30000) // 30秒超时
    
    // 监听响应
    const responseHandler = (data) => {
      try {
        const message = JSON.parse(data.toString())
        if (message.type === 'print_result' && message.taskId === taskId) {
          clearTimeout(timeout)
          agent.removeListener('message', responseHandler)
          
          if (message.success) {
            console.log(`✅ 打印任务完成: ${taskId}`)
            resolve({
              bytesSent: message.bytesSent
            })
          } else {
            reject(new Error(message.error || '打印失败'))
          }
        }
      } catch (error) {
        // 忽略解析错误
      }
    }
    
    agent.on('message', responseHandler)
    
    // 🔥 重要：print-agent server 不应该转换数据，因为简单的 convertToGBK 会破坏 ESC/POS 命令
    // 应该直接转发给 local-usb-agent-app，让 agent 使用 convertEscPosUtf8ToGbk 来正确转换
    // 
    // 策略：
    // 1. 如果数据是 UTF-8，设置 charset: 'utf8'，让 agent 使用 convertEscPosUtf8ToGbk 转换
    // 2. 如果数据已经是 GBK，不设置 charset，让 agent 直接使用
    const message = {
      type: 'print',
      taskId: taskId,
      printerIP: printerHost,
      port: printerPort,
      data: printData.toString('base64'), // 🔥 直接使用原始数据，不转换
      encoding: 'base64'
    }
    
    // 🔥 只有数据是 UTF-8 时才设置 charset，告诉 agent 需要转换
    // 如果数据已经是 GBK，不设置 charset，agent 会直接使用
    if (isUTF8) {
      message.charset = 'utf8'
      console.log(`   🔄 发送给 agent：数据是 UTF-8，设置 charset: utf8，agent 将使用 convertEscPosUtf8ToGbk 转换`)
    } else {
      console.log(`   ✅ 发送给 agent：数据已经是 GBK，不设置 charset，agent 直接使用`)
    }
    
    console.log(`   📦 消息详情:`, {
      type: message.type,
      taskId: message.taskId,
      printerIP: message.printerIP,
      port: message.port,
      dataLength: message.data.length,
      charset: message.charset || 'none (assumed GBK)',
      isUTF8
    })
    
    agent.send(JSON.stringify(message))
    
    console.log(`   🔗 已发送到本地代理: ${taskId}`)
  })
}

/**
 * 健康检查接口
 */
app.get('/api/print/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.0.0-local-agent',
    encoding: 'GBK (iconv-lite)',
    mode: 'local_agent',
    connectedAgents: localAgents.size,
    agents: Array.from(localAgents.keys()),
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  })
})

/**
 * 获取已连接的分店列表
 */
app.get('/api/print/agents', (req, res) => {
  const agents = Array.from(agentStates.values()).map(serializeAgentState)
  res.json({
    agents,
    total: agents.length,
    connected: agents.filter((a) => a.connected).length
  })
})

app.get('/api/agent/states', (req, res) => {
  const agents = Array.from(agentStates.values()).map(serializeAgentState)
  res.json({
    agents,
    total: agents.length,
    connected: agents.filter((a) => a.connected).length
  })
})

app.get('/api/agent/states/:shopId', (req, res) => {
  const state = serializeAgentState(agentStates.get(req.params.shopId))
  if (!state) {
    return res.status(404).json({ success: false, error: '未找到门店状态' })
  }
  res.json({ success: true, agent: state })
})

app.get('/api/agent/tasks', (req, res) => {
  res.json({
    tasks: recentTasks.map(serializeTask),
    total: recentTasks.length
  })
})

app.get('/api/agent/tasks/:id', (req, res) => {
  const task = serializeTask(taskHistory.get(req.params.id))
  if (!task) {
    return res.status(404).json({ success: false, error: '未找到任务' })
  }
  res.json({ success: true, task })
})

app.post('/api/agent/tasks', (req, res) => {
  try {
    const { shopId, type, payload } = req.body || {}
    if (!shopId || !type) {
      return res.status(400).json({ success: false, error: 'shopId 与 type 必填' })
    }
    const task = dispatchTask(shopId, type, payload || {})
    res.json({ success: true, task })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || '任务下发失败' })
  }
})

/**
 * 根路径
 */
app.get('/', (req, res) => {
  res.json({
    service: 'Print Agent Server (Local Agent Mode)',
    version: '2.0.0-local-agent',
    endpoints: {
      health: '/api/print/health',
      agents: '/api/print/agents',
      print: '/api/print?host=IP&port=9100'
    },
    encoding: 'GBK (iconv-lite)',
    mode: 'local_agent',
    nodeEnv: NODE_ENV,
    connectedAgents: localAgents.size
  })
})

// ============================================
// WebSocket 服务器
// ============================================

// 创建 HTTP 服务器
const server = http.createServer(app)

// 创建 WebSocket 服务器
wss = new WebSocket.Server({ 
  server,
  path: '/print-agent',
  verifyClient: (info) => {
    // 验证请求头中的分店ID
    const shopId = info.req.headers['x-shop-id']
    if (shopId) {
      info.req.shopId = shopId
      return true
    }
    return false
  }
})

// WebSocket 连接处理
wss.on('connection', (ws, req) => {
  const shopId = req.shopId || req.headers['x-shop-id']
  
  if (!shopId) {
    console.warn('⚠️  WebSocket 连接缺少分店ID，已拒绝')
    ws.close(1008, 'Missing shop ID')
    return
  }
  
  console.log(`✅ 本地代理已连接: ${shopId}`)
  localAgents.set(shopId, ws)
  const state = attachWebSocketToState(shopId, ws, req.socket?.remoteAddress)
  
  // 处理消息
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString())
      const type = message.type
      const payload = message.payload !== undefined ? message.payload : message

      switch (type) {
        case 'register': {
          state.version = payload.version || payload.agentVersion || payload.versionId || null
          state.platform = payload.platform || null
          state.arch = payload.arch || null
          state.hostname = payload.hostname || null
          state.capabilities = payload.capabilities || []
          console.log(`   📋 代理信息: ${state.platform || 'unknown'} · ${state.hostname || 'unknown'} · v${state.version || 'unknown'}`)
          ack(ws, message)
          break
        }
        case 'heartbeat': {
          state.lastHeartbeatAt = new Date().toISOString()
          state.lastHeartbeat = payload
          state.devices = Array.isArray(payload.devices) ? payload.devices : []
          state.history = Array.isArray(payload.history) ? payload.history.slice(0, 50) : []
          state.telemetry = payload.telemetry || null
          ack(ws, message)
          break
        }
        case 'task_result': {
          handleTaskResult(message, state)
          break
        }
        case 'log_event': {
          if (payload.level && /error|warn/i.test(payload.level)) {
            state.lastError = payload.message || null
          }
          break
        }
        default:
          break
      }
    } catch (error) {
      // 忽略解析错误
    }
  })
  
  // 连接关闭
  ws.on('close', () => {
    console.log(`❌ 本地代理已断开: ${shopId}`)
    if (localAgents.get(shopId) === ws) {
      localAgents.delete(shopId)
    }
    markAgentDisconnected(shopId)
  })
  
  // 错误处理
  ws.on('error', (error) => {
    console.error(`❌ WebSocket 错误 (${shopId}):`, error.message)
    const agent = agentStates.get(shopId)
    if (agent) {
      agent.lastError = error.message
    }
  })
  
  // 心跳
  const heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping()
    } else {
      clearInterval(heartbeat)
    }
  }, 30000)
  
  ws.on('close', () => {
    clearInterval(heartbeat)
  })
})

// ============================================
// 启动服务器
// ============================================

server.listen(PORT, () => {
  console.log('')
  console.log('════════════════════════════════════════════════════════════')
  console.log('🚀 打印代理服务器已启动（本地代理模式）')
  console.log('════════════════════════════════════════════════════════════')
  console.log(`   HTTP 端口: ${PORT}`)
  console.log(`   WebSocket 路径: /print-agent`)
  console.log(`   打印接口: http://localhost:${PORT}/api/print`)
  console.log(`   健康检查: http://localhost:${PORT}/api/print/health`)
  console.log('════════════════════════════════════════════════════════════')
  console.log(`📝 编码支持: GBK (iconv-lite)`)
  console.log(`🔗 模式: 本地代理（无需 VPN）`)
  console.log(`🌍 环境: ${NODE_ENV}`)
  console.log(`🔗 CORS: 允许所有域名访问`)
  console.log('════════════════════════════════════════════════════════════\n')
})

// 错误处理
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error)
})

process.on('unhandledRejection', (error) => {
  console.error('未处理的Promise拒绝:', error)
})

