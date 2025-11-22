#!/bin/bash

# 🔐 SSH密钥管理脚本（服务器端）
# 用途：查看、添加、删除服务器上的SSH授权密钥

set -euo pipefail

SERVER_USER="${SERVER_USER:-kevin}"
SERVER_HOST="${SERVER_HOST:-ssh.easyify.uk}"  # 使用域名或 IP 2.218.88.144
SERVER="${SERVER_USER}@${SERVER_HOST}"

AUTHORIZED_KEYS_FILE="~/.ssh/authorized_keys"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

show_menu() {
    echo ""
    echo "════════════════════════════════════════════════════════════"
    echo "🔐 SSH密钥管理 - $SERVER"
    echo "════════════════════════════════════════════════════════════"
    echo ""
    echo "  1. 查看所有授权密钥"
    echo "  2. 添加新公钥"
    echo "  3. 删除公钥"
    echo "  4. 备份授权密钥文件"
    echo "  5. 检查文件权限"
    echo "  6. 测试SSH连接"
    echo "  0. 退出"
    echo ""
    echo "════════════════════════════════════════════════════════════"
}

list_keys() {
    echo ""
    echo "📋 已授权的SSH公钥："
    echo "────────────────────────────────────────────────────────────"
    ssh "$SERVER" "cat $AUTHORIZED_KEYS_FILE 2>/dev/null | nl -w2 -s'. ' || echo '未找到授权密钥文件'"
    echo "────────────────────────────────────────────────────────────"
    echo ""
}

add_key() {
    echo ""
    echo "➕ 添加新公钥"
    echo "────────────────────────────────────────────────────────────"
    echo ""
    echo "请选择输入方式："
    echo "  1. 从文件读取公钥"
    echo "  2. 直接粘贴公钥内容"
    echo "  3. 从本地电脑复制公钥"
    read -p "请选择 (1-3): " choice
    
    case $choice in
        1)
            read -p "请输入公钥文件路径: " keyfile
            if [ ! -f "$keyfile" ]; then
                echo -e "${RED}❌ 文件不存在: $keyfile${NC}"
                return
            fi
            pubkey=$(cat "$keyfile")
            ;;
        2)
            echo "请粘贴公钥内容（输入完成后按Ctrl+D）："
            pubkey=$(cat)
            ;;
        3)
            if [ -f "$HOME/.ssh/id_ed25519.pub" ]; then
                pubkey=$(cat "$HOME/.ssh/id_ed25519.pub")
                echo "使用本地公钥: $HOME/.ssh/id_ed25519.pub"
            elif [ -f "$HOME/.ssh/id_rsa.pub" ]; then
                pubkey=$(cat "$HOME/.ssh/id_rsa.pub")
                echo "使用本地公钥: $HOME/.ssh/id_rsa.pub"
            else
                echo -e "${RED}❌ 未找到本地公钥文件${NC}"
                return
            fi
            ;;
        *)
            echo -e "${RED}❌ 无效选择${NC}"
            return
            ;;
    esac
    
    if [ -z "$pubkey" ]; then
        echo -e "${RED}❌ 公钥内容为空${NC}"
        return
    fi
    
    echo ""
    echo "📋 要添加的公钥："
    echo "$pubkey"
    echo ""
    read -p "确认添加? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "已取消"
        return
    fi
    
    # 添加公钥到服务器
    ssh "$SERVER" bash <<ENDSSH
set -euo pipefail

mkdir -p ~/.ssh
chmod 700 ~/.ssh

if [ -f ~/.ssh/authorized_keys ]; then
    if grep -qF "$pubkey" ~/.ssh/authorized_keys; then
        echo "⚠️  公钥已存在"
        exit 0
    fi
fi

echo "$pubkey" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
echo "✅ 公钥已添加"
ENDSSH
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ 公钥添加成功！${NC}"
    else
        echo -e "${RED}❌ 公钥添加失败！${NC}"
    fi
}

delete_key() {
    list_keys
    echo ""
    read -p "请输入要删除的公钥行号: " line_num
    
    if ! [[ "$line_num" =~ ^[0-9]+$ ]]; then
        echo -e "${RED}❌ 无效的行号${NC}"
        return
    fi
    
    echo ""
    read -p "确认删除第 $line_num 行的公钥? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "已取消"
        return
    fi
    
    # 删除指定行的公钥
    ssh "$SERVER" bash <<ENDSSH
set -euo pipefail

if [ ! -f ~/.ssh/authorized_keys ]; then
    echo "❌ 授权文件不存在"
    exit 1
fi

# 使用 sed 删除指定行
sed -i "${line_num}d" ~/.ssh/authorized_keys
echo "✅ 公钥已删除"
ENDSSH
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ 公钥删除成功！${NC}"
        list_keys
    else
        echo -e "${RED}❌ 公钥删除失败！${NC}"
    fi
}

backup_keys() {
    backup_file="authorized_keys_backup_$(date +%Y%m%d_%H%M%S).txt"
    echo ""
    echo "💾 备份授权密钥文件..."
    
    ssh "$SERVER" "cat ~/.ssh/authorized_keys" > "$backup_file" 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ 备份成功: $backup_file${NC}"
    else
        echo -e "${RED}❌ 备份失败${NC}"
    fi
}

check_permissions() {
    echo ""
    echo "🔍 检查文件权限..."
    echo "────────────────────────────────────────────────────────────"
    ssh "$SERVER" bash <<'ENDSSH'
echo "📁 .ssh 目录权限："
ls -ld ~/.ssh 2>/dev/null || echo "❌ .ssh 目录不存在"

echo ""
echo "📄 authorized_keys 文件权限："
ls -l ~/.ssh/authorized_keys 2>/dev/null || echo "❌ authorized_keys 文件不存在"

echo ""
echo "✅ 正确的权限应该是："
echo "   - .ssh 目录: drwx------ (700)"
echo "   - authorized_keys: -rw------- (600)"
ENDSSH
    echo "────────────────────────────────────────────────────────────"
}

test_connection() {
    echo ""
    echo "🧪 测试SSH连接..."
    echo "────────────────────────────────────────────────────────────"
    
    if ssh -o BatchMode=yes -o ConnectTimeout=5 "$SERVER" "echo '✅ SSH连接成功！'" 2>/dev/null; then
        echo -e "${GREEN}✅ SSH密钥认证成功！${NC}"
    else
        echo -e "${YELLOW}⚠️  SSH密钥认证失败，可能需要输入密码${NC}"
        echo ""
        echo "尝试交互式连接："
        ssh "$SERVER" "echo '✅ SSH连接成功！'"
    fi
    echo "────────────────────────────────────────────────────────────"
}

# 主循环
while true; do
    show_menu
    read -p "请选择操作 (0-6): " choice
    echo ""
    
    case $choice in
        1)
            list_keys
            ;;
        2)
            add_key
            ;;
        3)
            delete_key
            ;;
        4)
            backup_keys
            ;;
        5)
            check_permissions
            ;;
        6)
            test_connection
            ;;
        0)
            echo "再见！"
            exit 0
            ;;
        *)
            echo -e "${RED}❌ 无效选择，请重试${NC}"
            ;;
    esac
    
    echo ""
    read -p "按回车键继续..."
done

