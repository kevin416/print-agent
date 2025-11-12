# Yepos Agent

Electron 驱动的本地打印守护进程，用于在 Windows/macOS 终端上桥接浏览器与 USB/TCP 打印机。提供托盘常驻、配置面板、自启动选项、设备映射以及日志查看。

## 特性

- ✅ Electron 界面与托盘常驻，随时打开控制面板
- ✅ 内置 Express HTTP 服务 (`/health`, `/print`)，兼容现有浏览器联调接口
- ✅ 自动保存 `shopId`、端口、自签名策略等配置（基于 `electron-store`）
- ✅ USB 设备枚举、别名管理，与日志查看
- ✅ OS 自启动开关（Windows/macOS `Login Items`，Windows 额外写入启动项快捷方式），系统重启时自动后台运行
- ✅ 日志持久化至跨平台日志目录（macOS `~/Library/Logs/YeposAgent/agent.log`、Windows `%APPDATA%\\YeposAgent\\Logs`）
- ✅ 集成 electron-updater，支持自建更新源、手动检查与静默下载
- ✅ 周期性心跳上报（设备状态、版本、日志尾部）至中央 `print-agent` 后台
- ✅ 设备映射、用途标签、自定义默认机型与打印测试历史
- ✅ 首次启动引导，逐步完成 Shop ID、默认打印机和远程监控配置
- ✅ 单实例运行机制，防止重复启动和端口冲突
- ✅ 支持 USB 和 TCP 网络打印机
- 🧭 设备映射、打印队列与监控能力将持续增强

## 安装与启动

1. 从管理后台 (`https://pa.easyify.uk/`) 下载对应平台安装包（Windows 提供 `.exe` 安装版与 `.zip` 免安装包，macOS 提供 `.dmg` / `.zip`）。
2. 首次运行时填写 `Shop ID`，点击“保存配置”。建议随即点击“重新检测”确认列出本机打印机。
3. 界面关闭后程序会驻留托盘/状态栏，可通过托盘菜单重新打开控制面板。
4. 远程测试、设备热插拔、日志查看等功能均在控制面板中完成。

## 托盘与 UI 快捷操作

- 托盘菜单包含：打开控制面板、重新扫描设备、测试默认打印机、默认打印机设置、打开日志目录、最近测试记录，以及重新启动/退出。
- 控制面板右上角提供“重新启动”“完全退出”按钮，前者触发 `app.relaunch()`，后者确保托盘与后台服务一并退出。
- “设备热插拔”卡片会实时显示最近 5 条插拔事件，并支持对刚接入的打印机一键测试。
- 所有图标均使用 `src/assets/icon-512.svg`（Windows 使用 `icon.ico`），Windows 托盘自动缩放为 32×32。

## 开发

```bash
cd print-agent/local-usb-agent-app
npm install
npm run dev
```

> 首次运行会在托盘显示"Yepos Agent"，点击即可打开控制面板。

## 打包

### 通用打包命令

```bash
npm run build
```

Electron Builder 将输出至 `build/` 目录，对应平台的 DMG/ZIP/NSIS/AppImage 包。

### 平台特定打包命令

**Windows (x64):**
```bash
# 打包 Windows 安装程序（NSIS）
npx electron-builder --win --x64

# 打包 Windows 便携版（ZIP）
npx electron-builder --win --x64 --dir
```

**macOS:**
```bash
# 打包 macOS DMG 和 ZIP
npx electron-builder --mac

# 仅打包 DMG
npx electron-builder --mac --dmg

# 仅打包 ZIP
npx electron-builder --mac --zip

# 指定架构（arm64 或 x64）
npx electron-builder --mac --arm64
npx electron-builder --mac --x64
```

**Linux:**
```bash
# 打包 Linux AppImage 和 DEB
npx electron-builder --linux

# 仅打包 AppImage
npx electron-builder --linux --appimage

# 仅打包 DEB
npx electron-builder --linux --deb
```

**跨平台打包（需要对应平台环境）:**
```bash
# 同时打包 Windows 和 macOS（需要在 macOS 上运行）
npx electron-builder --win --mac

# 打包所有平台（需要在 macOS 上运行，Windows 需要 Wine）
npx electron-builder --win --mac --linux
```

