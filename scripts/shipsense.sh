#!/usr/bin/env bash
set -euo pipefail

# ShipSense helper CLI: wraps Makefile targets with a friendly interface

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

ensure_pm2() {
  if ! command -v pm2 >/dev/null 2>&1; then
    echo "pm2 not found. Install with: npm install -g pm2" >&2
    exit 1
  fi
}

ensure_venv() {
  if [ ! -d "$ROOT_DIR/.venv" ]; then
    require_cmd python3
    echo "Creating virtualenv at $ROOT_DIR/.venv"
    python3 -m venv "$ROOT_DIR/.venv"
  fi
}

activate_venv() {
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.venv/bin/activate"
}

require_env() {
  local var="$1"
  if [ -z "${!var:-}" ]; then
    echo "$var is not set in the environment" >&2
    exit 1
  fi
}

help() {
  cat <<EOF
ShipSense DevOps Assistant - Commands

Frontend:
  build                Build the Next.js application
  dev                  Start Next.js dev server (prints URL)
  start                Start app with pm2 (prints URL)
  stop                 Stop pm2 process
  restart              Restart pm2 process
  status               Show pm2 status
  logs                 Tail pm2 logs for $APP_NAME

Backend:
  start-backend        Start FastAPI (requires GEMINI_API_KEY)
  stop-backend         Stop FastAPI
  restart-backend      Restart FastAPI
  backend-status       Health check of FastAPI

Testing:
  test-ansible         Test /ansible-generate endpoint
  test-terraform       Test /terraform-generate endpoint
  test-all             Run both tests

System:
  install-deps         Install Python deps in .venv
  restart-all          Restart backend then frontend
  system-status        Backend status + pm2 status
  url                  Print frontend URL

Usage:
  bash scripts/shipsense.sh <command>
EOF
}

cmd_build() { (cd "$APP_DIR" && npm run build); }

cmd_dev() {
  echo "Open: $FRONTEND_URL"
  (cd "$APP_DIR" && npm run dev)
}

cmd_start() {
  ensure_pm2
  (cd "$APP_DIR" && pm2 start "npm run start" --name "$APP_NAME" --cwd "$APP_DIR")
  echo "Frontend running: $FRONTEND_URL"
}

cmd_stop() { ensure_pm2; pm2 stop "$APP_NAME" || true && pm2 delete "$APP_NAME" || true; }
cmd_restart() { ensure_pm2; pm2 restart "$APP_NAME"; }
cmd_status() { ensure_pm2; pm2 status; }
cmd_logs() { ensure_pm2; pm2 logs "$APP_NAME"; }

cmd_start_backend() {
  require_env GEMINI_API_KEY
  ensure_venv; activate_venv
  mkdir -p "$SERVER_DIR"
  (cd "$SERVER_DIR" && nohup python -m uvicorn main:app --host 127.0.0.1 --port 8080 > server.log 2>&1 &)
  echo "Backend running: $BACKEND_URL"
}

cmd_stop_backend() { pkill -f "uvicorn main:app" >/dev/null 2>&1 || true; }
cmd_restart_backend() { cmd_stop_backend; cmd_start_backend; }
cmd_backend_status() { curl -s "$BACKEND_URL/" || echo "Backend not running"; }

fmt_or_cat() {
  if command -v jq >/dev/null 2>&1; then jq '.output' | head -20; else cat; fi
}

cmd_test_ansible() {
  echo "Testing Ansible generation endpoint..."
  resp=$(curl -s -X POST "$BACKEND_URL/ansible-generate" \
    -H "Content-Type: application/json" \
    -d '{"prompt": "Create an Ansible playbook for installing nginx on web servers"}') || true
  if command -v jq >/dev/null 2>&1; then
    echo "$resp" | jq -r '.output // .error // .yaml_validation // .hcl_validation // .status // "(no output)"' | head -40
  else
    echo "$resp"
  fi
}

cmd_test_terraform() {
  echo "Testing Terraform generation endpoint..."
  resp=$(curl -s -X POST "$BACKEND_URL/terraform-generate" \
    -H "Content-Type: application/json" \
    -d '{"prompt": "Create a Terraform configuration for an AWS EC2 instance with VPC"}') || true
  if command -v jq >/dev/null 2>&1; then
    echo "$resp" | jq -r '.output // .error // .yaml_validation // .hcl_validation // .status // "(no output)"' | head -40
  else
    echo "$resp"
  fi
}

cmd_test_all() { cmd_test_ansible; echo ""; cmd_test_terraform; }

cmd_install_deps() {
  ensure_venv; activate_venv
  (cd "$SERVER_DIR" && pip install -r "$ROOT_DIR/requirements.txt")
}

cmd_restart_all() {
  cmd_stop || true
  cmd_stop_backend || true
  cmd_start_backend
  sleep 2
  cmd_start
}

cmd_system_status() { cmd_backend_status; echo "---"; cmd_status || true; }
cmd_url() { echo "$FRONTEND_URL"; }

main() {
  local cmd="${1:-help}"
  case "$cmd" in
    help|-h|--help) help ;;
    build) cmd_build ;;
    dev) cmd_dev ;;
    start) cmd_start ;;
    stop) cmd_stop ;;
    restart) cmd_restart ;;
    status) cmd_status ;;
    logs) cmd_logs ;;
    start-backend) cmd_start_backend ;;
    stop-backend) cmd_stop_backend ;;
    restart-backend) cmd_restart_backend ;;
    backend-status) cmd_backend_status ;;
    test-ansible) cmd_test_ansible ;;
    test-terraform) cmd_test_terraform ;;
    test-all) cmd_test_all ;;
    install-deps) cmd_install_deps ;;
    restart-all) cmd_restart_all ;;
    system-status) cmd_system_status ;;
    url) cmd_url ;;
    *) echo "Unknown command: $cmd" >&2; echo; help; exit 1 ;;
  esac
}

main "$@"


