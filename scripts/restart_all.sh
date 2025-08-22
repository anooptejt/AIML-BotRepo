#!/usr/bin/env bash
set -euo pipefail

# Restart all ShipSense services (frontend via pm2, backend via uvicorn)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"

echo "[1/2] Stopping services..."
if [ -x "$ROOT_DIR/scripts/stop_all.sh" ]; then
  bash "$ROOT_DIR/scripts/stop_all.sh"
else
  echo "stop_all.sh not found; using Makefile targets" >&2
  (cd "$ROOT_DIR" && make stop-backend stop || true)
fi

echo "[2/2] Starting services..."
bash "$ROOT_DIR/scripts/start_all.sh"

echo ""
echo "Restart complete."
echo "Frontend: http://localhost:3000/chat"
echo "Backend:  http://127.0.0.1:8080/"


