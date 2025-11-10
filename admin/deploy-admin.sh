#!/bin/bash

# 管理后台部署脚本

set -e

SERVER_USER="kevin"
SERVER_HOST="90.195.120.165"
SERVER_PATH="~/print-agent/admin"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🚀 打印代理管理后台部署脚本"
echo "════════════════════════════════════════════════════════════"
echo ""

# 检查是否在正确的目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 上传文件
echo "📤 上传管理后台文件..."
scp admin-server.js $SERVER_USER@$SERVER_HOST:$SERVER_PATH/
scp package.json $SERVER_USER@$SERVER_HOST:$SERVER_PATH/
scp ecosystem.config.js $SERVER_USER@$SERVER_HOST:$SERVER_PATH/
scp nginx.conf $SERVER_USER@$SERVER_HOST:$SERVER_PATH/
scp -r public $SERVER_USER@$SERVER_HOST:$SERVER_PATH/

echo "📦 同步客户端安装包..."
rsync -av --delete ../updates/ $SERVER_USER@$SERVER_HOST:~/print-agent/updates/

# 部署
echo ""
echo "🔧 部署服务..."
ssh $SERVER_USER@$SERVER_HOST "SUDO_PASS='$SUDO_PASS' bash -s" << 'ENDSSH'
set -e

cd ~/print-agent/admin

echo "📦 安装依赖..."
npm install --production

echo ""
echo "🚀 启动服务（PM2）..."
pm2 start ecosystem.config.js || pm2 restart print-agent-admin

echo ""
echo "💾 保存 PM2 配置..."
pm2 save

echo ""
echo "✅ 部署完成！"
ENDSSH

echo ""
echo "📝 配置 Nginx..."
ssh $SERVER_USER@$SERVER_HOST "SUDO_PASS='$SUDO_PASS' bash -s" << 'ENDSSH'
set -e

cd ~/print-agent/admin

if [ -n "${SUDO_PASS:-}" ]; then
    sudo() { echo "$SUDO_PASS" | command sudo -S "$@"; }
fi

# 备份现有配置
if [ -f /etc/nginx/sites-available/pa.easyify.uk ]; then
    echo "📋 备份现有配置..."
    sudo cp /etc/nginx/sites-available/pa.easyify.uk /etc/nginx/sites-available/pa.easyify.uk.backup.$(date +%Y%m%d_%H%M%S)
fi

# 复制新配置
echo "📋 复制 Nginx 配置..."
sudo cp nginx.conf /etc/nginx/sites-available/pa.easyify.uk

# 创建符号链接
echo "📋 创建符号链接..."
sudo ln -sf /etc/nginx/sites-available/pa.easyify.uk /etc/nginx/sites-enabled/pa.easyify.uk

# 测试配置
echo "📋 测试 Nginx 配置..."
if sudo nginx -t; then
    echo "✅ Nginx 配置测试通过"
    # 重载 Nginx
    echo "📋 重载 Nginx..."
    sudo systemctl reload nginx
    echo "✅ Nginx 已重载"
else
    echo "❌ Nginx 配置测试失败"
    exit 1
fi
ENDSSH

echo ""
echo "✅ Nginx 配置完成！"
echo ""
