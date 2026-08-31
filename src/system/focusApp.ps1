param (
    [string]$AppName,
    [string]$AppID = ""
)

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WindowFocus {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);
    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);
}
'@ -ErrorAction SilentlyContinue

Start-Sleep -Milliseconds 400

# 1. Try WScript.Shell AppActivate (works universally for names & titles)
try {
    $ws = New-Object -ComObject WScript.Shell
    if ($AppName) {
        $ws.AppActivate($AppName) | Out-Null
    }
} catch {}

# 2. Try User32 P/Invoke with MainWindowHandle
try {
    $candidates = Get-Process | Where-Object { 
        $_.MainWindowHandle -ne [IntPtr]::Zero -and (
            $_.ProcessName -like "*$AppName*" -or 
            $_.MainWindowTitle -like "*$AppName*"
        )
    }

    foreach ($proc in $candidates) {
        [WindowFocus]::ShowWindow($proc.MainWindowHandle, 9) # 9 = SW_RESTORE
        [WindowFocus]::BringWindowToTop($proc.MainWindowHandle)
        [WindowFocus]::SetForegroundWindow($proc.MainWindowHandle)
        [WindowFocus]::SwitchToThisWindow($proc.MainWindowHandle, $true)
    }
} catch {}

Write-Output "FOCUSED"
