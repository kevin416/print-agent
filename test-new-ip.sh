#!/bin/bash

# 测试新 IP 连接和服务状态
# 用途：快速测试服务器连接和服务是否正常

set -e

NEW_IP="2.218.88.144"
DOMAIN_PRINTER="printer-hub.easyify.uk"
DOMAIN_ADMIN="pa.easyify.uk"
DOMAIN_SSH="ssh.easyify.uk"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🧪 测试新 IP 连接和服务状态"
echo "════════════════════════════════════════════════════════════"
echo ""

# 测试 1: DNS 解析
echo "1️⃣  测试 DNS 解析..."
echo ""

echo "   printer-hub.easyify.uk:"
PRINTER_IP=$(dig +short $DOMAIN_PRINTER | head -1)
if [ "$PRINTER_IP" = "$NEW_IP" ]; then
    echo "   ✅ DNS 解析正确: $PRINTER_IP"
else
    echo "   ⚠️  DNS 解析: $PRINTER_IP (期望: $NEW_IP)"
fi

echo ""
echo "   pa.easyify.uk:"
ADMIN_IP=$(dig +short $DOMAIN_ADMIN | head -1)
if [ "$ADMIN_IP" = "$NEW_IP" ]; then
    echo "   ✅ DNS 解析正确: $ADMIN_IP"
else
    echo "   ⚠️  DNS 解析: $ADMIN_IP (期望: $NEW_IP)"
fi

echo ""
echo "   ssh.easyify.uk:"
SSH_IP=$(dig +short $DOMAIN_SSH | head -1)
if [ "$SSH_IP" = "$NEW_IP" ]; then
    echo "   ✅ DNS 解析正确: $SSH_IP"
else
    echo "   ⚠️  DNS 解析: $SSH_IP (期望: $NEW_IP)"
fi

echo ""

# 测试 2: SSH 连接
echo "2️⃣  测试 SSH 连接..."
if ssh -o ConnectTimeout=5 -o BatchMode=yes kevin@$NEW_IP "echo 'SSH 连接成功'" 2>/dev/null; then
    echo "   ✅ SSH 连接正常"
else
    echo "   ⚠️  SSH 连接失败（可能需要密码或密钥）"
    echo "   手动测试: ssh kevin@$NEW_IP"
fi

echo ""

# 测试 3: 打印代理服务器
echo "3️⃣  测试打印代理服务器..."
if curl -s --max-time 5 http://$NEW_IP:3000/api/print/health >/dev/null 2>&1; then
    echo "   ✅ 打印代理服务器运行正常 (http://$NEW_IP:3000)"
    curl -s http://$NEW_IP:3000/api/print/health | head -3
else
    echo "   ⚠️  打印代理服务器未响应 (http://$NEW_IP:3000)"
    echo "   可能原因: 服务未启动或端口未开放"
fi

echo ""

# 测试 4: 管理后台
echo "4️⃣  测试管理后台..."
if curl -s --max-time 5 -k https://$DOMAIN_ADMIN >/dev/null 2>&1; then
    echo "   ✅ 管理后台可访问 (https://$DOMAIN_ADMIN)"
else
    echo "   ⚠️  管理后台无法访问 (https://$DOMAIN_ADMIN)"
    echo "   可能原因: 服务未启动、Nginx 未配置或 SSL 证书问题"
fi

echo ""

# 测试 5: 域名访问打印代理
echo "5️⃣  测试域名访问打印代理..."
if curl -s --max-time 5 -k https://$DOMAIN_PRINTER/api/print/health >/dev/null 2>&1; then
    echo "   ✅ 域名访问正常 (https://$DOMAIN_PRINTER)"
else
    echo "   ⚠️  域名访问失败 (https://$DOMAIN_PRINTER)"
    echo "   可能原因: Nginx 未配置或 SSL 证书问题"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ 测试完成"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "📋 下一步："
echo "   1. 如果 DNS 未解析，运行: cd ../cloudflare/scripts && ./fix-cloudflare-dns.sh"
echo "   2. 如果服务未运行，部署服务:"
echo "      cd print-agent && ./deploy-to-server.sh"
echo "      cd admin && ./deploy-admin.sh"
echo "   3. 查看详细部署指南: cat DEPLOYMENT_NEW_IP.md"
echo ""

