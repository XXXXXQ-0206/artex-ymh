# Single batched capture pass: every screenshot the SPEC needs, taken with real screen pixels
# (CopyFromScreen) while the window is TOPMOST but NOT activated, then minimized again on exit.
$cap = Join-Path $repo 'evidence\codex-desktop\captures'
$shots = Join-Path $repo 'evidence\codex-desktop\screenshots'
$viewsAll = Join-Path $repo 'tools\codex-ref\views-all.json'
$viewsMenu = Join-Path $repo 'tools\codex-ref\views-menu.json'
$menuExpr = Join-Path $repo 'tools\codex-ref\expr-menu.js'
function Cap { param([string[]]$a) & $nodeExe $tool @a --port $Port }

Write-Output '=== home ==='
Cap @('blocks','--root','aside.app-shell-left-panel','--minArea','300','--name','blocks-sidebar')
Cap @('blocks','--root','._Workspace_yl8z4_2','--minArea','600','--name','blocks-chat-home')
& $nodeExe $tool views --spec $viewsAll --name views-chat-home --port $Port
Save-Shot (Join-Path $shots '01-chat-home.png')

Write-Output '=== app menus ==='
$i = 10
foreach ($m in @('file','edit','view','help')) {
  Cap @('click','--selector',('#application-menu-trigger-' + $m + '-menu'))
  Start-Sleep -Milliseconds 1000
  $json = & $nodeExe $tool eval (Get-Content -Raw $menuExpr) --port $Port
  Set-Content -Encoding UTF8 (Join-Path $cap ('menu-' + $m + '.json')) $json
  & $nodeExe $tool views --spec $viewsMenu --name ('views-app-menu-' + $m) --port $Port | Out-Null
  Save-Shot (Join-Path $shots ($i.ToString() + '-app-menu-' + $m + '.png'))
  $i = $i + 1
  Cap @('key','--keys','Escape')
  Start-Sleep -Milliseconds 500
}

Write-Output '=== composer popovers ==='
Cap @('click','--text','Sol')
Start-Sleep -Milliseconds 1100
& $nodeExe $tool views --spec $viewsAll --name views-model-picker --port $Port | Out-Null
Save-Shot (Join-Path $shots '20-model-picker.png')
Cap @('key','--keys','Escape')
Start-Sleep -Milliseconds 600
Cap @('click','--text','完全访问')
Start-Sleep -Milliseconds 1100
& $nodeExe $tool views --spec $viewsAll --name views-permission-menu --port $Port | Out-Null
Save-Shot (Join-Path $shots '21-permission-menu.png')
Cap @('key','--keys','Escape')
Start-Sleep -Milliseconds 600

Write-Output '=== conversation ==='
Cap @('click','--text','你好')
Start-Sleep -Seconds 2
Cap @('blocks','--root','._MainContentViewport_yl8z4_2','--minArea','400','--name','blocks-conversation')
& $nodeExe $tool views --spec $viewsAll --name views-chat-conversation --port $Port | Out-Null
Save-Shot (Join-Path $shots '02-chat-conversation.png')

Write-Output '=== back to fresh chat ==='
Cap @('click','--text','新聊天')
Start-Sleep -Seconds 2
Write-Output '=== all captures done ==='
