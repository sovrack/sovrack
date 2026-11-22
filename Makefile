# =============================================================================
# Sovrack Monorepo — Commandes Principales
# =============================================================================
SHELL := /usr/bin/env bash

.PHONY: help dev local-up down local-down logs local-logs test lint type-check check build clean infra-check

help: ## Affiche l'aide des commandes disponibles
	@printf "\n🦅 Commandes Sovrack Monorepo:\n\n"
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | sed -E 's/([a-zA-Z_-]+):.*?## (.*)/  \1\t\2/' | expand -t 18

dev: local-up ## Alias pour local-up (démarre l'environnement local complet)

local-up: ## Construit et démarre la pile locale (Server, Web, Nginx, DB, Redis, Mailpit)
	$(MAKE) -C infra local-up

down: local-down ## Alias pour local-down (arrête la pile locale)

local-down: ## Arrête la pile locale en conservant les volumes de données
	$(MAKE) -C infra local-down

local-reset: ## Arrête la pile locale et réinitialise tous les volumes de données
	$(MAKE) -C infra local-reset

logs: local-logs ## Alias pour local-logs (affiche les journaux en direct)

local-logs: ## Affiche les logs en direct (server, web, nginx, mailpit)
	$(MAKE) -C infra local-logs

test: ## Exécute l'ensemble des suites de tests (Web + Server)
	npm --workspace=@sovrack/web run test
	npm --workspace=@sovrack/server run test -- --testPathPatterns="auth-cookie|image-resolver|service-templates|automation.gateway|deployments.gateway|server-setup.gateway|git-provider-config|traefik-route|database-s3-backup|enterprise-license"

lint: ## Vérifie la syntaxe et les règles de code (Server + Web)
	npm --workspace=@sovrack/server run lint -- --max-warnings=0
	npm --workspace=@sovrack/web run lint -- --max-warnings=0

type-check: ## Vérifie les types TypeScript (Server + Web)
	npm --workspace=@sovrack/server run check:all
	npm --workspace=@sovrack/web run type-check

infra-check: ## Valide les configurations Docker Compose (Prod, Dev, Monitoring)
	$(MAKE) -C infra validate-ci

check: ## Exécute les quality gates (architecture, types, lint)
	npm --workspace=@sovrack/web run check:web
	npm --workspace=@sovrack/server run arch:check

build: ## Construit les applications Server et Web
	npm --workspace=@sovrack/server run build
	npm --workspace=@sovrack/web run build

clean: ## Supprime les dossiers de distribution et caches temporaires
	rm -rf apps/server/dist apps/web/.next
