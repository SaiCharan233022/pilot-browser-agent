param()

$ErrorActionPreference = 'SilentlyContinue'

# 1. Query Battery
$bat = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
$wmiBat = Get-CimInstance -Namespace root\wmi -ClassName BatteryStatus -ErrorAction SilentlyContinue | Select-Object -First 1

$percent = $null
$status = "No Battery / AC Powered"

if ($bat -and $bat.EstimatedChargeRemaining -ne $null) {
    $percent = [int]$bat.EstimatedChargeRemaining
    
    $isPlugged = $false
    if ($wmiBat -and $wmiBat.PowerOnline -ne $null) {
        $isPlugged = [bool]$wmiBat.PowerOnline
    } else {
        $isPlugged = ($bat.BatteryStatus -eq 2 -or $bat.BatteryStatus -eq 3 -or $bat.BatteryStatus -eq 6 -or $bat.BatteryStatus -eq 7)
    }

    if ($isPlugged) {
        if ($percent -ge 99) {
            $status = "Plugged In (Fully Charged)"
        } elseif ($wmiBat -and $wmiBat.Charging) {
            $status = "Plugged In (Charging)"
        } else {
            $status = "Plugged In (AC Connected)"
        }
    } else {
        $status = "On Battery (Discharging)"
    }
}

# 2. Query OS & RAM
$os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue | Select-Object -First 1
$cpu = Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
$disk = Get-PSDrive C -ErrorAction SilentlyContinue

$totalRamGB = if ($os) { [math]::Round($os.TotalVisibleMemorySize / 1MB, 1) } else { 16.0 }
$freeRamGB = if ($os) { [math]::Round($os.FreePhysicalMemory / 1MB, 1) } else { 8.0 }
$usedRamGB = [math]::Round($totalRamGB - $freeRamGB, 1)
$ramPercent = if ($totalRamGB -gt 0) { [math]::Round(($usedRamGB / $totalRamGB) * 100, 0) } else { 50 }

$diskFreeGB = if ($disk) { [math]::Round($disk.Free / 1GB, 1) } else { 0 }
$diskUsedGB = if ($disk) { [math]::Round($disk.Used / 1GB, 1) } else { 0 }
$diskTotalGB = [math]::Round($diskFreeGB + $diskUsedGB, 1)

$cpuName = if ($cpu) { $cpu.Name.Trim() } else { "Processor" }
$osName = if ($os) { $os.Caption.Trim() } else { "Windows" }

$result = [ordered]@{
    batteryPercent = if ($percent -ne $null) { "$percent%" } else { "N/A" }
    batteryStatus  = $status
    cpuName        = $cpuName
    totalRamGB     = $totalRamGB
    usedRamGB      = $usedRamGB
    freeRamGB      = $freeRamGB
    ramPercent     = $ramPercent
    diskTotalGB    = $diskTotalGB
    diskFreeGB     = $diskFreeGB
    osName         = $osName
}

$result | ConvertTo-Json -Compress
