# Short commands for managing the Next.js app with pm2
APP_DIR := web
NAME := devops-chat

.PHONY: help build start stop restart status logs save startup dev test-ansible test-terraform test-all start-backend stop-backend restart-backend backend-status install-deps restart-all system-status dev-setup

# Show help for all available commands
help:
	@echo "ShipSense DevOps Assistant - Available Commands:"
	@echo ""
	@echo "Frontend Management:"
	@echo "  build          - Build the Next.js application"
	@echo "  start          - Start the app with pm2"
	@echo "  stop           - Stop the pm2 process"
	@echo "  restart        - Restart the pm2 process"
	@echo "  status         - Show pm2 status"
	@echo "  logs           - Show pm2 logs"
	@echo "  dev            - Start Next.js development server"
	@echo ""
	@echo "Backend Management:"
	@echo "  start-backend  - Start Python FastAPI server"
	@echo "  stop-backend   - Stop Python server"
	@echo "  restart-backend- Restart Python server"
	@echo "  backend-status - Check backend server status"
	@echo ""
	@echo "Testing:"
	@echo "  test-ansible   - Test Ansible generation endpoint"
	@echo "  test-terraform - Test Terraform generation endpoint"
	@echo "  test-all       - Test all generation endpoints"
	@echo ""
	@echo "System Management:"
	@echo "  install-deps   - Install Python dependencies"
	@echo "  restart-all    - Restart entire system (frontend + backend)"
	@echo "  system-status  - Show status of both frontend and backend"
	@echo "  dev-setup      - Quick development environment setup"
	@echo ""
	@echo "Examples:"
	@echo "  make dev-setup     # Set up development environment"
	@echo "  make test-all      # Test all new capabilities"
	@echo "  make system-status # Check system health"

build:
	cd $(APP_DIR) && npm run build

start:
	cd $(APP_DIR) && pm2 start "npm run start" --name $(NAME) --cwd "$(shell pwd)/$(APP_DIR)"

stop:
	pm2 stop $(NAME) || true && pm2 delete $(NAME) || true

restart:
	pm2 restart $(NAME)

status:
	pm2 status

logs:
	pm2 logs $(NAME)

save:
	pm2 save

startup:
	pm2 startup

dev:
	cd $(APP_DIR) && npm run dev

# Test the new Ansible and Terraform generation endpoints
test-ansible:
	@echo "Testing Ansible generation endpoint..."
	@curl -X POST "http://127.0.0.1:8080/ansible-generate" \
		-H "Content-Type: application/json" \
		-d '{"prompt": "Create an Ansible playbook for installing nginx on web servers"}' \
		| jq '.output' | head -20

test-terraform:
	@echo "Testing Terraform generation endpoint..."
	@curl -X POST "http://127.0.0.1:8080/terraform-generate" \
		-H "Content-Type: application/json" \
		-d '{"prompt": "Create a Terraform configuration for AWS EC2 instance with VPC"}' \
		| jq '.output' | head -20

test-all: test-ansible test-terraform
	@echo "All endpoints tested successfully!"

# Start the Python backend server
start-backend:
	@echo "Starting Python backend server..."
	@if [ -z "$$GEMINI_API_KEY" ]; then echo "GEMINI_API_KEY is not set in the environment"; exit 1; fi
	cd server && source ../.venv/bin/activate && \
	nohup python -m uvicorn main:app --host 127.0.0.1 --port 8080 > server.log 2>&1 &

# Stop the Python backend server
stop-backend:
	@echo "Stopping Python backend server..."
	@pkill -f "uvicorn main:app" || true

# Restart the Python backend server
restart-backend: stop-backend
	@echo "Restarting Python backend server..."
	@$(MAKE) start-backend

# Check backend status
backend-status:
	@echo "Checking backend server status..."
	@curl -s "http://127.0.0.1:8080/" || echo "Backend server is not running"

# Install Python dependencies
install-deps:
	@echo "Installing Python dependencies..."
	cd server && source ../.venv/bin/activate && pip install -r ../requirements.txt

# Full system restart (both frontend and backend)
restart-all: stop stop-backend
	@echo "Restarting entire system..."
	@$(MAKE) start-backend
	@sleep 5
	@$(MAKE) start

# Show system status
system-status: backend-status
	@echo "---"
	@$(MAKE) status

# Quick development setup
dev-setup: install-deps start-backend
	@echo "Development environment ready!"
	@echo "Backend: http://127.0.0.1:8080"
	@echo "Frontend: cd web && npm run dev"
