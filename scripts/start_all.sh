#!/usr/bin/env bash
set -euo pipefail

# One-shot starter for ShipSense: backend (FastAPI) + frontend (Next.js via pm2)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
APP_DIR="$ROOT_DIR/web"
SERVER_DIR="$ROOT_DIR/server"
APP_NAME="devops-chat"
FRONTEND_URL="http://localhost:3000/chat"
BACKEND_URL="http://127.0.0.1:8080"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

echo "[1/6] Checking prerequisites..."
require_cmd python3
require_cmd npm

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 not found. Attempting to install globally (npm i -g pm2)..."
  if ! npm install -g pm2 >/dev/null 2>&1; then
    echo "Failed to install pm2 automatically. Please run: npm install -g pm2" >&2
    exit 1
  fi
fi

if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "GEMINI_API_KEY is not set in the environment. Export it and re-run." >&2
  echo "Example: export GEMINI_API_KEY=YOUR_KEY" >&2
  exit 1
fi

echo "[2/6] Ensuring Python virtualenv..."
if [ ! -d "$ROOT_DIR/.venv" ]; then
  python3 -m venv "$ROOT_DIR/.venv"
fi
# shellcheck disable=SC1091
source "$ROOT_DIR/.venv/bin/activate"

echo "[3/6] Installing backend dependencies..."
pip -q install -r "$ROOT_DIR/requirements.txt"

echo "[4/6] Starting backend (FastAPI @ $BACKEND_URL)..."
mkdir -p "$SERVER_DIR"
(cd "$SERVER_DIR" && nohup python -m uvicorn main:app --host 127.0.0.1 --port 8080 > server.log 2>&1 &)

echo "[5/6] Building and starting frontend (Next.js via pm2)..."
(cd "$APP_DIR" && npm install >/dev/null 2>&1)
(cd "$APP_DIR" && npm run build >/dev/null 2>&1)
pm2 start "npm run start" --name "$APP_NAME" --cwd "$APP_DIR" >/dev/null 2>&1 || pm2 restart "$APP_NAME" >/dev/null 2>&1

echo "[6/6] Health checks..."
# Wait for backend to be ready (max ~10s)
for i in {1..20}; do
  if curl -sf "$BACKEND_URL/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

echo ""
echo "ShipSense is starting up."
echo "- Backend:  $BACKEND_URL"
echo "- Frontend: $FRONTEND_URL"
echo ""
echo "Tip: pm2 status  # to see process status"
echo "     pm2 logs $APP_NAME  # to tail frontend logs"


