#!/bin/bash

# 客户端打包并上传脚本
# 一键完成：打包应用 -> 整理构建产物 -> 上传到服务器

set -e

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🚀 Yepos Agent 客户端打包并上传脚本"
echo "════════════════════════════════════════════════════════════"
echo ""

# 检查是否在正确的目录
if [ ! -d "local-usb-agent-app" ]; then
    echo "❌ 错误：未找到 local-usb-agent-app 目录"
    echo "   请确保在 print-agent 项目根目录下运行此脚本"
    exit 1
fi

# 进入应用目录
cd local-usb-agent-app

# 检查 package.json
if [ ! -f "package.json" ]; then
    echo "❌ 错误：未找到 package.json"
    exit 1
fi

# 读取版本号
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "📦 当前版本: v${CURRENT_VERSION}"
echo ""

# 版本号管理
echo "版本号管理："
echo "  1) 自动递增补丁版本 (${CURRENT_VERSION} -> $(node -e "const v='${CURRENT_VERSION}'.split('.'); v[2]=parseInt(v[2])+1; console.log(v.join('.'))"))"
echo "  2) 自动递增次版本 (${CURRENT_VERSION} -> $(node -e "const v='${CURRENT_VERSION}'.split('.'); v[1]=parseInt(v[1])+1; v[2]=0; console.log(v.join('.'))"))"
echo "  3) 自动递增主版本 (${CURRENT_VERSION} -> $(node -e "const v='${CURRENT_VERSION}'.split('.'); v[0]=parseInt(v[0])+1; v[1]=0; v[2]=0; console.log(v.join('.'))"))"
echo "  4) 手动输入新版本号"
echo "  5) 保持当前版本号"
echo ""
read -p "请选择 (1-5) [默认: 5]: " VERSION_CHOICE
VERSION_CHOICE=${VERSION_CHOICE:-5}

NEW_VERSION=""
case $VERSION_CHOICE in
    1)
        # 递增补丁版本 (0.2.2 -> 0.2.3)
        NEW_VERSION=$(node -e "const v='${CURRENT_VERSION}'.split('.'); v[2]=parseInt(v[2])+1; console.log(v.join('.'))")
        ;;
    2)
        # 递增次版本 (0.2.2 -> 0.3.0)
        NEW_VERSION=$(node -e "const v='${CURRENT_VERSION}'.split('.'); v[1]=parseInt(v[1])+1; v[2]=0; console.log(v.join('.'))")
        ;;
    3)
        # 递增主版本 (0.2.2 -> 1.0.0)
        NEW_VERSION=$(node -e "const v='${CURRENT_VERSION}'.split('.'); v[0]=parseInt(v[0])+1; v[1]=0; v[2]=0; console.log(v.join('.'))")
        ;;
    4)
        # 手动输入
        read -p "请输入新版本号 (格式: x.y.z): " NEW_VERSION
        # 验证版本号格式
        if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "❌ 错误：版本号格式不正确，应为 x.y.z (例如: 0.2.3)"
            exit 1
        fi
        ;;
    5)
        # 保持当前版本
        NEW_VERSION="$CURRENT_VERSION"
        ;;
    *)
        echo "❌ 错误：无效的选择"
        exit 1
        ;;
esac

# 如果版本号有变化，更新 package.json
if [ "$NEW_VERSION" != "$CURRENT_VERSION" ]; then
    echo ""
    echo "📝 更新版本号: v${CURRENT_VERSION} -> v${NEW_VERSION}"
    # 使用 node 更新 package.json
    node -e "
        const fs = require('fs');
        const pkg = require('./package.json');
        pkg.version = '${NEW_VERSION}';
        fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
    echo "✅ 版本号已更新"
    VERSION="$NEW_VERSION"
else
    echo ""
    echo "📝 保持当前版本号: v${CURRENT_VERSION}"
    VERSION="$CURRENT_VERSION"
fi

echo ""
echo "────────────────────────────────────────────────────────────"
echo "📦 准备打包版本: v${VERSION}"
echo "────────────────────────────────────────────────────────────"
echo ""

# 询问是否继续
read -p "是否开始打包？(y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消"
    # 如果版本号已更新，可以选择是否回滚
    if [ "$NEW_VERSION" != "$CURRENT_VERSION" ]; then
        read -p "是否回滚版本号到 v${CURRENT_VERSION}？(y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            node -e "
                const fs = require('fs');
                const pkg = require('./package.json');
                pkg.version = '${CURRENT_VERSION}';
                fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
            "
            echo "✅ 版本号已回滚到 v${CURRENT_VERSION}"
        fi
    fi
    exit 0
fi

# 打包应用
echo ""
echo "📦 开始打包应用..."
echo "────────────────────────────────────────────────────────────"

# 检测当前平台
PLATFORM=$(uname -s)
ARCH=$(uname -m)

if [[ "$PLATFORM" == "Darwin" ]]; then
    echo "检测到 macOS 平台"
    if [[ "$ARCH" == "arm64" ]]; then
        echo "打包 macOS ARM64 版本..."
        npx electron-builder --mac --arm64
    else
        echo "打包 macOS x64 版本..."
        npx electron-builder --mac --x64
    fi
elif [[ "$PLATFORM" == "Linux" ]]; then
    echo "检测到 Linux 平台"
    echo "打包 Linux 版本..."
    npx electron-builder --linux
