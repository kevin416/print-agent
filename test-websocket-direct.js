#!/usr/bin/env node

// 测试直接连接到服务器的 WebSocket

const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:3000/print-agent', {
  headers: {
    'X-Shop-Id': 'testclient'
  }
});

ws.on('open', () => {
  console.log('✅ WebSocket 连接成功！');
  ws.close();
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('❌ WebSocket 错误:', error.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('❌ 连接超时');
  process.exit(1);
}, 5000);
