param (
    [string]$OutputPath = ""
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

try {
    $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bitmap = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)

    if ($OutputPath) {
        $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
        $graphics.Dispose()
        $bitmap.Dispose()
        Write-Output "SAVED:$OutputPath"
    } else {
        $ms = New-Object System.IO.MemoryStream
        $bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Jpeg)
        $bytes = $ms.ToArray()
        $base64 = [Convert]::ToBase64String($bytes)
        $graphics.Dispose()
        $bitmap.Dispose()
        $ms.Dispose()
        Write-Output "BASE64:$base64"
    }
} catch {
    Write-Error $_.Exception.Message
}
