# Sovrack Infra — commandes courantes
# Usage : make <cible>  (depuis le dossier racine de ce repo)
# .env : copie-le depuis .env.production.example puis renseigne les secrets.

SHELL := /usr/bin/env bash
ENV_FILE := .env
COMPOSE := docker compose --env-file $(ENV_FILE) -f docker-compose.prod.yml

.PHONY: help bootstrap config up ps logs backup restore validate-ci certbot certbot-renew

help: ## Affiche l'aide
	@printf "Commandes Sovrack infra:\n"
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | sed 's/:.*## /   /' | sort

bootstrap: ## Initialise les dossiers + .env (1ère fois)
	./scripts/bootstrap.sh

config: ## Affiche la config résolue (validation)
	$(COMPOSE) config

up: ## Pull + up la stack de production
	./scripts/deploy.sh

ps: ## État des services
	$(COMPOSE) ps

logs: ## Logs backend+frontend en direct
	$(COMPOSE) logs -f backend frontend

backup: ## Dump PostgreSQL + rotation
	./scripts/backup.sh

restore: ## Restaure un dump (BRUTAL)
	@echo "Usage: make restore FILE=/chemin/backup.sql.gz"
	./scripts/restore.sh $(FILE)

validate-ci: ## Valide le compose dans les conditions CI (image docker cli)
	docker compose --env-file .env.production.example -f docker-compose.prod.yml config -q

certbot: ## Obtient/renouvelle le certificat TLS (DOMAIN = domaine)
	DOMAIN=$${DOMAIN:-sovrack.tech} ./scripts/certbot.sh

certbot-renew: ## Renouvellement TLS automatique (à appeler côté VPS, ex. cron)
	DOMAIN=$${DOMAIN:-sovrack.tech} ./scripts/certbot.sh --renew

.PHONY: help bootstrap config up ps logs backup restore validate-ci certbot certbot-renew