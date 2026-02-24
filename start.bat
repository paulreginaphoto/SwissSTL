@echo off
setlocal enabledelayedexpansion
title SwissSTL Launcher
color 0B

echo.
echo  ============================================
echo   SwissSTL - One-Click Launcher (Windows)
echo  ============================================
echo.

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"
set "VENV=%BACKEND%\venv"

if not exist "%BACKEND%\requirements.txt" (
    echo [ERROR] backend\requirements.txt not found.
    echo         Run this script from the SwissSTL project root.
    pause
    exit /b 1
)

:: ----------------------------------------------------------------
:: 1. Find Python
:: ----------------------------------------------------------------
set "PY="
where python >nul 2>&1 && (
    python --version 2>&1 | findstr /i "Python 3" >nul && set "PY=python"
)
if not defined PY (
    where py >nul 2>&1 && set "PY=py -3"
)

if not defined PY (
    echo [SwissSTL] Python 3 not found in PATH.
    echo.
    where winget >nul 2>&1 || (
        echo [ERROR] winget not available.
        echo         Please install Python 3.12+ manually:
        echo         https://www.python.org/downloads/
        echo         Make sure to check "Add python.exe to PATH" during install.
        echo.
        pause
        exit /b 1
    )
    echo [SwissSTL] Installing Python via winget...
    winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements
    if !errorlevel! neq 0 (
        echo [ERROR] Python install failed. Install manually from https://www.python.org
        pause
        exit /b 1
    )
    echo.
    echo [SwissSTL] Python installed. You need to CLOSE and REOPEN this window
    echo           so the PATH is refreshed, then double-click start.bat again.
    echo.
    pause
    exit /b 0
)

for /f "tokens=*" %%v in ('%PY% --version 2^>^&1') do echo [SwissSTL] Found %%v

:: ----------------------------------------------------------------
:: 2. Find Node.js / npm
:: ----------------------------------------------------------------
where npm >nul 2>&1
if !errorlevel! neq 0 (
    echo [SwissSTL] Node.js/npm not found in PATH.
    echo.
    where winget >nul 2>&1 || (
        echo [ERROR] winget not available.
        echo         Please install Node.js 18+ manually:
        echo         https://nodejs.org/
        echo.
        pause
        exit /b 1
    )
    echo [SwissSTL] Installing Node.js LTS via winget...
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if !errorlevel! neq 0 (
        echo [ERROR] Node.js install failed. Install manually from https://nodejs.org
        pause
        exit /b 1
    )
    echo.
    echo [SwissSTL] Node.js installed. You need to CLOSE and REOPEN this window
    echo           so the PATH is refreshed, then double-click start.bat again.
    echo.
    pause
    exit /b 0
)

for /f "tokens=*" %%v in ('node --version 2^>^&1') do echo [SwissSTL] Found Node.js %%v

:: ----------------------------------------------------------------
:: 3. Create Python venv if missing
:: ----------------------------------------------------------------
if not exist "%VENV%\Scripts\python.exe" (
    echo [SwissSTL] Creating backend virtual environment...
    %PY% -m venv "%VENV%"
    if !errorlevel! neq 0 (
        echo [ERROR] Failed to create venv. Check your Python installation.
        pause
        exit /b 1
    )
)

:: ----------------------------------------------------------------
:: 4. Install backend dependencies if needed
:: ----------------------------------------------------------------
set "MARKER=%VENV%\.deps_ok"
set "NEED_INSTALL=1"

if exist "%MARKER%" (
    for %%A in ("%BACKEND%\requirements.txt") do set "REQ_TIME=%%~tA"
    for %%A in ("%MARKER%") do set "MARK_TIME=%%~tA"
    set "NEED_INSTALL=0"
    :: Simple heuristic: if requirements.txt was modified after marker, reinstall
    for %%A in ("%BACKEND%\requirements.txt") do (
        for %%B in ("%MARKER%") do (
            if "%%~tA" gtr "%%~tB" set "NEED_INSTALL=1"
        )
    )
)

if "!NEED_INSTALL!"=="1" (
    echo [SwissSTL] Installing backend dependencies...
    "%VENV%\Scripts\pip.exe" install --upgrade pip
    "%VENV%\Scripts\pip.exe" install -r "%BACKEND%\requirements.txt"
    if !errorlevel! neq 0 (
        echo [ERROR] Backend dependency install failed.
        pause
        exit /b 1
    )
    echo ok > "%MARKER%"
    echo [SwissSTL] Backend dependencies installed.
) else (
    echo [SwissSTL] Backend dependencies up to date.
)

:: ----------------------------------------------------------------
:: 5. Install frontend dependencies if needed
:: ----------------------------------------------------------------
if not exist "%FRONTEND%\node_modules\package.json" (
    if not exist "%FRONTEND%\node_modules" (
        set "NEED_NPM=1"
    ) else (
        set "NEED_NPM=0"
    )
) else (
    set "NEED_NPM=0"
)
if not exist "%FRONTEND%\node_modules" set "NEED_NPM=1"

if "!NEED_NPM!"=="1" (
    echo [SwissSTL] Installing frontend dependencies...
    pushd "%FRONTEND%"
    call npm install
    if !errorlevel! neq 0 (
        echo [ERROR] Frontend dependency install failed.
        popd
        pause
        exit /b 1
    )
    popd
    echo [SwissSTL] Frontend dependencies installed.
) else (
    echo [SwissSTL] Frontend dependencies up to date.
)

:: ----------------------------------------------------------------
:: 6. Launch backend and frontend
:: ----------------------------------------------------------------
echo.
echo [SwissSTL] Starting services...
echo.
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:5173
echo.
echo   Close the Backend/Frontend windows or press Ctrl+C here to stop.
echo.

start "SwissSTL Backend" cmd /k "cd /d "%BACKEND%" && "%VENV%\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
start "SwissSTL Frontend" cmd /k "cd /d "%FRONTEND%" && npm run dev -- --host 0.0.0.0 --port 5173"

:: Wait a bit then open browser
timeout /t 4 /nobreak >nul
start http://localhost:5173

echo [SwissSTL] Running. Close the backend/frontend windows to stop.
echo.
pause
