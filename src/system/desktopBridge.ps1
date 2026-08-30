param (
    [string]$Action = "focus",
    [string]$Target = "",
    [string]$Text = ""
)

$code = @'
using System;
using System.Text;
using System.Runtime.InteropServices;

namespace DesktopControllerBridge {
    public class WindowOps {
        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")]
        public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

        [DllImport("user32.dll")]
        public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        public static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        public static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern bool IsIconic(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        public static bool FocusTarget(string query) {
            if (string.IsNullOrEmpty(query)) return false;
            string q = query.ToLower();
            IntPtr targetHwnd = IntPtr.Zero;

            // 1. Try Process MainWindowHandle
            var procs = System.Diagnostics.Process.GetProcesses();
            foreach (var p in procs) {
                if (p.MainWindowHandle != IntPtr.Zero && p.ProcessName.IndexOf(q, StringComparison.OrdinalIgnoreCase) >= 0) {
                    ShowWindow(p.MainWindowHandle, 9); // SW_RESTORE
                    return SetForegroundWindow(p.MainWindowHandle);
                }
            }

            // 2. Scan all top-level visible window titles
            EnumWindows((hWnd, lParam) => {
                if (IsWindowVisible(hWnd)) {
                    var sb = new StringBuilder(256);
                    GetWindowText(hWnd, sb, 256);
                    string title = sb.ToString();
                    if (!string.IsNullOrEmpty(title) && title.ToLower().Contains(q)) {
                        targetHwnd = hWnd;
                        return false;
                    }
                }
                return true;
            }, IntPtr.Zero);

            if (targetHwnd != IntPtr.Zero) {
                ShowWindow(targetHwnd, 9);
                return SetForegroundWindow(targetHwnd);
            }

            return false;
        }

        public static void SendMediaKey(byte vk) {
            keybd_event(vk, 0, 0, UIntPtr.Zero);
            keybd_event(vk, 0, 2, UIntPtr.Zero);
        }
    }
}
'@

if (-not ([System.Management.Automation.PSTypeName]'DesktopControllerBridge.WindowOps').Type) {
    Add-Type -TypeDefinition $code -ReferencedAssemblies "System.Windows.Forms"
}

switch ($Action.ToLower()) {
    "focus" {
        $focused = [DesktopControllerBridge.WindowOps]::FocusTarget($Target)
        if (-not $focused) {
            $ws = New-Object -ComObject WScript.Shell
            $ws.AppActivate($Target) | Out-Null
        }
        Write-Output "focused"
    }
    "type" {
        [DesktopControllerBridge.WindowOps]::FocusTarget($Target) | Out-Null
        Start-Sleep -Milliseconds 250
        $ws = New-Object -ComObject WScript.Shell
        $ws.SendKeys($Text)
        Write-Output "typed"
    }
    "key" {
        [DesktopControllerBridge.WindowOps]::FocusTarget($Target) | Out-Null
        Start-Sleep -Milliseconds 250
        $ws = New-Object -ComObject WScript.Shell
        $ws.SendKeys($Text)
        Write-Output "key_sent"
    }
    "playpause" {
        [DesktopControllerBridge.WindowOps]::SendMediaKey(179)
        Write-Output "playpause_sent"
    }
    default {
        Write-Output "unknown_action"
    }
}
