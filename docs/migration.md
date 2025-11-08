# 🔄 迁移指南

从 \`print-proxy-server\` 和 \`vpn-setup\` 迁移到新的 \`print-agent\` 项目。

## 主要变化

### ✅ 简化了什么

1. **移除了 VPN 相关代码**
   - 不再需要 VPN 服务器配置
   - 不再需要 VPN 客户端配置
   - 不再需要路由配置
   - 不再需要防火墙规则

2. **简化了服务器端代码**
   - 移除了 \`shops.conf\` 配置文件依赖
   - 移除了 VPN IP 识别逻辑
   - 移除了策略路由相关代码
   - 只保留本地代理模式

3. **简化了部署流程**
   - 服务器端：只需运行服务，无需网络配置
   - 本地代理端：只需配置 \`shopId\` 和 \`serverUrl\`

### 🔄 保持不变

1. **API 接口兼容**
   - \`/api/print\` 接口保持不变
   - 仍然需要 \`X-Shop-Name\` 请求头
   - 响应格式保持一致

2. **编码转换**
   - 仍然支持 UTF-8 → GBK 转换
   - 使用相同的 \`iconv-lite\` 库

3. **与 FastPrintLib 的集成**
   - 完全兼容现有的 FastPrintLib 代码
   - 只需要确保设置了 \`X-Shop-Name\` 请求头

## 迁移步骤

### 1. 服务器端迁移

#### 旧项目（print-proxy-server）

\`\`\`bash
# 旧项目需要：
- VPN 服务器配置
- shops.conf 配置文件
- 路由配置脚本
- 防火墙规则
\`\`\`

#### 新项目（print-agent）

\`\`\`bash
cd print-agent/server
npm install
npm start
# 就这么简单！
\`\`\`

**关键变化：**
- ❌ 不再需要 \`shops.conf\`
- ❌ 不再需要 VPN 配置
- ❌ 不再需要路由配置
- ✅ 只需要运行服务

### 2. 本地代理端迁移

#### 旧项目（print-proxy-server）

\`\`\`bash
# 旧项目需要：
- VPN 客户端配置
- 网络转发配置
- 复杂的路由设置
\`\`\`

#### 新项目（print-agent）

\`\`\`bash
cd print-agent/agent
npm install
cp config.example.json config.json
# 编辑 config.json，设置 shopId 和 serverUrl
npm start
\`\`\`

**关键变化：**
- ❌ 不再需要 VPN 客户端
- ❌ 不再需要网络配置
- ✅ 只需要配置 \`shopId\` 和 \`serverUrl\`

### 3. 代码迁移

#### FastPrintLib 使用

**旧代码（仍然有效）：**

\`\`\`typescript
const response = await fetch('https://printer1.easyify.uk/api/print?host=192.168.0.172&port=9100', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/octet-stream',
    'X-Shop-Name': 'shop1'  // 必需
  },
  body: printData
})
\`\`\`

**新代码（完全相同，域名保持不变）：**

\`\`\`typescript
// 代码完全一样，无需修改！域名保持向后兼容
const response = await fetch('https://printer1.easyify.uk/api/print?host=192.168.0.172&port=9100', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/octet-stream',
    'X-Shop-Name': 'shop1'  // 必需
  },
  body: printData
})
\`\`\`

### 4. Nginx 配置迁移

#### 旧配置

\`\`\`nginx
# 旧配置需要处理 VPN IP 转发
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    # 需要处理 VPN IP 识别
}
\`\`\`

#### 新配置

\`\`\`nginx
# 新配置只需要代理 HTTP 和 WebSocket
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

# WebSocket 代理（新增）
location /print-agent {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    # ... 其他配置
}
\`\`\`

## 配置对比

### 服务器端配置

| 项目 | 旧项目 | 新项目 |
|------|--------|--------|
| 配置文件 | \`shops.conf\` | 无需配置文件 |
| VPN 配置 | 必需 | 不需要 |
| 路由配置 | 必需 | 不需要 |
| 防火墙规则 | 必需 | 不需要 |
| 环境变量 | \`PORT\`, \`NODE_ENV\` | \`PORT\`, \`NODE_ENV\` |

### 本地代理配置

| 项目 | 旧项目 | 新项目 |
|------|--------|--------|
| VPN 客户端 | 必需 | 不需要 |
| 网络配置 | 必需 | 不需要 |
| 配置文件 | 复杂 | 简单的 \`config.json\` |
| shopId | 从 VPN IP 识别 | 直接配置 |

## 常见问题

### Q: 旧项目的代码还能用吗？

A: **可以！** API 接口完全兼容，只需要确保：
1. 服务器端运行新的 \`print-agent-server\`
2. 本地代理端运行新的 \`local-print-agent\`
3. 代码中设置了 \`X-Shop-Name\` 请求头

### Q: 需要修改 FastPrintLib 吗？

A: **不需要！** FastPrintLib 的代码完全兼容，域名保持不变（\`printer1.easyify.uk\` 和 \`printer2.easyify.uk\`），只需要确保：
1. \`proxyUrl\` 使用正确的域名（\`https://printer1.easyify.uk/api/print\` 或 \`https://printer2.easyify.uk/api/print\`）
2. 设置了 \`X-Shop-Name\` 请求头（如果 FastPrintLib 支持）

### Q: 如何验证迁移成功？

A: 检查以下几点：
1. 服务器健康检查：\`curl http://server/api/print/health\`
2. 本地代理连接：\`curl http://server/api/print/agents\`
3. 测试打印：发送一个测试打印请求

### Q: 可以同时运行旧项目和新项目吗？

A: **可以**，但需要：
1. 使用不同的端口
2. 确保本地代理连接到正确的服务器
3. 确保代码中的 \`proxyUrl\` 指向正确的服务器

## 回滚方案

如果新项目出现问题，可以：

1. **保持旧项目运行**：在迁移前不要停止旧服务
2. **切换代理地址**：修改代码中的 \`proxyUrl\` 指向旧服务器
3. **逐步迁移**：先迁移一个分店，验证成功后再迁移其他分店

## 优势总结

### 新项目的优势

1. ✅ **配置简单**：无需 VPN 和网络配置
2. ✅ **部署容易**：服务器和本地代理都只需运行服务
3. ✅ **维护方便**：代码更简洁，逻辑更清晰
4. ✅ **扩展性好**：添加新分店只需运行本地代理
5. ✅ **跨城市部署**：不受网络限制

### 何时使用新项目

- ✅ 新项目：推荐使用
- ✅ 需要简化配置：推荐使用
- ✅ 跨城市部署：推荐使用
- ⚠️ 已有 VPN 基础设施：可以继续使用旧项目，但建议迁移

## 下一步

1. 阅读 [快速开始](QUICK-START.md)
2. 查看 [完整文档](README.md)
3. 了解 [架构设计](ARCHITECTURE.md)
4. 参考 [部署指南](DEPLOYMENT.md)
