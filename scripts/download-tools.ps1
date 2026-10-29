param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = "SilentlyContinue"

$projectRoot = Split-Path -Parent $PSScriptRoot
$binDir = Join-Path $projectRoot "src-tauri\resources\bin"
$tempDir = Join-Path ([IO.Path]::GetTempPath()) ("video-downloader-tools-" + [Guid]::NewGuid().ToString("N"))

New-Item -ItemType Directory -Path $binDir -Force | Out-Null
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

function Get-RemoteFile {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    Write-Host "Descargando $Url" -ForegroundColor Cyan
    Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing
}

function Save-Executable {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $target = Join-Path $binDir $Name
    if ((Test-Path -LiteralPath $target) -and -not $Force) {
        Write-Host "Ya existe $Name (usa -Force para reemplazarlo)." -ForegroundColor DarkGray
        return
    }

    Copy-Item -LiteralPath $Source -Destination $target -Force
    Write-Host "Instalado $Name" -ForegroundColor Green
}

try {
    $ytDlpTarget = Join-Path $binDir "yt-dlp.exe"
    if ($Force -or -not (Test-Path -LiteralPath $ytDlpTarget)) {
        $ytDlpTemp = Join-Path $tempDir "yt-dlp.exe"
        Get-RemoteFile -Url "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" -Destination $ytDlpTemp
        Save-Executable -Source $ytDlpTemp -Name "yt-dlp.exe"
    }
    else {
        Write-Host "Ya existe yt-dlp.exe (usa -Force para reemplazarlo)." -ForegroundColor DarkGray
    }

    $ffmpegTarget = Join-Path $binDir "ffmpeg.exe"
    $ffprobeTarget = Join-Path $binDir "ffprobe.exe"
    if ($Force -or -not (Test-Path -LiteralPath $ffmpegTarget) -or -not (Test-Path -LiteralPath $ffprobeTarget)) {
        $archive = Join-Path $tempDir "ffmpeg.zip"
        $extractDir = Join-Path $tempDir "ffmpeg"
        Get-RemoteFile -Url "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" -Destination $archive
        Write-Host "Extrayendo FFmpeg..." -ForegroundColor Cyan
        Expand-Archive -LiteralPath $archive -DestinationPath $extractDir -Force

        $ffmpeg = Get-ChildItem -LiteralPath $extractDir -Recurse -Filter "ffmpeg.exe" |
            Select-Object -First 1
        $ffprobe = Get-ChildItem -LiteralPath $extractDir -Recurse -Filter "ffprobe.exe" |
            Select-Object -First 1

        if (-not $ffmpeg -or -not $ffprobe) {
            throw "No se encontraron ffmpeg.exe ni ffprobe.exe dentro del archivo descargado."
        }

        Save-Executable -Source $ffmpeg.FullName -Name "ffmpeg.exe"
        Save-Executable -Source $ffprobe.FullName -Name "ffprobe.exe"
    }
    else {
        Write-Host "Ya existen ffmpeg.exe y ffprobe.exe (usa -Force para reemplazarlos)." -ForegroundColor DarkGray
    }

    Write-Host ""
    Write-Host "Herramientas disponibles en:" -ForegroundColor Cyan
    Write-Host $binDir
}
finally {
    if (Test-Path -LiteralPath $tempDir) {
        Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
