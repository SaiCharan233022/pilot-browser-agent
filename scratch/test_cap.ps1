Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class Win32DesktopCapture {
    [DllImport("user32.dll")]
    public static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll")]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern bool CloseDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    public static extern IntPtr GetDC(IntPtr hwnd);

    [DllImport("user32.dll")]
    public static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);

    [DllImport("gdi32.dll")]
    public static extern bool BitBlt(IntPtr hdcDest, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hdcSrc, int nXSrc, int nYSrc, int dwRop);

    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);

    public const uint GENERIC_ALL = 0x10000000;
    public const int SRCCOPY = 0x00CC0020;
    public const int CAPTUREBLT = 0x40000000;

    public static Bitmap Capture() {
        try { SetProcessDPIAware(); } catch {}

        IntPtr hDesk = OpenInputDesktop(0, false, GENERIC_ALL);
        if (hDesk != IntPtr.Zero) {
            SetThreadDesktop(hDesk);
        }

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

        if (hDesk != IntPtr.Zero) {
            CloseDesktop(hDesk);
        }

        return bmp;
    }
}
'@ -ReferencedAssemblies System.Drawing

try {
    $bmp = [Win32DesktopCapture]::Capture()
    $path = Join-Path $PSScriptRoot "test_cap2.jpg"
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $bmp.Dispose()
    Write-Output "Captured with OpenInputDesktop to $path"
} catch {
    Write-Error $_.Exception.Message
}
