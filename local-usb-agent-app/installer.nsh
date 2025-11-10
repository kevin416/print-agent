; NSIS 安装脚本：自动关闭正在运行的 Yepos Agent
; 这个脚本会在安装前自动关闭所有正在运行的 Yepos Agent 实例

!macro customInstall
  ; 静默尝试关闭应用，忽略错误（如果进程不存在，taskkill 会返回错误，这是正常的）
  ; 使用 cmd /c 来确保命令正确执行，并重定向错误输出到 nul 以忽略错误
  ExecWait 'cmd /c taskkill /F /IM "Yepos Agent.exe" /T >nul 2>&1' $0
  ; 无论成功与否都继续，等待一下确保进程完全退出
  Sleep 1000
!macroend

!macro customUnInstall
  ; 卸载时也关闭应用
  ExecWait 'cmd /c taskkill /F /IM "Yepos Agent.exe" /T >nul 2>&1' $0
  Sleep 500
!macroend
