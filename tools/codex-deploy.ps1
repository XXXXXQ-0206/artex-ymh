# ARTEX 前端 → 构建 → 部署 → 重启（带互斥锁，任何人可调用）
#   pwsh -NoProfile -File C:\artex-ymh\tools\codex-deploy.ps1
# 锁：C:\artex-ymh\.build-lock —— 存在即表示有人正在构建，等一会儿再试。
param([switch]$NoRestart)
$ErrorActionPreference = 'Continue'
# ⚠️ 环境里可能带 ELECTRON_RUN_AS_NODE=1（本会话实测存在）——那会让 Electron 退化成纯 Node
#    进程、启动即退出（退出码 9）。启动 ARTEX 前必须清掉。
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
. 'C:\artex-ymh\tools\codex-lock.ps1'
$lock = 'C:\artex-ymh\.build-lock'
if (-not (Acquire-CodexLock -Path $lock -MaxWaitSec 900 -Label 'build')) { Write-Output 'LOCKED_TIMEOUT'; exit 2 }
try {
  Push-Location C:\artex-ymh\web
  $env:NEXT_EXPORT = '1'
  npx next build 2>&1 | Select-String -Pattern 'Compiled successfully|Failed to compile|Type error|Error:' | Select-Object -First 8
  if (-not (Test-Path C:\artex-ymh\web\out\index.html)) { Write-Output 'BUILD_FAILED'; exit 1 }
  Write-Output 'BUILD_OK'
  Pop-Location
  robocopy C:\artex-ymh\web\out C:\artex-ymh\server\webui\dist /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  Push-Location C:\artex-ymh
  go build -tags embedui -trimpath -o artex.exe ./cmd/artex
  Write-Output "GO=$LASTEXITCODE"
  Pop-Location
  if (-not $NoRestart) {
    & pwsh -NoProfile -File 'C:\artex-ymh\tools\codex-start.ps1' -Port 9333 -KeepBackend
  }
} finally {
  Release-CodexLock -Path $lock
}
Write-Output 'DEPLOY_DONE'
