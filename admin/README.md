# 🖨️ 打印代理管理后台

管理后台用于管理分店打印机配置和生成一键部署脚本。

## 功能

- ✅ **分店管理**：添加/编辑/删除分店，支持记录 manager_next 的公司 ID 映射
- ✅ **打印机管理**：为每个分店管理打印机列表
- ✅ **连接测试**：一键测试打印机连接
- ✅ **一键部署**：生成 WSL 一键部署脚本，支持复制 curl 命令
- ✅ **环境映射导出**：\`GET /api/shops/company-map\` 一键导出 \`NEXT_PUBLIC_PRINT_AGENT_MAP\`

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

#### 快速更新（仅更新管理后台代码）

适用于仅修改了管理后台代码，不需要更新客户端安装包的情况：

\`\`\`bash
./deploy-admin.sh --skip-client
\`\`\`

或者直接运行（默认选择"仅更新管理后台"）：

\`\`\`bash
./deploy-admin.sh
\`\`\`

#### 完整部署（包含客户端安装包）

如果需要上传客户端安装包，可以使用：

\`\`\`bash
./deploy-admin.sh --with-client
\`\`\`

#### 打包并部署客户端

如果需要打包客户端应用并上传，在项目根目录运行：

\`\`\`bash
./deploy-client.sh
\`\`\`

这会自动完成：打包客户端 → 整理构建产物 → 上传到服务器 → 更新管理后台

> 脚本会自动上传文件、安装依赖并重启 PM2，随后按照提示完成 Nginx / SSL 配置（详见 `DEPLOYMENT.md`）。

## 使用说明

### 添加分店

1. 点击"添加分店"按钮
2. 输入分店ID（如：shop1, bbq）
3. 输入分店名称（可选）
4. 录入关联公司 ID（可选，与 manager_next 的 \`companyId\` 对应，用于自动生成 \`.env\` 映射）
5. 保存

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
2. 复制对应环境的 curl 命令（WSL/Linux 或 macOS）
3. 在目标终端中粘贴并运行；macOS 脚本会提示使用 Homebrew 安装 Node.js（如未安装）
4. 注意命令两侧保留双引号，确保 `&platform=mac` 不被 shell 解析拆分

### 导出 manager_next 环境变量

1. 在列表里为每个分店填写“关联公司 ID”（manager_next 的 `companyId`）
2. 打开终端，执行：
   ```bash
   curl -s https://pa.easyify.uk/api/shops/company-map | jq -c '.map'
   ```
3. 将输出结果整体复制，粘贴到 manager_next `.env` 中，例如：
   ```env
   NEXT_PUBLIC_PRINT_AGENT_MAP='{"15":{"shopId":"testclient"},"27":{"shopId":"bbq"}}'
   ```
4. 保存后重新启动/部署 manager_next，新的映射即可生效

> 提示：如果没有安装 `jq`，可以改用 `curl -s ... | python -m json.tool` 或直接访问浏览器复制。

## API 接口

- \`GET /api/shops\` - 获取所有分店（含连接状态）
- \`POST /api/shops\` - 创建分店
- \`PUT /api/shops/:shopId\` - 更新分店信息、公司 ID 或打印机列表
- \`DELETE /api/shops/:shopId\` - 删除分店
- \`POST /api/shops/:shopId/printers\` - 添加/更新打印机
- \`DELETE /api/shops/:shopId/printers/:ip\` - 删除打印机
- \`POST /api/shops/:shopId/printers/:ip/test\` - 发送测试打印
- \`GET /api/shops/:shopId/deploy\` - 返回部署脚本 curl 命令
- \`GET /api/deploy-script?shopId=...\` - 输出针对分店的部署脚本
- \`GET /api/shops/company-map\` - 导出 \`companyId → shopId\` 映射（公开接口，无需登录）
- \`GET /api/agents\` - 获取已连接的本地代理列表

## 数据存储

后台会将分店与打印机信息持久化在 `data/shops.json`。请确保部署目录下的 `admin/data/` 在备份策略中，避免重装或更新时丢失配置。

如需清空数据，可停止服务后手动删除该文件再重启。
