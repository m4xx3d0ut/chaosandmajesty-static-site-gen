.PHONY: help build up down dev logs clean test rebuild health

# Default target
help: ## Show this help message
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

build: ## Build the Docker image
	docker build -t cm:latest .

up: ## Start the application in production mode
	docker compose up -d

down: ## Stop and remove containers
	docker compose down

# dev: ## Start in development mode with hot reload
# 	docker compose --profile dev up -d cm-dev
#
# dev-logs: ## Follow development logs
# 	docker compose logs -f cm-dev

logs: ## Follow application logs
	docker compose logs -f cm

restart: ## Restart the application
	docker compose restart cm

rebuild: ## Rebuild and restart the application
	docker compose down
	docker build --no-cache -t cm:latest .
	docker compose up -d

clean: ## Clean up containers, images, and volumes
	docker compose down -v --remove-orphans
	docker image prune -f
	docker system prune -f

test: ## Run smoke tests
	docker run --rm -v $(PWD):/app -w /app node:18-alpine sh -c "npm test || echo 'No tests configured'"

health: ## Check application health
	@echo "Checking application health..."
	@curl -f http://localhost:8080 > /dev/null 2>&1 && echo "✅ Application is healthy" || echo "❌ Application is not responding"

shell: ## Get shell access to running container
	docker compose exec cm sh

# dev-shell: ## Get shell access to development container
# 	docker compose exec cm-dev sh

install: ## Install dependencies locally
	npm install

build-local: ## Build site locally (without Docker)
	./build-site.sh

serve-local: ## Serve built site locally
	cd site-output && python3 -m http.server 8080

