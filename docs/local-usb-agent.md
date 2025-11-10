# 本地 USB 打印代理方案设计

## 目标

- 为 Windows / macOS 门店提供稳定的 USB 打印能力
- 浏览器端（manager_next / FastPrintLib）优先调用本地 Agent
- 保留现有网络打印和 WebUSB 作为兜底
- 与 FastPrintLib 数据格式、打印模板保持兼容

## 一阶段路线

1. **文档与架构设计（当前阶段）**
   - 明确 Agent 功能、接口、模块划分
   - 整理浏览器与 Agent 的交互流程
2. **阶段一：Demo 验证**
   - 快速搭建最小可运行 Agent（Node.js 命令行）
   - 支持基础 `/health` 和 `/print` 接口，验证常见打印机
3. **阶段二：Agent MVP**
   - 加入托盘 UI、自启动、日志、设备管理界面
   - 打包 Windows/macOS 安装包
4. **阶段三：manager_next 集成**
   - `usePrintService` 优先访问本地 Agent
   - UI 展示 Agent 状态，提供下载入口
5. **阶段四：试点与推广**
   - 门店试点、收集反馈
   - 完善自动更新与疑难解答

## 架构总览

```
浏览器 / FastPrintLib
        │  HTTP/WebSocket
        ▼
本地 USB Agent（守护进程）
        │  node-usb / 原生驱动
        ▼
USB 打印机
```

- **Agent 监听**：默认 `http://127.0.0.1:40713`
- **安全**：仅本机访问，可选 Token 保护
- **兼容**：数据结构沿用 FastPrintLib 当前传输格式

## Agent 功能模块

| 模块               | 描述                                                    |
| ------------------ | ------------------------------------------------------- |
| `usb-manager`      | 枚举 USB、读取 VID/PID、匹配打印机别名                  |
| `printer-adapter`  | 发送 ESC/POS 二进制到 USB；后续可扩展蓝牙/串口          |
| `http-server`      | Express/Koa 接口；支持 REST + WebSocket                |
| `tray-manager`     | 托盘图标、状态提示、快捷菜单（MVP 阶段可选）           |
| `config-store`     | JSON/SQLite 存储 `shopId`、设备映射、日志              |
| `auto-launch`      | Windows 注册表 / macOS launchctl                       |
| `logger`           | 本地日志 + 后续可上传云端                               |
| `updater`          | 预留自动更新（阶段二之后）                              |

## API 设计（初版）

| 方法 | 路径                     | 描述                       | 说明 |
| ---- | ------------------------ | -------------------------- | ---- |
| GET  | `/health`                | Agent 状态、版本、设备列表 | 返回打印机映射、连接状态 |
| GET  | `/devices`               | 当前可用 USB 设备          | 含 VID/PID、别名、状态 |
| POST | `/devices/rescan`        | 重新扫描 USB               | 触发授权/刷新 |
| POST | `/print`                 | 执行打印                   | 与 FastPrintLib 的渲染结果兼容 |
| POST | `/test`                  | 打印测试页                 | 指定设备，发送内置测试数据 |
| GET  | `/config` / `POST /config` | 读取 / 更新 Agent 配置   | `shopId`, `printerMappings` |
| GET  | `/logs/recent`           | 拉取最近日志               | 仅调试用 |
| WS   | `/events`                | 推送设备上下线、打印结果   | 实时通知浏览器 |

**打印请求示例**

```json
{
  "printerId": "printer_bar",
  "vendorId": "0x483",
  "productId": "0x5743",
  "data": "base64字符串",
  "encoding": "base64",
  "copies": 1,
  "metadata": {
    "template": "bar",
    "orderId": "123456"
  }
}
```

Agent 接收到后：
1. 根据 `printerId` / `vendorId` / `productId` 匹配 USB 设备
2. 解码数据，转换为 GBK（二进制）
3. 通过 `node-usb` 写入端点，完成打印

## manager_next / FastPrintLib 集成

1. `usePrintService` 增加 `probeLocalAgent()` 流程：
   ```ts
   const LOCAL_AGENT_ENDPOINT = 'http://127.0.0.1:40713';
   const agentAvailable = await fetch(`${LOCAL_AGENT_ENDPOINT}/health`, { timeout: 1000 });
   ```

2. 打印逻辑：
   ```ts
   async function print(data) {
     if (agentAvailable) {
       try {
         await fetch(`${LOCAL_AGENT_ENDPOINT}/print`, { method: 'POST', body: JSON.stringify(data) });
         return;
       } catch (err) {
         console.warn('Local agent failed, fallback...', err);
       }
     }
     // fallback: WebUSB 或 cloud print-agent
   }
   ```

3. UI 调整：
   - PrinterManagementModal 显示 “本地 Agent 在线/离线”
   - 提供下载/安装按钮（Windows/macOS）
   - 如果 Agent 离线，提示用户启动守护进程；仍可选择 WebUSB/网络打印

## 阶段一：Demo 验证计划

- ✅ 目标：验证核心 USB 打印流程可行，不涉及托盘、自启
- ✅ 实现方式：纯 Node.js 服务
- ✅ 功能范围：
  - `GET /health`：返回 demo 版本信息、枚举到的 USB 设备
  - `POST /print`：接收 base64 数据，打印到指定设备
  - 简单日志输出至控制台
- ✅ 环境要求：
  - Node.js 18+（Windows / macOS / WSL）
  - 打印机需先安装操作系统驱动
  - 以管理员权限运行（Windows 推荐以管理员启动）
- ✅ Demo 步骤：
  1. `npm install express usb iconv-lite`
  2. 运行 `node demo-agent/index.js`
  3. 浏览器或 Postman `GET http://127.0.0.1:40713/health`
  4. 使用示例请求 `POST http://127.0.0.1:40713/print`
- ✅ 成功判定：
  - `/health` 能列出目标打印机（VID/PID 正确）
  - 发送测试数据后打印机出纸（支持中文）
  - 日志显示传输字节数，无异常报错

## 后续工作

- [ ] 完成 demo 代码并跑通一款打印机（阶段一）
- [ ] 评估托盘 UI（Electron）需求，确定 MVP 方案
- [ ] 定义跨平台自启策略（node-windows / launchctl）
- [ ] 优化安装脚本 / 打包方式（electron-builder, pkg）
- [ ] 更新 manager_next `usePrintService` 实现
- [ ] 整理安装、故障排查文档

---

> 备注：网络打印 (cloud print-agent) 完全保持现状。新 Agent 仅负责本地 USB 打印，不影响现有门店部署。

