$csharp = @"
using System;
using System.Runtime.InteropServices;

public class DiagBitBlt {
    [DllImport("user32.dll")]
    public static extern IntPtr GetDC(IntPtr hWnd);

    [DllImport("gdi32.dll")]
    public static extern IntPtr CreateCompatibleDC(IntPtr hDC);

    [DllImport("gdi32.dll")]
    public static extern IntPtr CreateCompatibleBitmap(IntPtr hDC, int nWidth, int nHeight);

    [DllImport("gdi32.dll")]
    public static extern IntPtr SelectObject(IntPtr hDC, IntPtr hObject);

    [DllImport("gdi32.dll")]
    public static extern bool BitBlt(IntPtr hObject, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hObjectSource, int nXSrc, int nYSrc, int dwRop);

    [DllImport("kernel32.dll")]
    public static extern uint GetLastError();

    public static void Test() {
        IntPtr hdcSrc = GetDC(IntPtr.Zero);
        IntPtr hdcDest = CreateCompatibleDC(hdcSrc);
        IntPtr hBmp = CreateCompatibleBitmap(hdcSrc, 100, 100);
        IntPtr hOld = SelectObject(hdcDest, hBmp);
        bool res = BitBlt(hdcDest, 0, 0, 100, 100, hdcSrc, 0, 0, 0x00CC0020);
        uint err = GetLastError();
        Console.WriteLine("hdcSrc: " + hdcSrc + " hdcDest: " + hdcDest + " hBmp: " + hBmp + " BitBlt: " + res + " err: " + err);
    }
}
"@

Add-Type -TypeDefinition $csharp
[DiagBitBlt]::Test()
