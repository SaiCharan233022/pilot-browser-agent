param (
    [string]$Action = "get",
    [float]$Value = 0
)

$code = @'
using System;
using System.Runtime.InteropServices;

namespace AudioControllerBridge {
    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioEndpointVolume {
        [PreserveSig] int RegisterControlChangeNotify(IntPtr pNotify);
        [PreserveSig] int UnregisterControlChangeNotify(IntPtr pNotify);
        [PreserveSig] int GetChannelCount(out uint pnChannelCount);
        [PreserveSig] int SetMasterVolumeLevel(float fLevelDB, ref Guid pguidEventContext);
        [PreserveSig] int SetMasterVolumeLevelScalar(float fLevel, ref Guid pguidEventContext);
        [PreserveSig] int GetMasterVolumeLevel(out float pfLevelDB);
        [PreserveSig] int GetMasterVolumeLevelScalar(out float pfLevel);
        [PreserveSig] int SetChannelVolumeLevel(uint nChannel, float fLevelDB, ref Guid pguidEventContext);
        [PreserveSig] int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, ref Guid pguidEventContext);
        [PreserveSig] int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
        [PreserveSig] int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
        [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid pguidEventContext);
        [PreserveSig] int GetMute(out bool pbMute);
        [PreserveSig] int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
        [PreserveSig] int VolumeStepUp(ref Guid pguidEventContext);
        [PreserveSig] int VolumeStepDown(ref Guid pguidEventContext);
        [PreserveSig] int QueryHardwareSupport(out uint pdwHardwareSupportMask);
        [PreserveSig] int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDevice {
        [PreserveSig] int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
    }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceEnumerator {
        [PreserveSig] int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
        [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppEndpoint);
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    public class MMDeviceEnumeratorComObject { }

    public class AudioOps {
        [DllImport("user32.dll")]
        public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        public static void SendMediaKey(byte vk) {
            keybd_event(vk, 0, 0, UIntPtr.Zero);
            keybd_event(vk, 0, 2, UIntPtr.Zero);
        }

        private static IAudioEndpointVolume GetEndpointVolume() {
            var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
            IMMDevice dev = null;
            enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
            object obj = null;
            Guid iid = typeof(IAudioEndpointVolume).GUID;
            dev.Activate(ref iid, 23, IntPtr.Zero, out obj);
            return (IAudioEndpointVolume)obj;
        }

        public static float GetMasterVolume() {
            var aev = GetEndpointVolume();
            float vol = 0;
            aev.GetMasterVolumeLevelScalar(out vol);
            return vol * 100.0f;
        }

        public static void SetMasterVolume(float percent) {
            var aev = GetEndpointVolume();
            float scalar = Math.Max(0.0f, Math.Min(100.0f, percent)) / 100.0f;
            Guid empty = Guid.Empty;
            aev.SetMasterVolumeLevelScalar(scalar, ref empty);
            aev.SetMute(false, ref empty);
        }

        public static void SetMute(bool mute) {
            var aev = GetEndpointVolume();
            Guid empty = Guid.Empty;
            aev.SetMute(mute, ref empty);
        }
    }
}
'@

if (-not ([System.Management.Automation.PSTypeName]'AudioControllerBridge.AudioOps').Type) {
    Add-Type -TypeDefinition $code
}

switch ($Action.ToLower()) {
    "get" {
        $v = [AudioControllerBridge.AudioOps]::GetMasterVolume()
        [math]::Round($v)
    }
    "set" {
        [AudioControllerBridge.AudioOps]::SetMasterVolume($Value)
        $v = [AudioControllerBridge.AudioOps]::GetMasterVolume()
        [math]::Round($v)
    }
    "mute" {
        [AudioControllerBridge.AudioOps]::SetMute($true)
        Write-Output "muted"
    }
    "unmute" {
        [AudioControllerBridge.AudioOps]::SetMute($false)
        Write-Output "unmuted"
    }
    "playpause" {
        [AudioControllerBridge.AudioOps]::SendMediaKey(179)
        Write-Output "playpause_sent"
    }
    "stop" {
        [AudioControllerBridge.AudioOps]::SendMediaKey(178)
        Write-Output "stop_sent"
    }
    "next" {
        [AudioControllerBridge.AudioOps]::SendMediaKey(176)
        Write-Output "next_sent"
    }
    "prev" {
        [AudioControllerBridge.AudioOps]::SendMediaKey(177)
        Write-Output "prev_sent"
    }
    default {
        Write-Output "unknown_action"
    }
}
