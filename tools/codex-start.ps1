# 干净启动 ARTEX 桌面端并开出 CDP 端口
#   pwsh -NoProfile -File C:\artex-ymh\tools\codex-start.ps1 [-Port 9333] [-KeepBackend]
param([int]$Port = 9333, [switch]$KeepBackend)
$ErrorActionPreference = 'Continue'
# ⚠️ 必须清掉：ELECTRON_RUN_AS_NODE=1 会让 Electron 退化成纯 Node，启动即退出（码 9）
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

taskkill /F /T /IM ARTEX.exe 2>&1 | Out-Null
if (-not $KeepBackend) { Stop-Process -Name artex -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 3

$exe = 'C:\artex-ymh\desktop\build\ARTEX-win32-x64\ARTEX.exe'
# 关掉 Chromium 的原生遮挡检测与后台节流：窗口被遮挡/未激活时也持续出帧，
# 否则 CDP Page.captureScreenshot 会挂住（参考端也是这么解决的）。
$flags = @(
  "--remote-debugging-port=$Port",
  "--disable-features=CalculateNativeWinOcclusion",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding"
)
Start-Process -FilePath $exe -ArgumentList $flags
# 等 CDP 起来（最多 40s）
$ok = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 2
  $v = curl.exe -s --noproxy '*' --max-time 3 "http://127.0.0.1:$Port/json/version" 2>$null
  if ($v) { $ok = $true; break }
}
if (-not $ok) { Write-Output "CDP_FAIL port=$Port"; exit 1 }
# 第二个实例只为触发 second-instance -> showWindow()，让窗口显示出来
Start-Process -FilePath $exe 2>&1 | Out-Null
Start-Sleep -Seconds 6
# 把 ARTEX 窗口内容区定成 1280x816（与参考端一致的量测基准）。
# 走 Electron 自己的 win.setContentSize（DIP，与 CSS px 1:1），
# 不用 Win32 MoveWindow，也不碰参考端 ChatGPT 的窗口（ref-window.ps1 是给参考端用的）。
node 'C:\artex-ymh\tools\codex-measure.mjs' $Port "window.artexDesktop ? window.artexDesktop.invoke('setContentSize',{width:1280,height:816}).then(()=>JSON.stringify({w:innerWidth,h:innerHeight})) : 'NO_BRIDGE'" 2>&1 | Select-String -NotMatch 'UNDICI|trace-warnings'
Start-Sleep -Seconds 2
Write-Output "CDP_OK port=$Port"
Write-Output ("BACKEND=" + [bool](Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq 8787 }))
