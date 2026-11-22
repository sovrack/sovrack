# Sovrack Infra — commandes courantes
# Usage : make <cible>  (depuis le dossier racine de ce repo)
# .env : copie-le depuis .env.production.example puis renseigne les secrets.

SHELL := /usr/bin/env bash
BASE_DIR ?= /srv/sovrack
CURRENT_COMPOSE := SOVRACK_BASE_DIR=$(BASE_DIR) ./scripts/current-compose.sh

.PHONY: help bootstrap bootstrap-staff config up ps logs backup restore rollback preflight validate-ci test-scripts test-hardening certbot certbot-renew local-up local-down local-reset local-logs local-browser local-perf local-acceptance host-dependencies host-syntax host-prepare monitoring-up monitoring-down monitoring-logs

help: ## Affiche l'aide
	@printf "Commandes Sovrack infra:\n"
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | sed 's/:.*## /   /' | sort

bootstrap: ## Initialise les dossiers + .env (1ère fois)
	./scripts/bootstrap.sh

bootstrap-staff: ## Invite le premier ROOT par code email (EMAIL=...)
	SOVRACK_BASE_DIR=$(BASE_DIR) ./scripts/bootstrap-staff.sh "$(EMAIL)"

config: ## Affiche la config résolue de la release active
	$(CURRENT_COMPOSE) config

up: ## Promeut une release immuable (FILE=manifest)
	SOVRACK_BASE_DIR=$(BASE_DIR) ./scripts/deploy.sh --release-file $(FILE)

ps: ## État des services
	$(CURRENT_COMPOSE) ps

logs: ## Logs server+web en direct
	$(CURRENT_COMPOSE) logs -f server worker web

backup: ## Dump PostgreSQL + rotation
	SOVRACK_BASE_DIR=$(BASE_DIR) ./scripts/backup-current.sh

restore: ## Restaure un dump (BRUTAL)
	@echo "Usage: make restore FILE=/chemin/backup.sql.gz"
	@echo "Utiliser rollback pour un retour de schéma ou restore.sh avec un manifeste explicite."

rollback: ## Restaure dump + ancienne release (RELEASE=id FILE=dump) ou app-only (RELEASE=id APP_ONLY=1)
	SOVRACK_BASE_DIR=$(BASE_DIR) ./scripts/rollback.sh $(RELEASE) $(if $(APP_ONLY),--app-only,$(FILE))

monitoring-up: ## Démarre la pile de monitoring déclarative (Prometheus / Alertmanager / Exporters)
	docker compose -f docker-compose.monitoring.yml up -d

monitoring-down: ## Arrête la pile de monitoring
	docker compose -f docker-compose.monitoring.yml down

monitoring-logs: ## Affiche les journaux de la pile de monitoring
	docker compose -f docker-compose.monitoring.yml logs -f

preflight: ## Valide capacité, secrets et manifeste (FILE=manifest)
	SOVRACK_BASE_DIR=$(BASE_DIR) ./scripts/preflight.sh --release-file $(FILE)

validate-ci: ## Valide les compose dans les conditions CI (prod, dev, monitoring)
	docker compose --env-file .env.production.example -f docker-compose.prod.yml config -q
	docker compose -f docker-compose.dev.yml config -q
	docker compose -f docker-compose.monitoring.yml config -q

test-scripts: ## Teste backup/restore dans une stack Docker jetable
	./tests/ansible-layout-test.sh
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

local-up: ## Construit et démarre la recette locale isolée avec Mailpit
	docker compose -f docker-compose.dev.yml up -d --build --wait

local-down: ## Arrête la recette locale en conservant ses données
	docker compose -f docker-compose.dev.yml down --remove-orphans

local-reset: ## Supprime uniquement les volumes de la recette locale
	docker compose -f docker-compose.dev.yml down --volumes --remove-orphans

local-logs: ## Affiche les logs de la recette locale
	docker compose -f docker-compose.dev.yml logs -f server web nginx mailpit

local-browser: ## Exécute les E2E navigateur sur les trois hôtes locaux
	npm --prefix ../apps/web run test:browser

local-perf: ## Mesure Mon compte et Workspaces dans Chromium
	npm --prefix ../apps/web run perf:local

local-acceptance: local-browser local-perf ## Exécute la recette navigateur et performance

host-dependencies: ## Installe les collections Ansible épinglées
	ansible-galaxy collection install -r ansible/requirements.yml

host-syntax: ## Vérifie le playbook de préparation sans toucher une machine
	cd ansible && ansible-playbook --syntax-check playbooks/prepare-host.yml

host-prepare: ## Prépare un hôte (INVENTORY=... PRIVATE_KEY=...)
	cd ansible && ansible-playbook -i $(INVENTORY) --private-key $(PRIVATE_KEY) playbooks/prepare-host.yml
