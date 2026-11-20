# =============================================================================
# Frontend Makefile — Sovrack
# =============================================================================
.PHONY: help build run dev test test-watch test-coverage lint lint-fix typecheck \
	build-dev build-prod dev-clean clean clean-all install install-clean \
	contract-generate deploy-staging deploy-prod

.DEFAULT_GOAL := help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ─── Application ─────────────────────────────────────────────────────────────

build: ## Build Docker image
	docker build -t sovrack/frontend:local .

run: ## Run with Docker Compose
	docker compose up -d --build

dev: ## Start frontend in development mode
	npm run dev

# ─── Quality ─────────────────────────────────────────────────────────────────

test: ## Run unit tests
	npm test

test-watch: ## Run tests in watch mode
	npm run test:watch

test-coverage: ## Run tests with coverage
	npm run test:cov

lint: ## Run ESLint
	npm run lint

lint-fix: ## Run ESLint with auto-fix
	npm run lint:fix

typecheck: ## Run TypeScript checks
	npx tsc --noEmit

# ─── Build ─────────────────────────────────────────────────────────────────

build-dev: ## Build for development
	npm run build

build-prod: ## Build for production
	NODE_ENV=production npm run build

# ─── Development ───────────────────────────────────────────────────────────

dev-clean: ## Clean development (remove .next and restart)
	rm -rf .next
	$(MAKE) dev

# ─── Cleanup ─────────────────────────────────────────────────────────────────

clean: ## Stop this Compose project and remove only its local app image
	docker compose down
	-docker image rm sovrack/frontend:local

clean-all: ## Clean everything including node_modules and .next
	rm -rf -- "$(CURDIR)/node_modules" "$(CURDIR)/.next" "$(CURDIR)/dist" "$(CURDIR)/coverage"
	$(MAKE) clean

# ─── Dependencies ───────────────────────────────────────────────────────────

install: ## Install dependencies
	npm install

install-clean: ## Clean install (remove node_modules first)
	rm -rf -- "$(CURDIR)/node_modules"
	$(MAKE) install

# ─── Code Generation ───────────────────────────────────────────────────────

contract-generate: ## Generate OpenAPI contract from backend
	npm run contract:generate

# ─── Deployment Helpers ───────────────────────────────────────────────────

deploy-staging: ## Refuse mutable direct deployment; use the infra pipeline
	@echo "Use an immutable RC tag and the deploy-automation-infra pipeline."
	@false

deploy-prod: ## Refuse mutable direct deployment; use the infra pipeline
	@echo "Use an immutable SemVer tag and the deploy-automation-infra pipeline."
	@false
