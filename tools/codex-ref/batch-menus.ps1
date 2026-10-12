# Dumps the full structure of each application menu (labels, shortcuts, row geometry) and turns the
# reference window back to a fresh chat afterwards. Dot-sourced by ref-window.ps1.
$cap = Join-Path $repo 'evidence\codex-desktop\captures'
$shots = Join-Path $repo 'evidence\codex-desktop\screenshots'
$menuExpr = Join-Path $repo 'tools\codex-ref\expr-menu.js'

function Cap { param([string[]]$a) & $nodeExe $tool @a --port $Port }

$menuShots = @{ file = '10-app-menu-file.png'; edit = '11-app-menu-edit.png'; view = '12-app-menu-view.png'; help = '13-app-menu-help.png' }
foreach ($m in @('file','edit','view','help')) {
  Write-Output ('=== menu: ' + $m + ' ===')
  Cap @('click','--selector',('#application-menu-trigger-' + $m + '-menu'))
  Start-Sleep -Milliseconds 900
  $json = & $nodeExe $tool eval (Get-Content -Raw $menuExpr) --port $Port
  Set-Content -Encoding UTF8 (Join-Path $cap ('menu-' + $m + '.json')) $json
  $len = ($json | Out-String).Length
  Write-Output ('  menu-' + $m + '.json bytes=' + $len)
  Save-Shot (Join-Path $shots $menuShots[$m])
  Cap @('key','--keys','Escape')
  Start-Sleep -Milliseconds 400
}

Write-Output '=== conversation numbers ==='
Cap @('click','--text','你好')
Start-Sleep -Seconds 2
Cap @('blocks','--root','._MainContentViewport_yl8z4_2','--minArea','600','--name','blocks-conversation')
& $nodeExe $tool views --spec (Join-Path $repo 'tools\codex-ref\views-all.json') --name views-chat-conversation --port $Port
Save-Shot (Join-Path $shots '02-chat-conversation.png')
Cap @('click','--text','新聊天')
Start-Sleep -Seconds 2
Write-Output '=== menus batch done ==='
