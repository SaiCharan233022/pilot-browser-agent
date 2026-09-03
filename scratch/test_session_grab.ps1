$csharp = @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class SessionGrabber {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenWindowStation(string lpszWinSta, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetProcessWindowStation(IntPtr hWinSta);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr GetDC(IntPtr hWnd);

    [DllImport("gdi32.dll", SetLastError = true)]
    public static extern IntPtr CreateCompatibleDC(IntPtr hDC);

    [DllImport("gdi32.dll", SetLastError = true)]
    public static extern IntPtr CreateCompatibleBitmap(IntPtr hDC, int nWidth, int nHeight);

    [DllImport("gdi32.dll", SetLastError = true)]
    public static extern IntPtr SelectObject(IntPtr hDC, IntPtr hObject);

    [DllImport("gdi32.dll", SetLastError = true)]
    public static extern bool BitBlt(IntPtr hObject, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hObjectSource, int nXSrc, int nYSrc, int dwRop);

    [DllImport("kernel32.dll")]
    public static extern uint GetLastError();

    public static bool TryCapture(string outPath) {
        IntPtr hWinsta = OpenWindowStation("winsta0", false, 0x037F);
        bool setWinsta = SetProcessWindowStation(hWinsta);
        IntPtr hDesk = OpenDesktop("default", 0, false, 0x01FF);
        bool setDesk = SetThreadDesktop(hDesk);

        Console.WriteLine("hWinsta: " + hWinsta + " setWinsta: " + setWinsta + " hDesk: " + hDesk + " setDesk: " + setDesk);

        IntPtr hdcSrc = GetDC(IntPtr.Zero);
        IntPtr hdcDest = CreateCompatibleDC(hdcSrc);
        IntPtr hBmp = CreateCompatibleBitmap(hdcSrc, 1920, 1080);
        IntPtr hOld = SelectObject(hdcDest, hBmp);
        bool res = BitBlt(hdcDest, 0, 0, 1920, 1080, hdcSrc, 0, 0, 0x00CC0020);
        uint err = GetLastError();

        Console.WriteLine("hdcSrc: " + hdcSrc + " BitBlt: " + res + " err: " + err);

        if (res) {
            using (Bitmap bmp = Bitmap.FromHbitmap(hBmp)) {
                bmp.Save(outPath, ImageFormat.Jpeg);
            }
        }
        return res;
    }
}
"@

Add-Type -TypeDefinition $csharp -ReferencedAssemblies System.Drawing
$out = Join-Path $PSScriptRoot "session_grab.jpg"
[SessionGrabber]::TryCapture($out)