> **注意**：Windows 安装包需要在 Windows 系统上构建，macOS 安装包需要在 macOS 系统上构建。Linux 可以在 macOS 或 Linux 上构建。

### 清理构建缓存

如果遇到应用名称、图标未更新等问题，可能需要清理构建缓存后重新构建：

**Windows (PowerShell):**
```powershell
# 删除构建目录
Remove-Item -Recurse -Force build

# 清理 electron-builder 缓存（可选）
Remove-Item -Recurse -Force "$env:USERPROFILE\AppData\Local\electron-builder\Cache" -ErrorAction SilentlyContinue

# 清理 node_modules 中的缓存（可选）
Remove-Item -Recurse -Force node_modules\.cache -ErrorAction SilentlyContinue

# 重新构建（使用 --clean 参数自动清理）
npx electron-builder --win --x64 --clean
```

**macOS/Linux:**
```bash
# 删除构建目录
rm -rf build

# 清理 electron-builder 缓存（可选）
rm -rf ~/.cache/electron-builder

# 清理 node_modules 中的缓存（可选）
rm -rf node_modules/.cache

# 重新构建（使用 --clean 参数自动清理）
npm run build -- --clean
```

## 打包上传到服务器

### 步骤概览

1. **打包应用**：在对应平台构建安装包
2. **整理构建产物**：将构建产物复制到 `updates/` 目录
3. **上传到服务器**：使用部署脚本同步到服务器

### 详细步骤

#### 1. 打包应用

**macOS:**
```bash
cd print-agent/local-usb-agent-app
npm run build
# 或指定架构
npx electron-builder --mac --arm64
npx electron-builder --mac --x64
```

**Windows:**
```bash
cd print-agent/local-usb-agent-app
npx electron-builder --win --x64
```

构建产物会输出到 `build/` 目录，包含：
- 安装包（`.dmg`, `.exe`, `.zip` 等）
- YAML 更新文件（`latest-mac.yml`, `latest.yml` 等）
- Blockmap 文件（用于增量更新）

#### 2. 整理构建产物

将构建产物复制到 `print-agent/updates/local-usb-agent/` 目录，按平台分类：

```bash
# 从项目根目录执行
cd print-agent

# 创建目录结构（如果不存在）
mkdir -p updates/local-usb-agent/{mac,win,linux}

# 创建稳定通道目录
mkdir -p updates/local-usb-agent/stable

# 复制 macOS 构建产物
cp local-usb-agent-app/build/*.dmg updates/local-usb-agent/mac/ 2>/dev/null || true
cp local-usb-agent-app/build/*-mac.zip updates/local-usb-agent/mac/ 2>/dev/null || true
cp local-usb-agent-app/build/latest-mac.yml updates/local-usb-agent/stable/stable-mac.yml 2>/dev/null || true
cp local-usb-agent-app/build/*.blockmap updates/local-usb-agent/mac/ 2>/dev/null || true

# 复制 Windows 构建产物
cp local-usb-agent-app/build/*.exe updates/local-usb-agent/win/ 2>/dev/null || true
cp local-usb-agent-app/build/*-win*.zip updates/local-usb-agent/win/ 2>/dev/null || true
cp local-usb-agent-app/build/latest.yml updates/local-usb-agent/stable/stable.yml 2>/dev/null || true
cp local-usb-agent-app/build/*.blockmap updates/local-usb-agent/win/ 2>/dev/null || true

# 复制 Linux 构建产物（如果有）
cp local-usb-agent-app/build/*.AppImage updates/local-usb-agent/linux/ 2>/dev/null || true
cp local-usb-agent-app/build/*.deb updates/local-usb-agent/linux/ 2>/dev/null || true
cp local-usb-agent-app/build/latest-linux.yml updates/local-usb-agent/stable/stable-linux.yml 2>/dev/null || true
```

**目录结构示例：**
```
print-agent/updates/local-usb-agent/
├── mac/
│   ├── Yepos Agent-0.2.1.dmg
│   ├── Yepos Agent-0.2.1-mac.zip
│   └── *.blockmap
├── win/
│   ├── Yepos Agent Setup-0.2.1.exe
│   ├── Yepos Agent-0.2.1-win64.zip
│   └── *.blockmap
├── linux/
│   ├── *.AppImage
│   └── *.deb
└── stable/
    ├── stable-mac.yml
    ├── stable.yml
    └── stable-linux.yml
```

