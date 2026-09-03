$csharp = @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class ScreenGrabber {
    [DllImport("user32.dll")]
    public static extern IntPtr GetDesktopWindow();

    [DllImport("user32.dll")]
    public static extern IntPtr GetWindowDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr ReleaseDC(IntPtr hWnd, IntPtr hDC);

    [DllImport("gdi32.dll")]
    public static extern bool BitBlt(IntPtr hObject, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hObjectSource, int nXSrc, int nYSrc, int dwRop);

    [DllImport("gdi32.dll")]
    public static extern IntPtr CreateCompatibleBitmap(IntPtr hDC, int nWidth, int nHeight);

    [DllImport("gdi32.dll")]
    public static extern IntPtr CreateCompatibleDC(IntPtr hDC);

    [DllImport("gdi32.dll")]
    public static extern bool DeleteDC(IntPtr hDC);

    [DllImport("gdi32.dll")]
    public static extern bool DeleteObject(IntPtr hObject);

    [DllImport("gdi32.dll")]
    public static extern IntPtr SelectObject(IntPtr hDC, IntPtr hObject);

    public static bool Capture(string outPath, int width, int height) {
        IntPtr hDesktop = GetDesktopWindow();
        IntPtr hdcSrc = GetWindowDC(hDesktop);
        IntPtr hdcDest = CreateCompatibleDC(hdcSrc);
        IntPtr hBitmap = CreateCompatibleBitmap(hdcSrc, width, height);
        IntPtr hOld = SelectObject(hdcDest, hBitmap);

        bool success = BitBlt(hdcDest, 0, 0, width, height, hdcSrc, 0, 0, 0x00CC0020); // SRCCOPY

        SelectObject(hdcDest, hOld);
        DeleteDC(hdcDest);
        ReleaseDC(hDesktop, hdcSrc);

        if (success) {
            using (Bitmap bmp = Bitmap.FromHbitmap(hBitmap)) {
                bmp.Save(outPath, ImageFormat.Jpeg);
            }
        }
        DeleteObject(hBitmap);
        return success;
    }
}
"@

Add-Type -TypeDefinition $csharp -ReferencedAssemblies System.Drawing

$out = Join-Path $PSScriptRoot "grab_test.jpg"
$ok = [ScreenGrabber]::Capture($out, 1920, 1080)
Write-Output "Capture success: $ok, file exists: $(Test-Path $out), size: $((Get-Item $out -ErrorAction SilentlyContinue).Length)"
