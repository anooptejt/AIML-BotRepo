# Short commands for managing the Next.js app with pm2
APP_DIR := web
NAME := devops-chat

.PHONY: build start stop restart status logs save startup dev

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
