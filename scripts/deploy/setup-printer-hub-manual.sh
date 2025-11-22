#!/bin/bash

# 手动配置 printer-hub.easyify.uk 的脚本
# 用途：上传 Nginx 配置并设置域名

set -e

SERVER_USER="kevin"
SERVER_HOST="2.218.88.144"
DOMAIN="printer-hub.easyify.uk"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🌐 配置 printer-hub.easyify.uk 域名"
echo "════════════════════════════════════════════════════════════"
echo ""

# 上传 Nginx 配置文件
echo "📤 上传 Nginx 配置文件..."
scp server/nginx-printer-hub.conf $SERVER_USER@$SERVER_HOST:/tmp/printer-hub.nginx.conf

echo "✅ 文件上传完成"
echo ""

echo "📋 请在服务器上执行以下命令："
echo ""
echo "ssh $SERVER_USER@$SERVER_HOST"
echo ""
echo "然后运行："
echo ""
echo "# 1. 复制配置文件"
echo "sudo cp /tmp/printer-hub.nginx.conf /etc/nginx/sites-available/$DOMAIN"
echo ""
echo "# 2. 创建符号链接"
echo "sudo ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN"
echo ""
echo "# 3. 测试 Nginx 配置"
echo "sudo nginx -t"
echo ""
echo "# 4. 重载 Nginx"
echo "sudo systemctl reload nginx"
echo ""
echo "# 5. 申请 SSL 证书（如果需要）"
echo "sudo certbot --nginx -d $DOMAIN --agree-tos --email ops@easyify.uk"
echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

