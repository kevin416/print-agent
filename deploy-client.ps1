# Yepos Agent 客户端打包并上传脚本 (Windows PowerShell)
# 一键完成：打包应用 -> 整理构建产物 -> 上传到服务器
# 
# 注意：如果遇到中文编码问题，建议使用 Git Bash 运行 deploy-client.sh
# 或使用 PowerShell Core 7+ (pwsh) 代替 Windows PowerShell

# 设置控制台编码为 UTF-8
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
    $PSDefaultParameterValues['*:Encoding'] = 'utf8'
    if ($PSVersionTable.PSVersion.Major -lt 6) {
        # Windows PowerShell 5.1 及以下版本
        chcp 65001 | Out-Null
    }
} catch {
    # 如果编码设置失败，继续执行（可能在某些环境中不支持）
    Write-Warning "无法设置 UTF-8 编码，可能会显示乱码。建议使用 Git Bash 或 PowerShell Core 7+"
}

$ErrorActionPreference = "Stop"

# 获取脚本所在目录
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $SCRIPT_DIR

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════"
Write-Host "🚀 Yepos Agent 客户端打包并上传脚本"
Write-Host "════════════════════════════════════════════════════════════"
Write-Host ""

# 检查是否在正确的目录
if (-not (Test-Path "local-usb-agent-app")) {
    Write-Host "❌ 错误：未找到 local-usb-agent-app 目录" -ForegroundColor Red
    Write-Host "   请确保在 print-agent 项目根目录下运行此脚本"
    exit 1
}

# 进入应用目录
Set-Location local-usb-agent-app

# 检查 package.json
if (-not (Test-Path "package.json")) {
    Write-Host "❌ 错误：未找到 package.json" -ForegroundColor Red
    exit 1
}

# 读取版本号
$packageJson = Get-Content "package.json" | ConvertFrom-Json
$CURRENT_VERSION = $packageJson.version
Write-Host "📦 当前版本: v$CURRENT_VERSION"
Write-Host ""

# 版本号管理
Write-Host "版本号管理："
$versionParts = $CURRENT_VERSION -split '\.'
$patchVersion = [int]$versionParts[2] + 1
$minorVersion = [int]$versionParts[1] + 1
$majorVersion = [int]$versionParts[0] + 1

$newPatchVersion = "$($versionParts[0]).$($versionParts[1]).$patchVersion"
$newMinorVersion = "$($versionParts[0]).$minorVersion.0"
$newMajorVersion = "$majorVersion.0.0"

Write-Host "  1) 自动递增补丁版本 ($CURRENT_VERSION -> $newPatchVersion)"
Write-Host "  2) 自动递增次版本 ($CURRENT_VERSION -> $newMinorVersion)"
Write-Host "  3) 自动递增主版本 ($CURRENT_VERSION -> $newMajorVersion)"
Write-Host "  4) 手动输入新版本号"
Write-Host "  5) 保持当前版本号"
Write-Host ""

$VERSION_CHOICE = Read-Host "请选择 (1-5) [默认: 5]"
if ([string]::IsNullOrWhiteSpace($VERSION_CHOICE)) {
    $VERSION_CHOICE = "5"
}

$NEW_VERSION = ""
switch ($VERSION_CHOICE) {
    "1" {
        # 递增补丁版本
        $NEW_VERSION = "$($versionParts[0]).$($versionParts[1]).$patchVersion"
    }
    "2" {
        # 递增次版本
        $NEW_VERSION = "$($versionParts[0]).$minorVersion.0"
    }
    "3" {
        # 递增主版本
        $NEW_VERSION = "$majorVersion.0.0"
    }
    "4" {
        # 手动输入
        $inputVersion = Read-Host "请输入新版本号 (格式: x.y.z)"
        if ($inputVersion -match '^\d+\.\d+\.\d+$') {
            $NEW_VERSION = $inputVersion
        } else {
            Write-Host "❌ 错误：版本号格式不正确，应为 x.y.z (例如: 0.2.3)" -ForegroundColor Red
            exit 1
        }
    }
    "5" {
        # 保持当前版本
        $NEW_VERSION = $CURRENT_VERSION
    }
    default {
        Write-Host "❌ 错误：无效的选择" -ForegroundColor Red
        exit 1
    }
}

# 如果版本号有变化，更新 package.json
if ($NEW_VERSION -ne $CURRENT_VERSION) {
    Write-Host ""
    Write-Host "📝 更新版本号: v$CURRENT_VERSION -> v$NEW_VERSION"
    $packageJson.version = $NEW_VERSION
    $packageJson | ConvertTo-Json -Depth 10 | Set-Content "package.json" -Encoding UTF8
    Write-Host "✅ 版本号已更新"
    $VERSION = $NEW_VERSION
} else {
    Write-Host ""
    Write-Host "📝 保持当前版本号: v$CURRENT_VERSION"
    $VERSION = $CURRENT_VERSION
}

Write-Host ""
Write-Host "────────────────────────────────────────────────────────────"
Write-Host "📦 准备打包版本: v$VERSION"
Write-Host "────────────────────────────────────────────────────────────"
Write-Host ""