> **注意**：YAML 文件需要放在 `stable/` 或 `beta/` 子目录下，`electron-updater` 会根据更新源 URL 和通道自动查找对应的文件。

#### 3. 上传到服务器

使用管理后台的部署脚本自动上传：

```bash
cd print-agent/admin

# 设置服务器密码（如果需要 sudo 权限）
export SUDO_PASS="your-sudo-password"

# 执行部署脚本（会自动同步 updates/ 目录）
./deploy-admin.sh
```

部署脚本会：
- 上传管理后台文件
- **自动同步 `updates/` 目录到服务器**（使用 `rsync`）
- 重启 PM2 服务
- 重载 Nginx 配置

#### 4. 验证上传

检查服务器上的文件：

```bash
# SSH 连接到服务器
ssh kevin@90.195.120.165

# 检查更新文件
ls -lh ~/print-agent/updates/local-usb-agent/mac/
ls -lh ~/print-agent/updates/local-usb-agent/win/

# 测试访问（应该返回 YAML 文件内容）
curl https://pa.easyify.uk/updates/local-usb-agent/stable/stable-mac.yml
curl https://pa.easyify.uk/updates/local-usb-agent/stable/stable.yml
```

### 注意事项

1. **YAML 文件命名**：
   - `electron-updater` 会根据平台和通道自动查找对应的 YAML 文件
   - macOS: `stable-mac.yml` 或 `latest-mac.yml`
   - Windows: `stable.yml` 或 `latest.yml`
   - Linux: `stable-linux.yml` 或 `latest-linux.yml`

2. **更新源路径**：
   - 更新源基础 URL: `https://pa.easyify.uk/updates/local-usb-agent`
   - 稳定通道: `https://pa.easyify.uk/updates/local-usb-agent/stable/`
   - Beta 通道: `https://pa.easyify.uk/updates/local-usb-agent/beta/`

3. **版本号**：
   - 确保 `package.json` 中的版本号已更新
   - YAML 文件中的版本号会自动从 `package.json` 读取

4. **文件权限**：
   - 确保服务器上的文件有正确的读取权限
   - Nginx 配置应允许访问 `.yml` 和 `.blockmap` 文件

5. **增量更新**：
   - Blockmap 文件用于支持增量更新，建议一并上传
   - 如果文件较大，可以考虑只上传完整安装包

### 快速脚本

项目根目录已提供自动化脚本 `deploy-client.sh`，可以一键完成打包、整理和上传：

```bash
# 从项目根目录执行
cd print-agent
./deploy-client.sh
```

脚本功能：
- ✅ **版本号管理**：自动递增或手动输入新版本号
  - 自动递增补丁版本 (0.2.2 -> 0.2.3)
  - 自动递增次版本 (0.2.2 -> 0.3.0)
  - 自动递增主版本 (0.2.2 -> 1.0.0)
  - 手动输入新版本号
  - 保持当前版本号
- ✅ 自动检测当前平台（macOS/Windows/Linux）
- ✅ 根据平台自动选择打包命令
- ✅ 自动整理构建产物到 `updates/` 目录
- ✅ 显示整理后的文件列表
- ✅ 可选择是否立即上传到服务器
- ✅ 如果选择不上传，会提示手动上传的方法
- ✅ 如果取消打包，可选择回滚版本号

**使用示例：**
```bash
# 1. 进入项目根目录
cd print-agent

# 2. 运行脚本
./deploy-client.sh

# 3. 按提示操作：
#    - 选择版本号管理方式（自动递增或手动输入）
#    - 确认是否开始打包
#    - 确认是否上传到服务器
```

**版本号管理说明：**
- **补丁版本** (Patch)：修复 bug 或小改动，例如 0.2.2 -> 0.2.3
- **次版本** (Minor)：新功能或较大改动，例如 0.2.2 -> 0.3.0
- **主版本** (Major)：重大变更或不兼容更新，例如 0.2.2 -> 1.0.0
- **手动输入**：可以输入任意符合 `x.y.z` 格式的版本号
- **保持当前**：不修改版本号，使用当前版本打包

