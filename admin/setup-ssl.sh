#!/bin/bash

# SSL 证书配置脚本 - pa.easyify.uk

set -e

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🔒 配置 SSL 证书 - pa.easyify.uk"
echo "════════════════════════════════════════════════════════════"
echo ""

# 1. 确保 Nginx 配置已部署
echo "1️⃣  检查 Nginx 配置..."
if [ ! -f "/etc/nginx/sites-available/pa.easyify.uk" ]; then
    echo "❌ Nginx 配置文件不存在，请先配置 Nginx"
    exit 1
fi

echo "✅ Nginx 配置文件存在"
echo ""

# 2. 检查 certbot 是否已安装
echo "2️⃣  检查 certbot..."
if ! command -v certbot &> /dev/null; then
    echo "📦 安装 certbot..."
    sudo apt-get update
    sudo apt-get install -y certbot python3-certbot-nginx
    echo "✅ certbot 安装完成"
else
    echo "✅ certbot 已安装"
fi
echo ""

# 3. 申请 SSL 证书
echo "3️⃣  申请 SSL 证书..."
echo "   域名: pa.easyify.uk"
echo ""

sudo certbot --nginx -d pa.easyify.uk --non-interactive --agree-tos --email kevin@easyify.uk || {
    echo "⚠️  自动申请失败，请手动运行："
    echo "   sudo certbot --nginx -d pa.easyify.uk"
    exit 1
}

echo ""
echo "✅ SSL 证书申请成功！"
echo ""

# 4. 测试证书自动续期
echo "4️⃣  测试证书自动续期..."
sudo certbot renew --dry-run

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ SSL 配置完成！"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "📝 访问地址："
echo "   https://pa.easyify.uk"
echo ""
echo "📋 证书信息："
echo "   证书位置: /etc/letsencrypt/live/pa.easyify.uk/"
echo "   自动续期: 已配置（每 90 天自动续期）"
echo ""
