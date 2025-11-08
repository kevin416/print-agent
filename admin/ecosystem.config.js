/**
 * PM2 配置文件 - 打印代理管理后台
 */

module.exports = {
  apps: [
    {
      name: 'print-agent-admin',
      script: './admin-server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3004,
        PRINT_SERVER_URL: 'http://127.0.0.1:3000'
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3004,
        PRINT_SERVER_URL: 'http://127.0.0.1:3000'
      },
      watch: false,
      max_memory_restart: '512M',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10,
      autorestart: true,
      kill_timeout: 5000,
      listen_timeout: 10000
    }
  ]
}



