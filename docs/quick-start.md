# ⚡ 快速开始

## 5 分钟快速部署

### 1. 服务器端（1 分钟）

\`\`\`bash
cd server
npm install
npm start
\`\`\`

服务器将在 \`http://localhost:3000\` 启动。

### 2. 本地代理端（2 分钟）

\`\`\`bash
cd agent
npm install
cp config.example.json config.json
# 编辑 config.json，设置 shopId 和 serverUrl
npm start
\`\`\`

### 3. 测试连接（1 分钟）

在浏览器中打开：
\`\`\`
http://localhost:3000/api/print/health
\`\`\`

应该看到：
\`\`\`json
{
  "status": "ok",
  "connectedAgents": 1,
  "agents": ["shop1"]
}
\`\`\`

### 4. 测试打印（1 分钟）

使用 curl 测试：

\`\`\`bash
curl -X POST \
  "http://localhost:3000/api/print?host=192.168.0.172&port=9100" \
  -H "X-Shop-Name: shop1" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "测试打印"
\`\`\`

## 与 FastPrintLib 集成

### 在代码中使用

\`\`\`typescript
// 设置打印服务（生产环境使用域名）
const response = await fetch('https://printer1.easyify.uk/api/print?host=192.168.0.172&port=9100', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/octet-stream',
    'X-Shop-Name': 'shop1'  // 分店标识
  },
  body: printData  // UTF-8 编码的打印数据
})

const result = await response.json()
console.log(result)
\`\`\`

## 生产环境部署

### 服务器端

#### 使用 PM2

\`\`\`bash
cd server
npm install
npm run pm2
\`\`\`

#### 使用 Docker

\`\`\`bash
cd server
docker-compose up -d
\`\`\`

### 本地代理端

#### Windows 开机自启动

\`\`\`bash
npm install -g pm2 pm2-windows-startup
pm2 start local-print-agent.js --name print-agent
pm2-startup install
pm2 save
\`\`\`

## 常见问题

### Q: 本地代理连接失败？

A: 检查：
1. \`config.json\` 中的 \`serverUrl\` 是否正确
2. 服务器是否正在运行
3. 网络连接是否正常

### Q: 打印请求返回 503？

A: 检查：
1. 本地代理是否已连接
2. \`X-Shop-Name\` 头是否与 \`shopId\` 一致

### Q: 打印机连接超时？

A: 检查：
1. 打印机 IP 是否正确
2. 打印机是否开机
3. 本地代理和打印机是否在同一网络

## 下一步

- 查看 [完整文档](README.md)
- 查看 [架构说明](ARCHITECTURE.md)
- 查看 [部署指南](DEPLOYMENT.md)
