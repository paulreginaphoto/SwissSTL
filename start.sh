#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/venv"
MARKER="$VENV_DIR/.deps_ok"

BACKEND_PID=""
FRONTEND_PID=""

info()  { printf '\033[1;36m[SwissSTL]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[SwissSTL]\033[0m %s\n' "$*" >&2; }
fail()  { printf '\033[1;31m[SwissSTL][ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

cleanup() {
  info "Stopping services..."
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
  [[ -n "$BACKEND_PID" ]]  && kill "$BACKEND_PID"  2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

[[ -d "$BACKEND_DIR" ]] && [[ -d "$FRONTEND_DIR" ]] || fail "Run from SwissSTL root."

# --- Find Python 3 ---
PY=""
for cmd in python3 python; do
  if command -v "$cmd" >/dev/null 2>&1; then
    if "$cmd" --version 2>&1 | grep -q "Python 3"; then
      PY="$cmd"; break
    fi
  fi
done

if [[ -z "$PY" ]]; then
  warn "Python 3 not found."
  if [[ "$(uname)" == "Darwin" ]]; then
    if command -v brew >/dev/null 2>&1; then
      info "Installing Python via Homebrew..."
      brew install python@3.12
      PY="python3"
    else
      fail "Install Python 3: brew install python@3.12  (or https://www.python.org)"
    fi
  else
    if command -v apt-get >/dev/null 2>&1; then
      info "Installing Python via apt..."
      sudo apt-get update && sudo apt-get install -y python3 python3-venv python3-pip
      PY="python3"
    elif command -v dnf >/dev/null 2>&1; then
      info "Installing Python via dnf..."
      sudo dnf install -y python3 python3-pip
      PY="python3"
    else
      fail "Install Python 3.10+: https://www.python.org/downloads/"
    fi
  fi
fi
info "Found $($PY --version 2>&1)"

# --- Find npm ---
if ! command -v npm >/dev/null 2>&1; then
  warn "Node.js/npm not found."
  if [[ "$(uname)" == "Darwin" ]] && command -v brew >/dev/null 2>&1; then
    info "Installing Node.js via Homebrew..."
    brew install node
  elif command -v apt-get >/dev/null 2>&1; then
    info "Installing Node.js via apt..."
    sudo apt-get update && sudo apt-get install -y nodejs npm
  elif command -v dnf >/dev/null 2>&1; then
    info "Installing Node.js via dnf..."
    sudo dnf install -y nodejs npm
  else
    fail "Install Node.js 18+: https://nodejs.org"
  fi
fi
info "Found Node.js $(node --version 2>&1)"

# --- Create venv ---
if [[ ! -f "$VENV_DIR/bin/python" ]]; then
  info "Creating backend virtual environment..."
  "$PY" -m venv "$VENV_DIR"
fi

PYTHON_BIN="$VENV_DIR/bin/python"
PIP_BIN="$VENV_DIR/bin/pip"
[[ -x "$PYTHON_BIN" ]] || fail "Venv is broken. Delete $VENV_DIR and rerun."

# --- Install backend deps ---
if [[ ! -f "$MARKER" ]] || [[ "$BACKEND_DIR/requirements.txt" -nt "$MARKER" ]]; then
  info "Installing backend dependencies..."
  "$PIP_BIN" install --upgrade pip
  "$PIP_BIN" install -r "$BACKEND_DIR/requirements.txt"
  touch "$MARKER"
  info "Backend dependencies installed."
else
  info "Backend dependencies up to date."
fi

# --- Install frontend deps ---
if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  info "Installing frontend dependencies..."
  (cd "$FRONTEND_DIR" && npm install)
  info "Frontend dependencies installed."
else
  info "Frontend dependencies up to date."
fi

# --- Launch ---
info "Starting backend on http://localhost:8000 ..."
(cd "$BACKEND_DIR" && "$PYTHON_BIN" -m uvicorn app.main:app --host 0.0.0.0 --port 8000) &
BACKEND_PID=$!

info "Starting frontend on http://localhost:5173 ..."
(cd "$FRONTEND_DIR" && npm run dev -- --host 0.0.0.0 --port 5173) &
FRONTEND_PID=$!

sleep 3

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:5173" 2>/dev/null || true
elif command -v open >/dev/null 2>&1; then
  open "http://localhost:5173" 2>/dev/null || true
fi

echo ""
info "SwissSTL is running!"
info "Frontend: http://localhost:5173"
info "Backend:  http://localhost:8000"
info "Press Ctrl+C to stop."
echo ""

wait "$BACKEND_PID" "$FRONTEND_PID"