**注意事项：**
- 脚本会自动检测当前平台并打包对应版本
- 如果需要打包其他平台，请手动执行对应的打包命令
- 上传到服务器需要 SSH 访问权限和 `SUDO_PASS` 环境变量（如果需要 sudo 权限）

## 自动更新

- 默认更新源：`https://pa.easyify.uk/updates/local-usb-agent`（可在 UI 中修改）
- 支持 `stable` / `beta` 通道与自动下载开关
- 也可以通过环境变量覆盖默认源：`LOCAL_AGENT_UPDATE_BASE_URL=https://...`（打包或运行前设置）
- 打包时需将 `latest.yml` 与对应安装包部署在更新源目录

控制面板会展示当前版本、检查状态、下载进度与发行说明；当新版本下载完成后，可一键触发安装。

## 远程监控（心跳上报）

- 默认上报地址：`https://pa.easyify.uk/api/agent-heartbeat`（可在 UI 中修改或关闭）
- 上传内容包含：版本、平台、USB 设备列表、核心配置、最近日志尾部（行数可调）
- 可配置上报间隔、日志开关，并支持手动“立即同步”
- 管理后台会聚合 `/api/agent-heartbeat` 数据，展示在线状态与最新日志

## 设备映射与测试

- 面板支持为每台 USB 打印机设置别名、用途（Kitchen/FrontDesk/…）以及默认设备
- 一键触发测试打印并记录结果，最近历史保存在本地，可随时查看或清空
- 映射存储于 `printerMappings`，历史保存在 `printHistory`，便于后续上传到中央服务

## 自启动机制

### Windows
- 控制面板中的"随系统启动"开关会写入/删除 `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Yepos Agent.lnk`。
- 快捷方式指向当前 `Yepos Agent.exe`，携带 `--hidden` 参数，登录后静默运行（不显示窗口，只在托盘显示图标）。
- 如果重新安装到新目录，建议关闭后再勾选一次以刷新启动项；也可以在任务管理器的"启动"标签或上述目录核实。

### macOS
- 使用系统 `Login Items` 机制，通过 `app.setLoginItemSettings` 设置。
- 自启动时同样携带 `--hidden` 参数，登录后静默运行（不显示窗口，只在状态栏显示图标）。

### 单实例运行
- 应用使用单实例锁定机制，确保同一时间只有一个实例运行。
- 如果应用已经启动，再次打开应用会自动显示并聚焦已存在的窗口，而不是启动新实例或报错。
- 系统重启时，应用会自动在后台启动，只显示托盘/状态栏图标，不显示窗口。用户可以通过点击托盘图标打开控制面板。

## 中文打印与编码

- 本地打印路径（USB/TCP、托盘测试、远程任务、HTTP `/print`）统一使用 `GB18030` 编码，覆盖所有简繁中文字符。
- 管理后台下发的远程测试任务会在服务器端先转换为 `GB18030` 再发给 Agent。
- 常见排查：
  - 控制面板“测试打印”若出现乱码，优先确认打印机驱动（需 WinUSB/libusbK）。
  - 确保上层系统传入的文本为 UTF-8，避免重复转码。
  - 检查打印历史/最近测试记录中的错误信息定位问题。

更多型号兼容性及驱动记录请参见 [`docs/printer-compatibility.md`](../docs/printer-compatibility.md)。

## Windows USB 驱动提示（LIBUSB_ERROR_NOT_SUPPORTED）

### 问题描述

在 Windows 系统上，如果出现 `LIBUSB_ERROR_NOT_SUPPORTED` 错误，说明该 USB 打印机仍由系统内置驱动 (`usbprint.sys`) 托管。要让 Agent 直接写入打印数据，需要将该设备的接口切换成 WinUSB/libusbK 驱动。

### 错误识别

当出现以下情况时，应用会自动检测到驱动问题：
- 错误消息包含 `LIBUSB_ERROR_NOT_SUPPORTED`
- 错误消息包含 `not supported` 或 `NOT_SUPPORTED`
- 错误消息包含 `Windows USB 驱动不支持`

在控制面板的设备列表中，如果测试打印失败且错误消息包含上述关键词，应用会显示"查看解决方案"链接，点击即可查看详细的解决步骤。

