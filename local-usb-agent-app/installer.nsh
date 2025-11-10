; NSIS 安装脚本：自动关闭正在运行的 Yepos Agent
; 这个脚本会在安装前自动关闭所有正在运行的 Yepos Agent 实例

!macro customInstall
  ; 静默尝试关闭应用，忽略所有错误
  ; 使用 cmd /c 来确保命令正确执行，并重定向所有输出到 nul 以完全忽略错误
  ; 如果进程不存在，taskkill 会返回错误码，但我们忽略它
  ExecWait 'cmd /c "taskkill /F /IM Yepos Agent.exe /T 2>nul || exit 0"' $0
  ; 无论成功与否都继续，等待一下确保进程完全退出
  Sleep 1000
!macroend

!macro customUnInstall
  ; 卸载时也关闭应用
  ExecWait 'cmd /c "taskkill /F /IM Yepos Agent.exe /T 2>nul || exit 0"' $0
  Sleep 500
!macroend

; 在安装前执行（在文件复制之前）
!macro preInit
  ; 在安装开始前就关闭应用
  ExecWait 'cmd /c "taskkill /F /IM Yepos Agent.exe /T 2>nul || exit 0"' $0
  Sleep 1000
!macroend