# 询问是否继续
$continue = Read-Host "是否开始打包？(y/n)"
if ($continue -ne "y" -and $continue -ne "Y") {
    Write-Host "已取消"
    # 如果版本号已更新，可以选择是否回滚
    if ($NEW_VERSION -ne $CURRENT_VERSION) {
        $rollback = Read-Host "是否回滚版本号到 v$CURRENT_VERSION？(y/n)"
        if ($rollback -eq "y" -or $rollback -eq "Y") {
            $packageJson.version = $CURRENT_VERSION
            $packageJson | ConvertTo-Json -Depth 10 | Set-Content "package.json" -Encoding UTF8
            Write-Host "✅ 版本号已回滚到 v$CURRENT_VERSION"
        }
    }
    exit 0
}

# 打包应用
Write-Host ""
Write-Host "📦 开始打包应用..."
Write-Host "────────────────────────────────────────────────────────────"

# 检测当前平台
$PLATFORM = $env:OS
$ARCH = $env:PROCESSOR_ARCHITECTURE

if ($PLATFORM -like "*Windows*") {
    Write-Host "检测到 Windows 平台"
    Write-Host ""
    Write-Host "可用的打包选项："
    Write-Host "  1) Windows x64 (NSIS 安装程序 + ZIP)"
    Write-Host "  2) Linux (AppImage + DEB)"
    Write-Host "  3) Windows + Linux"
    Write-Host ""
    $BUILD_CHOICE = Read-Host "请选择打包选项 (1-3) [默认: 1]"
    if ([string]::IsNullOrWhiteSpace($BUILD_CHOICE)) {
        $BUILD_CHOICE = "1"
    }
    
    switch ($BUILD_CHOICE) {
        "1" {
            Write-Host "打包 Windows x64 版本..."
            npx electron-builder --win --x64
        }
        "2" {
            Write-Host "打包 Linux 版本..."
            npx electron-builder --linux
        }
        "3" {
            Write-Host "打包 Windows + Linux 版本..."
            npx electron-builder --win --x64 --linux
        }
        default {
            Write-Host "❌ 错误：无效的选择" -ForegroundColor Red
            exit 1
        }
    }
} else {
    Write-Host "⚠️  未知平台，使用默认打包命令..."
    npm run build
}

Write-Host ""
Write-Host "✅ 打包完成！"
Write-Host ""

# 返回项目根目录
Set-Location ..

# 整理构建产物
Write-Host "📁 整理构建产物..."
Write-Host "────────────────────────────────────────────────────────────"

# 创建目录结构
$null = New-Item -ItemType Directory -Force -Path "updates\local-usb-agent\mac"
$null = New-Item -ItemType Directory -Force -Path "updates\local-usb-agent\win"
$null = New-Item -ItemType Directory -Force -Path "updates\local-usb-agent\linux"
$null = New-Item -ItemType Directory -Force -Path "updates\local-usb-agent\stable"

# 复制 Windows 构建产物
Write-Host "复制 Windows 构建产物..."
$buildDir = "local-usb-agent-app\build"
if (Test-Path $buildDir) {
    $winFiles = Get-ChildItem "$buildDir\*.exe" -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "Setup" }
    if ($winFiles) {
        foreach ($file in $winFiles) {
            Copy-Item $file.FullName -Destination "updates\local-usb-agent\win\" -Force
            Write-Host "  ✓ EXE 文件已复制: $($file.Name)"
        }
    }
    $winZipFiles = Get-ChildItem "$buildDir\*-win*.zip" -ErrorAction SilentlyContinue
    if ($winZipFiles) {
        foreach ($file in $winZipFiles) {
            Copy-Item $file.FullName -Destination "updates\local-usb-agent\win\" -Force
            Write-Host "  ✓ ZIP 文件已复制: $($file.Name)"
        }
    }
    $latestYml = Get-Item "$buildDir\latest.yml" -ErrorAction SilentlyContinue
    if ($latestYml) {
        $ymlContent = Get-Content $latestYml.FullName -Raw
        if ($ymlContent -notmatch "mac") {
            Copy-Item $latestYml.FullName -Destination "updates\local-usb-agent\stable\stable.yml" -Force
            Write-Host "  ✓ YAML 文件已复制 (stable.yml)"
        }
    }
}

# 复制 macOS 构建产物（如果有）
Write-Host "复制 macOS 构建产物..."
if (Test-Path $buildDir) {
    $macDmgFiles = Get-ChildItem "$buildDir\*.dmg" -ErrorAction SilentlyContinue
    if ($macDmgFiles) {
        foreach ($file in $macDmgFiles) {
            Copy-Item $file.FullName -Destination "updates\local-usb-agent\mac\" -Force
            Write-Host "  ✓ DMG 文件已复制: $($file.Name)"
        }
    }
    $macZipFiles = Get-ChildItem "$buildDir\*-mac.zip" -ErrorAction SilentlyContinue
    if ($macZipFiles) {
        foreach ($file in $macZipFiles) {
            Copy-Item $file.FullName -Destination "updates\local-usb-agent\mac\" -Force
            Write-Host "  ✓ ZIP 文件已复制: $($file.Name)"
        }
    }
    $latestMacYml = Get-Item "$buildDir\latest-mac.yml" -ErrorAction SilentlyContinue
    if ($latestMacYml) {
        Copy-Item $latestMacYml.FullName -Destination "updates\local-usb-agent\stable\stable-mac.yml" -Force
        Write-Host "  ✓ YAML 文件已复制 (stable-mac.yml)"
    }
}

