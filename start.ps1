Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Info($msg) { Write-Host "[SwissSTL] $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "[SwissSTL][ERROR] $msg" -ForegroundColor Red; exit 1 }

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"
$VenvDir = Join-Path $BackendDir "venv"
$PyInVenv = Join-Path $VenvDir "Scripts\python.exe"
$PipInVenv = Join-Path $VenvDir "Scripts\pip.exe"
$Marker = Join-Path $VenvDir ".backend_deps_installed"

if (-not (Test-Path $BackendDir) -or -not (Test-Path $FrontendDir)) {
  Fail "Run start.ps1 from the SwissSTL project root."
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) { Fail "Python is required and must be available in PATH." }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail "Node.js/npm is required and must be available in PATH." }

if (-not (Test-Path $VenvDir)) {
  Info "Creating backend virtual environment..."
  python -m venv $VenvDir
}

if (-not (Test-Path $PyInVenv)) {
  Fail "Virtual environment is invalid at $VenvDir. Delete it and rerun start.ps1."
}

$NeedBackendInstall = $true
if (Test-Path $Marker) {
  $req = Get-Item (Join-Path $BackendDir "requirements.txt")
  $mark = Get-Item $Marker
  $NeedBackendInstall = $req.LastWriteTimeUtc -gt $mark.LastWriteTimeUtc
}

if ($NeedBackendInstall) {
  Info "Installing backend dependencies..."
  & $PipInVenv install --upgrade pip
  & $PipInVenv install -r (Join-Path $BackendDir "requirements.txt")
  Set-Content -Path $Marker -Value ((Get-Date).ToString("o"))
} else {
  Info "Backend dependencies already installed."
}

$NeedFrontendInstall = -not (Test-Path (Join-Path $FrontendDir "node_modules"))
if (-not $NeedFrontendInstall) {
  $lock = Get-Item (Join-Path $FrontendDir "package-lock.json")
  $mods = Get-Item (Join-Path $FrontendDir "node_modules")
  $NeedFrontendInstall = $lock.LastWriteTimeUtc -gt $mods.LastWriteTimeUtc
}

if ($NeedFrontendInstall) {
  Info "Installing frontend dependencies..."
  Push-Location $FrontendDir
  try { npm install } finally { Pop-Location }
} else {
  Info "Frontend dependencies already installed."
}

Info "Starting backend on http://localhost:8000 ..."
$backendProc = Start-Process -FilePath $PyInVenv -ArgumentList "-m uvicorn app.main:app --host 0.0.0.0 --port 8000" -WorkingDirectory $BackendDir -PassThru

Info "Starting frontend on http://localhost:5173 ..."
$frontendProc = Start-Process -FilePath "npm" -ArgumentList "run dev -- --host 0.0.0.0 --port 5173" -WorkingDirectory $FrontendDir -PassThru

Info "SwissSTL launched."
Info "Frontend: http://localhost:5173"
Info "Backend:  http://localhost:8000"
Info "Press Ctrl+C to stop both."

try {
  while (-not $backendProc.HasExited -and -not $frontendProc.HasExited) {
    Start-Sleep -Seconds 1
    $backendProc.Refresh()
    $frontendProc.Refresh()
  }
} finally {
  if (-not $backendProc.HasExited) { Stop-Process -Id $backendProc.Id -Force }
  if (-not $frontendProc.HasExited) { Stop-Process -Id $frontendProc.Id -Force }
}
