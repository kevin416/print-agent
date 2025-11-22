#!/bin/bash

# 打印代理服务器部署脚本 - 新版本（无VPN）
# 部署到远程服务器
# 使用 PM2 或 Docker 部署
# 用法: ./deploy-to-server.sh

set -e

# 配置
SERVER_USER="kevin"
SERVER_HOST="2.218.88.144"  # 新 IP，或使用域名 printer-hub.easyify.uk
SERVER_PATH="~/print-agent"
OLD_PROXY_PATH="~/print-proxy-server"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🚀 打印代理服务器部署脚本（新版本 - 无VPN）"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "服务器: $SERVER_USER@$SERVER_HOST"
echo "部署路径: $SERVER_PATH"
echo ""

# 检查本地文件
if [ ! -d "server" ]; then
    echo "❌ 未找到 server 目录"
    exit 1
fi

if [ ! -f "server/print-server.js" ]; then
    echo "❌ 未找到 server/print-server.js"
    exit 1
fi

echo "✅ 本地文件检查完成"
echo ""

# 连接到服务器并停止旧服务
echo "🛑 停止旧服务..."
ssh $SERVER_USER@$SERVER_HOST << 'ENDSSH'
set -e

echo "📋 检查并停止 PM2 进程..."
# 停止所有相关的 PM2 进程
pm2 stop print-proxy 2>/dev/null || true
pm2 stop print-proxy-server 2>/dev/null || true
pm2 stop print-agent-admin 2>/dev/null || true
pm2 delete print-proxy 2>/dev/null || true
pm2 delete print-proxy-server 2>/dev/null || true
pm2 delete print-agent-admin 2>/dev/null || true

echo "📋 检查并停止 Docker 容器..."
# 停止所有相关的 Docker 容器
cd ~/print-proxy-server 2>/dev/null && docker compose down --remove-orphans 2>/dev/null || true
docker stop print-proxy-1 print-proxy-2 2>/dev/null || true
docker rm print-proxy-1 print-proxy-2 2>/dev/null || true

echo "✅ 旧服务已停止"
ENDSSH

echo ""

# 创建远程目录
echo "📁 创建远程目录..."
ssh $SERVER_USER@$SERVER_HOST "mkdir -p $SERVER_PATH/server/logs"

# 上传服务器端文件
echo "📤 上传服务器端文件..."
scp server/print-server.js $SERVER_USER@$SERVER_HOST:$SERVER_PATH/server/
scp server/package.json $SERVER_USER@$SERVER_HOST:$SERVER_PATH/server/
scp server/ecosystem.config.js $SERVER_USER@$SERVER_HOST:$SERVER_PATH/server/
scp server/Dockerfile $SERVER_USER@$SERVER_HOST:$SERVER_PATH/server/
scp server/docker-compose.yml $SERVER_USER@$SERVER_HOST:$SERVER_PATH/server/
scp server/nginx.conf $SERVER_USER@$SERVER_HOST:$SERVER_PATH/server/

echo "✅ 文件上传完成"
echo ""

# 部署方式（默认 PM2）
DEPLOY_MODE=${1:-pm2}
if [ "$DEPLOY_MODE" != "docker" ] && [ "$DEPLOY_MODE" != "pm2" ]; then
    DEPLOY_MODE="pm2"
fi

echo "📦 部署方式: $DEPLOY_MODE"
choice=$([ "$DEPLOY_MODE" = "docker" ] && echo "2" || echo "1")

# 在服务器上执行部署
if [ "$choice" = "2" ]; then
    echo "🔧 使用 Docker 部署..."
    ssh $SERVER_USER@$SERVER_HOST << 'ENDSSH'
set -e

cd ~/print-agent/server

echo "📦 检查 Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    exit 1
fi

echo "📦 检查 Docker..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装"
    exit 1
fi

echo "📦 安装依赖..."
npm install --production

echo ""
echo "🏗️  构建 Docker 镜像..."
docker compose build --no-cache

echo ""
echo "🚀 启动容器..."
docker compose up -d

echo ""
echo "⏳ 等待容器启动..."
sleep 10

