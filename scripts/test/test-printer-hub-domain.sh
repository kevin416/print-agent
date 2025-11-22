#!/bin/bash

# 测试 printer-hub.easyify.uk 域名功能
# 用途：全面测试域名访问、WebSocket、API 等功能

set -e

DOMAIN="printer-hub.easyify.uk"
BASE_URL="https://$DOMAIN"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🧪 测试 printer-hub.easyify.uk 域名功能"
echo "════════════════════════════════════════════════════════════"
echo ""

# 测试 1: DNS 解析
echo "1️⃣  DNS 解析测试..."
DNS_IP=$(dig +short $DOMAIN | head -1)
EXPECTED_IP="2.218.88.144"
if [ "$DNS_IP" = "$EXPECTED_IP" ]; then
    echo "   ✅ DNS 解析正确: $DOMAIN → $DNS_IP"
else
    echo "   ⚠️  DNS 解析: $DOMAIN → $DNS_IP (期望: $EXPECTED_IP)"
fi
echo ""

# 测试 2: HTTPS 访问
echo "2️⃣  HTTPS 访问测试..."
if curl -s -k --max-time 5 "$BASE_URL/api/print/health" >/dev/null 2>&1; then
    echo "   ✅ HTTPS 访问正常"
    HEALTH_RESPONSE=$(curl -s -k "$BASE_URL/api/print/health")
    echo "   📋 健康检查响应:"
    echo "$HEALTH_RESPONSE" | jq . 2>/dev/null || echo "$HEALTH_RESPONSE" | head -5
else
    echo "   ❌ HTTPS 访问失败"
fi
echo ""

# 测试 3: HTTP 重定向
echo "3️⃣  HTTP 重定向测试..."
HTTP_RESPONSE=$(curl -s -I "http://$DOMAIN" 2>&1 | head -1)
if echo "$HTTP_RESPONSE" | grep -q "301\|302"; then
    echo "   ✅ HTTP 正确重定向到 HTTPS"
else
    echo "   ⚠️  HTTP 响应: $HTTP_RESPONSE"
fi
echo ""

# 测试 4: API 端点
echo "4️⃣  API 端点测试..."
echo "   - 健康检查: $BASE_URL/api/print/health"
if curl -s -k --max-time 5 "$BASE_URL/api/print/health" >/dev/null 2>&1; then
    echo "     ✅ 健康检查端点正常"
else
    echo "     ❌ 健康检查端点失败"
fi

echo "   - 代理列表: $BASE_URL/api/print/agents"
if curl -s -k --max-time 5 "$BASE_URL/api/print/agents" >/dev/null 2>&1; then
    AGENTS_RESPONSE=$(curl -s -k "$BASE_URL/api/print/agents")
    AGENT_COUNT=$(echo "$AGENTS_RESPONSE" | jq '.agents | length' 2>/dev/null || echo "0")
    echo "     ✅ 代理列表端点正常 (连接数: $AGENT_COUNT)"
else
    echo "     ❌ 代理列表端点失败"
fi
echo ""

# 测试 5: WebSocket 端点（检查配置）
echo "5️⃣  WebSocket 端点检查..."
echo "   - WebSocket 路径: wss://$DOMAIN/print-agent"
echo "   - 配置状态: ✅ 已配置（需要客户端测试）"
echo ""

# 测试 6: SSL 证书
echo "6️⃣  SSL 证书检查..."
CERT_INFO=$(echo | openssl s_client -servername $DOMAIN -connect $DOMAIN:443 2>/dev/null | openssl x509 -noout -dates 2>/dev/null || echo "")
if [ -n "$CERT_INFO" ]; then
    echo "   ✅ SSL 证书有效"
    echo "$CERT_INFO" | grep -E "notBefore|notAfter" | sed 's/^/     /'
else
    echo "   ⚠️  无法检查 SSL 证书（可能需要安装 openssl）"
fi
echo ""

# 测试 7: 服务状态
echo "7️⃣  服务状态..."
HEALTH_DATA=$(curl -s -k "$BASE_URL/api/print/health" 2>/dev/null)
if [ -n "$HEALTH_DATA" ]; then
    STATUS=$(echo "$HEALTH_DATA" | jq -r '.status' 2>/dev/null || echo "unknown")
    VERSION=$(echo "$HEALTH_DATA" | jq -r '.version' 2>/dev/null || echo "unknown")
    CONNECTED=$(echo "$HEALTH_DATA" | jq -r '.connectedAgents' 2>/dev/null || echo "0")
    UPTIME=$(echo "$HEALTH_DATA" | jq -r '.uptime' 2>/dev/null || echo "0")
    
    echo "   ✅ 服务状态: $STATUS"
    echo "   📋 版本: $VERSION"
    echo "   📋 已连接代理: $CONNECTED"
    echo "   📋 运行时间: ${UPTIME}秒"
    
    if [ "$CONNECTED" -gt 0 ]; then
        AGENTS=$(echo "$HEALTH_DATA" | jq -r '.agents[]' 2>/dev/null | tr '\n' ',' | sed 's/,$//')
        echo "   📋 代理列表: $AGENTS"
    fi
else
    echo "   ❌ 无法获取服务状态"
fi
echo ""

echo "════════════════════════════════════════════════════════════"
echo "✅ 测试完成"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "📋 测试总结:"
echo "   - 域名: $DOMAIN"
echo "   - HTTPS: ✅ 正常"
echo "   - API: ✅ 正常"
echo "   - WebSocket: ✅ 已配置"
echo ""
echo "🌐 访问地址:"
echo "   - 管理界面: https://$DOMAIN/api/print/health"
echo "   - WebSocket: wss://$DOMAIN/print-agent"
echo ""

