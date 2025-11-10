#!/bin/bash

# 🔐 添加SSH公钥到服务器脚本
# 用途：将当前电脑的SSH公钥添加到远程服务器的authorized_keys文件中

set -euo pipefail

SERVER_USER="${SERVER_USER:-kevin}"
SERVER_HOST="${SERVER_HOST:-90.195.120.165}"
SERVER="${SERVER_USER}@${SERVER_HOST}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🔐 添加SSH公钥到服务器"
echo "════════════════════════════════════════════════════════════"
echo "  服务器 : $SERVER"
echo "════════════════════════════════════════════════════════════"
echo ""

# 检查本地SSH密钥
PUBKEY_FILE=""
if [ -f "$HOME/.ssh/id_ed25519.pub" ]; then
    PUBKEY_FILE="$HOME/.ssh/id_ed25519.pub"
    echo "✅ 找到 ed25519 公钥: $PUBKEY_FILE"
elif [ -f "$HOME/.ssh/id_rsa.pub" ]; then
    PUBKEY_FILE="$HOME/.ssh/id_rsa.pub"
    echo "✅ 找到 RSA 公钥: $PUBKEY_FILE"
else
    echo -e "${RED}❌ 错误: 未找到SSH公钥文件${NC}"
    echo ""
    echo "请先生成SSH密钥对："
    echo "  ssh-keygen -t ed25519 -C \"your-email@example.com\""
    echo "  或"
    echo "  ssh-keygen -t rsa -b 4096 -C \"your-email@example.com\""
    exit 1
fi

# 显示公钥内容
echo ""
echo "📋 公钥内容："
echo "────────────────────────────────────────────────────────────"
cat "$PUBKEY_FILE"
echo "────────────────────────────────────────────────────────────"
echo ""

# 确认是否继续
read -p "是否将以上公钥添加到服务器 $SERVER? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消操作"
    exit 0
fi

# 方法1: 尝试使用 ssh-copy-id（最简单）
if command -v ssh-copy-id >/dev/null 2>&1; then
    echo ""
    echo "🚀 使用 ssh-copy-id 添加公钥..."
    ssh-copy-id -i "$PUBKEY_FILE" "$SERVER"
    
    if [ $? -eq 0 ]; then
        echo ""
        echo -e "${GREEN}✅ 公钥已成功添加到服务器！${NC}"
        echo ""
        echo "🧪 测试连接..."
        ssh -o BatchMode=yes -o ConnectTimeout=5 "$SERVER" "echo 'SSH连接成功！'" 2>/dev/null
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ SSH密钥认证成功！现在可以无密码登录了。${NC}"
        else
            echo -e "${YELLOW}⚠️  连接测试失败，请手动测试：ssh $SERVER${NC}"
        fi
        exit 0
    else
        echo -e "${YELLOW}⚠️  ssh-copy-id 失败，尝试手动方法...${NC}"
    fi
fi

# 方法2: 手动添加公钥
echo ""
echo "🔧 使用手动方法添加公钥..."

# 读取公钥内容
PUBKEY=$(cat "$PUBKEY_FILE")

# 在服务器上执行命令添加公钥
echo "📤 连接到服务器并添加公钥..."
ssh "$SERVER" bash <<ENDSSH
set -euo pipefail

# 创建 .ssh 目录（如果不存在）
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# 检查公钥是否已存在
if [ -f ~/.ssh/authorized_keys ]; then
    if grep -qF "$PUBKEY" ~/.ssh/authorized_keys; then
        echo "⚠️  公钥已存在于 authorized_keys 文件中"
        exit 0
    fi
fi

# 添加公钥
echo "$PUBKEY" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

echo "✅ 公钥已添加到服务器"
ENDSSH

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ 公钥已成功添加到服务器！${NC}"
    echo ""
    echo "🧪 测试连接..."
    ssh -o BatchMode=yes -o ConnectTimeout=5 "$SERVER" "echo 'SSH连接成功！'" 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ SSH密钥认证成功！现在可以无密码登录了。${NC}"
    else
        echo -e "${YELLOW}⚠️  连接测试失败，请手动测试：ssh $SERVER${NC}"
        echo ""
        echo "如果仍然需要输入密码，请检查："
        echo "  1. 服务器上的文件权限："
        echo "     ssh $SERVER 'ls -la ~/.ssh/'"
        echo "  2. 服务器SSH配置："
        echo "     ssh $SERVER 'sudo cat /etc/ssh/sshd_config | grep -E \"PubkeyAuthentication|PasswordAuthentication\"'"
    fi
else
    echo -e "${RED}❌ 添加公钥失败！${NC}"
    exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✨ 完成！"
echo "════════════════════════════════════════════════════════════"

