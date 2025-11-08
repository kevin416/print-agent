#!/bin/bash

# 打印机连接测试脚本
# 在分店电脑上运行此脚本来测试打印机连接

PRINTER_IP="${1:-192.168.0.172}"
PRINTER_PORT="${2:-9100}"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🔍 打印机连接测试"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "打印机: $PRINTER_IP:$PRINTER_PORT"
echo ""

# 1. 测试网络连接
echo "1️⃣  测试网络连接 (ping)..."
if ping -c 3 -W 2 $PRINTER_IP > /dev/null 2>&1; then
    echo "   ✅ 网络连接正常"
else
    echo "   ❌ 网络连接失败"
    echo "   ⚠️  可能的原因："
    echo "      - 打印机未开机"
    echo "      - IP 地址不正确"
    echo "      - 打印机和电脑不在同一网络"
    exit 1
fi
echo ""

# 2. 测试端口连接
echo "2️⃣  测试端口连接 ($PRINTER_PORT)..."
if timeout 3 bash -c "</dev/tcp/$PRINTER_IP/$PRINTER_PORT" 2>/dev/null; then
    echo "   ✅ 端口 $PRINTER_PORT 开放"
else
    echo "   ❌ 端口 $PRINTER_PORT 无法连接"
    echo "   ⚠️  可能的原因："
    echo "      - 打印机端口不是 $PRINTER_PORT"
    echo "      - 防火墙阻止了连接"
    echo "      - 打印机未启用 Raw TCP/IP 打印"
    exit 1
fi
echo ""

# 3. 测试打印功能
echo "3️⃣  测试打印功能..."
TEST_DATA="测试打印
时间: $(date '+%Y-%m-%d %H:%M:%S')
打印机: $PRINTER_IP:$PRINTER_PORT
"

if echo -e "$TEST_DATA" | nc -w 3 $PRINTER_IP $PRINTER_PORT 2>/dev/null; then
    echo "   ✅ 打印测试数据已发送"
    echo "   📄 请检查打印机是否打印出测试内容"
else
    echo "   ❌ 无法发送打印数据"
    echo "   ⚠️  请检查打印机状态和网络连接"
    exit 1
fi
echo ""

# 4. 显示网络信息
echo "4️⃣  当前网络信息..."
echo "   本机 IP 地址:"
ip addr show | grep "inet " | grep -v "127.0.0.1" | awk '{print "      " $2}' | cut -d/ -f1
echo ""

# 5. 扫描同网段设备（可选）
echo "5️⃣  扫描同网段设备（可选）..."
echo "   提示: 如果打印机 IP 不正确，可以运行以下命令查找："
echo "   nmap -sn $(ip route | grep default | awk '{print $3}' | cut -d. -f1-3).0/24"
echo ""

echo "════════════════════════════════════════════════════════════"
echo "✅ 测试完成！"
echo "════════════════════════════════════════════════════════════"
echo ""
