
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
  public delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
"@
$found = @()
$cb = [W+EnumWindowsProc]{
  param($h, $l)
  $sb = New-Object System.Text.StringBuilder 512
  [W]::GetWindowText($h, $sb, 512) | Out-Null
  $t = $sb.ToString()
  if ($t -match 'ChatGPT' -and [W]::IsWindowVisible($h)) { $script:found += [pscustomobject]@{ H = $h; Title = $t } }
  return $true
}
[W]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
Write-Output ("ChatGPT windows: " + $found.Count)
foreach ($f in $found) {
  [W]::ShowWindow($f.H, 6) | Out-Null          # SW_MINIMIZE
  [W]::SetWindowPos($f.H, [IntPtr](-2), 0, 0, 0, 0, 0x0013) | Out-Null   # HWND_NOTOPMOST, NOMOVE|NOSIZE|NOACTIVATE
  Write-Output ("  minimized NOTOPMOST: " + $f.Title)
}
$fg = [W]::GetForegroundWindow()
$sb2 = New-Object System.Text.StringBuilder 512
[W]::GetWindowText($fg, $sb2, 512) | Out-Null
Write-Output ("foreground now: " + $sb2.ToString())
