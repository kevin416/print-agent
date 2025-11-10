# 🖨️ Print Agent - 打印代理服务

一个简洁的打印代理服务，通过 **本地代理模式** 完成跨网络打印，**无需 VPN**。

- **服务器**（`server/`）负责接收 Web/REST 请求并转发到本地代理
- **本地代理**（`agent/`）运行在分店 Windows / WSL 设备，与打印机建立 TCP 连接
- **Yepos Agent**（`local-usb-agent-app/`）Electron 桌面应用，支持 USB 和 TCP 打印机，提供图形界面和自动更新
- **管理后台**（`admin/`）用于管理分店、打印机、生成一键部署脚本，并提供客户端下载

> 📚 所有文档已经集中到 [`docs/`](docs/) 目录：
> - [架构概述](docs/architecture.md)
> - [快速开始](docs/quick-start.md)
> - [部署手册](docs/deployment.md)
> - [迁移指南](docs/migration.md)
> - [自启动方案](docs/auto-start.md)
> - [问题排查](docs/troubleshooting.md)
> - [本地 USB Agent 方案（新）](docs/local-usb-agent.md)

## 🔭 总览

### 架构流程

```
浏览器 / Web 应用 (FastPrintLib)
        │  HTTP /api/print
        ▼
服务器 (print-agent-server)
        │  WebSocket (ws://printer*.easyify.uk/print-agent)
        ▼
本地代理 (local-print-agent 或 Yepos Agent)
        │  TCP 192.168.x.x:9100 或 USB 直连
        ▼
打印机 (分店内网)
```

### 两种本地代理方案

1. **命令行代理**（`agent/`）：轻量级 Node.js 脚本，适合服务器环境
2. **Yepos Agent**（`local-usb-agent-app/`）：Electron 桌面应用，支持 USB/TCP，提供图形界面

### 核心特性

- 本地代理运行在分店电脑上，直接访问打印机
- 服务器只负责消息转发与在线状态管理，不需要进入分店网络
- 通过 WebSocket 维持长连接，保证打印任务实时送达
- 支持 USB 和 TCP 网络打印机
- 自动更新、心跳监控、远程配置

## ⚡ 快速体验

### 方案一：Yepos Agent（推荐）

1. 从管理后台下载安装包：<https://pa.easyify.uk>
2. 安装并运行，首次启动会引导配置
3. 设置 Shop ID 和默认打印机
4. 应用会自动在后台运行，支持系统自启动

详细文档请查看 [`local-usb-agent-app/README.md`](local-usb-agent-app/README.md)

### 方案二：命令行代理

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

- **地址**：<https://pa.easyify.uk>
- **功能**：
  - 分店/打印机管理
  - 打印测试（远程触发）
  - 一键部署脚本生成
  - 客户端下载（自动显示最新版本）
  - Agent 心跳监控与远程配置
  - 打印历史查看
  - 异常告警
- **部署脚本**：`cd admin && ./deploy-admin.sh`（详情见 `admin/DEPLOYMENT.md`）

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

### 服务器部署

```bash
# 部署服务器端（SSH）
./deploy-to-server.sh          # PM2 / Docker 一键部署

# 配置 Nginx + HTTPS 到 printer-hub.easyify.uk
./setup-printer-hub-domain.sh printer-hub.easyify.uk ops@easyify.uk

# 管理后台
cd admin && ./deploy-admin.sh

# 查看服务器状态
pm2 list
curl http://127.0.0.1:3000/api/print/health | jq .
```

### 客户端打包与发布

#### 自动打包脚本（推荐）

**macOS/Linux:**
```bash
./deploy-client.sh
```

**Windows:**
```batch
# 方式 1：使用批处理文件（推荐，无需额外安装）
deploy-client.bat
# 或
deploy-client.cmd

# 方式 2：使用 Git Bash（需要先安装 Git for Windows）
# 安装 Git: https://git-scm.com/download/win
# 安装后，在 Git Bash 中运行：
bash deploy-client.sh

# 方式 3：使用 WSL（需要先安装 WSL）
# 安装 WSL: wsl --install
# 安装后，在 PowerShell 或 CMD 中运行：
wsl bash deploy-client.sh

# 方式 4：使用 PowerShell Core 7+（需要先安装）
# 安装: https://aka.ms/powershell-release?tag=stable
# 安装后运行：
pwsh deploy-client.ps1

# 方式 5：直接运行 PowerShell 脚本（可能遇到编码问题）
.\deploy-client.ps1
```

> **Windows 使用说明**：
> - **最简单方式**：直接双击 `deploy-client.bat` 或 `deploy-client.cmd`（无需安装任何工具）
> - **Git Bash**：如果已安装 Git for Windows，可以在 Git Bash 终端中运行 `bash deploy-client.sh`
> - **WSL**：如果已安装 WSL，可以在 PowerShell/CMD 中运行 `wsl bash deploy-client.sh`
> - **编码问题**：如果 PowerShell 脚本出现中文乱码，优先使用批处理文件或 Git Bash

#### 手动打包

```bash
cd local-usb-agent-app

# Windows 端打包
npm run build                  # 或 npx electron-builder --win --x64
npx electron-builder --win --x64 --dir  # 仅打包 ZIP 便携版

# macOS 端打包
npx electron-builder --mac --arm64      # Apple Silicon
npx electron-builder --mac --x64        # Intel
npx electron-builder --mac              # 同时打包 ARM64 和 x64

# Linux 端打包
npx electron-builder --linux
```

> **注意**：
> - Windows 安装包需要在 Windows 系统上构建，macOS 安装包需要在 macOS 系统上构建
> - Windows 上可以使用 PowerShell 脚本（`deploy-client.ps1`）或 Git Bash/WSL 运行 bash 脚本
> - 上传到服务器需要 SSH 访问权限，Windows 上可以使用 Git Bash、WSL 或手动上传

### 测试

```bash
# 测试打印（本地脚本）
./test-print-now.sh 192.168.0.172
```

更多调试方法请参考 [docs/troubleshooting.md](docs/troubleshooting.md)。

## 📦 项目结构

```
print-agent/
├── server/              # 打印服务器（WebSocket 转发）
├── agent/               # 命令行本地代理（Node.js）
├── local-usb-agent-app/ # Yepos Agent 桌面应用（Electron）
├── admin/               # 管理后台（Web 界面）
├── updates/             # 客户端安装包存储
├── docs/                # 文档目录
└── deploy-client.sh     # 客户端打包上传脚本
```

详细结构说明请查看 [docs/project-structure.md](docs/project-structure.md)。
