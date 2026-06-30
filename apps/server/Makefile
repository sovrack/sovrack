# =============================================================================
# Backend Makefile — platform Deploy Automation
# =============================================================================
.PHONY: help build run test lint clean db db-stop db-reset

.DEFAULT_GOAL := help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ─── Database ────────────────────────────────────────────────────────────────

db: ## Start PostgreSQL + Redis (idempotent) and wait until healthy
	docker compose -f docker-compose.db.yml up -d
	@echo "Waiting for PostgreSQL and Redis to be healthy..."
	@for i in $$(seq 1 30); do \
		status=$$(docker inspect --format '{{.State.Health.Status}}' nestjs_devops_db 2>/dev/null || echo missing); \
		redis_status=$$(docker inspect --format '{{.State.Health.Status}}' nestjs_devops_redis 2>/dev/null || echo missing); \
		if [ "$$status" = "healthy" ] && [ "$$redis_status" = "healthy" ]; then \
			echo "PostgreSQL and Redis are healthy."; exit 0; \
		fi; \
		sleep 2; \
	done; \
	echo "Database or Redis did not become healthy in time." >&2; exit 1

db-stop: ## Stop PostgreSQL + Redis (keeps data volume)
	docker compose -f docker-compose.db.yml stop

db-reset: ## DANGER: drop the DB volume and recreate (wipes all data)
	docker compose -f docker-compose.db.yml down -v
	$(MAKE) db
	npx prisma migrate deploy

# ─── Application ─────────────────────────────────────────────────────────────

build: ## Build Docker image
	docker build -t platform/backend:latest .

run: ## Run with Docker Compose (production mode)
	docker compose up -d --build

dev: db ## Start backend in development mode (requires DB + Redis)
	npm run start:dev

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

# ─── Database Operations ─────────────────────────────────────────────────────

migrate: ## Apply Prisma migrations
	npx prisma migrate deploy

migrate:dev: ## Create and apply new migration (development)
	npx prisma migrate dev

migrate:reset: ## Reset database and reapply all migrations
	npx prisma migrate reset

db:seed: ## Seed database with sample data
	npx prisma db seed

db:studio: ## Open Prisma Studio
	npx prisma studio

# ─── Cleanup ─────────────────────────────────────────────────────────────────

clean: ## Clean Docker resources
	docker compose down -v
	docker system prune -f

clean:all: ## Clean everything including node_modules
	rm -rf node_modules dist coverage
	$(MAKE) clean

# ─── Dependencies ───────────────────────────────────────────────────────────

install: ## Install dependencies and generate Prisma client
	npm install
	npm run prisma:generate

install:clean: ## Clean install (remove node_modules first)
	rm -rf node_modules
	$(MAKE) install
