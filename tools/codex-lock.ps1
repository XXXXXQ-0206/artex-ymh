# 共享构建锁：带「持有者 PID 存活检查」的互斥锁
#   之前的实现只看 mtime，持锁进程被超时杀掉后 finally 不执行 → 僵尸锁 → 全员排队。
#   现在：owner pid 已退出 = 立刻接管；锁龄 > 15min 也接管；抢锁用 CreateNew 原子创建。
function Acquire-CodexLock {
  param([string]$Path, [int]$MaxWaitSec = 900, [string]$Label = 'build')
  $deadline = (Get-Date).AddSeconds($MaxWaitSec)
  $announced = $false
  while ($true) {
    if (Test-Path $Path) {
      $content = Get-Content $Path -Raw -ErrorAction SilentlyContinue
      $ownerPid = 0
      if ($content) { [void][int]::TryParse((($content -split '\s+')[0]), [ref]$ownerPid) }
      $ownerAlive = $false
      if ($ownerPid -gt 0) { $ownerAlive = [bool](Get-Process -Id $ownerPid -ErrorAction SilentlyContinue) }
      $age = ((Get-Date) - (Get-Item $Path).LastWriteTime).TotalSeconds
      if (-not $ownerAlive) {
        Write-Output "[lock] 僵尸锁（owner pid=$ownerPid 已退出，age=$([int]$age)s）→ 接管"
        Remove-Item $Path -Force -ErrorAction SilentlyContinue
      } elseif ($age -gt 900) {
        Write-Output "[lock] 锁超龄 $([int]$age)s → 接管"
        Remove-Item $Path -Force -ErrorAction SilentlyContinue
      } else {
        if (-not $announced) { Write-Output "[lock] 排队等待 $Label 锁（owner pid=$ownerPid，已持 $([int]$age)s）..."; $announced = $true }
        if ((Get-Date) -gt $deadline) { Write-Output '[lock] 等待超时'; return $false }
        Start-Sleep -Seconds 5
        continue
      }
    }
    try {
      $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
      $sw = New-Object System.IO.StreamWriter($fs)
      $sw.Write("$PID " + (Get-Date -Format o))
      $sw.Flush(); $sw.Close(); $fs.Close()
      Write-Output "[lock] 取得 $Label 锁 (pid=$PID)"
      return $true
    } catch {
      Start-Sleep -Seconds 2
      if ((Get-Date) -gt $deadline) { Write-Output '[lock] 抢锁超时'; return $false }
    }
  }
}
function Release-CodexLock { param([string]$Path) Remove-Item $Path -Force -ErrorAction SilentlyContinue }
