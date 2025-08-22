#!/usr/bin/env bash
set -euo pipefail

# Stop all locally started ShipSense services

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
APP_DIR="$ROOT_DIR/web"
SERVER_DIR="$ROOT_DIR/server"
APP_NAME="devops-chat"

echo "[1/2] Stopping frontend (pm2: $APP_NAME)..."
if command -v pm2 >/dev/null 2>&1; then
  pm2 stop "$APP_NAME" >/dev/null 2>&1 || true
  pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
else
  echo "pm2 not found; skipping frontend stop."
fi

echo "[2/2] Stopping backend (uvicorn)..."
pkill -f "uvicorn main:app" >/dev/null 2>&1 || true

sleep 0.5

echo ""
echo "All services requested to stop."
echo "- Frontend (pm2): $APP_NAME"
echo "- Backend (uvicorn): main:app"
echo ""
echo "Tips:"
echo "  pm2 status            # inspect pm2 processes"
echo "  lsof -i :8080 || true # check if backend port is free"


