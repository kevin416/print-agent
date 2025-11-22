#!/bin/bash

# 快速测试打印脚本

SHOP_NAME="testclient"
PRINTER_HOST="${1:-192.168.0.31}"  # 默认使用第一个打印机
PRINTER_PORT="${2:-9100}"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🧪 测试打印功能"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "分店: $SHOP_NAME"
echo "打印机: $PRINTER_HOST:$PRINTER_PORT"
echo ""

# 创建测试数据
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

echo "发送打印请求..."
RESPONSE=$(curl -s -X POST \
  "http://printer1.easyify.uk/api/print?host=$PRINTER_HOST&port=$PRINTER_PORT" \
  -H "Content-Type: application/octet-stream" \
  -H "X-Shop-Name: $SHOP_NAME" \
  --data-binary "$TEST_DATA" \
  -w "\nHTTP_CODE:%{http_code}")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

echo ""
echo "响应状态码: $HTTP_CODE"
echo "响应内容:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"

if [ "$HTTP_CODE" = "200" ]; then
    echo ""
    echo "✅ 打印请求成功！"
    echo "   请检查打印机是否打印出测试内容"
else
    echo ""
    echo "❌ 打印请求失败"
    if [ "$HTTP_CODE" = "503" ]; then
        echo "   错误：本地代理未连接"
        echo "   请确保本地代理服务正在运行"
    fi
fi

echo ""
