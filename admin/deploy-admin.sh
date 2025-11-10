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

# 获取项目根目录（admin 的父目录）
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
UPDATES_DIR="$PROJECT_ROOT/updates"

# 配置 SSH agent 以避免重复输入密码
echo "🔐 配置 SSH agent..."
if [ -z "$SSH_AUTH_SOCK" ]; then
    # 启动 SSH agent（如果未运行）
    eval "$(ssh-agent -s)" > /dev/null
    # 添加默认 SSH 密钥
    if [ -f ~/.ssh/id_ed25519 ]; then
        ssh-add ~/.ssh/id_ed25519 2>/dev/null || true
    elif [ -f ~/.ssh/id_rsa ]; then
        ssh-add ~/.ssh/id_rsa 2>/dev/null || true
    fi
fi

# 使用 SSH ControlMaster 复用连接（可选，进一步优化）
SSH_OPTS="-o ControlMaster=auto -o ControlPath=~/.ssh/control-%r@%h:%p -o ControlPersist=300"

# 上传文件（使用 SSH 选项）
echo "📤 上传管理后台文件..."
scp $SSH_OPTS admin-server.js $SERVER_USER@$SERVER_HOST:$SERVER_PATH/
scp $SSH_OPTS package.json $SERVER_USER@$SERVER_HOST:$SERVER_PATH/
scp $SSH_OPTS ecosystem.config.js $SERVER_USER@$SERVER_HOST:$SERVER_PATH/
scp $SSH_OPTS nginx.conf $SERVER_USER@$SERVER_HOST:$SERVER_PATH/
scp $SSH_OPTS -r public $SERVER_USER@$SERVER_HOST:$SERVER_PATH/

# 同步客户端安装包
echo "📦 同步客户端安装包..."
if [ ! -d "$UPDATES_DIR" ]; then
    echo "⚠️  警告：未找到 updates 目录: $UPDATES_DIR"
    echo "   跳过客户端安装包上传"
else
    echo "   源目录: $UPDATES_DIR"
    echo "   目标: $SERVER_USER@$SERVER_HOST:~/print-agent/updates/"
    rsync $SSH_OPTS -av --delete "$UPDATES_DIR/" $SERVER_USER@$SERVER_HOST:~/print-agent/updates/
    echo "✅ 客户端安装包同步完成"
fi

# 部署
echo ""
echo "🔧 部署服务..."
ssh $SSH_OPTS $SERVER_USER@$SERVER_HOST "SUDO_PASS='$SUDO_PASS' bash -s" << 'ENDSSH'
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
ssh $SSH_OPTS $SERVER_USER@$SERVER_HOST "SUDO_PASS='$SUDO_PASS' bash -s" << 'ENDSSH'
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

# 清理 SSH ControlMaster 连接（可选）
ssh $SSH_OPTS -O exit $SERVER_USER@$SERVER_HOST 2>/dev/null || true