echo ""
echo "📊 检查容器状态..."
docker ps | grep print-agent-server || echo "⚠️  未找到容器"

echo ""
echo "🧪 测试健康检查..."
if curl -f -s http://127.0.0.1:3000/api/print/health > /dev/null; then
    echo "✅ 服务健康"
    curl -s http://127.0.0.1:3000/api/print/health | jq . 2>/dev/null || curl -s http://127.0.0.1:3000/api/print/health
else
    echo "❌ 服务不健康"
    echo "查看日志: docker logs print-agent-server"
fi

echo ""
echo "✅ Docker 部署完成！"
ENDSSH
else
    echo "🔧 使用 PM2 部署..."
    ssh $SERVER_USER@$SERVER_HOST << 'ENDSSH'
set -e

cd ~/print-agent/server

echo "📦 检查 Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    exit 1
fi

echo "📦 检查 PM2..."
if ! command -v pm2 &> /dev/null; then
    echo "⚠️  PM2 未安装，正在安装..."
    npm install -g pm2
fi

echo "📦 安装依赖..."
npm install --production

echo ""
echo "🚀 启动服务（PM2）..."
pm2 start ecosystem.config.js || pm2 restart print-agent-server

echo ""
echo "⏳ 等待服务启动..."
sleep 5

echo ""
echo "📊 检查 PM2 状态..."
pm2 list | grep print-agent-server || echo "⚠️  未找到进程"

echo ""
echo "🧪 测试健康检查..."
if curl -f -s http://127.0.0.1:3000/api/print/health > /dev/null; then
    echo "✅ 服务健康"
    curl -s http://127.0.0.1:3000/api/print/health | jq . 2>/dev/null || curl -s http://127.0.0.1:3000/api/print/health
else
    echo "❌ 服务不健康"
    echo "查看日志: pm2 logs print-agent-server"
fi

echo ""
echo "💾 保存 PM2 配置..."
pm2 save

echo ""
echo "✅ PM2 部署完成！"
ENDSSH
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ 部署完成！"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "📋 服务信息："
echo "- 服务器地址: http://127.0.0.1:3000"
echo "- 健康检查: http://127.0.0.1:3000/api/print/health"
echo "- 已连接代理: http://127.0.0.1:3000/api/print/agents"
echo ""
if [ -n "${SUDO_PASS:-}" ]; then
  echo "📝 配置 Nginx..."
  ssh $SERVER_USER@$SERVER_HOST "SUDO_PASS='$SUDO_PASS'" <<'ENDSSH'
set -e

sudo_run() {
  if [ -n "$SUDO_PASS" ]; then
    printf '%s\n' "$SUDO_PASS" | sudo -S "$@"
  else
    sudo "$@"
  fi
}

cd ~/print-agent/server

if [ -f /etc/nginx/sites-available/print-agent ]; then
    echo "📋 备份现有配置..."
    sudo_run cp /etc/nginx/sites-available/print-agent /etc/nginx/sites-available/print-agent.backup.$(date +%Y%m%d_%H%M%S)
fi

echo "📋 复制 Nginx 配置..."
sudo_run cp nginx.conf /etc/nginx/sites-available/print-agent

echo "📋 创建符号链接..."
sudo_run ln -sf /etc/nginx/sites-available/print-agent /etc/nginx/sites-enabled/print-agent

echo "📋 测试 Nginx 配置..."
if sudo_run nginx -t; then
    echo "✅ Nginx 配置测试通过"
    echo "📋 重载 Nginx..."
    sudo_run systemctl reload nginx
    echo "✅ Nginx 已重载"
else
    echo "❌ Nginx 配置测试失败"
    echo "⚠️  请手动检查配置"
fi
ENDSSH
else
  echo "⚠️ 未提供 SUDO_PASS，跳过 Nginx 配置步骤"
fi

echo ""
echo "✅ Nginx 配置完成！"
echo ""
echo "🔐 配置 SSL 证书（如果需要）："
echo "sudo certbot --nginx -d printer1.easyify.uk -d printer2.easyify.uk"
echo ""
