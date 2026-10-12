# Quiet helper for the reference Codex Desktop window (unpacked ChatGPT.exe).
#
# HARD RULE (user request): never steal foreground. This script therefore
#   - resolves the window by enumerating top-level windows of the unpacked build's processes
#     (a store-installed Codex can run at the same time and .NET MainWindowHandle goes 0)
#   - restores with SW_SHOWNOACTIVATE and raises with SWP_NOACTIVATE only, never
#     SetForegroundWindow / SW_SHOW / SW_RESTORE
#   - captures with PrintWindow(PW_RENDERFULLCONTENT) so an occluded window still yields
#     fresh pixels without being raised at all
#   - leaves the window MINIMIZED + NOTOPMOST on every exit path
#
# Why DPI-aware: at 150% scaling a non-DPI-aware process gets virtualized GetWindowRect
# coordinates and a CopyFromScreen over that rect lands a third of a window off.
# ASCII only. Partner of tools/codex-ref/capture.mjs.
param(
  [int]$W = 1280,
  [int]$H = 816,
  [int]$Port = 9222,
  [string]$Expr = '',
  [string]$ExprFile = '',
  [string]$EvalName = '',
  [string]$OutDir = '',
  [string]$ScreenShot = '',
  [string]$Shot = '',
  [string]$Nav = '',
  [int]$Wait = 4000,
  [ValidateSet('PrintWindow','Screen')] [string]$CaptureMode = 'PrintWindow',
  [switch]$SkipResize,
  [switch]$SkipResize2,
  [switch]$KeepVisible,
  [switch]$Bottom,
  [switch]$NoActivate,
  [string]$Batch = ''
)
$ErrorActionPreference = 'Continue'
$env:NODE_NO_WARNINGS = '1'
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class RefWin32 {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int ht, bool repaint);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  public static List<string> Log = new List<string>();
  public static IntPtr FindLargest(int[] pids, string titlePart) {
    IntPtr best = IntPtr.Zero; long bestArea = -1;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (Array.IndexOf(pids, (int)pid) < 0) return true;
      if (GetParent(h) != IntPtr.Zero) return true;
      int len = GetWindowTextLength(h);
      StringBuilder sb = new StringBuilder(len + 2);
      GetWindowText(h, sb, sb.Capacity);
      string t = sb.ToString();
      RECT r; GetWindowRect(h, out r);
      long area = (long)(r.Right - r.Left) * (r.Bottom - r.Top);
      Log.Add("hwnd=" + h + " pid=" + pid + " vis=" + IsWindowVisible(h) + " rect=" + (r.Right - r.Left) + "x" + (r.Bottom - r.Top) + " title=" + t);
      if (titlePart.Length > 0 && t.IndexOf(titlePart) < 0) return true;
      if (area > bestArea) { bestArea = area; best = h; }
      return true;
    }, IntPtr.Zero);
    return best;
  }
  public static string[] Dump() { return Log.ToArray(); }
}
'@ -ErrorAction SilentlyContinue
[void][RefWin32]::SetProcessDPIAware()

$SW_MINIMIZE = 6
$SW_SHOWNOACTIVATE = 4
$HWND_TOPMOST = [IntPtr](-1)
$HWND_NOTOPMOST = [IntPtr](-2)
$SWP_NOSIZE = 0x0001
$SWP_NOMOVE = 0x0002
$SWP_NOACTIVATE = 0x0010
$SWP_NOOWNERZORDER = 0x0200
$TOPMOST_NOACTIVATE = $SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_NOACTIVATE -bor $SWP_NOOWNERZORDER
$MOVE_NOACTIVATE = $SWP_NOACTIVATE -bor $SWP_NOOWNERZORDER

$repo = 'C:\artex-ymh'
$tool = Join-Path $repo 'tools\codex-ref\capture.mjs'
$nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) { throw 'node.exe not found on PATH' }

