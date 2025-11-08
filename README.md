# 🖨️ Print Agent - 打印代理服务

一个简洁的打印代理服务，通过 **本地代理模式** 完成跨网络打印，**无需 VPN**。

- 服务器（`server/`）负责接收 Web/REST 请求并转发到本地代理
- 本地代理（`agent/`）运行在分店 Windows / WSL 设备，与打印机建立 TCP 连接
- 管理后台（`admin/`）用于管理分店、打印机并生成一键部署脚本

> 📚 所有文档已经集中到 [`docs/`](docs/) 目录：
> - [架构概述](docs/architecture.md)
> - [快速开始](docs/quick-start.md)
> - [部署手册](docs/deployment.md)
> - [迁移指南](docs/migration.md)
> - [自启动方案](docs/auto-start.md)
> - [问题排查](docs/troubleshooting.md)

## 🔭 总览

```
浏览器 / Web 应用 (FastPrintLib)
        │  HTTP /api/print
        ▼
服务器 (print-agent-server)
        │  WebSocket (ws://printer*.easyify.uk/print-agent)
        ▼
本地代理 (local-print-agent)
        │  TCP 192.168.x.x:9100
        ▼
打印机 (分店内网)
```

1. 本地代理运行在分店电脑上，直接访问打印机
2. 服务器只负责消息转发与在线状态管理，不需要进入分店网络
3. 通过 WebSocket 维持长连接，保证打印任务实时送达

## ⚡ 快速体验

```bash
# 服务器（本地或云端）
cd server && npm install && npm start

# 本地代理（分店电脑）
cd agent
cp config.example.json config.json   # 设置 shopId / serverUrl
npm install
npm start
```

详细步骤（含 Docker、PM2、自启动等）请查看 [docs/quick-start.md](docs/quick-start.md) 与 [docs/deployment.md](docs/deployment.md)。

## 🌐 管理后台

- 地址：<https://pa.easyify.uk>
- 功能：分店/打印机管理、打印测试、一键部署脚本、WSL 修复工具
- 部署脚本：`./deploy-admin.sh`（详情见 `admin/DEPLOYMENT.md`）

## 🔌 与 FastPrintLib 集成

```ts
const response = await fetch('https://printer1.easyify.uk/api/print?host=192.168.0.172&port=9100', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/octet-stream',
    'X-Shop-Name': 'shop1'
  },
  body: printData
})
```

> `X-Shop-Name` 必须与本地代理 `config.json` 中的 `shopId` 一致。

## 🛠️ 常用命令

```bash
# 部署服务器端（SSH）
./deploy-to-server.sh          # PM2 / Docker 一键部署

# 管理后台
cd admin && ./deploy-admin.sh

# 查看服务器状态
pm2 list
curl http://127.0.0.1:3000/api/print/health | jq .

# 测试打印（本地脚本）
./test-print-now.sh 192.168.0.172
```

更多调试方法请参考 [docs/troubleshooting.md](docs/troubleshooting.md)。
# print-agent
