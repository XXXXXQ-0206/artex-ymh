# Batch capture for the reference Codex Desktop window.
# Dot-sourced by tools/codex-ref/ref-window.ps1 AFTER the window was quietly restored
# (SW_SHOWNOACTIVATE + SWP_NOACTIVATE, no focus steal) and sized to 1280x816, and BEFORE the
# parent minimizes it again, so the whole session touches the foreground exactly zero times.
$cap = Join-Path $repo 'evidence\codex-desktop\captures'
$shots = Join-Path $repo 'evidence\codex-desktop\screenshots'
$viewsAll = Join-Path $repo 'tools\codex-ref\views-all.json'
$viewsMenu = Join-Path $repo 'tools\codex-ref\views-menu.json'

function Cap { param([string[]]$a) & $nodeExe $tool @a --port $Port }
function Views { param([string]$name) & $nodeExe $tool views --spec $viewsAll --name $name --port $Port }

Write-Output '=== [1/7] chat-home ==='
Cap @('blocks','--root','._Workspace_yl8z4_2','--minArea','900','--name','blocks-chat-home')
Cap @('blocks','--root','aside.app-shell-left-panel','--minArea','400','--name','blocks-sidebar')
Views 'views-chat-home'
Save-Shot (Join-Path $shots '01-chat-home.png')

Write-Output '=== [2/7] app menu: file ==='
Cap @('click','--selector','#application-menu-trigger-file-menu')
Start-Sleep -Milliseconds 900
& $nodeExe $tool views --spec $viewsMenu --name views-app-menu-file --port $Port
Save-Shot (Join-Path $shots '10-app-menu-file.png')
Cap @('key','--keys','Escape')
Start-Sleep -Milliseconds 500

Write-Output '=== [3/7] app menu: edit / view / help ==='
$n = 11
foreach ($m in @('edit','view','help')) {
  Cap @('click','--selector',('#application-menu-trigger-' + $m + '-menu'))
  Start-Sleep -Milliseconds 800
  & $nodeExe $tool views --spec $viewsMenu --name ('views-app-menu-' + $m) --port $Port
  Save-Shot (Join-Path $shots ($n.ToString() + '-app-menu-' + $m + '.png'))
  $n = $n + 1
  Cap @('key','--keys','Escape')
  Start-Sleep -Milliseconds 400
}

Write-Output '=== [4/7] composer model picker dropdown ==='
Cap @('click','--text','Sol')
Start-Sleep -Milliseconds 1000
Views 'views-model-picker'
Save-Shot (Join-Path $shots '20-model-picker.png')
Cap @('key','--keys','Escape')
Start-Sleep -Milliseconds 500

Write-Output '=== [5/7] composer permission dropdown ==='
Cap @('click','--text','完全访问')
Start-Sleep -Milliseconds 1000
Views 'views-permission-menu'
Save-Shot (Join-Path $shots '21-permission-menu.png')
Cap @('key','--keys','Escape')
Start-Sleep -Milliseconds 500

Write-Output '=== [6/7] conversation state ==='
Cap @('click','--text','你好')
Start-Sleep -Seconds 2
Views 'views-chat-conversation'
Cap @('blocks','--root','._MainContentViewport_yl8z4_2','--minArea','600','--name','blocks-conversation')
Save-Shot (Join-Path $shots '02-chat-conversation.png')

Write-Output '=== [7/7] back to a fresh chat ==='
Cap @('click','--text','新聊天')
Start-Sleep -Seconds 2
Cap @('eval','JSON.stringify({title:document.title})')
Write-Output '=== batch done ==='
