# 重新打包 ARTEX 桌面端（Electron 外壳改动后必须跑）
#   pwsh -NoProfile -File C:\artex-ymh\tools\codex-pack.ps1
$ErrorActionPreference = 'Continue'
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
. 'C:\artex-ymh\tools\codex-lock.ps1'
$lock = 'C:\artex-ymh\.pack-lock'
if (-not (Acquire-CodexLock -Path $lock -MaxWaitSec 600 -Label 'pack')) { Write-Output 'PACK_LOCKED'; exit 2 }
try {
  taskkill /F /T /IM ARTEX.exe 2>&1 | Out-Null
  Start-Sleep -Seconds 2
  Push-Location C:\artex-ymh\desktop
  npm run pack 2>&1 | Select-Object -Last 6
  Write-Output "PACK_EXIT=$LASTEXITCODE"
  Pop-Location
  Write-Output ("ASAR_BYTES=" + (Get-Item 'C:\artex-ymh\desktop\build\ARTEX-win32-x64\resources\app.asar').Length)
  Write-Output ("ASAR_MTIME=" + (Get-Item 'C:\artex-ymh\desktop\build\ARTEX-win32-x64\resources\app.asar').LastWriteTime)
} finally {
  Release-CodexLock -Path $lock
}
