@echo off
REM Yepos Agent 客户端打包并上传脚本启动器
REM 此批处理文件用于在 Windows 上正确设置编码后运行 PowerShell 脚本

chcp 65001 >nul 2>&1
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; $PSDefaultParameterValues['*:Encoding'] = 'utf8'; & '%~dp0deploy-client.ps1'"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================
    echo 如果遇到问题，请尝试以下方式：
    echo ========================================
    echo 1. 使用 Git Bash: bash deploy-client.sh
    echo 2. 使用 WSL: wsl bash deploy-client.sh
    echo 3. 使用 PowerShell Core 7+: pwsh deploy-client.ps1
    echo.
    pause
)