$procs = Get-Process -Name ChatGPT -ErrorAction SilentlyContinue
$refProcs = $procs | Where-Object { $_.Path -like '*codex-desktop-electron*' }
if (-not $refProcs) { $refProcs = $procs }
$pids = [int[]]($refProcs | ForEach-Object { $_.Id })
if (-not $pids -or $pids.Length -eq 0) { throw 'no ChatGPT process found' }
Write-Output ('pids=' + ($pids -join ','))
$script:hwnd = [RefWin32]::FindLargest($pids, 'ChatGPT')
if ($script:hwnd -eq [IntPtr]::Zero) { throw 'reference Codex window not found' }
Write-Output ('picked hwnd=' + $script:hwnd)

function Ensure-Size {
  # Other agents resize or minimize this window; a capture at the wrong viewport silently
  # invalidates every later comparison, so re-assert the exact client size before each grab.
  if (-not $script:TW) { return }
  for ($i = 0; $i -lt 4; $i++) {
    $wr = New-Object RefWin32+RECT
    $cr = New-Object RefWin32+RECT
    [void][RefWin32]::GetWindowRect($script:hwnd, [ref]$wr)
    [void][RefWin32]::GetClientRect($script:hwnd, [ref]$cr)
    $cw = $cr.Right - $cr.Left
    $ch = $cr.Bottom - $cr.Top
    if ($cw -eq $script:TW -and $ch -eq $script:TH) { return }
    $fw = ($wr.Right - $wr.Left) - $cw
    $fh = ($wr.Bottom - $wr.Top) - $ch
    [void][RefWin32]::MoveWindow($script:hwnd, $wr.Left, $wr.Top, $script:TW + $fw, $script:TH + $fh, $true)
    Start-Sleep -Milliseconds 700
  }
}

$HWND_BOTTOM = [IntPtr](1)

function Show-Quiet {
  # SW_SHOWNOACTIVATE shows without taking focus; SW_RESTORE / SW_SHOW / SetForegroundWindow
  # would steal it, and the user forbade that.
  # Never MINIMIZE: a minimized window stops compositing and CDP screenshots then time out.
  [void][RefWin32]::ShowWindow($script:hwnd, $SW_SHOWNOACTIVATE)
  Start-Sleep -Milliseconds 600
  Ensure-Size
  if ($Bottom) {
    # Bottom of the z-order: never covers the user, still composited because the reference is
    # launched with --disable-features=CalculateNativeWinOcclusion.
    [void][RefWin32]::SetWindowPos($script:hwnd, $HWND_BOTTOM, 0, 0, 0, 0, [uint32]$TOPMOST_NOACTIVATE)
  } else {
    [void][RefWin32]::SetWindowPos($script:hwnd, $HWND_TOPMOST, 0, 0, 0, 0, [uint32]$TOPMOST_NOACTIVATE)
  }
  Start-Sleep -Milliseconds 600
}

function Hide-Quiet {
  # Park the reference out of sight without minimizing, because minimizing stops frames.
  if ($Bottom) {
    $cr = New-Object RefWin32+RECT
    [void][RefWin32]::GetWindowRect($script:hwnd, [ref]$cr)
    [void][RefWin32]::SetWindowPos($script:hwnd, $HWND_BOTTOM, -4000, 0, ($cr.Right - $cr.Left), ($cr.Bottom - $cr.Top), [uint32]$MOVE_NOACTIVATE)
  } else {
    [void][RefWin32]::SetWindowPos($script:hwnd, $HWND_NOTOPMOST, 0, 0, 0, 0, [uint32]$TOPMOST_NOACTIVATE)
    [void][RefWin32]::ShowWindow($script:hwnd, $SW_MINIMIZE)
  }
}

function Get-Info {
  param([int]$P)
  $raw = (& $nodeExe $tool info --port $P 2>$null | Out-String)
  return ($raw | ConvertFrom-Json)
}

