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
    const gbkBuffer = iconv.encode(textString, 'GBK')
    return gbkBuffer
  } catch (error) {
    console.error('编码转换失败:', error.message)
    return utf8Buffer
  }
}

// ============================================
// API 接口
// ============================================

/**
 * 打印接口
 * POST /api/print?host=192.168.0.172&port=9100
 * Headers: X-Shop-Name: shop-name
 * Body: 打印数据（UTF-8 编码）
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
    
    // 获取打印数据
    const utf8Data = req.body instanceof Buffer ? req.body : Buffer.from(req.body)
    
    console.log(`\n📄 收到打印请求: ${printerHost}:${printerPort}`)
    console.log(`   分店: ${shopName}`)
    console.log(`   数据大小: ${utf8Data.length} 字节 (UTF-8)`)
    
    // 通过本地代理发送
    const result = await sendViaLocalAgent(
      shopConfig.agent,
      shopName,
      printerHost,
      printerPort,
      utf8Data
    )
    
    res.json({
      success: true,
      bytesSent: result.bytesSent,
      printer: `${printerHost}:${printerPort}`,
      shop: shopName,
      mode: 'local_agent',
      encoding: 'GBK (本地代理转换)'
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
 */
function sendViaLocalAgent(agent, shopName, printerHost, printerPort, utf8Data) {
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
    
    // 发送打印任务（数据以 base64 编码传输）
    agent.send(JSON.stringify({
      type: 'print',
      taskId: taskId,
      printerIP: printerHost,
      port: printerPort,
      data: utf8Data.toString('base64'),
      encoding: 'base64'
    }))
    
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
  const agents = Array.from(localAgents.entries()).map(([shopId, ws]) => ({
    shopId,
    connected: ws.readyState === WebSocket.OPEN,
    readyState: ws.readyState
  }))
  
  res.json({
    agents,
    total: agents.length,
    connected: agents.filter(a => a.connected).length
  })
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
  
  // 处理消息
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString())
      if (message.type === 'register') {
        console.log(`   📋 代理信息: ${message.platform || 'unknown'} - ${message.hostname || 'unknown'}`)
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
  })
  
  // 错误处理
  ws.on('error', (error) => {
    console.error(`❌ WebSocket 错误 (${shopId}):`, error.message)
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

