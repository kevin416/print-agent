# 国际化实现总结

## 概述

已完成本地 USB 打印 Agent 应用的国际化重构，支持中英文切换。

## 实现的功能

### 1. 国际化模块
- ✅ 创建了 `src/i18n/index.js` - 主进程 i18n 模块
- ✅ 创建了 `src/i18n/zh-CN.json` - 中文翻译文件（216 个翻译键）
- ✅ 创建了 `src/i18n/en-US.json` - 英文翻译文件（216 个翻译键）
- ✅ 创建了 `src/renderer/i18n.js` - 渲染进程 i18n 辅助模块

### 2. 主进程国际化
- ✅ 托盘菜单所有文本国际化
- ✅ 对话框消息国际化
- ✅ 打印测试任务内容国际化（`buildTestPayload`）
- ✅ 打印历史记录消息国际化
- ✅ WebSocket 客户端消息国际化
- ✅ 错误消息国际化

### 3. 渲染进程国际化
- ✅ 所有 UI 文本国际化
- ✅ 动态内容国际化
- ✅ 表格标题国际化
- ✅ 按钮和标签国际化
- ✅ 引导流程（onboarding）国际化

### 4. 语言切换功能
- ✅ 在 header 添加语言选择器
- ✅ 语言偏好持久化（保存在配置中）
- ✅ 实时语言切换（无需重启）
- ✅ 语言变更时自动更新所有 UI

### 5. 配置存储
- ✅ 添加 `locale` 配置项到 store
- ✅ 添加迁移逻辑（版本 0.5.0）
- ✅ 默认语言：zh-CN

## 翻译键分类

### 主要分类
1. **app** - 应用标题和名称
2. **status** - 状态文本
3. **header** - 头部按钮
4. **config** - 配置相关
5. **hotplug** - 设备热插拔
6. **updates** - 更新相关
7. **telemetry** - 远程监控
8. **devices** - 设备映射
9. **history** - 打印历史
10. **logs** - 日志
11. **onboarding** - 引导流程
12. **tray** - 托盘菜单
13. **dialogs** - 对话框
14. **common** - 通用文本
15. **language** - 语言相关
16. **print** - 打印相关

## 使用方式

### 用户使用
1. 在应用右上角选择语言（中文/English）
2. 语言设置自动保存
3. 界面立即更新，无需重启

### 开发者添加新翻译
1. 在 `src/i18n/zh-CN.json` 和 `src/i18n/en-US.json` 中添加对应的键值对
2. 在代码中使用 `i18n.t('key.path')` 获取翻译
3. 支持参数化翻译，使用 `{param}` 占位符

## 技术实现

### 主进程
- 使用 `getI18n(locale)` 获取 i18n 实例
- 通过 `i18n.t(key, params)` 获取翻译
- 语言变更时更新托盘菜单

### 渲染进程
- 通过 IPC 从主进程获取翻译
- 监听 `agent:locale-changed` 事件
- 使用 `updateUI()` 函数更新所有 UI 元素

### 打印内容
- `buildTestPayload` 函数使用国际化文本
- 打印内容根据当前语言环境生成
- 使用 GB18030 编码确保中文正确显示

## 注意事项

1. **Fallback 机制**：如果 i18n 不可用，代码中保留中文 fallback 文本
2. **日期时间**：使用 `toLocaleString()` 根据系统语言环境格式化
3. **打印编码**：打印内容使用 GB18030 编码，确保中文正确显示
4. **JSON 语法**：所有 JSON 文件中的引号必须正确转义

## 测试

运行以下命令验证国际化功能：
```bash
npm run dev
```

检查项：
- [x] 语言选择器显示正常
- [x] 切换语言后界面立即更新
- [x] 托盘菜单文本更新
- [x] 打印测试内容使用正确语言
- [x] 所有对话框消息使用正确语言
- [x] 语言偏好持久化

## 文件清单

### 新增文件
- `src/i18n/index.js`
- `src/i18n/zh-CN.json`
- `src/i18n/en-US.json`
- `src/renderer/i18n.js`

### 修改文件
- `src/main/main.js` - 添加国际化支持
- `src/main/preload.js` - 添加语言相关 IPC
- `src/main/store.js` - 添加 locale 配置
- `src/main/wsClient.js` - 添加国际化支持
- `src/renderer/renderer.js` - 添加国际化支持
- `src/renderer/index.html` - 添加语言选择器

## 后续改进建议

1. 支持更多语言（如日语、韩语等）
2. 添加翻译完整性检查工具
3. 支持从外部文件加载翻译
4. 添加翻译上下文说明
5. 支持翻译键的自动补全

