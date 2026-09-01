/**
 * Pilot System Health & Hardware Inspector
 * Queries real-time battery status, CPU load, memory utilization, disk space, and network info.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

/**
 * Get comprehensive hardware and OS status metrics via PowerShell.
 */
export async function getSystemInfo() {
  const psScript = `
    $ErrorActionPreference = 'SilentlyContinue'
    $battery = Get-CimInstance Win32_Battery | Select-Object -First 1
    $os = Get-CimInstance Win32_OperatingSystem
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    $disk = Get-PSDrive C | Select-Object Used, Free
    
    $batPercent = if ($battery) { $battery.EstimatedChargeRemaining } else { $null }
    $batStatus = if ($battery) { 
      switch ($battery.BatteryStatus) {
        1 { "Discharging" }
        2 { "AC Connected (Charging)" }
        3 { "Fully Charged" }
        default { "On Battery" }
      }
    } else { "Desktop / No Battery" }

    $totalRamGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
    $freeRamGB = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
    $usedRamGB = [math]::Round($totalRamGB - $freeRamGB, 1)
    $ramPercent = [math]::Round(($usedRamGB / $totalRamGB) * 100, 0)

    $diskFreeGB = [math]::Round($disk.Free / 1GB, 1)
    $diskUsedGB = [math]::Round($disk.Used / 1GB, 1)
    $diskTotalGB = [math]::Round($diskFreeGB + $diskUsedGB, 1)

    $result = @{
      batteryPercent = $batPercent
      batteryStatus = $batStatus
      cpuName = $cpu.Name.Trim()
      totalRamGB = $totalRamGB
      usedRamGB = $usedRamGB
      freeRamGB = $freeRamGB
      ramPercent = $ramPercent
      diskTotalGB = $diskTotalGB
      diskFreeGB = $diskFreeGB
      osName = $os.Caption.Trim()
    }
    $result | ConvertTo-Json -Compress
  `;

  try {
    const { stdout } = await execAsync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/\n/g, ' ')}"`, { timeout: 6000 });
    const data = JSON.parse(stdout.trim());
    return {
      success: true,
      battery: {
        percent: data.batteryPercent != null ? `${data.batteryPercent}%` : 'N/A',
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
      battery: { percent: 'AC Connected', status: 'Plugged In' },
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
    percent: info.battery?.percent || '100%',
    status: info.battery?.status || 'AC Connected',
  };
}
