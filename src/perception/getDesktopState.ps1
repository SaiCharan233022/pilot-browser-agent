param (
    [string]$OutputPath = ""
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Text;
using System.Windows.Forms;
using System.Runtime.InteropServices;

public class Win32ScreenHelper {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr GetDC(IntPtr hwnd);

    [DllImport("user32.dll")]
    public static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);

    [DllImport("gdi32.dll")]
    public static extern bool BitBlt(IntPtr hdcDest, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hdcSrc, int nXSrc, int nYSrc, int dwRop);

    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);

    public const int SRCCOPY = 0x00CC0020;
    public const int CAPTUREBLT = 0x40000000;

    public static List<string> GetVisibleWindowTitles() {
        List<string> titles = new List<string>();
        EnumWindows(delegate (IntPtr hWnd, IntPtr lParam) {
            if (IsWindowVisible(hWnd)) {
                int length = GetWindowTextLength(hWnd);
                if (length > 0) {
                    StringBuilder builder = new StringBuilder(length + 1);
                    GetWindowText(hWnd, builder, builder.Capacity);
                    string title = builder.ToString().Trim();
                    if (!string.IsNullOrEmpty(title) && !titles.Contains(title) && title != "Default IME" && title != "MSCTFIME UI") {
                        titles.Add(title);
                    }
                }
            }
            return true;
        }, IntPtr.Zero);
        return titles;
    }

    public static Bitmap Capture() {
        int width = GetSystemMetrics(78);
        int height = GetSystemMetrics(79);
        int x = GetSystemMetrics(76);
        int y = GetSystemMetrics(77);

        if (width <= 0 || height <= 0) {
            width = GetSystemMetrics(0);
            height = GetSystemMetrics(1);
            x = 0;
            y = 0;
        }

        IntPtr hdcSrc = GetDC(IntPtr.Zero);
        Bitmap bmp = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        Graphics g = Graphics.FromImage(bmp);
        IntPtr hdcDest = g.GetHdc();

        BitBlt(hdcDest, 0, 0, width, height, hdcSrc, x, y, SRCCOPY | CAPTUREBLT);

        g.ReleaseHdc(hdcDest);
        g.Dispose();
        ReleaseDC(IntPtr.Zero, hdcSrc);

        return bmp;
    }
}
'@ -ReferencedAssemblies System.Drawing, System.Windows.Forms

# 1. Enumerate Visible Desktop Windows with Win32 EnumWindows
$windows = @()
try {
    $windows = [Win32ScreenHelper]::GetVisibleWindowTitles()
} catch {
    try {
        $processes = Get-Process | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle.Trim().Length -gt 0 }
        foreach ($p in $processes) {
            $windows += "$($p.ProcessName): $($p.MainWindowTitle)"
        }
    } catch {}
}

# 2. Capture Desktop Screenshot
$captured = $false
try {
    $bmp = [Win32ScreenHelper]::Capture()
    if ($OutputPath) {
        $dir = [System.IO.Path]::GetDirectoryName($OutputPath)
        if ($dir -and -not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
        $bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
        $bmp.Dispose()
        $captured = $true
    }
} catch {}

$result = [PSCustomObject]@{
    success = $true
    screenshotSaved = $captured
    activeWindows = $windows
}

$result | ConvertTo-Json -Compress
