# 🖨️ 打印代理管理后台

管理后台用于管理分店打印机配置和生成一键部署脚本。

## 功能

- ✅ **分店管理**：添加/编辑/删除分店
- ✅ **打印机管理**：为每个分店管理打印机列表
- ✅ **连接测试**：一键测试打印机连接
- ✅ **一键部署**：生成 WSL 一键部署脚本，支持复制 curl 命令

## 快速开始

### 1. 安装依赖

\`\`\`bash
cd admin
npm install
\`\`\`

### 2. 启动服务

\`\`\`bash
npm start
\`\`\`

访问：http://localhost:3004

### 3. 部署到生产环境

\`\`\`bash
./deploy-admin.sh
\`\`\`

脚本会自动上传文件、安装依赖并重启 PM2，随后按照提示完成 Nginx / SSL 配置（详见 `DEPLOYMENT.md`）。

## 使用说明

### 添加分店

1. 点击"添加分店"按钮
2. 输入分店ID（如：shop1, bbq）
3. 输入分店名称（可选）
4. 保存

### 添加打印机

1. 在分店列表中，点击"添加"按钮
2. 输入打印机IP地址
3. 输入端口（默认9100）
4. 输入打印机名称（可选）
5. 选择类型（厨房/前台/其他）
6. 保存

### 测试打印机

1. 在打印机列表中，点击"测试"按钮
2. 系统会发送测试打印任务
3. 检查打印机是否打印出测试内容

### 一键部署

1. 在分店列表中，点击"部署"按钮
2. 复制显示的 curl 命令
3. 在 Windows WSL 中粘贴并运行

## API 接口

- \`GET /api/shops\` - 获取所有分店
- \`POST /api/shops\` - 创建分店
- \`GET /api/shops/:shopId\` - 获取单个分店
- \`PUT /api/shops/:shopId\` - 更新分店
- \`DELETE /api/shops/:shopId\` - 删除分店
- \`POST /api/shops/:shopId/printers\` - 添加打印机
- \`DELETE /api/shops/:shopId/printers/:ip\` - 删除打印机
- \`POST /api/shops/:shopId/printers/:ip/test\` - 测试打印机
- \`GET /api/shops/:shopId/deploy\` - 生成部署脚本
- \`GET /api/agents\` - 获取已连接的代理列表
- \`GET /api/download/agent\` - 下载 local-print-agent.js 文件

## 数据存储

后台会将分店与打印机信息持久化在 `data/shops.json`。请确保部署目录下的 `admin/data/` 在备份策略中，避免重装或更新时丢失配置。

如需清空数据，可停止服务后手动删除该文件再重启。
