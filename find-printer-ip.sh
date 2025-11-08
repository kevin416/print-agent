#!/bin/bash

# 查找打印机 IP 地址脚本
# 在分店电脑上运行此脚本来查找打印机

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🔍 查找打印机 IP 地址"
echo "════════════════════════════════════════════════════════════"
echo ""

# 获取本机 IP 和网段
LOCAL_IP=$(ip route get 8.8.8.8 2>/dev/null | awk '{print $7; exit}' || hostname -I | awk '{print $1}')
NETWORK=$(echo $LOCAL_IP | cut -d. -f1-3)

echo "本机 IP: $LOCAL_IP"
echo "网段: $NETWORK.0/24"
echo ""

# 检查是否安装了 nmap
if ! command -v nmap &> /dev/null; then
    echo "⚠️  nmap 未安装，正在安装..."
    sudo apt-get update
    sudo apt-get install -y nmap
fi

echo "正在扫描网段 $NETWORK.0/24，查找开放 9100 端口的设备..."
echo "（这可能需要几分钟）"
echo ""

# 扫描网段，查找开放 9100 端口的设备
nmap -p 9100 --open $NETWORK.0/24 2>/dev/null | grep -E "Nmap scan report|9100/tcp" | while read line; do
    if [[ $line =~ "Nmap scan report" ]]; then
        IP=$(echo $line | awk '{print $5}')
        echo "发现设备: $IP"
    elif [[ $line =~ "9100/tcp" ]]; then
        echo "  ✅ 端口 9100 开放（可能是打印机）"
        echo ""
    fi
done

echo ""
echo "════════════════════════════════════════════════════════════"
echo "💡 提示："
echo "   1. 如果找到多个设备，请根据打印机型号确认"
echo "   2. 也可以从打印机控制面板查看 IP 地址"
echo "   3. 或登录路由器查看已连接设备"
echo "════════════════════════════════════════════════════════════"
echo ""
