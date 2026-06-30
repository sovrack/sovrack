# =============================================================================
# Frontend Makefile — platform Deploy Automation
# =============================================================================
.PHONY: help build run test lint clean

.DEFAULT_GOAL := help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ─── Application ─────────────────────────────────────────────────────────────

build: ## Build Docker image
	docker build -t platform/frontend:latest .

run: ## Run with Docker Compose
	docker compose up -d --build

dev: ## Start frontend in development mode
	npm run dev

# ─── Quality ─────────────────────────────────────────────────────────────────

test: ## Run unit tests
	npm test

test:watch: ## Run tests in watch mode
	npm run test:watch

test:coverage: ## Run tests with coverage
	npm run test:cov

lint: ## Run ESLint
	npm run lint

lint:fix: ## Run ESLint with auto-fix
	npm run lint:fix

typecheck: ## Run TypeScript checks
	npx tsc --noEmit

# ─── Build ─────────────────────────────────────────────────────────────────

build:dev: ## Build for development
	npm run build

build:prod: ## Build for production
	NODE_ENV=production npm run build

build:analyze: ## Build and analyze bundle size
	npm run build:analyze

# ─── Development ───────────────────────────────────────────────────────────

dev:clean: ## Clean development (remove .next and restart)
	rm -rf .next
	$(MAKE) dev

# ─── Cleanup ─────────────────────────────────────────────────────────────────

clean: ## Clean Docker resources
	docker compose down
	docker system prune -f

clean:all: ## Clean everything including node_modules and .next
	rm -rf node_modules .next dist coverage
	$(MAKE) clean

# ─── Dependencies ───────────────────────────────────────────────────────────

install: ## Install dependencies
	npm install

install:clean: ## Clean install (remove node_modules first)
	rm -rf node_modules
	$(MAKE) install

# ─── Code Generation ───────────────────────────────────────────────────────

contract:generate: ## Generate OpenAPI contract from backend
	npm run contract:generate

# ─── Deployment Helpers ───────────────────────────────────────────────────

deploy:staging: ## Build and deploy to staging
	docker build -t registry.example.com/platform/frontend:staging .
	docker push registry.example.com/platform/frontend:staging

deploy:prod: ## Build and deploy to production
	docker build -t registry.example.com/platform/frontend:latest .
	docker push registry.example.com/platform/frontend:latest
