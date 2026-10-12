$log='C:\artex-ymh\web\dev-3007.log'
$err='C:\artex-ymh\web\dev-3007.err.log'
Remove-Item -LiteralPath $log,$err -Force -ErrorAction SilentlyContinue
$npm=(Get-Command npm.cmd -ErrorAction Stop).Source
& $npm --prefix 'C:\artex-ymh\web' run dev -- --hostname 127.0.0.1 --port 3007 *>> $log
