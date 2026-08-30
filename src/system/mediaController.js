/**
 * System Media & Volume Controller for Windows
 * Controls master volume, media keys (play, pause, next, prev, stop), and mute/unmute
 * using native Windows PowerShell / CoreAudio API bridges.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Execute a PowerShell script safely.
 */
async function runPowerShell(script) {
  try {
    const encodedCommand = Buffer.from(script, 'utf16le').toString('base64');
    const { stdout, stderr } = await execAsync(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${encodedCommand}`);
    if (stderr && stderr.trim()) {
      console.warn('PowerShell warning:', stderr.trim());
    }
    return stdout.trim();
  } catch (err) {
    console.error('PowerShell execution failed:', err.message);
    throw err;
  }
}

/**
 * Send virtual key codes via Windows user32.dll
 * VK_MEDIA_NEXT_TRACK = 0xB0 (176)
 * VK_MEDIA_PREV_TRACK = 0xB1 (177)
 * VK_MEDIA_STOP = 0xB2 (178)
 * VK_MEDIA_PLAY_PAUSE = 0xB3 (179)
 * VK_VOLUME_MUTE = 0xAD (173)
 * VK_VOLUME_DOWN = 0xAE (174)
 * VK_VOLUME_UP = 0xAF (175)
 */
async function sendMediaKey(vkCode) {
  const script = `
$code = @"
using System;
using System.Runtime.InteropServices;
public class MediaControl {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    public static void SendKey(byte vk) {
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        keybd_event(vk, 0, 2, UIntPtr.Zero);
    }
}
"@
if (-not ([System.Management.Automation.PSTypeName]'MediaControl').Type) {
    Add-Type -TypeDefinition $code
}
[MediaControl]::SendKey(${vkCode})
`;
  await runPowerShell(script);
  return true;
}

/**
 * Toggle media play/pause.
 */
export async function togglePlayPause() {
  await sendMediaKey(179); // VK_MEDIA_PLAY_PAUSE
  return { success: true, action: 'toggle_play_pause' };
}

/**
 * Stop media playback.
 */
export async function stopMedia() {
  await sendMediaKey(178); // VK_MEDIA_STOP
  return { success: true, action: 'stop_media' };
}

/**
 * Next track.
 */
export async function nextTrack() {
  await sendMediaKey(176); // VK_MEDIA_NEXT_TRACK
  return { success: true, action: 'next_track' };
}

/**
 * Previous track.
 */
export async function previousTrack() {
  await sendMediaKey(177); // VK_MEDIA_PREV_TRACK
  return { success: true, action: 'previous_track' };
}

/**
 * Mute / Unmute toggle.
 */
export async function toggleMute() {
  await sendMediaKey(173); // VK_VOLUME_MUTE
  return { success: true, action: 'toggle_mute' };
}

/**
 * Set master system volume (0 - 100%).
 * Uses Windows CoreAudio IAudioEndpointVolume interface.
 */
export async function setVolume(percent) {
  const normalized = Math.max(0, Math.min(100, Math.round(Number(percent))));
  const scalar = (normalized / 100).toFixed(4);

  const script = `
$code = @"
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
    int f(); int g(); int h(); int i();
    int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
    int j();
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, System.Guid pguidEventContext);
    int GetMute(out bool pbMute);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
    int Activate(ref System.Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    int f();
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDevEnumeratorComObject { }

public class AudioControl {
    public static void SetVolume(float level) {
        var enumerator = (IMMDeviceEnumerator)(new MMDevEnumeratorComObject());
        IMMDevice dev = null;
        enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
        IAudioEndpointVolume aev = null;
        var iid = typeof(IAudioEndpointVolume).GUID;
        dev.Activate(ref iid, 23, 0, out aev);
        aev.SetMasterVolumeLevelScalar(level, Guid.Empty);
        aev.SetMute(false, Guid.Empty);
    }
}
"@
if (-not ([System.Management.Automation.PSTypeName]'AudioControl').Type) {
    Add-Type -TypeDefinition $code
}
[AudioControl]::SetVolume([float]${scalar})
`;
  await runPowerShell(script);
  return { success: true, volume: normalized };
}

/**
 * Increase system volume by step.
 */
export async function volumeUp(step = 5) {
  const steps = Math.ceil(step / 2);
  for (let i = 0; i < steps; i++) {
    await sendMediaKey(175); // VK_VOLUME_UP
  }
  return { success: true, action: 'volume_up' };
}

/**
 * Decrease system volume by step.
 */
export async function volumeDown(step = 5) {
  const steps = Math.ceil(step / 2);
  for (let i = 0; i < steps; i++) {
    await sendMediaKey(174); // VK_VOLUME_DOWN
  }
  return { success: true, action: 'volume_down' };
}

/**
 * Unmute system audio.
 */
export async function unmute() {
  const script = `
$code = @"
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
    int f(); int g(); int h(); int i();
    int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
    int j();
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, System.Guid pguidEventContext);
    int GetMute(out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
    int Activate(ref System.Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev);
}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    int f();
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDevEnumeratorComObject { }
public class AudioUnmute {
    public static void DoUnmute() {
        var enumerator = (IMMDeviceEnumerator)(new MMDevEnumeratorComObject());
        IMMDevice dev = null;
        enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
        IAudioEndpointVolume aev = null;
        var iid = typeof(IAudioEndpointVolume).GUID;
        dev.Activate(ref iid, 23, 0, out aev);
        aev.SetMute(false, Guid.Empty);
    }
}
"@
if (-not ([System.Management.Automation.PSTypeName]'AudioUnmute').Type) {
    Add-Type -TypeDefinition $code
}
[AudioUnmute]::DoUnmute()
`;
  await runPowerShell(script);
  return { success: true, action: 'unmute' };
}

/**
 * Handle high-level media command.
 */
export async function executeMediaAction(action, value) {
  switch (action) {
    case 'pause':
    case 'stop':
      return await stopMedia();
    case 'play':
    case 'resume':
    case 'toggle':
      return await togglePlayPause();
    case 'next':
      return await nextTrack();
    case 'previous':
    case 'prev':
      return await previousTrack();
    case 'mute':
      return await toggleMute();
    case 'unmute':
      return await unmute();
    case 'set_volume':
      return await setVolume(value ?? 50);
    case 'volume_up':
      return await volumeUp(value ?? 10);
    case 'volume_down':
      return await volumeDown(value ?? 10);
    default:
      throw new Error(`Unknown media action: ${action}`);
  }
}
