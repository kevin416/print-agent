#!/usr/bin/env bash
#
# setup-printer-hub-domain.sh
# 将 print-agent 核心服务通过 Nginx 反向代理到指定域名，并申请 Let's Encrypt 证书。
# 默认目标服务器：kevin@2.218.88.144 (或使用域名 printer-hub.easyify.uk)
#
# 用法:
#   ./setup-printer-hub-domain.sh [domain] [email] [--staging]
#
# 参数:
#   domain  - 要绑定的域名，默认 printer-hub.easyify.uk
#   email   - Let's Encrypt 联系邮箱，默认 ops@easyify.uk
#   --staging - （可选）使用 Let's Encrypt Staging 环境调试证书
#

set -euo pipefail

DOMAIN="${1:-printer-hub.easyify.uk}"
EMAIL="${2:-ops@easyify.uk}"
STAGING_FLAG="${3:-}"

if [[ -z "$DOMAIN" ]]; then
  echo "❌ 域名不能为空"
  exit 1
fi

if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9.-]+$ ]]; then
  echo "❌ 域名格式不合法: $DOMAIN"
  exit 1
fi

# 配置
SERVER_USER="${SERVER_USER:-kevin}"
SERVER_HOST="${SERVER_HOST:-2.218.88.144}"
REMOTE="${SERVER_USER}@${SERVER_HOST}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-~/print-agent/server}"
REMOTE_CONFIG_TMP="/tmp/${DOMAIN}.nginx.conf"
LOCAL_TMP_DIR="$(mktemp -d)"
LOCAL_TEMPLATE="${LOCAL_TMP_DIR}/nginx.conf.tpl"
LOCAL_RENDERED="${LOCAL_TMP_DIR}/${DOMAIN}.conf"

APP_PORT="${APP_PORT:-3000}"
APP_WS_PATH="${APP_WS_PATH:-/print-agent}"
CERTBOT_ARGS=("--nginx" "-d" "$DOMAIN" "--agree-tos" "--non-interactive" "--email" "$EMAIL")
CERTBOT_ARGS_STR="$(printf '%s ' "${CERTBOT_ARGS[@]}")"
SUDO_PASS="${SUDO_PASS:-}"

if [[ "$STAGING_FLAG" == "--staging" ]]; then
  echo "⚠️ 使用 Let's Encrypt Staging 环境（仅用于调试）"
  CERTBOT_ARGS+=("--staging")
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🌐 配置 print-agent 反向代理域名"
echo "════════════════════════════════════════════════════════════"
echo " 域名:     $DOMAIN"
echo " 服务器:   $REMOTE"
echo " 应用端口: $APP_PORT"
echo " WS 路径:  $APP_WS_PATH"
echo " 邮箱:     $EMAIL"
echo "════════════════════════════════════════════════════════════"
echo ""

cleanup() {
  rm -rf "$LOCAL_TMP_DIR"
}
trap cleanup EXIT

cat > "$LOCAL_TEMPLATE" <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    # 提前允许 Nginx 处理 ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location ${APP_WS_PATH} {
        proxy_pass http://127.0.0.1:${APP_PORT}${APP_WS_PATH};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

export DOMAIN APP_PORT APP_WS_PATH
envsubst '${DOMAIN} ${APP_PORT} ${APP_WS_PATH}' < "$LOCAL_TEMPLATE" > "$LOCAL_RENDERED"

echo "📤 上传 Nginx 配置模板..."
scp "$LOCAL_RENDERED" "$REMOTE":"$REMOTE_CONFIG_TMP"

echo "🖥️  连接到服务器执行配置..."
ssh "$REMOTE" "DOMAIN='$DOMAIN' EMAIL='$EMAIL' REMOTE_CONFIG_TMP='$REMOTE_CONFIG_TMP' REMOTE_APP_DIR='$REMOTE_APP_DIR' STAGING_FLAG='$STAGING_FLAG' SUDO_PASS='$SUDO_PASS' CERTBOT_ARGS_STR='$CERTBOT_ARGS_STR' bash -s" <<'ENDSSH'
set -euo pipefail

DOMAIN="${DOMAIN}"
EMAIL="${EMAIL}"
REMOTE_CONFIG_TMP="${REMOTE_CONFIG_TMP}"
REMOTE_APP_DIR="${REMOTE_APP_DIR}"
STAGING_FLAG="${STAGING_FLAG}"
SUDO_PASS="${SUDO_PASS}"
CERTBOT_ARGS_STR="${CERTBOT_ARGS_STR}"
read -r -a CERTBOT_ARGS <<< "${CERTBOT_ARGS_STR}"

sudo_run() {
  if [[ -n "$SUDO_PASS" ]]; then
    printf '%s\n' "$SUDO_PASS" | sudo -S "$@"
  else
    sudo "$@"
  fi
}

if ! command -v nginx >/dev/null 2>&1; then
  echo "⚙️  安装 Nginx..."
  sudo_run apt-get update
  sudo_run apt-get install -y nginx
fi

if ! command -v certbot >/dev/null 2>&1; then
  echo "⚙️  安装 Certbot..."
  sudo_run apt-get update
  sudo_run apt-get install -y certbot python3-certbot-nginx
fi

if ! command -v node >/dev/null 2>&1; then
  echo "⚠️  请先在服务器上部署 print-agent（未检测到 Node.js）"
fi

TARGET="/etc/nginx/sites-available/${DOMAIN}.conf"
ENABLED="/etc/nginx/sites-enabled/${DOMAIN}.conf"
sudo_run mv "$REMOTE_CONFIG_TMP" "$TARGET"
sudo_run ln -sf "$TARGET" "$ENABLED"

if sudo_run nginx -t; then
  echo "✅ Nginx 配置测试通过"
  sudo_run systemctl reload nginx
else
  echo "❌ Nginx 配置测试失败"
  exit 1
fi

echo "🔐 申请/更新 TLS 证书..."
sudo_run certbot "${CERTBOT_ARGS[@]}"

echo "🔁 重载 Nginx..."
sudo_run systemctl reload nginx

echo ""
echo "✅ 域名已配置完成: https://${DOMAIN}"
ENDSSH

echo ""
echo "🎉 完成！请确保 DNS 已将 ${DOMAIN} 指向 ${SERVER_HOST}"
echo ""

