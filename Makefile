.PHONY: help build up down dev logs clean test rebuild health install build-local serve-local serve-local-sse \
        dev-single microk8s-build microk8s-push microk8s-deploy

# MicroK8s registry configuration
MICROK8S_REG   ?= reg.microk8s.core.home.arpa:32000
MICROK8S_IMAGE ?= cm
# Prefer MICROK8S_TAGS (space-separated); falls back to single MICROK8S_TAG
MICROK8S_TAG   ?= latest
MICROK8S_TAGS  ?=

# Internal: resolve TAGS from TAGS or TAG
TAGS := $(strip $(if $(MICROK8S_TAGS),$(MICROK8S_TAGS),$(MICROK8S_TAG)))
# Buildx/platform support (optional). Leave empty or set like: linux/amd64,linux/arm64
PLATFORMS ?=

# Compose the -t args for docker build
TAG_ARGS := $(foreach t,$(TAGS),-t $(MICROK8S_REG)/$(MICROK8S_IMAGE):$(t))

help: ## Show this help message
	@echo "Available commands:"
	@awk 'BEGIN {FS=":.*##"} \
	     /^[a-zA-Z0-9_.-]+:.*##/ { \
	       gsub(/^[[:space:]]+|[[:space:]]+$$/,"",$$2); \
	       printf "\033[36m%-20s\033[0m %s\n", $$1, $$2 \
	     }' $(MAKEFILE_LIST) | sort

build: ## Build the Docker image
	docker build -t cm:latest .

up: ## Start the application in production mode
	docker compose up -d

down: ## Stop and remove containers
	docker compose down

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

install: ## Install dependencies locally
	npm install

build-local: ## Build site locally (without Docker)
	./build-site.sh

serve-local: ## Serve built site locally
	cd site-output && python3 -m http.server 8080

serve-local-sse: ## Serve built site locally with RSS SSE proxy
	@RSS_CONFIG_PATH="$(PWD)/smoke-test.yaml" RSS_OUTPUT_DIR="$(PWD)/site-output" RSS_REFRESH_INTERVAL=600000 \
	  node rss-proxy/index.mjs & \
	  proxy_pid=$$!; \
	  trap 'kill $$proxy_pid' INT TERM EXIT; \
	  LOCAL_SERVE_HOST=0.0.0.0 LOCAL_SERVE_PORT=8888 SITE_OUTPUT_DIR="$(PWD)/site-output" SSE_PROXY_TARGET="http://127.0.0.1:7070" \
	    node scripts/serve-local-sse.mjs

dev-single: ## Build and run single-container dev image (nginx + rss-proxy)
	docker build -f Dockerfile.dev -t cm-dev:latest .
	@docker rm -f cm-dev >/dev/null 2>&1 || true
	docker run --name cm-dev -p 8080:8080 -d --cap-drop=ALL --security-opt no-new-privileges cm-dev:latest

microk8s-build: ## Build image for MicroK8s registry (supports multiple tags)
	@if [ -n "$(PLATFORMS)" ]; then \
	  echo ">> Using buildx for platforms: $(PLATFORMS)"; \
	  docker buildx build --platform $(PLATFORMS) $(TAG_ARGS) . --load; \
	else \
	  docker build $(TAG_ARGS) .; \
	fi

microk8s-push: microk8s-build ## Build once and push all tags to MicroK8s registry
	@set -e; \
	for t in $(TAGS); do \
	  echo ">> Pushing $(MICROK8S_REG)/$(MICROK8S_IMAGE):$$t"; \
	  docker push "$(MICROK8S_REG)/$(MICROK8S_IMAGE):$$t"; \
	done
