param (
    [string]$Action = "focus",
    [string]$Target = "",
    [string]$Text = ""
)

$code = @'
using System;
using System.Text;
using System.Diagnostics;
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
        public static extern bool BringWindowToTop(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr ProcessId);

        [DllImport("user32.dll")]
        public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

        [DllImport("kernel32.dll")]
        public static extern uint GetCurrentThreadId();

        [DllImport("user32.dll")]
        public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        public static bool ForceForeground(IntPtr hWnd) {
            if (hWnd == IntPtr.Zero) return false;
            try {
                // Simulate ALT key press to bypass Windows 11 foreground lock timeout
                keybd_event(0x12, 0, 0, UIntPtr.Zero);
                keybd_event(0x12, 0, 2, UIntPtr.Zero);

                IntPtr hFore = GetForegroundWindow();
                uint foreThread = GetWindowThreadProcessId(hFore, IntPtr.Zero);
                uint curThread = GetCurrentThreadId();

                if (foreThread != curThread && foreThread != 0) {
                    AttachThreadInput(curThread, foreThread, true);
                    ShowWindow(hWnd, 9); // SW_RESTORE
                    BringWindowToTop(hWnd);
                    SetForegroundWindow(hWnd);
                    AttachThreadInput(curThread, foreThread, false);
                } else {
                    ShowWindow(hWnd, 9);
                    BringWindowToTop(hWnd);
                    SetForegroundWindow(hWnd);
                }
                return true;
            } catch {
                ShowWindow(hWnd, 9);
                return SetForegroundWindow(hWnd);
            }
        }

        public static bool FocusTarget(string query) {
            if (string.IsNullOrEmpty(query)) return false;
            string q = query.ToLower().Trim();
            IntPtr targetHwnd = IntPtr.Zero;

            // Common aliases
            if (q == "code" || q == "vscode") q = "visual studio code";
            if (q == "browser") q = "chrome";

            // 1. Try Process MainWindowHandle
            var procs = Process.GetProcesses();
            foreach (var p in procs) {
                if (p.MainWindowHandle != IntPtr.Zero) {
                    if (p.ProcessName.IndexOf(q, StringComparison.OrdinalIgnoreCase) >= 0 ||
                        p.MainWindowTitle.IndexOf(q, StringComparison.OrdinalIgnoreCase) >= 0) {
                        return ForceForeground(p.MainWindowHandle);
                    }
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
                return ForceForeground(targetHwnd);
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
        if ($Target) {
            [DesktopControllerBridge.WindowOps]::FocusTarget($Target) | Out-Null
            Start-Sleep -Milliseconds 200
        }
        $ws = New-Object -ComObject WScript.Shell
        $ws.SendKeys($Text)
        Write-Output "sent_key"
    }
}