function Nudge-Window {
  # A window that is topmost but never activated gets no compositor frames, so both
  # PrintWindow and CopyFromScreen hand back the previous frame. Resizing by one pixel and
  # back forces Chromium to composite again without activating anything.
  $wr = New-Object RefWin32+RECT
  [void][RefWin32]::GetWindowRect($script:hwnd, [ref]$wr)
  $w0 = $wr.Right - $wr.Left
  $h0 = $wr.Bottom - $wr.Top
  [void][RefWin32]::MoveWindow($script:hwnd, $wr.Left, $wr.Top, ($w0 + 1), $h0, $true)
  Start-Sleep -Milliseconds 350
  [void][RefWin32]::MoveWindow($script:hwnd, $wr.Left, $wr.Top, $w0, $h0, $true)
  Start-Sleep -Milliseconds 700
}
function Save-Shot {
  param([string]$Path)
  # Other agents share this desktop and something minimizes the window every so often; a minimized
  # window yields a 237x39 black bitmap, so re-assert visibility quietly right before every grab.
  Show-Quiet
  Nudge-Window
  Show-Quiet
  Add-Type -AssemblyName System.Drawing
  $cr = New-Object RefWin32+RECT
  [void][RefWin32]::GetClientRect($script:hwnd, [ref]$cr)
  $cw = $cr.Right - $cr.Left
  $ch = $cr.Bottom - $cr.Top
  $bmp = New-Object System.Drawing.Bitmap($cw, $ch)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  if ($CaptureMode -eq 'Screen') {
    $pt = New-Object RefWin32+POINT
    $pt.X = 0
    $pt.Y = 0
    [void][RefWin32]::ClientToScreen($script:hwnd, [ref]$pt)
    $g.CopyFromScreen($pt.X, $pt.Y, 0, 0, (New-Object System.Drawing.Size($cw, $ch)))
  } else {
    $hdc = $g.GetHdc()
    [void][RefWin32]::PrintWindow($script:hwnd, $hdc, 2)
    $g.ReleaseHdc($hdc)
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Output ('shot[' + $CaptureMode + ']: ' + $Path + ' ' + $cw + 'x' + $ch)
}

try {
  Show-Quiet
  $info = Get-Info -P $Port
  $dpr = [double]$info.devicePixelRatio
  $tw = [int][Math]::Round($W * $dpr)
  $th = [int][Math]::Round($H * $dpr)
  $script:TW = $tw
  $script:TH = $th
  if (-not $SkipResize -and -not $SkipResize2) {
    $wr = New-Object RefWin32+RECT
    $cr = New-Object RefWin32+RECT
    [void][RefWin32]::GetWindowRect($script:hwnd, [ref]$wr)
    [void][RefWin32]::GetClientRect($script:hwnd, [ref]$cr)
    $frameW = ($wr.Right - $wr.Left) - ($cr.Right - $cr.Left)
    $frameH = ($wr.Bottom - $wr.Top) - ($cr.Bottom - $cr.Top)
    for ($i = 0; $i -lt 4; $i++) {
      [void][RefWin32]::MoveWindow($script:hwnd, $wr.Left, $wr.Top, $tw + $frameW, $th + $frameH, $true)
      Start-Sleep -Milliseconds 900
      $info = Get-Info -P $Port
      if ($info.innerWidth -eq $W -and $info.innerHeight -eq $H) { break }
    }
  }
  Write-Output ('window: dpr=' + $dpr + ' css=' + $info.innerWidth + 'x' + $info.innerHeight + ' vis=' + $info.visibility)
  if ($Batch) { . $Batch }
  if ($Nav) { & $nodeExe $tool eval ("location.href='" + $Nav + "'; 'ok'") --port $Port | Out-Null; Start-Sleep -Milliseconds $Wait }
  if ($ExprFile) {
    $e = Get-Content -Raw $ExprFile
    $json = & $nodeExe $tool eval $e --port $Port
    if ($EvalName -and $OutDir) { New-Item -ItemType Directory -Force -Path $OutDir | Out-Null; $json | Set-Content -Encoding UTF8 (Join-Path $OutDir ($EvalName + '.json')) } else { $json }
  } elseif ($Expr) { & $nodeExe $tool eval $Expr --port $Port }
  if ($Shot) { New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Shot) | Out-Null; & $nodeExe $tool shot --out $Shot --port $Port }
  if ($ScreenShot) { Save-Shot -Path $ScreenShot }
} finally {
  if (-not $KeepVisible) { Hide-Quiet }
}