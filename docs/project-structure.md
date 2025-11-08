# 📁 项目结构

```
print-agent/
├── agent/                     # 本地代理
│   ├── local-print-agent.js   # 主程序，连接服务器并转发打印任务
│   ├── package.json           # 依赖配置
│   ├── config.example.json    # 代理配置示例（复制为 config.json）
│   └── ...
│
├── server/                    # 服务器端（消息中继 / API）
│   ├── print-server.js        # HTTP + WebSocket 服务
│   ├── package.json           # 依赖配置
│   ├── ecosystem.config.js    # PM2 进程配置
│   ├── Dockerfile             # Docker 镜像构建
│   ├── docker-compose.yml     # Docker Compose 定义
│   └── nginx.conf             # 域名反向代理示例
│
├── admin/                     # 管理后台（分店 & 打印机管理）
│   ├── admin-server.js        # Express 后端（提供 API / 部署脚本）
│   ├── public/                # 前端静态资源（单页应用）
│   ├── deploy-admin.sh        # 一键部署脚本
│   ├── nginx.conf             # `pa.easyify.uk` Nginx 配置示例
│   ├── setup-ssl.sh           # Certbot 自动签发脚本
│   └── README.md              # 管理后台使用说明
│
├── docs/                      # 文档集合
│   ├── architecture.md        # 架构详解
│   ├── quick-start.md         # 快速开始（本地/生产）
│   ├── deployment.md          # 服务器部署手册
│   ├── migration.md           # 从旧版/代理迁移指南
│   ├── auto-start.md          # Windows WSL 自启动方案
│   ├── troubleshooting.md     # 调试与排错指南
│   └── project-structure.md   # 本文件
│
├── README.md                  # 顶层介绍，指向核心文档
├── ALL-FIXES-INTEGRATED.md    # 问题修复与历史记录
├── FIX-NGINX-CONFLICT.md      # Nginx 冲突处理手册
├── deploy-to-server.sh        # 服务器一键部署脚本
└── ...
```

## 文件说明

### 服务器端（`server/`）

- **print-server.js**: 主服务器文件，处理 HTTP 请求和 WebSocket 连接
- **package.json**: Node.js 依赖配置
- **ecosystem.config.js**: PM2 进程管理配置
- **Dockerfile**: Docker 镜像构建配置
- **docker-compose.yml**: Docker Compose 编排配置
- **nginx.conf**: Nginx 反向代理配置（支持 HTTP 和 WebSocket）

### 本地代理端（`agent/`）

- **local-print-agent.js**: 本地代理主文件，连接服务器并转发打印任务
- **package.json**: Node.js 依赖配置
- **config.example.json**: 配置文件示例（需要复制为 config.json 并修改）
- **.gitignore**: Git 忽略文件（忽略 config.json 和 node_modules）

### 管理后台（`admin/`）

- **admin-server.js**: 提供后台 API、部署脚本生成等功能；持久化数据保存在 `admin/data/`
- **public/**: 静态 HTML/JS/CSS（单页应用）
- **deploy-admin.sh**: SSH 一键部署脚本（上传、安装依赖、重启服务）
- **setup-ssl.sh**: 使用 Certbot 为 `pa.easyify.uk` 申请 SSL 证书
- **nginx.conf**: 管理后台的站点配置示例（HTTP + HTTPS）

### 文档（`docs/`）

- **architecture.md**: 架构与数据流
- **quick-start.md**: 本地体验与生产快速部署
- **deployment.md**: 服务器部署、脚本说明与验证
- **migration.md**: 旧 VPN/代理项目迁移到 print-agent 的步骤
- **auto-start.md**: Windows / WSL 自启动方案（PM2 + 计划任务）
- **troubleshooting.md**: 服务器/代理/打印机/WSL 常见问题排查
- **project-structure.md**: 本文件，用于快速了解仓库结构

## 依赖说明

### 服务器端依赖

- `express`: HTTP 服务器框架
- `ws`: WebSocket 服务器
- `iconv-lite`: 字符编码转换（UTF-8 → GBK）

### 本地代理端依赖

- `ws`: WebSocket 客户端
- `iconv-lite`: 字符编码转换（UTF-8 → GBK）

### 本地代理配置

编辑 `agent/config.json`：

```json
{
  "shopId": "<分店标识>",
  "serverUrl": "ws://printer1.easyify.uk/print-agent",
  "reconnectInterval": 5000,
  "heartbeatInterval": 30000,
  "logLevel": "info",
  "enableStatusServer": true,
  "printers": ["192.168.0.172"]
}
```

## 其他资源

- `deploy-to-server.sh`: 服务器一键部署脚本（PM2 / Docker）
- `ALL-FIXES-INTEGRATED.md`: 所有补丁与临时修复的汇总
- `FIX-NGINX-CONFLICT.md`: 当旧代理的 Nginx 配置冲突时的处理步骤
