# ─────────────────────────────────────────────────────────────
# build.ps1 - Build TutorMate into a Windows installer (.exe)
#             Bundles Ollama installer so end-users get it
#             automatically when they install TutorMate.
#
# Usage:
#   .\build.ps1
#
# Output: dist\TutorMate-Setup-x64.exe
# ─────────────────────────────────────────────────────────────
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

function Step($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Info($msg) { Write-Host "    $msg" }
function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

# ── 1. Preflight ─────────────────────────────────────────────
Step "Checking prerequisites..."
if (-not (Get-Command node  -ErrorAction SilentlyContinue)) { Fail "Node.js not found. Install from https://nodejs.org" }
if (-not (Get-Command npm   -ErrorAction SilentlyContinue)) { Fail "npm not found." }
Info "Node.js $(node -v)   npm $(npm -v)"

# ── 2. npm install ───────────────────────────────────────────
Step "Installing project dependencies..."
& npm install --prefer-offline --loglevel=error
if ($LASTEXITCODE -ne 0) { Fail "npm install failed" }

# ── 3. Install electron-builder locally if needed ────────────
$ebBin = Join-Path $ScriptDir "node_modules\.bin\electron-builder.cmd"
if (-not (Test-Path $ebBin)) {
    Step "Installing electron-builder..."
    & npm install --save-dev electron-builder --loglevel=error
    if ($LASTEXITCODE -ne 0) { Fail "electron-builder install failed" }
} else {
    Info "electron-builder found in node_modules"
}

# ── 4. Generate icons if missing ─────────────────────────────
$icoPath = Join-Path $ScriptDir "build\icon.ico"
if (-not (Test-Path $icoPath)) {
    Step "Generating placeholder icons (build/icon.png + build/icon.ico)..."
    & node build-icon.js
    if ($LASTEXITCODE -ne 0) { Fail "Icon generation failed" }
} else {
    Info "build\icon.ico found"
}

# ── 5. Patch package.json ─────────────────────────────────────
Step "Checking package.json..."
& node build-pkg.js
if ($LASTEXITCODE -ne 0) { Fail "package.json patch failed" }

# ── 6. Download Ollama installer ──────────────────────────────
$ollamaPath = Join-Path $ScriptDir "build\OllamaSetup.exe"
if (-not (Test-Path $ollamaPath)) {
    Step "Downloading Ollama installer..."
    $ollamaUrl = "https://ollama.com/download/OllamaSetup.exe"
    Info "From: $ollamaUrl"
    Info "To:   build\OllamaSetup.exe"
    try {
        $ProgressPreference = "SilentlyContinue"   # dramatically speeds up Invoke-WebRequest
        Invoke-WebRequest -Uri $ollamaUrl -OutFile $ollamaPath -UseBasicParsing
        $sizeMB = [math]::Round((Get-Item $ollamaPath).Length / 1MB, 1)
        Info "Downloaded ($sizeMB MB)"
    } catch {
        Write-Host "WARNING: Could not download Ollama: $_" -ForegroundColor Yellow
        Write-Host "         The installer will be built without Ollama bundled." -ForegroundColor Yellow
        # Remove the extraFiles entry from config so the build doesn't fail
        $cfg = Get-Content electron-builder.json | ConvertFrom-Json
        $cfg.win.PSObject.Properties.Remove('extraFiles')
        $cfg.nsis.PSObject.Properties.Remove('include')
        $cfg | ConvertTo-Json -Depth 10 | Out-File electron-builder.json -Encoding utf8
    }
} else {
    $sizeMB = [math]::Round((Get-Item $ollamaPath).Length / 1MB, 1)
    Info "build\OllamaSetup.exe already present ($sizeMB MB)"
}

# ── 7. Build ──────────────────────────────────────────────────
Step "Building Windows installer..."
Info "Output -> .\dist\"
Info "(First run downloads Electron binaries ~80MB - may take a few minutes)"

# Use local binary directly - avoids npx startup overhead / hanging
$env:ELECTRON_BUILDER_CACHE = "$env:LOCALAPPDATA\electron-builder\Cache"

& $ebBin --win --config electron-builder.json --publish never
if ($LASTEXITCODE -ne 0) { Fail "electron-builder failed (exit $LASTEXITCODE)" }

# ── 8. Report output ─────────────────────────────────────────
Write-Host ""
Write-Host "==> Build complete!" -ForegroundColor Green
Write-Host ""

if (Test-Path "dist") {
    Get-ChildItem dist -File | Where-Object { $_.Extension -in ".exe",".msi",".zip" } |
        Format-Table @{L="File";E={$_.Name}}, @{L="Size";E={"$([math]::Round($_.Length/1MB,1)) MB"}} -AutoSize
}
