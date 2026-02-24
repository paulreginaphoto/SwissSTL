#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/venv"

BACKEND_PID=""
FRONTEND_PID=""

info() { echo "[SwissSTL] $*"; }
warn() { echo "[SwissSTL][WARN] $*" >&2; }
fail() { echo "[SwissSTL][ERROR] $*" >&2; exit 1; }

cleanup() {
  info "Stopping services..."
  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
}

trap cleanup INT TERM EXIT

command -v python3 >/dev/null 2>&1 || fail "python3 is required."
command -v npm >/dev/null 2>&1 || fail "npm is required."

if [[ ! -d "$BACKEND_DIR" ]] || [[ ! -d "$FRONTEND_DIR" ]]; then
  fail "Run this script from the SwissSTL project root."
fi

if [[ ! -d "$VENV_DIR" ]]; then
  info "Creating backend virtual environment..."
  python3 -m venv "$VENV_DIR"
fi

PYTHON_BIN="$VENV_DIR/bin/python"
PIP_BIN="$VENV_DIR/bin/pip"

if [[ ! -x "$PYTHON_BIN" ]]; then
  fail "Backend virtualenv is invalid at $VENV_DIR. Delete it and rerun."
fi

if [[ ! -f "$VENV_DIR/.backend_deps_installed" ]] || [[ "$BACKEND_DIR/requirements.txt" -nt "$VENV_DIR/.backend_deps_installed" ]]; then
  info "Installing backend dependencies..."
  "$PIP_BIN" install --upgrade pip
  "$PIP_BIN" install -r "$BACKEND_DIR/requirements.txt"
  touch "$VENV_DIR/.backend_deps_installed"
else
  info "Backend dependencies already installed."
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]] || [[ "$FRONTEND_DIR/package-lock.json" -nt "$FRONTEND_DIR/node_modules" ]]; then
  info "Installing frontend dependencies..."
  (cd "$FRONTEND_DIR" && npm install)
else
  info "Frontend dependencies already installed."
fi

info "Starting backend on http://localhost:8000 ..."
(
  cd "$BACKEND_DIR"
  "$PYTHON_BIN" -m uvicorn app.main:app --host 0.0.0.0 --port 8000
) &
BACKEND_PID=$!

info "Starting frontend on http://localhost:5173 ..."
(
  cd "$FRONTEND_DIR"
  npm run dev -- --host 0.0.0.0 --port 5173
) &
FRONTEND_PID=$!

info "SwissSTL is starting."
info "Frontend: http://localhost:5173"
info "Backend:  http://localhost:8000"
info "Press Ctrl+C to stop both services."

wait "$BACKEND_PID" "$FRONTEND_PID"
