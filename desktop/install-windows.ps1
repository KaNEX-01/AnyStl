# Installs AnyStl dependencies on Windows (Node.js LTS, npm packages,
# Playwright Chromium, production build) and creates a Start Menu shortcut
# (plus an optional Desktop shortcut with -DesktopShortcut).

param(
    [switch]$SkipBrowser,
    [switch]$SkipBuild,
    [switch]$BuildDesktop,
    [switch]$DesktopShortcut
)

$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root

Write-Host "=== AnyStl Windows Setup ===" -ForegroundColor Cyan
Write-Host "Project folder: $Root"

# 1. Ensure Node.js 20+ (downloads portable LTS into %LOCALAPPDATA%\AnyStl\node if missing).
$ensureNode = Join-Path $Root "scripts\ensure-node.ps1"
$nodeBin = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ensureNode | Select-Object -Last 1).Trim()
if (-not $nodeBin -or -not (Test-Path -LiteralPath (Join-Path $nodeBin "node.exe"))) {
    throw "Failed to locate or install Node.js 20+."
}
$env:Path = "$nodeBin;$env:Path"
$nodeVer = & node -v
Write-Host "Using Node.js $nodeVer ($nodeBin)" -ForegroundColor Green

# 2. Install npm dependencies.
Write-Host "`n-> Installing npm dependencies..."
& npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed." }

# 3. Install Playwright Chromium (unless skipped or API-only mode is set).
if (-not $SkipBrowser -and $env:ANYSTL_NO_BROWSER -ne "1") {
    Write-Host "`n-> Ensuring Playwright Chromium is installed..."
    & (Join-Path $Root "node_modules\.bin\playwright.cmd") install chromium
    if ($LASTEXITCODE -ne 0) { throw "Playwright Chromium install failed." }
}

# 4. Build Next.js production bundle.
if (-not $SkipBuild) {
    Write-Host "`n-> Building AnyStl for production..."
    $env:NEXT_TELEMETRY_DISABLED = "1"
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed." }
}

# 5. Optionally compile the Tauri desktop launcher if requested or Cargo is available.
$exeCandidates = @(
    (Join-Path $Root "anystl.exe"),
    (Join-Path $Root "desktop\target\release\anystl.exe")
)
$launcherExe = $exeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if ($BuildDesktop -or (-not $launcherExe -and (Get-Command cargo.exe -ErrorAction SilentlyContinue))) {
    Write-Host "`n-> Building native Windows launcher (anystl.exe)..."
    & cargo build --manifest-path (Join-Path $Root "desktop\Cargo.toml") --release
    if ($LASTEXITCODE -ne 0) { throw "cargo build failed." }
    Copy-Item -LiteralPath (Join-Path $Root "desktop\target\release\anystl.exe") -Destination (Join-Path $Root "anystl.exe") -Force
    $launcherExe = Join-Path $Root "anystl.exe"
}

# 6. Create Start Menu shortcut (pointing to anystl.exe if present, otherwise start.cmd).
$target = if ($launcherExe) { $launcherExe } else { Join-Path $Root "start.cmd" }
$icon = Join-Path $Root "desktop\icons\icon.ico"
$startMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$shell = New-Object -ComObject WScript.Shell

function New-AnyStlShortcut {
    param([string]$ShortcutPath)
    $sc = $shell.CreateShortcut($ShortcutPath)
    $sc.TargetPath = $target
    $sc.WorkingDirectory = $Root
    $sc.Description = "AnyStl - 3D model meta-search across 22+ libraries"
    if (Test-Path -LiteralPath $icon) {
        $sc.IconLocation = "$icon,0"
    }
    $sc.Save()
}

New-Item -ItemType Directory -Path $startMenuDir -Force | Out-Null
$startMenuShortcut = Join-Path $startMenuDir "AnyStl.lnk"
New-AnyStlShortcut $startMenuShortcut

if ($DesktopShortcut) {
    $desktopDir = [Environment]::GetFolderPath("Desktop")
    $desktopLink = Join-Path $desktopDir "AnyStl.lnk"
    New-AnyStlShortcut $desktopLink
    Write-Host "Desktop shortcut:    $desktopLink"
}

Write-Host "`nSetup complete!" -ForegroundColor Green
Write-Host "  Target:              $target"
Write-Host "  Start Menu shortcut: $startMenuShortcut"
if (-not $launcherExe) {
    Write-Host "  Tip: Place anystl.exe in $Root and re-run this script to use the dedicated desktop window." -ForegroundColor Yellow
}
