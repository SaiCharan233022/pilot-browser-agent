$csharp = @"
using System;
using System.Runtime.InteropServices;

public class DiagGrabber {
    [DllImport("user32.dll")]
    public static extern IntPtr GetDesktopWindow();

    [DllImport("user32.dll")]
    public static extern IntPtr GetWindowDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr GetDC(IntPtr hWnd);

    [DllImport("kernel32.dll")]
    public static extern uint GetLastError();

    public static void Check() {
        IntPtr hDesktop = GetDesktopWindow();
        IntPtr hdcWin = GetWindowDC(hDesktop);
        uint err1 = GetLastError();
        IntPtr hdcZero = GetDC(IntPtr.Zero);
        uint err2 = GetLastError();

        Console.WriteLine("Desktop hWnd: " + hDesktop + " hdcWin: " + hdcWin + " (err: " + err1 + ") hdcZero: " + hdcZero + " (err: " + err2 + ")");
    }
}
"@

Add-Type -TypeDefinition $csharp
[DiagGrabber]::Check()
