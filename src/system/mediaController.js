/**
 * System Media & Volume Controller for Windows
 * Controls master volume, media keys (play, pause, next, prev, stop), and mute/unmute
 * using verified native Windows CoreAudio COM and User32 virtual key bridges.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE_SCRIPT = path.join(__dirname, 'audioBridge.ps1');

/**
 * Execute action on the audio bridge.
 */
async function runBridge(action, value = 0) {
  try {
    const cmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${BRIDGE_SCRIPT}" -Action ${action} -Value ${value}`;
    const { stdout, stderr } = await execAsync(cmd);
    if (stderr && stderr.trim()) {
      console.warn('AudioBridge warning:', stderr.trim());
    }
    return stdout.trim();
  } catch (err) {
    console.error('AudioBridge execution failed:', err.message);
    throw err;
  }
}

/**
 * Get master system volume (0 - 100).
 */
export async function getVolume() {
  const out = await runBridge('get');
  const num = parseInt(out, 10);
  return isNaN(num) ? 50 : num;
}

/**
 * Set master system volume (0 - 100%).
 */
export async function setVolume(percent) {
  const normalized = Math.max(0, Math.min(100, Math.round(Number(percent))));
  const out = await runBridge('set', normalized);
  const updatedVol = parseInt(out, 10) || normalized;
  return { success: true, volume: updatedVol };
}

/**
 * Toggle media play/pause.
 */
export async function togglePlayPause() {
  await runBridge('playpause');
  return { success: true, action: 'toggle_play_pause' };
}

/**
 * Stop media playback.
 */
export async function stopMedia() {
  await runBridge('stop');
  return { success: true, action: 'stop_media' };
}

/**
 * Next track.
 */
export async function nextTrack() {
  await runBridge('next');
  return { success: true, action: 'next_track' };
}

/**
 * Previous track.
 */
export async function previousTrack() {
  await runBridge('prev');
  return { success: true, action: 'previous_track' };
}

/**
 * Mute audio.
 */
export async function mute() {
  await runBridge('mute');
  return { success: true, action: 'mute' };
}

/**
 * Unmute audio.
 */
export async function unmute() {
  await runBridge('unmute');
  return { success: true, action: 'unmute' };
}

/**
 * Increase system volume by step.
 */
export async function volumeUp(step = 10) {
  const current = await getVolume();
  const nextVol = Math.min(100, current + step);
  return await setVolume(nextVol);
}

/**
 * Decrease system volume by step.
 */
export async function volumeDown(step = 10) {
  const current = await getVolume();
  const nextVol = Math.max(0, current - step);
  return await setVolume(nextVol);
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
      return await mute();
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