### 解决步骤

#### 方法一：使用 Zadig 工具（推荐）

1. **下载 Zadig 工具**
   - 访问 Zadig 官网：https://zadig.akeo.ie/
   - 下载最新版本的 Zadig（支持 Windows 7/8/10/11）

2. **以管理员身份运行**
   - 右键点击下载的 `zadig.exe`
   - 选择"以管理员身份运行"
   - 如果出现 UAC 提示，点击"是"

3. **配置 Zadig 选项**
   - 在 Zadig 主界面，点击菜单 `Options`
   - 勾选 `List All Devices`（显示所有设备）
   - 勾选 `Ignore Hubs or Composite Parents`（忽略 USB 集线器，可选）

4. **选择目标打印机**
   - 在下拉列表中找到目标打印机
   - 可参考应用 UI 中显示的 `VID_xxxx & PID_xxxx` 来识别设备
   - 例如：如果 UI 显示 `VID_04e8 & PID_0202`，在 Zadig 中选择对应的设备

5. **选择驱动类型**
   - 在右侧驱动选择区域，选择 `WinUSB (v6.x)` 或 `libusbK`
   - 推荐使用 `WinUSB (v6.x)`（兼容性更好）

6. **替换驱动**
   - 点击 `Replace Driver` 按钮
   - 如果出现警告提示，确认后继续
   - 等待驱动安装完成（通常需要几秒钟）

7. **验证安装**
   - 重新插拔 USB 打印机（或重启 Agent）
   - 在应用控制面板中点击"测试打印"
   - 如果打印成功，说明驱动切换成功

#### 方法二：使用设备管理器（高级用户）

1. 打开设备管理器（`devmgmt.msc`）
2. 找到目标打印机设备
3. 右键点击设备，选择"更新驱动程序"
4. 选择"浏览我的电脑以查找驱动程序"
5. 选择"让我从计算机上的可用驱动程序列表中选取"
6. 选择 `WinUSB` 或 `libusbK` 驱动
7. 完成驱动安装后重启 Agent

### 注意事项

- ⚠️ **重要**：切换成 WinUSB/libusbK 后，该打印机将**不再走 Windows 默认打印队列**。这意味着：
  - 无法通过 Windows 的"打印"对话框使用该打印机
  - 无法在其他应用程序中直接选择该打印机打印
  - 只能通过 Agent 应用程序进行打印

- 🔄 **恢复原驱动**：如果需要恢复 Windows 默认打印功能：
  1. 在 Zadig 中重新选择该设备
  2. 选择 `usbprint` 或原厂驱动
  3. 点击 `Replace Driver` 恢复

- 🔍 **识别设备**：如果 Zadig 中无法找到设备：
  - 确保打印机已正确连接到 USB 端口
  - 确保在 Zadig 中勾选了 `List All Devices`
  - 尝试重新插拔打印机后刷新设备列表

- 📝 **多台打印机**：如果有多台 USB 打印机，需要为每台打印机单独执行驱动切换操作

### 常见问题

**Q: 切换驱动后，Windows 打印队列中看不到打印机了？**
A: 这是正常现象。切换为 WinUSB/libusbK 后，打印机将不再出现在 Windows 打印队列中，只能通过 Agent 应用程序使用。

**Q: 切换驱动后，其他应用程序无法使用该打印机？**
A: 是的。如果需要其他应用程序也能使用，需要保留 Windows 默认驱动。但这样 Agent 将无法直接控制打印机。

**Q: 如何知道驱动切换是否成功？**
A: 在 Agent 控制面板中点击"测试打印"，如果打印成功且没有错误提示，说明驱动切换成功。

**Q: 切换驱动后，打印机仍然无法工作？**
A: 请检查：
1. 是否选择了正确的设备（VID/PID 是否匹配）
2. 是否选择了正确的驱动（WinUSB 或 libusbK）
3. 是否重新插拔了打印机
4. 是否重启了 Agent 应用程序
5. 查看应用日志文件中的详细错误信息

