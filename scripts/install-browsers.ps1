# Installs the Playwright full Chromium browser on Windows using Windows native
# TLS (curl.exe / PowerShell Schannel) instead of Node's OpenSSL downloader.
# Prefers Google's official Chrome for Testing CDN (storage.googleapis.com),
# skips unused ffmpeg/headless-shell packages, and falls back to installed
# Chrome or Microsoft Edge if downloads are blocked.

$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root

$pwCli = Join-Path $Root "node_modules\playwright\cli.js"
if (-not (Test-Path -LiteralPath $pwCli)) {
    throw "Playwright is not installed in node_modules."
}

$dryRun = & node $pwCli install --dry-run chromium 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Could not determine Playwright browser downloads:`n$($dryRun -join "`n")"
}

# Parse packages: @{ Location = "..."; Urls = List<string> }
$packages = @()
$byLoc = @{}
$current = $null

foreach ($line in $dryRun) {
    $text = [string]$line
    if ($text -match 'Install location:\s*(.+)$') {
        $loc = $Matches[1].Trim()
        if ($byLoc.ContainsKey($loc)) {
            $current = $byLoc[$loc]
        } else {
            $current = @{ Location = $loc; Urls = [System.Collections.Generic.List[string]]::new() }
            $byLoc[$loc] = $current
            $packages += $current
        }
    } elseif ($current -and $text -match 'Download (?:url|fallback \d+):\s*(\S+)$') {
        $u = $Matches[1].Trim()
        # Prefer Google's official Chrome for Testing storage mirror first, since
        # cdn.playwright.dev is frequently TLS-reset by some ISPs / HTTPS filters.
        if ($u -match '^https://cdn\.playwright\.dev/builds/cft/(.+)$') {
            $gUrl = "https://storage.googleapis.com/chrome-for-testing-public/$($Matches[1])"
            if (-not $current.Urls.Contains($gUrl)) {
                $current.Urls.Insert(0, $gUrl)
            }
        }
        if (-not $current.Urls.Contains($u)) {
            $current.Urls.Add($u)
        }
    }
}

# AnyStl uses `channel: "chromium"` (full Chromium) only — skip ffmpeg and headless-shell.
$fullChromium = @($packages | Where-Object { (Split-Path -Leaf $_.Location) -match '^chromium-\d+' })
if ($fullChromium.Count -gt 0) {
    $packages = $fullChromium
}

if ($packages.Count -eq 0) {
    throw "Could not parse Playwright Chromium install plan."
}

function Test-SystemBrowser {
    $paths = @(
        (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
        (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"),
        (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe")
    )
    foreach ($p in $paths) {
        if ($p -and (Test-Path -LiteralPath $p)) { return $p }
    }
    return $null
}

function Invoke-NativeDownload {
    param([string]$Url, [string]$OutFile)

    # 1. Windows built-in curl.exe (uses Schannel TLS, fast & reliable).
    $curlExe = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($curlExe) {
        $prevEap = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            & $curlExe.Source --ssl-no-revoke -fL --retry 1 --connect-timeout 15 -# -o $OutFile $Url
            $curlExit = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $prevEap
        }
        if ($curlExit -eq 0 -and (Test-Path -LiteralPath $OutFile) -and (Get-Item -LiteralPath $OutFile).Length -gt 0) {
            return $true
        }
        if (Test-Path -LiteralPath $OutFile) {
            Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue
        }
    }

    # 2. PowerShell .NET Schannel fallback.
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing -TimeoutSec 180
        if ((Test-Path -LiteralPath $OutFile) -and (Get-Item -LiteralPath $OutFile).Length -gt 0) {
            return $true
        }
    } catch {
        if (Test-Path -LiteralPath $OutFile) {
            Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue
        }
    }
    return $false
}

function Expand-ZipFast {
    param([string]$ZipPath, [string]$DestDir)
    $tarExe = Get-Command tar.exe -ErrorAction SilentlyContinue
    if ($tarExe) {
        $prevEap = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            & $tarExe.Source -xf $ZipPath -C $DestDir
            $tarExit = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $prevEap
        }
        if ($tarExit -eq 0) { return }
    }
    Expand-Archive -Path $ZipPath -DestinationPath $DestDir -Force
}

$tmpRoot = Join-Path ([IO.Path]::GetTempPath()) ("anystl-pw-" + [Guid]::NewGuid().ToString("N"))
$hadFailure = $false

try {
    New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null

    foreach ($pkg in $packages) {
        $loc = $pkg.Location
        if (Test-Path -LiteralPath (Join-Path $loc "INSTALLATION_COMPLETE")) {
            continue
        }

        $name = Split-Path -Leaf $loc
        Write-Host "-> Downloading $name..."
        $zipPath = Join-Path $tmpRoot "$name.zip"
        $ok = $false

        foreach ($url in $pkg.Urls) {
            Write-Host "   $url"
            if (Invoke-NativeDownload -Url $url -OutFile $zipPath) {
                $ok = $true
                break
            }
            Write-Host "   download failed, trying next mirror..."
        }

        if (-not $ok) {
            Write-Warning "Failed to download $name."
            $hadFailure = $true
            break
        }

        Write-Host "-> Extracting $name..."
        if (Test-Path -LiteralPath $loc) {
            Remove-Item -LiteralPath $loc -Recurse -Force
        }
        New-Item -ItemType Directory -Path $loc -Force | Out-Null
        try {
            Expand-ZipFast -ZipPath $zipPath -DestDir $loc
        } catch {
            Remove-Item -LiteralPath $loc -Recurse -Force -ErrorAction SilentlyContinue
            throw "Failed to extract ${name}: $_"
        }
        Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue

        New-Item -ItemType File -Path (Join-Path $loc "INSTALLATION_COMPLETE") -Force | Out-Null
        New-Item -ItemType File -Path (Join-Path $loc "DEPENDENCIES_VALIDATED") -Force | Out-Null
    }

    # Clear any stale lock left by an interrupted playwright install.
    $firstParent = Split-Path -Parent $packages[0].Location
    if ($firstParent) {
        $lockDir = Join-Path $firstParent "__dirlock"
        if (Test-Path -LiteralPath $lockDir) {
            Remove-Item -LiteralPath $lockDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
} finally {
    if (Test-Path -LiteralPath $tmpRoot) {
        Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if ($hadFailure) {
    $sysBrowser = Test-SystemBrowser
    if ($sysBrowser) {
        Write-Host "Could not download Playwright Chromium; AnyStl will use your installed browser ($sysBrowser)." -ForegroundColor Yellow
        exit 0
    }
    throw "Could not download Playwright Chromium and no local Chrome/Edge browser was found."
}
