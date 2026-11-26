# Ensures Node.js 20+ is available on Windows without requiring admin rights.
# Checks PATH, common install paths, and %LOCALAPPDATA%\AnyStl\node, downloading
# the official portable Node.js LTS archive if needed. Prints the bin directory
# to prepend to PATH on stdout.

$ErrorActionPreference = "Stop"

function Test-NodeVersion {
    param([string]$NodeExe)
    if (-not $NodeExe -or -not (Test-Path -LiteralPath $NodeExe)) { return $false }
    try {
        $ver = (& $NodeExe -p "parseInt(process.versions.node.split('.')[0], 10)" 2>$null)
        return ([int]$ver -ge 20)
    } catch {
        return $false
    }
}

$cmd = Get-Command node.exe -ErrorAction SilentlyContinue
if ($cmd -and (Test-NodeVersion $cmd.Source)) {
    Split-Path -Parent $cmd.Source
    exit 0
}

$localAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE "AppData\Local" }
$managedDir = Join-Path $localAppData "AnyStl\node"
$candidates = @(
    (Join-Path $managedDir "node.exe"),
    (Join-Path $env:ProgramFiles "nodejs\node.exe"),
    (Join-Path $localAppData "Programs\nodejs\node.exe")
)

foreach ($candidate in $candidates) {
    if (Test-NodeVersion $candidate) {
        Split-Path -Parent $candidate
        exit 0
    }
}

$arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
[Console]::Error.WriteLine("Node.js 20+ not found. Downloading official Node.js LTS ($arch)...")

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -TimeoutSec 30
$lts = $index | Where-Object {
    $_.lts -and ([int]($_.version.TrimStart("v").Split(".")[0]) -ge 20) -and ($_.files -contains "win-$arch-zip")
} | Select-Object -First 1

if (-not $lts) {
    throw "Could not find a compatible Node.js LTS release for win-$arch."
}

$version = $lts.version
$archiveName = "node-$version-win-$arch"
$downloadUrl = "https://nodejs.org/dist/$version/$archiveName.zip"

$tmpRoot = Join-Path ([IO.Path]::GetTempPath()) ("anystl-node-" + [Guid]::NewGuid().ToString("N"))
$zipPath = Join-Path $tmpRoot "$archiveName.zip"
$extractDir = Join-Path $tmpRoot "extract"

try {
    New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
    [Console]::Error.WriteLine("Downloading $downloadUrl...")
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing -TimeoutSec 180
    [Console]::Error.WriteLine("Extracting Node.js $version...")
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

    $extracted = Join-Path $extractDir $archiveName
    if (-not (Test-Path -LiteralPath (Join-Path $extracted "node.exe"))) {
        throw "Downloaded Node.js archive is missing node.exe."
    }

    if (Test-Path -LiteralPath $managedDir) {
        Remove-Item -LiteralPath $managedDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $managedDir) -Force | Out-Null
    Move-Item -LiteralPath $extracted -Destination $managedDir -Force
} finally {
    if (Test-Path -LiteralPath $tmpRoot) {
        Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

[Console]::Error.WriteLine("Installed Node.js $version to $managedDir")
$managedDir