elif [[ "$PLATFORM" == MINGW* ]] || [[ "$PLATFORM" == MSYS* ]] || [[ "$PLATFORM" == CYGWIN* ]]; then
    echo "检测到 Windows 平台"
    echo "打包 Windows x64 版本..."
    npx electron-builder --win --x64
else
    echo "⚠️  未知平台，使用默认打包命令..."
    npm run build
fi

echo ""
echo "✅ 打包完成！"
echo ""

# 返回项目根目录
cd ..

# 整理构建产物
echo "📁 整理构建产物..."
echo "────────────────────────────────────────────────────────────"

# 创建目录结构
mkdir -p updates/local-usb-agent/{mac,win,linux}
mkdir -p updates/local-usb-agent/stable

# 复制 macOS 构建产物
echo "复制 macOS 构建产物..."
if ls local-usb-agent-app/build/*.dmg 1> /dev/null 2>&1; then
    cp local-usb-agent-app/build/*.dmg updates/local-usb-agent/mac/
    echo "  ✓ DMG 文件已复制"
fi
if ls local-usb-agent-app/build/*-mac.zip 1> /dev/null 2>&1; then
    cp local-usb-agent-app/build/*-mac.zip updates/local-usb-agent/mac/
    echo "  ✓ ZIP 文件已复制"
fi
if ls local-usb-agent-app/build/latest-mac.yml 1> /dev/null 2>&1; then
    cp local-usb-agent-app/build/latest-mac.yml updates/local-usb-agent/stable/stable-mac.yml
    echo "  ✓ YAML 文件已复制 (stable-mac.yml)"
fi
if ls local-usb-agent-app/build/*.blockmap 1> /dev/null 2>&1; then
    cp local-usb-agent-app/build/*.blockmap updates/local-usb-agent/mac/ 2>/dev/null || true
    echo "  ✓ Blockmap 文件已复制"
fi

# 复制 Windows 构建产物
echo "复制 Windows 构建产物..."
if ls local-usb-agent-app/build/*.exe 1> /dev/null 2>&1; then
    cp local-usb-agent-app/build/*.exe updates/local-usb-agent/win/
    echo "  ✓ EXE 文件已复制"
fi
if ls local-usb-agent-app/build/*-win*.zip 1> /dev/null 2>&1; then
    cp local-usb-agent-app/build/*-win*.zip updates/local-usb-agent/win/
    echo "  ✓ ZIP 文件已复制"
fi
if ls local-usb-agent-app/build/latest.yml 1> /dev/null 2>&1; then
    # 检查是否是 Windows 的 YAML（不是 macOS 的）
    if ! grep -q "mac" local-usb-agent-app/build/latest.yml 2>/dev/null; then
        cp local-usb-agent-app/build/latest.yml updates/local-usb-agent/stable/stable.yml
        echo "  ✓ YAML 文件已复制 (stable.yml)"
    fi
fi

# 复制 Linux 构建产物
echo "复制 Linux 构建产物..."
if ls local-usb-agent-app/build/*.AppImage 1> /dev/null 2>&1; then
    cp local-usb-agent-app/build/*.AppImage updates/local-usb-agent/linux/
    echo "  ✓ AppImage 文件已复制"
fi
if ls local-usb-agent-app/build/*.deb 1> /dev/null 2>&1; then
    cp local-usb-agent-app/build/*.deb updates/local-usb-agent/linux/
    echo "  ✓ DEB 文件已复制"
fi
if ls local-usb-agent-app/build/latest-linux.yml 1> /dev/null 2>&1; then
    cp local-usb-agent-app/build/latest-linux.yml updates/local-usb-agent/stable/stable-linux.yml
    echo "  ✓ YAML 文件已复制 (stable-linux.yml)"
fi

echo ""
echo "✅ 构建产物整理完成！"
echo ""

# 显示整理后的文件列表
echo "📋 整理后的文件列表："
echo "────────────────────────────────────────────────────────────"
echo "macOS:"
ls -lh updates/local-usb-agent/mac/ 2>/dev/null | tail -n +2 | awk '{print "  " $9 " (" $5 ")"}' || echo "  (无文件)"
echo ""
echo "Windows:"
ls -lh updates/local-usb-agent/win/ 2>/dev/null | tail -n +2 | awk '{print "  " $9 " (" $5 ")"}' || echo "  (无文件)"
echo ""
echo "Linux:"
ls -lh updates/local-usb-agent/linux/ 2>/dev/null | tail -n +2 | awk '{print "  " $9 " (" $5 ")"}' || echo "  (无文件)"
echo ""
echo "稳定通道 YAML:"
ls -lh updates/local-usb-agent/stable/ 2>/dev/null | tail -n +2 | awk '{print "  " $9 " (" $5 ")"}' || echo "  (无文件)"
echo ""

# 询问是否上传
read -p "是否上传到服务器？(y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "✅ 构建产物已整理完成，但未上传到服务器"
    echo "   文件位置: $(pwd)/updates/local-usb-agent/"
    echo "   可以稍后手动运行: cd admin && ./deploy-admin.sh"
    exit 0
fi

# 检查部署脚本
if [ ! -f "admin/deploy-admin.sh" ]; then
    echo "❌ 错误：未找到 admin/deploy-admin.sh"
    echo "   请确保部署脚本存在"
    exit 1
fi

# 上传到服务器
echo ""
echo "🚀 上传到服务器..."
echo "────────────────────────────────────────────────────────────"

cd admin
./deploy-admin.sh

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ 完成！客户端已打包并上传到服务器"
echo "════════════════════════════════════════════════════════════"
echo ""

