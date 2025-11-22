# 打印代理新 IP 部署指南

## 📋 更新状态

已更新以下文件中的 IP 地址：

### ✅ 已更新的文件

1. **部署脚本**
   - `deploy-to-server.sh` - 服务器部署脚本
   - `admin/deploy-admin.sh` - 管理后台部署脚本
   - `setup-printer-hub-domain.sh` - 域名设置脚本

2. **测试脚本**
   - `test-print-remote.sh` - 远程打印测试

3. **SSH 脚本**
   - `ssh/add-ssh-key-to-server.sh`
   - `ssh/add-new-computer-key.sh`
   - `ssh/manage-ssh-keys.sh`

4. **配置文件**
   - `admin/public/index.html` - RustDesk 配置（已更新为域名）

### 📝 IP 地址变更

- **旧 IP**: `90.195.120.165`
- **新 IP**: `2.218.88.144`
- **域名**: 
  - `printer-hub.easyify.uk` - 打印代理服务器
  - `pa.easyify.uk` - 管理后台
  - `ssh.easyify.uk` - SSH 访问

## 🚀 部署流程

### 步骤 1: 测试服务器连接

```bash
# 测试 SSH 连接
ssh kevin@2.218.88.144

# 或使用域名
ssh kevin@ssh.easyify.uk
```

### 步骤 2: 部署打印代理服务器

```bash
cd print-agent

# 部署服务器端
./deploy-to-server.sh

# 选择部署方式：
# 1) PM2 (推荐)
# 2) Docker
```

**部署内容**:
- 上传 `server/` 目录文件
- 安装依赖
- 启动服务（PM2 或 Docker）
- 配置 Nginx（如果需要）

### 步骤 3: 部署管理后台

```bash
cd print-agent/admin

# 部署管理后台
./deploy-admin.sh

# 选择是否上传客户端安装包：
# 1) 是 - 完整部署（包含客户端安装包）
# 2) 否 - 仅更新管理后台（快速）
```

**部署内容**:
- 上传管理后台文件
- 上传客户端安装包（可选）
- 启动 PM2 服务
- 配置 Nginx

### 步骤 4: 配置域名（如果需要）

```bash
# 配置打印代理服务器域名
./setup-printer-hub-domain.sh printer-hub.easyify.uk

# 管理后台域名已在 deploy-admin.sh 中配置
```

### 步骤 5: 验证服务

```bash
# 测试打印代理服务器
curl http://2.218.88.144:3000/api/print/health
# 或
curl http://printer-hub.easyify.uk/api/print/health

# 测试管理后台
curl https://pa.easyify.uk
```

## 🔍 检查服务状态

### 在服务器上检查

```bash
# SSH 到服务器
ssh kevin@2.218.88.144

# 检查打印代理服务器（PM2）
pm2 list | grep print-agent-server
pm2 logs print-agent-server

# 检查管理后台（PM2）
pm2 list | grep print-agent-admin
pm2 logs print-agent-admin

# 检查 Docker（如果使用）
docker ps | grep print-agent
docker logs print-agent-server

# 检查 Nginx
sudo nginx -t
sudo systemctl status nginx
```

### 检查端口监听

```bash
# 在服务器上
sudo ss -tulpn | grep -E "3000|3001"
```

## 🧪 测试流程

### 1. 测试服务器连接

```bash
# 测试 SSH
ssh kevin@2.218.88.144 "echo '连接成功'"

# 测试 HTTP
curl -I http://2.218.88.144:3000/api/print/health
```

### 2. 测试打印功能

```bash
# 使用测试脚本
./test-print-remote.sh
```

### 3. 测试管理后台

```bash
# 访问管理后台
open https://pa.easyify.uk
# 或
curl https://pa.easyify.uk
```

## 📝 配置说明

### 服务器配置

- **服务器 IP**: `2.218.88.144`
- **打印代理端口**: `3000`
- **管理后台端口**: `3001`（通过 Nginx 代理）

### 域名配置

- **打印代理**: `printer-hub.easyify.uk` → `2.218.88.144:3000`
- **管理后台**: `pa.easyify.uk` → `2.218.88.144:3001`
- **SSH**: `ssh.easyify.uk` → `2.218.88.144:22`

### RustDesk 配置

管理后台显示的 RustDesk 配置：
- **ID服务器**: `rustdesk.easyify.uk:21116`
- **中继服务器**: `rustdesk.easyify.uk:21117`
- **密钥**: `VhrFMc1CL7jkcVmcwxdXI6KSkmRa6fuDtWKKM60vc1Q=`

## ⚠️ 注意事项

1. **DNS 记录**: 确保域名 DNS 记录已更新到新 IP
   ```bash
   dig printer-hub.easyify.uk +short
   dig pa.easyify.uk +short
   ```

2. **防火墙**: 确保服务器防火墙允许端口
   ```bash
   sudo ufw allow 3000/tcp
   sudo ufw allow 3001/tcp
   sudo ufw allow 22/tcp
   ```

3. **SSL 证书**: 如果使用 HTTPS，确保 SSL 证书有效
   ```bash
   sudo certbot certificates
   ```

4. **服务重启**: 部署后可能需要重启服务
   ```bash
   pm2 restart all
   # 或
   docker compose restart
   ```

## 🔧 故障排查

### 问题：无法连接服务器

```bash
# 检查网络连接
ping 2.218.88.144

# 检查 SSH
ssh -v kevin@2.218.88.144
```

### 问题：服务无法启动

```bash
# 检查日志
pm2 logs print-agent-server
pm2 logs print-agent-admin

# 检查端口占用
sudo ss -tulpn | grep 3000
```

### 问题：Nginx 配置错误

```bash
# 测试配置
sudo nginx -t

# 查看错误日志
sudo tail -f /var/log/nginx/error.log
```

## 📋 快速部署命令

```bash
# 完整部署流程
cd print-agent

# 1. 部署服务器
./deploy-to-server.sh

# 2. 部署管理后台
cd admin
./deploy-admin.sh

# 3. 测试
cd ..
./test-print-remote.sh
```

## ✅ 完成检查清单

- [ ] SSH 连接正常
- [ ] 打印代理服务器部署成功
- [ ] 管理后台部署成功
- [ ] Nginx 配置正确
- [ ] SSL 证书有效（如果使用 HTTPS）
- [ ] 服务正常运行
- [ ] 测试打印功能正常
- [ ] 管理后台可以访问

