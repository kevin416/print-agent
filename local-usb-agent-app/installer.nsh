; NSIS 安装脚本：自动关闭正在运行的 Yepos Agent
; 这个脚本会在安装前自动关闭所有正在运行的 Yepos Agent 实例

; 在安装初始化之前执行（最早执行）
!macro preInit
  ; 静默尝试关闭应用，忽略所有错误
  ; 使用 cmd /c 来确保命令正确执行，并重定向所有输出到 nul 以完全忽略错误
  ExecWait 'cmd /c "taskkill /F /IM Yepos Agent.exe /T 2>nul || exit 0"' $0
  ; 等待进程完全退出
  Sleep 2000
!macroend

; 在安装过程中执行
!macro customInstall
  ; 再次确保应用已关闭
  ExecWait 'cmd /c "taskkill /F /IM Yepos Agent.exe /T 2>nul || exit 0"' $0
  Sleep 1000
!macroend

; 卸载时执行
!macro customUnInstall
  ; 卸载时也关闭应用
  ExecWait 'cmd /c "taskkill /F /IM Yepos Agent.exe /T 2>nul || exit 0"' $0
  Sleep 500
!macroend
