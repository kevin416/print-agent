# 🚀 部署指南

## 服务器部署

### 方式一：PM2 部署（推荐）

#### 1. 安装依赖

\`\`\`bash
cd server
npm install
\`\`\`

#### 2. 创建日志目录

\`\`\`bash
mkdir -p logs
\`\`\`

#### 3. 启动服务

\`\`\`bash
npm run pm2
\`\`\`

#### 4. 查看日志

\`\`\`bash
npm run pm2:logs
\`\`\`

#### 5. 停止服务

\`\`\`bash
npm run pm2:stop
\`\`\`

#### 6. 重启服务

\`\`\`bash
npm run pm2:restart
\`\`\`

### 方式二：Docker 部署

#### 1. 构建镜像

\`\`\`bash
cd server
docker-compose build
\`\`\`

#### 2. 启动容器

\`\`\`bash
docker-compose up -d
\`\`\`

#### 3. 查看日志

\`\`\`bash
docker-compose logs -f
\`\`\`

#### 4. 停止容器

\`\`\`bash
docker-compose down
\`\`\`

### 方式三：Nginx 反向代理

#### 1. 安装 Nginx

\`\`\`bash
# Ubuntu/Debian
sudo apt-get install nginx

# CentOS/RHEL
sudo yum install nginx
\`\`\`

#### 2. 复制配置文件

\`\`\`bash
sudo cp server/nginx.conf /etc/nginx/sites-available/print-agent
\`\`\`

#### 3. 编辑配置文件（可选）

配置文件已包含两个域名（与之前相同）：
- \`printer1.easyify.uk\`
- \`printer2.easyify.uk\`

两个域名都指向同一个服务（端口 3000），保持向后兼容。如果需要修改，可以编辑配置文件。

#### 4. 启用配置

\`\`\`bash
sudo ln -s /etc/nginx/sites-available/print-agent /etc/nginx/sites-enabled/
\`\`\`

#### 5. 测试配置

\`\`\`bash
sudo nginx -t
\`\`\`

#### 6. 重载 Nginx

\`\`\`bash
sudo systemctl reload nginx
\`\`\`

#### 7. 配置 SSL（可选）

使用 Let's Encrypt 申请 SSL 证书：

\`\`\`bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d printer1.easyify.uk -d printer2.easyify.uk
\`\`\`

然后取消注释 \`nginx.conf\` 中的 HTTPS 配置。

## 本地代理部署

### Windows 部署

#### 1. 安装 Node.js

下载并安装 Node.js v18+：
https://nodejs.org/

#### 2. 下载项目

\`\`\`bash
git clone <repository-url>
cd print-agent/agent
\`\`\`

#### 3. 安装依赖

\`\`\`bash
npm install
\`\`\`

#### 4. 配置

\`\`\`bash
copy config.example.json config.json
\`\`\`

编辑 \`config.json\`：

\`\`\`json
{
  "shopId": "shop1",
  "serverUrl": "ws://printer1.easyify.uk/print-agent",
  "reconnectInterval": 5000,
  "heartbeatInterval": 30000,
  "logLevel": "info",
  "enableStatusServer": true,
  "rejectUnauthorized": false
}
\`\`\`

#### 5. 启动服务

\`\`\`bash
npm start
\`\`\`

### Windows 开机自启动

#### 方法一：使用 PM2（推荐）

1. 安装 PM2：

\`\`\`bash
npm install -g pm2
npm install -g pm2-windows-startup
\`\`\`

2. 启动服务：

\`\`\`bash
pm2 start local-print-agent.js --name print-agent
\`\`\`

3. 设置开机自启动：

\`\`\`bash
pm2-startup install
pm2 save
\`\`\`

#### 方法二：使用 Windows 任务计划程序

1. 打开任务计划程序
2. 创建基本任务
3. 触发器：当计算机启动时
4. 操作：启动程序
5. 程序：\`node.exe\`
6. 参数：\`C:\\path\\to\\print-agent\\agent\\local-print-agent.js\`
7. 起始于：\`C:\\path\\to\\print-agent\\agent\`

### 打包成可执行文件

#### 1. 安装 pkg

\`\`\`bash
npm install -g pkg
\`\`\`

#### 2. 打包

\`\`\`bash
cd agent
pkg local-print-agent.js --targets node18-win-x64 --output print-agent.exe
\`\`\`

#### 3. 运行

\`\`\`bash
./print-agent.exe
\`\`\`

### Linux 部署

#### 1. 安装 Node.js

\`\`\`bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
\`\`\`

#### 2. 下载项目

\`\`\`bash
git clone <repository-url>
cd print-agent/agent
\`\`\`

#### 3. 安装依赖

\`\`\`bash
npm install
\`\`\`

#### 4. 配置

\`\`\`bash
cp config.example.json config.json
# 编辑 config.json
\`\`\`

#### 5. 使用 PM2 启动

\`\`\`bash
npm install -g pm2
pm2 start local-print-agent.js --name print-agent
pm2 startup
pm2 save
\`\`\`

## 验证部署

### 1. 检查服务器状态

\`\`\`bash
curl http://localhost:3000/api/print/health
\`\`\`

### 2. 检查本地代理连接

启动本地代理后，再次检查服务器状态：

\`\`\`bash
curl http://localhost:3000/api/print/agents
\`\`\`

应该返回已连接的分店列表。

### 3. 测试打印

使用 curl 测试打印：

\`\`\`bash
curl -X POST \
  "http://localhost:3000/api/print?host=192.168.0.172&port=9100" \
  -H "X-Shop-Name: shop1" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @test.txt
\`\`\`

## 故障排查

### 服务器无法启动

1. 检查端口是否被占用：

\`\`\`bash
lsof -i :3000
\`\`\`

2. 检查日志：

\`\`\`bash
# PM2
npm run pm2:logs

# Docker
docker-compose logs
\`\`\`

### 本地代理无法连接

1. 检查服务器地址是否正确
2. 检查网络连接
3. 检查防火墙设置
4. 检查服务器日志

### 打印失败

1. 检查本地代理是否已连接
2. 检查打印机 IP 是否正确
3. 检查打印机是否开机
4. 检查本地代理日志

## 监控

### 服务器监控

- 健康检查：\`/api/print/health\`
- 连接状态：\`/api/print/agents\`
- PM2 监控：\`pm2 monit\`
- Docker 监控：\`docker stats\`

### 本地代理监控

- 状态接口：\`http://127.0.0.1:<port>/status\`
- 日志文件：查看控制台输出
- PM2 监控：\`pm2 monit\`
