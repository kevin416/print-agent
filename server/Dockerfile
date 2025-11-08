FROM node:18-alpine

WORKDIR /app

# 安装 wget（用于健康检查）
RUN apk add --no-cache wget

# 复制依赖文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制应用文件
COPY print-server.js ./

# 创建日志目录
RUN mkdir -p logs

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/print/health || exit 1

# 启动应用
CMD ["node", "print-server.js"]

