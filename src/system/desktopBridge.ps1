param (
    [string]$Action = "focus",
    [string]$Target = "",
    [string]$Text = ""
)

$code = @'
using System;
using System.Runtime.InteropServices;

namespace DesktopControllerBridge {
    public class WindowOps {
        [DllImport("user32.dll")]
        public static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        public static extern bool IsIconic(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        public static bool FocusProcess(string pattern) {
            var procs = System.Diagnostics.Process.GetProcesses();
            foreach (var p in procs) {
                if (p.MainWindowHandle != IntPtr.Zero && p.ProcessName.IndexOf(pattern, StringComparison.OrdinalIgnoreCase) >= 0) {
                    if (IsIconic(p.MainWindowHandle)) {
                        ShowWindow(p.MainWindowHandle, 9); // SW_RESTORE
                    } else {
                        ShowWindow(p.MainWindowHandle, 5); // SW_SHOW
                    }
                    return SetForegroundWindow(p.MainWindowHandle);
                }
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
        $focused = [DesktopControllerBridge.WindowOps]::FocusProcess($Target)
        if (-not $focused) {
            # Fallback to WScript AppActivate
            $ws = New-Object -ComObject WScript.Shell
            $ws.AppActivate($Target) | Out-Null
        }
        Write-Output "focused"
    }
    "type" {
        [DesktopControllerBridge.WindowOps]::FocusProcess($Target) | Out-Null
        Start-Sleep -Milliseconds 200
        $ws = New-Object -ComObject WScript.Shell
        $ws.SendKeys($Text)
        Write-Output "typed"
    }
    "key" {
        [DesktopControllerBridge.WindowOps]::FocusProcess($Target) | Out-Null
        Start-Sleep -Milliseconds 200
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
