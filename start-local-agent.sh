#!/bin/bash

# 快速启动本地代理脚本

set -e

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🚀 启动本地代理服务"
echo "════════════════════════════════════════════════════════════"
echo ""

cd "$(dirname "$0")/agent"

# 检查配置文件
if [ ! -f "config.json" ]; then
    echo "⚠️  配置文件不存在，从示例文件创建..."
    if [ -f "config.example.json" ]; then
        cp config.example.json config.json
        echo "✅ 已创建 config.json"
        echo ""
        echo "📝 请编辑 config.json，设置："
        echo "   - shopId: 分店标识（如 'shop1', 'bbq' 等）"
        echo "   - serverUrl: 服务器地址（如 'ws://printer1.easyify.uk/print-agent'）"
        echo ""
        read -p "按 Enter 继续（将使用默认配置）..."
    else
        echo "❌ 找不到 config.example.json"
        exit 1
    fi
fi

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
    echo "✅ 依赖安装完成"
    echo ""
fi

# 显示配置
echo "📋 当前配置："
SHOP_ID=$(jq -r '.shopId' config.json 2>/dev/null || echo "未设置")
SERVER_URL=$(jq -r '.serverUrl' config.json 2>/dev/null || echo "未设置")
echo "   shopId: $SHOP_ID"
echo "   serverUrl: $SERVER_URL"
echo ""

# 检查配置
if [ "$SHOP_ID" = "null" ] || [ -z "$SHOP_ID" ]; then
    echo "❌ shopId 未设置，请编辑 config.json"
    exit 1
fi

if [ "$SERVER_URL" = "null" ] || [ -z "$SERVER_URL" ]; then
    echo "❌ serverUrl 未设置，请编辑 config.json"
    exit 1
fi

echo "✅ 配置检查通过"
echo ""

# 启动服务
echo "🚀 启动本地代理服务..."
echo "   按 Ctrl+C 停止服务"
echo ""

node local-print-agent.js
