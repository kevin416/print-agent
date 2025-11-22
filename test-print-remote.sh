#!/bin/bash

# 远程服务器打印测试脚本
# 用于在服务器上测试打印功能

set -e

# 配置
SERVER_USER="kevin"
SERVER_HOST="2.218.88.144"  # 新 IP，或使用域名 printer-hub.easyify.uk
SHOP_NAME="${SHOP_NAME:-testclient}"
PRINTER_HOST="${PRINTER_HOST:-192.168.0.172}"
PRINTER_PORT="${PRINTER_PORT:-9100}"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🧪 远程服务器打印测试"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "服务器: $SERVER_USER@$SERVER_HOST"
echo "分店名称: $SHOP_NAME"
echo "打印机: $PRINTER_HOST:$PRINTER_PORT"
echo ""

# 1. 测试健康检查
echo "1️⃣  测试服务器健康检查..."
ssh $SERVER_USER@$SERVER_HOST "curl -s http://127.0.0.1:3000/api/print/health | jq ."
echo ""

# 2. 检查已连接的代理
echo "2️⃣  检查已连接的本地代理..."
ssh $SERVER_USER@$SERVER_HOST "curl -s http://127.0.0.1:3000/api/print/agents | jq ."
echo ""

# 3. 测试打印
echo "3️⃣  测试打印功能..."
echo "   生成测试打印数据..."

# 创建测试打印数据
TEST_DATA="测试打印
════════════════════════════════════════
Print Agent 测试
时间: $(date '+%Y-%m-%d %H:%M:%S')
分店: $SHOP_NAME
打印机: $PRINTER_HOST:$PRINTER_PORT
════════════════════════════════════════

这是一条测试打印内容。
如果能看到这段文字，说明打印功能正常！
"

echo "   发送打印请求..."
ssh $SERVER_USER@$SERVER_HOST << ENDSSH
curl -s -X POST \
    "http://127.0.0.1:3000/api/print?host=$PRINTER_HOST&port=$PRINTER_PORT" \
    -H "Content-Type: application/octet-stream" \
    -H "X-Shop-Name: $SHOP_NAME" \
    --data-binary "$TEST_DATA" \
    -w "\nHTTP_CODE:%{http_code}" | tee /tmp/print-response.txt
ENDSSH

echo ""
echo "   查看响应..."
ssh $SERVER_USER@$SERVER_HOST "cat /tmp/print-response.txt | sed '/HTTP_CODE/d' | jq . 2>/dev/null || cat /tmp/print-response.txt | sed '/HTTP_CODE/d'"
HTTP_CODE=$(ssh $SERVER_USER@$SERVER_HOST "cat /tmp/print-response.txt | grep HTTP_CODE | cut -d: -f2")

echo ""
echo "   响应状态码: $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ 打印请求成功！"
elif [ "$HTTP_CODE" = "503" ]; then
    echo "❌ 服务不可用：本地代理未连接"
    echo "   请检查本地代理服务是否正在运行"
else
    echo "❌ 打印请求失败！HTTP 状态码: $HTTP_CODE"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ 测试完成！"
echo "════════════════════════════════════════════════════════════"
echo ""
