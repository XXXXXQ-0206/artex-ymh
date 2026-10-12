# Screenshot batch: real reference pixels at 1280x816, taken with CDP while the window sits at the
# BOTTOM of the z-order (never covers the user, never activated, never minimized).
# Order matters: leave Settings LAST, because the settings view replaces the whole left panel and
# every text-based click for the chat surface would then miss.
$shots = Join-Path $repo 'evidence\codex-desktop\reference-shots'
New-Item -ItemType Directory -Force -Path $shots | Out-Null
function Cap { param([string[]]$a) & $nodeExe $tool @a --port $Port }
function Shot { param([string]$n) & $nodeExe $tool shot --out (Join-Path $shots $n) --bg '40,40,40' --port $Port }

Write-Output '=== reset to chat surface via the rail home button ==='
Cap @('click','--selector','nav[class*=sidebar-rail] button')
Start-Sleep -Seconds 2
Cap @('eval','JSON.stringify({where: document.title, hasComposer: !!document.querySelector("[contenteditable=true]")})')
Cap @('click','--text','新聊天')
Start-Sleep -Seconds 2
Cap @('eval','JSON.stringify({where: document.title, hasComposer: !!document.querySelector("[contenteditable=true]")})')
Shot 'ref-01-chat-home.png'

Write-Output '=== 02-05 app menus ==='
$i = 2
foreach ($m in @('file','edit','view','help')) {
  Cap @('click','--selector',('#application-menu-trigger-' + $m + '-menu'))
  Start-Sleep -Milliseconds 1200
  Shot ('ref-0' + $i + '-app-menu-' + $m + '.png')
  $i = $i + 1
  Cap @('key','--keys','Escape')
  Start-Sleep -Milliseconds 700
}

Write-Output '=== 06 model picker ==='
Cap @('click','--text','Sol')
Start-Sleep -Milliseconds 1300
Shot 'ref-06-model-picker.png'
Cap @('key','--keys','Escape')
Start-Sleep -Milliseconds 700

Write-Output '=== 07 permission popover ==='
Cap @('click','--text','完全访问')
Start-Sleep -Milliseconds 1300
Shot 'ref-07-permission-menu.png'
Cap @('key','--keys','Escape')
Start-Sleep -Milliseconds 700

Write-Output '=== 08 conversation ==='
Cap @('click','--text','你好')
Start-Sleep -Seconds 3
Shot 'ref-08-conversation.png'

Write-Output '=== 09 settings (last, via edit menu) ==='
Cap @('click','--selector','#application-menu-trigger-edit-menu')
Start-Sleep -Milliseconds 1200
Cap @('click','--text','设置')
Start-Sleep -Seconds 3
Shot 'ref-09-settings.png'
Write-Output '=== shots done ==='
