; NSIS 安装脚本：自动关闭正在运行的 Yepos Agent
; 这个脚本会在安装前自动关闭所有正在运行的 Yepos Agent 实例

!macro customInstall
  ; 使用 taskkill 命令终止所有 Yepos Agent 进程
  ; /F = 强制终止
  ; /IM = 镜像名称（进程名）
  ; /T = 终止进程树（包括子进程）
  ; 忽略错误（如果进程不存在，taskkill 会返回错误，这是正常的）
  ExecWait 'taskkill /F /IM "Yepos Agent.exe" /T' $0
  ; 等待进程完全退出
  Sleep 1000
!macroend

!macro customUnInstall
  ; 卸载时也关闭应用
  ExecWait 'taskkill /F /IM "Yepos Agent.exe" /T' $0
  Sleep 500
!macroend
