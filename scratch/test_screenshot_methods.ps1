Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Windows.Forms;
using System.Runtime.InteropServices;

public class ScreenTester {
    [DllImport("user32.dll")]
    public static extern IntPtr GetDesktopWindow();

    [DllImport("user32.dll")]
    public static extern IntPtr GetWindowDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr GetDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

    [DllImport("gdi32.dll")]
    public static extern bool BitBlt(IntPtr hObject, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hObjectSource, int nXSrc, int nYSrc, int dwRop);

    [DllImport("user32.dll")]
    public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdcBlt, uint nFlags);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    public static Bitmap CaptureForeground() {
        IntPtr hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero) hwnd = GetDesktopWindow();
        Bitmap bmp = new Bitmap(1920, 1080, PixelFormat.Format32bppArgb);
        Graphics g = Graphics.FromImage(bmp);
        IntPtr hdc = g.GetHdc();
        PrintWindow(hwnd, hdc, 2); // 2 = PW_RENDERFULLCONTENT
        g.ReleaseHdc(hdc);
        g.Dispose();
        return bmp;
    }
}
'@ -ReferencedAssemblies System.Drawing, System.Windows.Forms

# Method 1: Graphics.CopyFromScreen on PrimaryScreen
try {
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp1 = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
    $g1 = [System.Drawing.Graphics]::FromImage($bmp1)
    $g1.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $g1.Dispose()
    $bmp1.Save("scratch/method1.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $bmp1.Dispose()
    Write-Output "Method 1: Saved"
} catch {
    Write-Output "Method 1 failed: $_"
}

# Method 2: CaptureForeground PrintWindow
try {
    $bmp2 = [ScreenTester]::CaptureForeground()
    $bmp2.Save("scratch/method2.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $bmp2.Dispose()
    Write-Output "Method 2: Saved"
} catch {
    Write-Output "Method 2 failed: $_"
}

# Method 3: PowerShell SendKeys + Clipboard
try {
    [System.Windows.Forms.SendKeys]::SendWait('{PRTSC}')
    Start-Sleep -Milliseconds 400
    if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
        $img = [System.Windows.Forms.Clipboard]::GetImage()
        $img.Save("scratch/method3.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
        $img.Dispose()
        Write-Output "Method 3: Saved"
    } else {
        Write-Output "Method 3: Clipboard empty"
    }
} catch {
    Write-Output "Method 3 failed: $_"
}
