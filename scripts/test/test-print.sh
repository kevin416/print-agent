#!/bin/bash

# 打印测试脚本
# 用于测试打印代理服务是否正常工作

set -e

# 配置
SERVER_URL="${PRINT_SERVER_URL:-http://127.0.0.1:3000}"
SHOP_NAME="${SHOP_NAME:-shop1}"
PRINTER_HOST="${PRINTER_HOST:-192.168.0.172}"
PRINTER_PORT="${PRINTER_PORT:-9100}"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🧪 打印代理服务测试脚本"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "服务器地址: $SERVER_URL"
echo "分店名称: $SHOP_NAME"
echo "打印机: $PRINTER_HOST:$PRINTER_PORT"
echo ""

# 1. 测试健康检查
echo "1️⃣  测试服务器健康检查..."
HEALTH_RESPONSE=$(curl -s "$SERVER_URL/api/print/health")
echo "$HEALTH_RESPONSE" | jq . 2>/dev/null || echo "$HEALTH_RESPONSE"
echo ""

# 检查服务状态
STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.status' 2>/dev/null || echo "unknown")
if [ "$STATUS" != "ok" ]; then
    echo "❌ 服务器健康检查失败！"
    exit 1
fi

echo "✅ 服务器健康检查通过"
echo ""

# 2. 检查已连接的代理
echo "2️⃣  检查已连接的本地代理..."
AGENTS_RESPONSE=$(curl -s "$SERVER_URL/api/print/agents")
echo "$AGENTS_RESPONSE" | jq . 2>/dev/null || echo "$AGENTS_RESPONSE"
echo ""

CONNECTED_COUNT=$(echo "$AGENTS_RESPONSE" | jq -r '.connected' 2>/dev/null || echo "0")
if [ "$CONNECTED_COUNT" = "0" ]; then
    echo "⚠️  警告：没有已连接的本地代理！"
    echo "   请确保本地代理服务正在运行，并且 shopId 与 SHOP_NAME ($SHOP_NAME) 一致"
    echo ""
    read -p "是否继续测试？(y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✅ 找到 $CONNECTED_COUNT 个已连接的本地代理"
fi
echo ""

# 3. 测试打印
echo "3️⃣  测试打印功能..."
echo "   生成测试打印数据..."

# 创建测试打印数据（ESC/POS 格式）
TEST_DATA=$(cat <<'TEST_EOF'
测试打印
════════════════════════════════════════
Print Agent 测试
时间: $(date '+%Y-%m-%d %H:%M:%S')
分店: SHOP_NAME
打印机: PRINTER_HOST:PRINTER_PORT
════════════════════════════════════════

这是一条测试打印内容。
如果能看到这段文字，说明打印功能正常！

TEST_EOF
)

# 替换变量
TEST_DATA=$(echo "$TEST_DATA" | sed "s/SHOP_NAME/$SHOP_NAME/g" | sed "s/PRINTER_HOST/$PRINTER_HOST/g" | sed "s/PRINTER_PORT/$PRINTER_PORT/g")

echo "   发送打印请求..."
PRINT_RESPONSE=$(curl -s -X POST \
    "$SERVER_URL/api/print?host=$PRINTER_HOST&port=$PRINTER_PORT" \
    -H "Content-Type: application/octet-stream" \
    -H "X-Shop-Name: $SHOP_NAME" \
    --data-binary "$TEST_DATA" \
    -w "\nHTTP_CODE:%{http_code}")

HTTP_CODE=$(echo "$PRINT_RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
RESPONSE_BODY=$(echo "$PRINT_RESPONSE" | sed '/HTTP_CODE/d')

echo ""
echo "   响应状态码: $HTTP_CODE"
echo "   响应内容:"
echo "$RESPONSE_BODY" | jq . 2>/dev/null || echo "$RESPONSE_BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    SUCCESS=$(echo "$RESPONSE_BODY" | jq -r '.success' 2>/dev/null || echo "false")
    if [ "$SUCCESS" = "true" ]; then
        echo "✅ 打印请求成功！"
        BYTES_SENT=$(echo "$RESPONSE_BODY" | jq -r '.bytesSent' 2>/dev/null || echo "unknown")
        echo "   已发送字节数: $BYTES_SENT"
    else
        echo "❌ 打印请求失败！"
        ERROR=$(echo "$RESPONSE_BODY" | jq -r '.error' 2>/dev/null || echo "unknown")
        echo "   错误信息: $ERROR"
        exit 1
    fi
elif [ "$HTTP_CODE" = "503" ]; then
    echo "❌ 服务不可用：本地代理未连接"
    echo "   请检查："
    echo "   1. 本地代理服务是否正在运行"
    echo "   2. shopId 是否与 SHOP_NAME ($SHOP_NAME) 一致"
    echo "   3. 本地代理是否能连接到服务器"
    exit 1
else
    echo "❌ 打印请求失败！HTTP 状态码: $HTTP_CODE"
    exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ 测试完成！"
echo "════════════════════════════════════════════════════════════"
echo ""