**Q: 已经用 Zadig 安装了 WinUSB，但还是出现 LIBUSB_ERROR_NOT_SUPPORTED？**
A: 这通常是因为以下原因之一：
1. **选择了错误的接口**：某些 USB 设备有多个接口，需要选择正确的接口（通常是接口 0 或标记为"打印机"的接口）
   - 在 Zadig 中，确保选择的是设备的**接口（Interface）**，而不是设备本身
   - 如果设备有多个接口，尝试每个接口都切换驱动
   
2. **驱动未正确安装**：
   - 检查设备管理器中，该设备是否显示为"WinUSB Device"或"libusbK Device"
   - 如果仍然显示为"USB 打印支持"或原厂驱动名称，说明驱动切换未成功
   
3. **需要完全重新插拔设备**：
   - 关闭 Agent 应用程序
   - 拔掉 USB 打印机
   - 等待 5 秒
   - 重新插入 USB 打印机
   - 等待 Windows 识别设备（可能需要几秒钟）
   - 重新启动 Agent 应用程序
   
4. **尝试不同的驱动**：
   - 如果 WinUSB 不工作，尝试 libusbK
   - 如果 libusbK 不工作，尝试 WinUSB
   - 某些设备可能对特定驱动版本更兼容
   
5. **检查设备管理器中的驱动状态**：
   - 打开设备管理器（`devmgmt.msc`）
   - 展开"通用串行总线控制器"或"libusb-win32 设备"
   - 找到你的设备（可能显示为"WinUSB Device"或设备 VID/PID）
   - 右键点击 → 属性 → 驱动程序
   - 确认驱动程序提供商是"Microsoft"（WinUSB）或"libusb-win32"（libusbK）
   - 如果显示"usbprint"或原厂驱动，说明切换未成功
   
6. **以管理员权限运行 Zadig**：
   - 确保以管理员身份运行 Zadig
   - 如果 UAC 提示被拒绝，驱动切换会失败
   
7. **检查是否有多个设备实例**（重要）：
   - 某些情况下，Windows 可能同时识别了原驱动和 WinUSB 驱动
   - 在设备管理器中，查看是否有重复的设备条目
   - **如果设备同时出现在"通用串行总线控制器"和"通用串行总线设备"下**：
     - 一个可能是 WinUSB 驱动（libwdi），另一个可能是 usbprint 驱动
     - **需要禁用或卸载 usbprint 驱动的设备实例**
     - 在设备管理器中，找到显示为"USB 打印支持"或原厂驱动名称的设备
     - 右键点击 → 禁用设备 或 卸载设备
     - 如果卸载，确保勾选"删除此设备的驱动程序软件"
     - 重新插拔设备，确认只剩下 WinUSB 驱动的设备实例
   
8. **libwdi 驱动问题**：
   - 如果使用 libwdi（Zadig 默认），但问题仍然存在
   - 可以尝试使用 Microsoft 官方的 WinUSB 驱动：
     - 在 Zadig 中，选择设备后，右侧驱动选择区域
     - 尝试选择 `WinUSB (v6.x)` 而不是 `libusbK`
     - 如果已经选择了 WinUSB，尝试切换到 `libusbK`
   
9. **检查设备是否被其他程序占用**：
   - 关闭所有可能使用打印机的程序
   - 检查 Windows 打印队列中是否有挂起的任务
   - 在任务管理器中，结束可能占用打印机的进程
   
10. **查看详细日志**：
    - 打开 Agent 控制面板 → 日志标签
    - 查看最近的错误日志
    - 日志会显示详细的错误信息，包括：
      - 设备打开失败的具体原因
      - 接口声明失败的具体原因
      - 端点查找失败的具体原因
    - 根据日志信息进一步排查问题

