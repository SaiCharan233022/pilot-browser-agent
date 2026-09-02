param (
    [string]$OutputPath = ""
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Windows.Forms;
using System.Runtime.InteropServices;

public class NativeScreenCapture {
    [DllImport("user32.dll")]
    public static extern IntPtr GetDesktopWindow();

    [DllImport("user32.dll")]
    public static extern IntPtr GetWindowDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr ReleaseDC(IntPtr hWnd, IntPtr hDC);

    [DllImport("gdi32.dll")]
    public static extern bool BitBlt(IntPtr hObject, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hObjectSource, int nXSrc, int nYSrc, int dwRop);

    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);

    public static Bitmap Capture() {
        int width = GetSystemMetrics(0);
        int height = GetSystemMetrics(1);
        if (width <= 0 || height <= 0) {
            width = Screen.PrimaryScreen.Bounds.Width;
            height = Screen.PrimaryScreen.Bounds.Height;
        }
        if (width <= 0 || height <= 0) { width = 1920; height = 1080; }

        IntPtr hDesk = GetDesktopWindow();
        IntPtr hDC = GetWindowDC(hDesk);
        Bitmap bmp = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        Graphics g = Graphics.FromImage(bmp);
        IntPtr hDestDC = g.GetHdc();
        BitBlt(hDestDC, 0, 0, width, height, hDC, 0, 0, 0x00CC0020);
        g.ReleaseHdc(hDestDC);
        g.Dispose();
        ReleaseDC(hDesk, hDC);
        return bmp;
    }
}
'@ -ReferencedAssemblies System.Drawing, System.Windows.Forms

try {
    $bmp = $null
    try {
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bmp = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
        $g.Dispose()
    } catch {
        # Fallback to Win32 GDI BitBlt
        $bmp = [NativeScreenCapture]::Capture()
    }

    if ($OutputPath) {
        $dir = [System.IO.Path]::GetDirectoryName($OutputPath)
        if ($dir -and -not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
        $bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
        $bmp.Dispose()
        Write-Output "SAVED:$OutputPath"
    } else {
        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Jpeg)
        $bytes = $ms.ToArray()
        $base64 = [Convert]::ToBase64String($bytes)
        $bmp.Dispose()
        $ms.Dispose()
        Write-Output "BASE64:$base64"
    }
} catch {
    Write-Error $_.Exception.Message
}
