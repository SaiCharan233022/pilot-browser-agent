Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$screen = [System.Windows.Forms.Screen]::PrimaryScreen
Write-Output "PrimaryScreen bounds: $($screen.Bounds.Width)x$($screen.Bounds.Height)"

$bmp = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bmp)

try {
    $graphics.CopyFromScreen($screen.Bounds.X, $screen.Bounds.Y, 0, 0, $screen.Bounds.Size, [System.Drawing.CopyPixelOperation]::SourceCopy)
    $outPath = Join-Path $PSScriptRoot "screen_test.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output "Saved screenshot to: $outPath (Size: $((Get-Item $outPath).Length) bytes)"
} catch {
    Write-Output "Error in CopyFromScreen: $_"
} finally {
    $graphics.Dispose()
    $bmp.Dispose()
}