11. **WinUSB 驱动已安装但仍报错**（重要）：
    - 如果设备管理器显示 WinUSB 驱动已安装并启动（事件日志显示"已启动设备 (WinUSB)"），但 Agent 仍然报错：
      1. **完全重新插拔设备**：
         - 关闭 Agent 应用程序
         - 拔掉 USB 打印机
         - 等待 10-15 秒
         - 重新插入 USB 打印机
         - 等待 Windows 完全识别设备（可能需要 5-10 秒）
         - 重新启动 Agent 应用程序
         - 测试打印
      
      2. **检查是否有多个设备实例**：
         - 在设备管理器中，检查是否有多个相同 VID/PID 的设备实例
         - 如果有，确保只有一个使用 WinUSB 驱动
         - 卸载或禁用其他实例（特别是 usbprint 驱动的实例）
      
      3. **重启 Windows USB 子系统**（高级）：
         - 在设备管理器中，展开"通用串行总线控制器"
         - 找到"USB Root Hub"或"USB Host Controller"
         - 右键点击 → 禁用设备
         - 等待 5 秒
         - 右键点击 → 启用设备
         - 重新插拔 USB 打印机
         - 重新启动 Agent 应用程序
      
      4. **检查 libusb 是否能识别设备**：
         - 打开 Agent 控制面板 → 日志标签
         - 查看日志中是否有"Multiple devices found with same VID/PID"警告
         - 如果有，说明 libusb 检测到了多个设备实例
         - 查看日志中"Selected USB device"信息，确认选择了正确的设备
      
      5. **尝试不同的 USB 端口**：
         - 某些 USB 端口可能有兼容性问题
         - 尝试将打印机连接到不同的 USB 端口
         - 避免使用 USB 集线器，直接连接到电脑的 USB 端口

### 技术说明

- **usbprint.sys**：Windows 系统内置的 USB 打印机驱动，用于 Windows 打印队列
- **WinUSB**：Microsoft 提供的通用 USB 驱动，允许应用程序直接访问 USB 设备
- **libusbK**：基于 libusb 的 Windows USB 驱动，提供类似的功能
- **LIBUSB_ERROR_NOT_SUPPORTED**：libusb 库返回的错误码，表示当前驱动不支持直接访问设备

## 常见问题

| 问题 | 排查建议 |
| ---- | -------- |
| 托盘/状态栏看不到图标 | Windows 需展开托盘箭头并设置"始终显示"；macOS 请确保状态栏未隐藏图标。 |
| 开机未自动启动 | 检查"随系统启动"是否勾选，并确认启动目录存在 `.lnk`；必要时重新勾选一次。 |
| 再次打开应用报错端口占用 | 应用已实现单实例锁定，如果仍报错，请检查是否有残留进程，可通过任务管理器结束进程后重新打开。 |
| 打印中文仍乱码 | 先运行内置测试单确认编码，如仍异常请检查 WinUSB 驱动并确认上游数据为 UTF-8。 |
| 默认打印机测试失败 | 查看托盘"最近测试记录"或 `agent.log`，确认设备是否被其他程序占用。 |

## 目录结构

- `src/main`：Electron 主进程逻辑（窗口、托盘、配置、HTTP 服务、USB 驱动、自动更新）
- `src/renderer`：控制面板 UI（纯原生 DOM + IPC）
- `src/assets`：图标及静态资源预留

## 下一步规划

1. **Windows 打包完善**
   - 输出 `.ico` / `.icns` 资源并在 `electron-builder.yml` 中声明，让安装包、任务栏图标与托盘一致。
   - 评估是否需要 arm64 版本及便携版自动更新支持，确保 `latest.yml` 自动同步。
2. **自动更新链路实测**
   - 搭建 staging 通道，从 0.2.x 升级到下一版本，验证下载、提示、重启流程。
   - 整理 `updates/` 目录同步脚本，减少人工复制误差。
3. **更多打印机兼容性**
   - 针对常见 58/80mm 热敏、标签机等做驱动验证，补充 VID/PID 白名单。
   - 研究无法替换 WinUSB 的型号是否可通过系统打印队列或虚拟端口兼容。
4. **可观测性与运维**
   - 后台统计打印失败/编码错误的趋势，Agent 上传关键日志片段以便远程诊断。
   - Heartbeat 增加驱动类型、自检状态、最近任务耗时等指标。
5. **部署自动化**
   - 为 `deploy-admin.sh` / `deploy-to-server.sh` 提供 dry-run、完整日志输出，或整合成 CI/CD。
   - 记录服务器标准操作流程（PM2、Nginx、证书）降低手工部署风险。
6. **用户指引与回归测试**
   - 制作图文安装手册（含 Zadig 步骤、测试票样），在控制面板加入“查看帮助”链接。
   - 建立 USB/TCP/托盘/自启动/远程任务的回归测试清单，实现半自动化验证。
