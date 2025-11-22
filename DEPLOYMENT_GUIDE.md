# 🚀 打印代理部署指南

## 📋 快速部署流程

### 首次部署（新服务器）

```bash
cd print-agent

# 1. 部署打印代理服务器
./scripts/deploy/deploy-to-server.sh

# 2. 部署管理后台
cd admin
./deploy-admin.sh

# 3. 配置域名（如果需要）
cd ..
./scripts/deploy/setup-printer-hub-domain.sh printer-hub.easyify.uk ops@easyify.uk
```

### 重新部署（IP 变化或重装系统）

```bash
cd print-agent

# 1. 更新部署脚本中的 IP（如果需要）
# 编辑 scripts/deploy/deploy-to-server.sh 和 admin/deploy-admin.sh
# 修改 SERVER_HOST="2.218.88.144"

# 2. 部署打印代理服务器
./scripts/deploy/deploy-to-server.sh

# 3. 部署管理后台
cd admin
./deploy-admin.sh
```

## 🔧 配置信息

### 当前配置

- **服务器 IP**: `2.218.88.144`
- **服务器用户**: `kevin`
- **域名**:
  - `printer-hub.easyify.uk` - 打印代理服务器
  - `pa.easyify.uk` - 管理后台
  - `ssh.easyify.uk` - SSH 访问

### 服务端口

- **打印代理服务器**: 3000 (本地)
- **管理后台**: 3001 (本地，通过 Nginx 代理)

### 部署方式

- **打印代理服务器**: PM2 或 Docker
- **管理后台**: PM2

## 📝 部署脚本说明

### 核心部署脚本

1. **`scripts/deploy/deploy-to-server.sh`**
   - 用途: 部署打印代理服务器
   - 功能: 上传文件、安装依赖、启动服务（PM2/Docker）
   - 位置: `print-agent/scripts/deploy/`

2. **`admin/deploy-admin.sh`**
   - 用途: 部署管理后台
   - 功能: 上传文件、安装依赖、启动 PM2、配置 Nginx
   - 位置: `print-agent/admin/`

3. **`scripts/deploy/setup-printer-hub-domain.sh`**
   - 用途: 配置域名和 SSL 证书
   - 功能: 配置 Nginx、申请 Let's Encrypt 证书
   - 位置: `print-agent/scripts/deploy/`

### 测试脚本

- **`scripts/test/test-new-ip.sh`** - 测试新 IP 连接
- **`scripts/test/test-printer-hub-domain.sh`** - 测试域名功能
- **`scripts/test/test-print-remote.sh`** - 测试远程打印

## 🧪 部署后验证

### 1. 检查服务状态

```bash
# SSH 到服务器
ssh kevin@2.218.88.144

# 检查 PM2 进程
pm2 list

# 检查服务健康
curl http://127.0.0.1:3000/api/print/health
```

### 2. 测试域名访问

```bash
# 运行测试脚本
cd print-agent
./scripts/test/test-printer-hub-domain.sh
```

### 3. 访问管理后台

```bash
# 浏览器访问
open https://pa.easyify.uk
```

## 📁 项目结构

```
print-agent/
├── server/                    # 打印代理服务器
│   ├── print-server.js        # 主程序
│   ├── package.json
│   ├── ecosystem.config.js    # PM2 配置
│   └── nginx.conf             # Nginx 配置
├── admin/                     # 管理后台
│   ├── admin-server.js
│   ├── deploy-admin.sh       # 部署脚本
│   └── public/
├── scripts/
│   ├── deploy/                # 部署脚本
│   │   ├── deploy-to-server.sh
│   │   └── setup-printer-hub-domain.sh
│   └── test/                  # 测试脚本
│       ├── test-new-ip.sh
│       └── test-printer-hub-domain.sh
├── docs/                      # 文档
│   └── deployment-archive/   # 归档文档
└── DEPLOYMENT_GUIDE.md        # 本文档
```

## 🔍 故障排查

### 问题：服务无法启动

```bash
# 查看 PM2 日志
ssh kevin@2.218.88.144 "pm2 logs print-agent-server"

# 检查端口占用
ssh kevin@2.218.88.144 "sudo ss -tulpn | grep 3000"
```

### 问题：域名无法访问

```bash
# 检查 DNS 解析
dig printer-hub.easyify.uk +short

# 检查 Nginx 配置
ssh kevin@2.218.88.144 "sudo nginx -t"
```

### 问题：SSL 证书问题

```bash
# 检查证书
ssh kevin@2.218.88.144 "sudo certbot certificates"

# 更新证书
ssh kevin@2.218.88.144 "sudo certbot renew"
```

## 📝 重要提示

1. **IP 地址变化**: 如果服务器 IP 变化，需要：
   - 更新部署脚本中的 `SERVER_HOST`
   - 更新 Cloudflare DNS 记录（自动或手动）
   - 重新部署服务

2. **配置文件**: 
   - 部署脚本中的 IP 地址需要手动更新
   - DNS 记录通过 Cloudflare 自动更新（如果已配置）

3. **服务重启**:
   ```bash
   ssh kevin@2.218.88.144 "pm2 restart all"
   ```

## 🔗 相关文档

- [项目 README](README.md)
- [架构文档](docs/architecture.md)
- [快速开始](docs/quick-start.md)
- [问题排查](docs/troubleshooting.md)

