#!/bin/bash

# 🔐 从已有权限的电脑添加新电脑的SSH公钥到服务器
# 用途：当你已经有SSH权限时，帮助添加新电脑的公钥
# 使用场景：新电脑无法直接SSH到服务器时，从已有权限的电脑执行此脚本

set -euo pipefail

SERVER_USER="${SERVER_USER:-kevin}"
SERVER_HOST="${SERVER_HOST:-ssh.easyify.uk}"  # 使用域名或 IP 2.218.88.144
SERVER="${SERVER_USER}@${SERVER_HOST}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🔐 添加新电脑SSH公钥到服务器"
echo "════════════════════════════════════════════════════════════"
echo "  服务器 : $SERVER"
echo "  说明   : 从已有权限的电脑添加新电脑的公钥"
echo "════════════════════════════════════════════════════════════"
echo ""

# 检查当前电脑是否可以SSH到服务器
echo "🔍 检查当前电脑的SSH权限..."
if ssh -o BatchMode=yes -o ConnectTimeout=5 "$SERVER" "echo 'OK'" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ 当前电脑已有SSH权限${NC}"
else
    echo -e "${RED}❌ 当前电脑无法SSH到服务器！${NC}"
    echo ""
    echo "此脚本需要从已有SSH权限的电脑运行。"
    echo ""
    echo "请选择："
    echo "  1. 从另一台已有权限的电脑运行此脚本"
    echo "  2. 如果服务器支持密码认证，可以使用密码登录后手动添加"
    echo "  3. 通过服务器控制台直接操作"
    echo ""
    echo "详细说明请查看：SSH_ACCESS_SETUP.md"
    exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "📋 添加新电脑公钥的方法"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "请选择输入新电脑公钥的方式："
echo "  1. 从文件读取公钥（新电脑的公钥文件）"
echo "  2. 直接粘贴公钥内容"
echo "  3. 从新电脑复制公钥内容后输入"
echo ""
read -p "请选择 (1-3): " choice

PUBKEY=""

case $choice in
    1)
        read -p "请输入新电脑的公钥文件路径: " keyfile
        if [ ! -f "$keyfile" ]; then
            echo -e "${RED}❌ 文件不存在: $keyfile${NC}"
            exit 1
        fi
        PUBKEY=$(cat "$keyfile")
        echo -e "${GREEN}✅ 已从文件读取公钥${NC}"
        ;;
    2)
        echo ""
        echo "请粘贴新电脑的公钥内容（输入完成后按Enter，然后按Ctrl+D结束）："
        echo "────────────────────────────────────────────────────────────"
        PUBKEY=$(cat)
        echo "────────────────────────────────────────────────────────────"
        ;;
    3)
        echo ""
        echo -e "${CYAN}📝 请在新电脑上执行以下命令获取公钥：${NC}"
        echo ""
        echo "  cat ~/.ssh/id_ed25519.pub"
        echo "  或"
        echo "  cat ~/.ssh/id_rsa.pub"
        echo ""
        echo "然后复制公钥内容，粘贴到下面："
        echo "────────────────────────────────────────────────────────────"
        read -p "公钥内容: " PUBKEY
        echo "────────────────────────────────────────────────────────────"
        ;;
    *)
        echo -e "${RED}❌ 无效选择${NC}"
        exit 1
        ;;
esac

# 验证公钥格式
if [ -z "$PUBKEY" ]; then
    echo -e "${RED}❌ 公钥内容为空${NC}"
    exit 1
fi

if [[ ! "$PUBKEY" =~ ^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521|ssh-dss) ]]; then
    echo -e "${YELLOW}⚠️  警告: 公钥格式可能不正确${NC}"
    echo "公钥应该以以下之一开头："
    echo "  - ssh-ed25519"
    echo "  - ssh-rsa"
    echo "  - ecdsa-sha2-nistp256/384/521"
    echo "  - ssh-dss"
    echo ""
    read -p "是否继续? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "已取消"
        exit 0
    fi
fi

# 显示公钥内容
echo ""
echo "📋 要添加的公钥："
echo "────────────────────────────────────────────────────────────"
echo "$PUBKEY"
echo "────────────────────────────────────────────────────────────"
echo ""

# 添加注释提示
read -p "是否为这个公钥添加注释（用于标识是哪台电脑）? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "请输入注释（如：laptop-kevin, desktop-office等）: " comment
    if [ -n "$comment" ]; then
        PUBKEY="$PUBKEY $comment"
        echo -e "${GREEN}✅ 已添加注释: $comment${NC}"
    fi
fi

echo ""
read -p "确认将以上公钥添加到服务器 $SERVER? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消操作"
    exit 0
fi

# 连接到服务器并添加公钥
echo ""
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
        echo "✅ 无需重复添加"
        exit 0
    fi
else
    touch ~/.ssh/authorized_keys
    chmod 600 ~/.ssh/authorized_keys
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
    echo "════════════════════════════════════════════════════════════"
    echo "🧪 测试连接"
    echo "════════════════════════════════════════════════════════════"
    echo ""
    echo "现在新电脑应该可以SSH到服务器了。"
    echo ""
    echo "请在新电脑上测试："
    echo "  ssh $SERVER"
    echo ""
    echo "如果新电脑仍然无法连接，请检查："
    echo "  1. 新电脑的公钥文件是否正确"
    echo "  2. 服务器上的文件权限："
    echo "     ssh $SERVER 'ls -la ~/.ssh/'"
    echo "  3. 服务器SSH配置是否启用公钥认证"
else
    echo -e "${RED}❌ 添加公钥失败！${NC}"
    exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✨ 完成！"
echo "════════════════════════════════════════════════════════════"

