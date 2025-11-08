# 🚀 管理后台部署指南

## 部署步骤

| 步骤 | 内容 |
| ---- | ---- |
| 1 | 将仓库同步到服务器：`~/print-agent/admin` |
| 2 | 运行部署脚本：`./deploy-admin.sh`（上传、安装依赖、重启 PM2） |
| 3 | 配置 Nginx：`sudo cp nginx.conf ...`（脚本会提示命令） |
| 4 | （可选）申请 SSL：`./setup-ssl.sh` 或 `sudo certbot --nginx -d pa.easyify.uk` |
| 5 | 验证访问：https://pa.easyify.uk |

> `deploy-admin.sh` 会自动执行以下动作：
> - `scp` 上传 `admin-server.js`、`package.json`、`public/` 等文件
> - `npm install --production`
> - `pm2 start/ restart print-agent-admin`
> - 提示 Nginx 配置命令（保留在日志中方便复制）

### 手动部署（备用流程）

1. 安装依赖：
   ```bash
   cd ~/print-agent/admin
   npm install --production
   ```
2. 使用 PM2 启动/重启：
   ```bash
   pm2 start ecosystem.config.js || pm2 restart print-agent-admin
   pm2 save
   ```
3. 配置 Nginx（只需第一次）：
   ```bash
   sudo cp nginx.conf /etc/nginx/sites-available/pa.easyify.uk
   sudo ln -sf /etc/nginx/sites-available/pa.easyify.uk /etc/nginx/sites-enabled/pa.easyify.uk
   sudo nginx -t && sudo systemctl reload nginx
   ```
4. 申请/续签 SSL（选用 Let's Encrypt）：
   ```bash
   sudo certbot --nginx -d pa.easyify.uk
   ```

## 访问

- **HTTP**: http://pa.easyify.uk
- **HTTPS**: https://pa.easyify.uk（配置 SSL 后）

## 功能

1. **分店管理**：增删改查、查看在线状态
2. **打印机管理**：配置 IP/端口/类型，支持在线测试
3. **一键部署**：生成 curl + bash 脚本（包含 PM2/自启动 instructions）
4. **工具下载**：WSL 网络修复脚本、最新代理客户端

## 环境变量

- `PORT`: 服务端口（默认：3004）
- `PRINT_SERVER_URL`: 打印服务器地址（默认：http://127.0.0.1:3000）

## 数据存储

管理后台会在 `data/shops.json` 中持久化分店及打印机信息。
请将 `admin/data/` 目录加入备份策略，避免重装/部署时丢失数据。

## 验证

```bash
# 查看 PM2 状态
pm2 list | grep print-agent-admin

# 验证健康检查
curl -s http://127.0.0.1:3004/api/shops | jq . | head
```