# 复制 Linux 构建产物（如果有）
Write-Host "复制 Linux 构建产物..."
if (Test-Path $buildDir) {
    $linuxAppImageFiles = Get-ChildItem "$buildDir\*.AppImage" -ErrorAction SilentlyContinue
    if ($linuxAppImageFiles) {
        foreach ($file in $linuxAppImageFiles) {
            Copy-Item $file.FullName -Destination "updates\local-usb-agent\linux\" -Force
            Write-Host "  ✓ AppImage 文件已复制: $($file.Name)"
        }
    }
    $linuxDebFiles = Get-ChildItem "$buildDir\*.deb" -ErrorAction SilentlyContinue
    if ($linuxDebFiles) {
        foreach ($file in $linuxDebFiles) {
            Copy-Item $file.FullName -Destination "updates\local-usb-agent\linux\" -Force
            Write-Host "  ✓ DEB 文件已复制: $($file.Name)"
        }
    }
    $latestLinuxYml = Get-Item "$buildDir\latest-linux.yml" -ErrorAction SilentlyContinue
    if ($latestLinuxYml) {
        Copy-Item $latestLinuxYml.FullName -Destination "updates\local-usb-agent\stable\stable-linux.yml" -Force
        Write-Host "  ✓ YAML 文件已复制 (stable-linux.yml)"
    }
}

Write-Host ""
Write-Host "✅ 构建产物整理完成！"
Write-Host ""

# 显示整理后的文件列表
Write-Host "📋 整理后的文件列表："
Write-Host "────────────────────────────────────────────────────────────"
Write-Host "Windows:"
Get-ChildItem "updates\local-usb-agent\win\" -ErrorAction SilentlyContinue | ForEach-Object {
    $size = "{0:N2} MB" -f ($_.Length / 1MB)
    Write-Host "  $($_.Name) ($size)"
}
Write-Host ""
Write-Host "macOS:"
Get-ChildItem "updates\local-usb-agent\mac\" -ErrorAction SilentlyContinue | ForEach-Object {
    $size = "{0:N2} MB" -f ($_.Length / 1MB)
    Write-Host "  $($_.Name) ($size)"
}
Write-Host ""
Write-Host "Linux:"
Get-ChildItem "updates\local-usb-agent\linux\" -ErrorAction SilentlyContinue | ForEach-Object {
    $size = "{0:N2} MB" -f ($_.Length / 1MB)
    Write-Host "  $($_.Name) ($size)"
}
Write-Host ""
Write-Host "稳定通道 YAML:"
Get-ChildItem "updates\local-usb-agent\stable\" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  $($_.Name)"
}
Write-Host ""

# 询问是否上传
$upload = Read-Host "是否上传到服务器？(y/n)"
if ($upload -ne "y" -and $upload -ne "Y") {
    Write-Host ""
    Write-Host "✅ 构建产物已整理完成，但未上传到服务器"
    Write-Host "   文件位置: $(Get-Location)\updates\local-usb-agent\"
    Write-Host "   可以稍后手动运行: cd admin && bash deploy-admin.sh"
    exit 0
}

# 检查部署脚本
if (-not (Test-Path "admin\deploy-admin.sh")) {
    Write-Host "❌ 错误：未找到 admin\deploy-admin.sh" -ForegroundColor Red
    Write-Host "   请确保部署脚本存在"
    exit 1
}

# 上传到服务器
Write-Host ""
Write-Host "🚀 上传到服务器..."
Write-Host "────────────────────────────────────────────────────────────"
Write-Host ""
Write-Host "⚠️  注意：Windows 上需要使用 Git Bash 或 WSL 来运行 deploy-admin.sh"
Write-Host "   或者使用支持 SSH 的工具（如 PuTTY、WinSCP）手动上传"
Write-Host ""
Write-Host "推荐方式："
Write-Host "  1. 使用 Git Bash: cd admin && bash deploy-admin.sh"
Write-Host "  2. 使用 WSL: wsl bash admin/deploy-admin.sh"
Write-Host "  3. 手动上传 updates/ 目录到服务器"
Write-Host ""

$useBash = Read-Host "是否尝试使用 Git Bash 运行部署脚本？(y/n)"
if ($useBash -eq "y" -or $useBash -eq "Y") {
    Set-Location admin
    bash deploy-admin.sh
} else {
    Write-Host ""
    Write-Host "✅ 构建产物已整理完成"
    Write-Host "   请手动运行: cd admin && bash deploy-admin.sh"
    Write-Host "   或使用其他方式上传 updates/ 目录到服务器"
}

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════"
Write-Host "✅ 完成！"
Write-Host "════════════════════════════════════════════════════════════"
Write-Host ""

