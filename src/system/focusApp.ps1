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
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
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

# 2. Try User32 P/Invoke with HWND_TOPMOST force-elevation over active browser
try {
    $HWND_TOPMOST = [IntPtr](-1)
    $HWND_NOTOPMOST = [IntPtr](-2)
    $SWP_FLAGS = 0x0003 # SWP_NOSIZE (0x0001) | SWP_NOMOVE (0x0002)

    $candidates = Get-Process | Where-Object { 
        $_.MainWindowHandle -ne [IntPtr]::Zero -and (
            $_.ProcessName -like "*$AppName*" -or 
            $_.MainWindowTitle -like "*$AppName*"
        )
    }

    foreach ($proc in $candidates) {
        [WindowFocus]::ShowWindow($proc.MainWindowHandle, 9) # 9 = SW_RESTORE
        [WindowFocus]::BringWindowToTop($proc.MainWindowHandle)
        [WindowFocus]::SetWindowPos($proc.MainWindowHandle, $HWND_TOPMOST, 0, 0, 0, 0, $SWP_FLAGS)
        [WindowFocus]::SetForegroundWindow($proc.MainWindowHandle)
        [WindowFocus]::SwitchToThisWindow($proc.MainWindowHandle, $true)
        Start-Sleep -Milliseconds 250
        [WindowFocus]::SetWindowPos($proc.MainWindowHandle, $HWND_NOTOPMOST, 0, 0, 0, 0, $SWP_FLAGS)
    }
} catch {}

Write-Output "FOCUSED"
