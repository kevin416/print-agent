# Local USB Print Agent (Electron MVP)

Electron 驱动的本地打印守护进程，用于在 Windows/macOS 终端上桥接浏览器与 USB 打印机。相比此前的 `local-usb-agent-demo`，此版本提供托盘常驻、配置面板、自启动选项、设备映射以及日志查看。

## 特性

- ✅ Electron 界面与托盘常驻，随时打开控制面板
- ✅ 内置 Express HTTP 服务 (`/health`, `/print`)，兼容现有浏览器联调接口
- ✅ 自动保存 `shopId`、端口、自签名策略等配置（基于 `electron-store`）
- ✅ USB 设备枚举、别名管理，与日志查看
- ✅ OS 自启动开关（Windows/macOS `Login Items`）
- ✅ 日志持久化至跨平台日志目录（macOS `~/Library/Logs/LocalUSBPrintAgent/agent.log`、Windows `%APPDATA%\\LocalUSBPrintAgent\\Logs`）
- ✅ 集成 electron-updater，支持自建更新源、手动检查与静默下载
- ✅ 周期性心跳上报（设备状态、版本、日志尾部）至中央 `print-agent` 后台
- ✅ 设备映射、用途标签、自定义默认机型与打印测试历史
- ✅ 首次启动引导，逐步完成 Shop ID、默认打印机和远程监控配置
- 🧭 设备映射、打印队列与监控能力将持续增强

## 开发

```bash
cd print-agent/local-usb-agent-app
npm install
npm run dev
```

> 首次运行会在托盘显示“Local USB Print Agent”，点击即可打开控制面板。

## 打包

```bash
npm run build
```

Electron Builder 将输出至 `build/` 目录，对应平台的 DMG/ZIP/NSIS/AppImage 包。

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

## 目录结构

- `src/main`：Electron 主进程逻辑（窗口、托盘、配置、HTTP 服务、USB 驱动、自动更新）
- `src/renderer`：控制面板 UI（纯原生 DOM + IPC）
- `src/assets`：图标及静态资源预留

## 下一步规划

- 设备映射与打印任务队列管理 UI 优化
- 上传打印任务历史、失败重试统计
- 托盘菜单直接触发测试打印、查看版本等操作
- 首次启动向导、自动诊断等用户体验增强
