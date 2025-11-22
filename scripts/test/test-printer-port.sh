#!/bin/bash

# 测试打印机端口连接脚本
# 在分店电脑上运行

PRINTER_IP="${1:-192.168.0.172}"
PRINTER_PORT="${2:-9100}"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🔍 测试打印机端口连接"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "打印机: $PRINTER_IP:$PRINTER_PORT"
echo ""

# 1. 测试 ping
echo "1️⃣  测试网络连接 (ping)..."
if ping -c 2 -W 2 $PRINTER_IP > /dev/null 2>&1; then
    echo "   ✅ 网络连接正常"
else
    echo "   ❌ 网络连接失败"
    exit 1
fi
echo ""

# 2. 测试端口连接（使用 telnet）
echo "2️⃣  测试端口 $PRINTER_PORT 连接 (telnet)..."
if command -v telnet &> /dev/null; then
    timeout 3 telnet $PRINTER_IP $PRINTER_PORT 2>&1 | grep -q "Connected\|Escape" && echo "   ✅ 端口 $PRINTER_PORT 可连接" || echo "   ❌ 端口 $PRINTER_PORT 无法连接"
else
    echo "   ⚠️  telnet 未安装，使用其他方法测试..."
fi
echo ""

# 3. 测试端口连接（使用 nc/netcat）
echo "3️⃣  测试端口 $PRINTER_PORT 连接 (nc)..."
if command -v nc &> /dev/null; then
    if timeout 3 nc -zv $PRINTER_IP $PRINTER_PORT 2>&1 | grep -q "succeeded\|open"; then
        echo "   ✅ 端口 $PRINTER_PORT 开放"
    else
        echo "   ❌ 端口 $PRINTER_PORT 关闭或无法连接"
    fi
else
    echo "   ⚠️  nc 未安装，跳过此测试"
fi
echo ""

# 4. 测试端口连接（使用 bash）
echo "4️⃣  测试端口 $PRINTER_PORT 连接 (bash TCP)..."
if timeout 3 bash -c "</dev/tcp/$PRINTER_IP/$PRINTER_PORT" 2>/dev/null; then
    echo "   ✅ 端口 $PRINTER_PORT 可连接"
else
    echo "   ❌ 端口 $PRINTER_PORT 无法连接"
    echo ""
    echo "   ⚠️  可能的原因："
    echo "      1. 打印机未启用 Raw TCP/IP 端口（9100）"
    echo "      2. 打印机端口不是 9100，而是其他端口（如 515, 631, 9101 等）"
    echo "      3. 打印机防火墙阻止了连接"
    echo "      4. 打印机需要特定的连接方式或认证"
    echo ""
    echo "   💡 建议："
    echo "      1. 检查打印机网络设置，确认 Raw TCP/IP 端口已启用"
    echo "      2. 尝试其他常见端口：515 (LPD), 631 (IPP), 9101, 9102"
    echo "      3. 查看打印机用户手册，确认正确的端口号"
fi
echo ""

# 5. 尝试发送测试数据
echo "5️⃣  尝试发送测试打印数据..."
if command -v nc &> /dev/null; then
    TEST_DATA="测试打印\n时间: $(date '+%Y-%m-%d %H:%M:%S')\n"
    if echo -e "$TEST_DATA" | timeout 3 nc -w 3 $PRINTER_IP $PRINTER_PORT 2>/dev/null; then
        echo "   ✅ 测试数据已发送"
        echo "   📄 请检查打印机是否打印出测试内容"
    else
        echo "   ❌ 无法发送数据"
    fi
else
    echo "   ⚠️  nc 未安装，跳过此测试"
fi
echo ""

# 6. 扫描常见打印端口
echo "6️⃣  扫描常见打印端口..."
COMMON_PORTS=(9100 515 631 9101 9102)
for port in "${COMMON_PORTS[@]}"; do
    if timeout 2 bash -c "</dev/tcp/$PRINTER_IP/$port" 2>/dev/null; then
        echo "   ✅ 端口 $port 开放"
    fi
done
echo ""

echo "════════════════════════════════════════════════════════════"
echo "✅ 测试完成！"
echo "════════════════════════════════════════════════════════════"
echo ""
