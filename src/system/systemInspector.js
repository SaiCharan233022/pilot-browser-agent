import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_INFO_SCRIPT = path.join(__dirname, 'getSystemInfo.ps1');

/**
 * Get comprehensive hardware, battery, and OS status metrics via PowerShell.
 */
export async function getSystemInfo() {
  try {
    const { stdout } = await execAsync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${SYSTEM_INFO_SCRIPT}"`, { timeout: 8000 });
    const data = JSON.parse(stdout.trim());
    return {
      success: true,
      battery: {
        percent: data.batteryPercent || 'N/A',
        status: data.batteryStatus || 'AC Powered',
      },
      cpu: {
        model: data.cpuName || os.cpus()[0]?.model || 'Processor',
        cores: os.cpus().length,
      },
      ram: {
        total: `${data.totalRamGB} GB`,
        used: `${data.usedRamGB} GB (${data.ramPercent}%)`,
        free: `${data.freeRamGB} GB`,
      },
      disk: {
        drive: 'C:',
        total: `${data.diskTotalGB} GB`,
        free: `${data.diskFreeGB} GB`,
      },
      os: {
        platform: data.osName || os.type(),
        uptime: `${Math.floor(os.uptime() / 3600)}h ${Math.floor((os.uptime() % 3600) / 60)}m`,
      },
    };
  } catch (err) {
    // Fallback using native Node.js os module
    const totalMem = (os.totalmem() / (1024 ** 3)).toFixed(1);
    const freeMem = (os.freemem() / (1024 ** 3)).toFixed(1);
    const usedMem = (totalMem - freeMem).toFixed(1);
    return {
      success: true,
      battery: { percent: 'N/A', status: 'AC Powered' },
      cpu: { model: os.cpus()[0]?.model || 'Processor', cores: os.cpus().length },
      ram: { total: `${totalMem} GB`, used: `${usedMem} GB`, free: `${freeMem} GB` },
      disk: { drive: 'C:', total: 'Available', free: 'Available' },
      os: { platform: os.type(), uptime: `${Math.floor(os.uptime() / 3600)}h` },
    };
  }
}

/**
 * Get quick battery status.
 */
export async function getBatteryStatus() {
  const info = await getSystemInfo();
  return {
    success: true,
    percent: info.battery?.percent || 'N/A',
    status: info.battery?.status || 'AC Powered',
  };
}

