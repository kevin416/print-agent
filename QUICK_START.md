# ⚡ 快速开始

## 🚀 一键部署

```bash
cd print-agent
./deploy.sh
```

就这么简单！脚本会自动：
1. 部署打印代理服务器
2. 部署管理后台
3. 测试部署结果

## 📋 部署前准备

### 必需信息

- **服务器 IP**: 2.218.88.144（当前）
- **服务器用户**: kevin
- **SSH 访问**: 已配置

### 可选配置

- **域名**: 
  - printer-hub.easyify.uk（打印代理）
  - pa.easyify.uk（管理后台）
- **SSL 证书**: 自动配置（如果使用域名）

## 🔧 IP 变化时

如果服务器 IP 变化：

1. **更新部署脚本中的 IP**
   ```bash
   # 编辑脚本
   nano scripts/deploy/deploy-to-server.sh
   # 修改 SERVER_HOST="新IP"
   
   nano admin/deploy-admin.sh
   # 修改 SERVER_HOST="新IP"
   ```

2. **运行部署**
   ```bash
   ./deploy.sh
   ```

3. **DNS 会自动更新**（如果配置了 Cloudflare 自动更新）

## 📝 详细文档

- [完整部署指南](DEPLOYMENT_GUIDE.md)
- [项目 README](README.md)
- [架构文档](docs/architecture.md)

