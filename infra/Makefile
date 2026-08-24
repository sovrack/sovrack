# Sovrack Infra — commandes courantes
# Usage : make <cible>  (depuis le dossier racine de ce repo)
# .env : copie-le depuis .env.production.example puis renseigne les secrets.

SHELL := /usr/bin/env bash
BASE_DIR ?= /srv/sovrack
CURRENT_COMPOSE := SOVRACK_BASE_DIR=$(BASE_DIR) ./scripts/current-compose.sh

.PHONY: help bootstrap config up ps logs backup restore rollback preflight validate-ci test-scripts test-hardening certbot certbot-renew

help: ## Affiche l'aide
	@printf "Commandes Sovrack infra:\n"
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | sed 's/:.*## /   /' | sort

bootstrap: ## Initialise les dossiers + .env (1ère fois)
	./scripts/bootstrap.sh

config: ## Affiche la config résolue de la release active
	$(CURRENT_COMPOSE) config

up: ## Promeut une release immuable (FILE=manifest)
	SOVRACK_BASE_DIR=$(BASE_DIR) ./scripts/deploy.sh --release-file $(FILE)

ps: ## État des services
	$(CURRENT_COMPOSE) ps

logs: ## Logs backend+frontend en direct
	$(CURRENT_COMPOSE) logs -f backend worker frontend

backup: ## Dump PostgreSQL + rotation
	SOVRACK_BASE_DIR=$(BASE_DIR) ./scripts/backup-current.sh

restore: ## Restaure un dump (BRUTAL)
	@echo "Usage: make restore FILE=/chemin/backup.sql.gz"
	@echo "Utiliser rollback pour un retour de schéma ou restore.sh avec un manifeste explicite."

rollback: ## Restaure dump + ancienne release (RELEASE=id FILE=dump)
	SOVRACK_BASE_DIR=$(BASE_DIR) ./scripts/rollback.sh $(RELEASE) $(FILE)

preflight: ## Valide capacité, secrets et manifeste (FILE=manifest)
	SOVRACK_BASE_DIR=$(BASE_DIR) ./scripts/preflight.sh --release-file $(FILE)

validate-ci: ## Valide le compose dans les conditions CI (image docker cli)
	docker compose --env-file .env.production.example -f docker-compose.prod.yml config -q

test-scripts: ## Teste backup/restore dans une stack Docker jetable
	./tests/release-manifest-test.sh
	./tests/nginx-maintenance-test.sh
	./tests/release-deploy-integration.sh
	./tests/backup-restore-integration.sh

test-hardening: ## Qualifie le runtime de production avec des images immuables
	./tests/production-hardening-test.sh

certbot: ## Obtient/renouvelle le certificat TLS (DOMAIN = domaine)
	SOVRACK_BASE_DIR=$(BASE_DIR) ENV_FILE=$(BASE_DIR)/shared/.env ./scripts/certbot.sh

certbot-renew: ## Renouvellement TLS automatique (à appeler côté VPS, ex. cron)
	SOVRACK_BASE_DIR=$(BASE_DIR) ENV_FILE=$(BASE_DIR)/shared/.env ./scripts/certbot.sh --renew

.PHONY: help bootstrap config up ps logs backup restore validate-ci test-scripts certbot certbot-renew
