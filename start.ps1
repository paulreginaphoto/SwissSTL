$ErrorActionPreference = "Stop"

function Info($msg) { Write-Host "[SwissSTL] $msg" -ForegroundColor Cyan }
function Warn($msg) { Write-Host "[SwissSTL] $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "[SwissSTL][ERROR] $msg" -ForegroundColor Red; Read-Host "Press Enter to exit"; exit 1 }

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"
$VenvDir = Join-Path $BackendDir "venv"
$PyInVenv = Join-Path $VenvDir "Scripts\python.exe"
$PipInVenv = Join-Path $VenvDir "Scripts\pip.exe"
$Marker = Join-Path $VenvDir ".deps_ok"

if (-not (Test-Path $BackendDir) -or -not (Test-Path $FrontendDir)) {
    Fail "backend/ or frontend/ folder not found. Run this from the SwissSTL root."
}

# --- Find Python ---
$PythonCmd = $null
foreach ($candidate in @("python", "python3", "py")) {
    try {
        $ver = & $candidate --version 2>&1
        if ($ver -match "Python 3") { $PythonCmd = $candidate; break }
    } catch {}
}

if (-not $PythonCmd) {
    Warn "Python 3 not found."
    $hasWinget = Get-Command winget -ErrorAction SilentlyContinue
    if ($hasWinget) {
        Info "Installing Python 3.12 via winget..."
        winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements
        Fail "Python installed. Please CLOSE this window and rerun start.ps1 so PATH refreshes."
    } else {
        Fail "Install Python 3.12+ from https://www.python.org (check 'Add to PATH')."
    }
}
Info "Found $((& $PythonCmd --version 2>&1))"

# --- Find npm ---
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Warn "Node.js/npm not found."
    $hasWinget = Get-Command winget -ErrorAction SilentlyContinue
    if ($hasWinget) {
        Info "Installing Node.js LTS via winget..."
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        Fail "Node.js installed. Please CLOSE this window and rerun start.ps1 so PATH refreshes."
    } else {
        Fail "Install Node.js 18+ from https://nodejs.org"
    }
}
Info "Found Node.js $((node --version 2>&1))"

# --- Create venv ---
if (-not (Test-Path $PyInVenv)) {
    Info "Creating backend virtual environment..."
    & $PythonCmd -m venv $VenvDir
    if (-not (Test-Path $PyInVenv)) { Fail "Failed to create venv at $VenvDir" }
}

# --- Install backend deps ---
$NeedBackend = $true
if (Test-Path $Marker) {
    $reqTime = (Get-Item (Join-Path $BackendDir "requirements.txt")).LastWriteTimeUtc
    $markTime = (Get-Item $Marker).LastWriteTimeUtc
    if ($markTime -ge $reqTime) { $NeedBackend = $false }
}

if ($NeedBackend) {
    Info "Installing backend dependencies..."
    & $PipInVenv install --upgrade pip
    & $PipInVenv install -r (Join-Path $BackendDir "requirements.txt")
    if ($LASTEXITCODE -ne 0) { Fail "Backend dependency install failed." }
    Set-Content -Path $Marker -Value "ok"
    Info "Backend dependencies installed."
} else {
    Info "Backend dependencies up to date."
}

# --- Install frontend deps ---
$NeedFrontend = -not (Test-Path (Join-Path $FrontendDir "node_modules"))
if ($NeedFrontend) {
    Info "Installing frontend dependencies..."
    Push-Location $FrontendDir
    try { npm install; if ($LASTEXITCODE -ne 0) { throw "npm install failed" } }
    catch { Pop-Location; Fail "Frontend dependency install failed." }
    Pop-Location
    Info "Frontend dependencies installed."
} else {
    Info "Frontend dependencies up to date."
}

# --- Launch ---
Info "Starting backend on http://localhost:8000 ..."
$backendProc = Start-Process -FilePath $PyInVenv `
    -ArgumentList "-m uvicorn app.main:app --host 0.0.0.0 --port 8000" `
    -WorkingDirectory $BackendDir -PassThru

Info "Starting frontend on http://localhost:5173 ..."
$frontendProc = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c cd /d `"$FrontendDir`" && npm run dev -- --host 0.0.0.0 --port 5173" `
    -PassThru

Start-Sleep -Seconds 4
Start-Process "http://localhost:5173"

Write-Host ""
Info "SwissSTL is running!"
Info "Frontend: http://localhost:5173"
Info "Backend:  http://localhost:8000"
Info "Press Enter in this window to stop both services."
Write-Host ""

Read-Host "Press Enter to stop"

if (-not $backendProc.HasExited) { Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue }
if (-not $frontendProc.HasExited) { Stop-Process -Id $frontendProc.Id -Force -ErrorAction SilentlyContinue }
Info "Stopped."
