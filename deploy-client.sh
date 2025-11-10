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
    echo ""
    echo "可用的打包选项："
    echo "  1) macOS ARM64 (Apple Silicon)"
    echo "  2) macOS x64 (Intel)"
    echo "  3) Linux (AppImage + DEB)"
    echo "  4) 所有 macOS 版本 (ARM64 + x64)"
    echo "  5) macOS + Linux"
    echo ""
    echo "⚠️  注意：在 macOS 上无法直接打包 Windows 版本"
    echo "   如需打包 Windows 版本，请在 Windows 系统上运行此脚本"
    echo ""
    read -p "请选择打包选项 (1-5) [默认: 1]: " BUILD_CHOICE
    BUILD_CHOICE=${BUILD_CHOICE:-1}
    
    case $BUILD_CHOICE in
        1)
            echo "打包 macOS ARM64 版本..."
            npx electron-builder --mac --arm64
            ;;
        2)
            echo "打包 macOS x64 版本..."
            npx electron-builder --mac --x64
            ;;
        3)
            echo "打包 Linux 版本..."
            npx electron-builder --linux
            ;;
        4)
            echo "打包所有 macOS 版本 (ARM64 + x64)..."
            npx electron-builder --mac --arm64 --x64
            ;;
        5)
            echo "打包 macOS + Linux 版本..."
            npx electron-builder --mac --linux
            ;;
        *)
            echo "❌ 错误：无效的选择"
            exit 1
            ;;
    esac
elif [[ "$PLATFORM" == "Linux" ]]; then
    echo "检测到 Linux 平台"
    echo ""
    echo "可用的打包选项："
    echo "  1) Linux (AppImage + DEB)"
    echo "  2) Windows x64 (需要 Wine)"
    echo "  3) Linux + Windows"
    echo ""
    read -p "请选择打包选项 (1-3) [默认: 1]: " BUILD_CHOICE
    BUILD_CHOICE=${BUILD_CHOICE:-1}
    
    case $BUILD_CHOICE in
        1)
            echo "打包 Linux 版本..."
            npx electron-builder --linux
            ;;
        2)
            echo "打包 Windows x64 版本 (需要 Wine)..."
            if ! command -v wine &> /dev/null; then
                echo "⚠️  警告：未检测到 Wine，Windows 打包可能失败"
                echo "   安装 Wine: sudo apt-get install wine (Ubuntu/Debian)"
                read -p "是否继续？(y/n) " -n 1 -r
                echo
                if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                    exit 0
                fi
            fi
            npx electron-builder --win --x64
            ;;
        3)
            echo "打包 Linux + Windows 版本..."
            npx electron-builder --linux --win --x64
            ;;
        *)
            echo "❌ 错误：无效的选择"
            exit 1
            ;;
    esac
elif [[ "$PLATFORM" == MINGW* ]] || [[ "$PLATFORM" == MSYS* ]] || [[ "$PLATFORM" == CYGWIN* ]]; then
    echo "检测到 Windows 平台"
    echo ""
    echo "可用的打包选项："
    echo "  1) Windows x64 (NSIS 安装程序 + ZIP)"
    echo "  2) Linux (AppImage + DEB)"
    echo "  3) Windows + Linux"
    echo ""
    read -p "请选择打包选项 (1-3) [默认: 1]: " BUILD_CHOICE
    BUILD_CHOICE=${BUILD_CHOICE:-1}
    
    case $BUILD_CHOICE in
        1)
            echo "打包 Windows x64 版本..."
            npx electron-builder --win --x64
            ;;
        2)
            echo "打包 Linux 版本..."
            npx electron-builder --linux
            ;;
        3)
            echo "打包 Windows + Linux 版本..."
            npx electron-builder --win --x64 --linux
            ;;
        *)
            echo "❌ 错误：无效的选择"
            exit 1
            ;;
    esac
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

# 验证 updates 目录是否存在
if [ ! -d "updates/local-usb-agent" ]; then
    echo "⚠️  警告：未找到 updates/local-usb-agent 目录"
    echo "   请确保构建产物已正确整理"
    read -p "是否继续上传？（可能不会上传客户端安装包）(y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
fi

# 显示要上传的文件
echo ""
echo "📋 准备上传的文件："
echo "────────────────────────────────────────────────────────────"
if [ -d "updates/local-usb-agent" ]; then
    echo "客户端安装包："
    find updates/local-usb-agent -type f -name "*.exe" -o -name "*.dmg" -o -name "*.zip" -o -name "*.AppImage" -o -name "*.deb" -o -name "*.yml" 2>/dev/null | while read file; do
        size=$(ls -lh "$file" 2>/dev/null | awk '{print $5}')
        echo "  - $file ($size)"
    done
fi
echo ""

# 上传到服务器
echo "🚀 上传到服务器..."
echo "────────────────────────────────────────────────────────────"

cd admin
./deploy-admin.sh

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ 完成！客户端已打包并上传到服务器"
echo "════════════════════════════════════════════════════════════"
echo ""

