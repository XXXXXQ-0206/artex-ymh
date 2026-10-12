# Final sizing-correct capture pass. Dot-sourced by ref-window.ps1 (quiet, no focus steal).
$shots = Join-Path $repo 'evidence\codex-desktop\screenshots'
$viewsAll = Join-Path $repo 'tools\codex-ref\views-all.json'
function Cap { param([string[]]$a) & $nodeExe $tool @a --port $Port }

Write-Output '=== home ==='
Cap @('blocks','--root','aside.app-shell-left-panel','--minArea','300','--name','blocks-sidebar')
Cap @('blocks','--root','._Workspace_yl8z4_2','--minArea','600','--name','blocks-chat-home')
& $nodeExe $tool views --spec $viewsAll --name views-chat-home --port $Port
Save-Shot (Join-Path $shots '01-chat-home.png')

Write-Output '=== conversation ==='
Cap @('click','--text','你好')
Start-Sleep -Seconds 2
Cap @('blocks','--root','._MainContentViewport_yl8z4_2','--minArea','400','--name','blocks-conversation')
& $nodeExe $tool views --spec $viewsAll --name views-chat-conversation --port $Port
Save-Shot (Join-Path $shots '02-chat-conversation.png')

Write-Output '=== back to fresh chat ==='
Cap @('click','--text','新聊天')
Start-Sleep -Seconds 2
Write-Output '=== final pass done ==='
