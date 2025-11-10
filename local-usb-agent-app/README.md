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
- 所有图标均使用 `src/assets/icon-512.svg`，Windows 托盘自动缩放为 32×32。

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

在 Windows 终端上，如果出现 `LIBUSB_ERROR_NOT_SUPPORTED`，说明该 USB 打印机仍由系统内置驱动(`usbprint.sys`)托管。要让 Agent 直接写入打印数据，需要将该设备的接口切换成 WinUSB/libusbK 驱动：

1. 下载 [Zadig](https://zadig.akeo.ie/) 并以管理员身份运行，菜单 `Options` 勾选 `List All Devices`。
2. 在下拉列表中选择目标打印机接口（可参考 UI 中显示的 `VID_xxxx & PID_xxxx`），右侧驱动选择 `WinUSB (v6.x)` 或 `libusbK`。
3. 点击 `Replace Driver` 后重新插拔打印机/重启 Agent，再次测试打印。

> **注意**：切换成 WinUSB 后，该打印机将不再走 Windows 默认打印队列。如需恢复，请在 Zadig 中重新安装原厂驱动 (`usbprint.sys`)。

## 常见问题

| 问题 | 排查建议 |
| ---- | -------- |
| 托盘/状态栏看不到图标 | Windows 需展开托盘箭头并设置“始终显示”；macOS 请确保状态栏未隐藏图标。 |
| 开机未自动启动 | 检查“随系统启动”是否勾选，并确认启动目录存在 `.lnk`；必要时重新勾选一次。 |
| 打印中文仍乱码 | 先运行内置测试单确认编码，如仍异常请检查 WinUSB 驱动并确认上游数据为 UTF-8。 |
| 默认打印机测试失败 | 查看托盘“最近测试记录”或 `agent.log`，确认设备是否被其他程序占用。 |

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
