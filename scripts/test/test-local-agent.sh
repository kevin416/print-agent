#!/bin/bash

# 本地代理测试脚本
# 用于测试本地代理服务是否正常工作

set -e

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🧪 本地代理服务测试脚本"
echo "════════════════════════════════════════════════════════════"
echo ""

# 检查配置文件
CONFIG_FILE="agent/config.json"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ 配置文件不存在: $CONFIG_FILE"
    echo "   请先复制 config.example.json 为 config.json 并配置"
    exit 1
fi

echo "1️⃣  检查配置文件..."
SHOP_ID=$(jq -r '.shopId' "$CONFIG_FILE" 2>/dev/null || echo "")
SERVER_URL=$(jq -r '.serverUrl' "$CONFIG_FILE" 2>/dev/null || echo "")

if [ -z "$SHOP_ID" ] || [ "$SHOP_ID" = "null" ]; then
    echo "❌ 配置文件中缺少 shopId"
    exit 1
fi

if [ -z "$SERVER_URL" ] || [ "$SERVER_URL" = "null" ]; then
    echo "❌ 配置文件中缺少 serverUrl"
    exit 1
fi

echo "   shopId: $SHOP_ID"
echo "   serverUrl: $SERVER_URL"
echo "✅ 配置文件检查通过"
echo ""

# 检查 Node.js
echo "2️⃣  检查 Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    exit 1
fi

NODE_VERSION=$(node --version)
echo "   Node.js 版本: $NODE_VERSION"
echo "✅ Node.js 检查通过"
echo ""

# 检查依赖
echo "3️⃣  检查依赖..."
if [ ! -d "agent/node_modules" ]; then
    echo "⚠️  依赖未安装，正在安装..."
    cd agent
    npm install
    cd ..
else
    echo "✅ 依赖已安装"
fi
echo ""

# 检查本地代理是否在运行
echo "4️⃣  检查本地代理服务状态..."
if pgrep -f "local-print-agent.js" > /dev/null; then
    echo "✅ 本地代理服务正在运行"
    PID=$(pgrep -f "local-print-agent.js" | head -1)
    echo "   进程 ID: $PID"
else
    echo "⚠️  本地代理服务未运行"
    echo "   启动本地代理服务..."
    cd agent
    node local-print-agent.js &
    AGENT_PID=$!
    cd ..
    echo "   已启动，进程 ID: $AGENT_PID"
    echo "   等待 3 秒让服务初始化..."
    sleep 3
fi
echo ""

# 检查状态服务（如果启用）
echo "5️⃣  检查状态服务..."
STATUS_PORT=$(lsof -ti:8080 2>/dev/null || echo "")
if [ -n "$STATUS_PORT" ]; then
    STATUS_RESPONSE=$(curl -s http://127.0.0.1:8080/status 2>/dev/null || echo "")
    if [ -n "$STATUS_RESPONSE" ]; then
        echo "$STATUS_RESPONSE" | jq . 2>/dev/null || echo "$STATUS_RESPONSE"
        CONNECTION_STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.status' 2>/dev/null || echo "unknown")
        if [ "$CONNECTION_STATUS" = "connected" ]; then
            echo "✅ 本地代理已连接到服务器"
        else
            echo "⚠️  本地代理未连接到服务器"
        fi
    fi
else
    echo "⚠️  状态服务未启用或端口未找到"
fi
echo ""

echo "════════════════════════════════════════════════════════════"
echo "✅ 本地代理测试完成！"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "📝 下一步："
echo "   1. 检查本地代理日志，确认已连接到服务器"
echo "   2. 运行服务器端测试: ./test-print.sh"
echo ""
