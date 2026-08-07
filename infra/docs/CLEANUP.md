# CLEANUP — Nettoyage du VPS après migration vers `sovrack`

> À exécuter **APRÈS** que la stack `sovrack` soit validée (voir MIGRATION.md).
> Certaines commandes sont **irréversibles** : fais le backup avant.

---

## 1. Stacks / conteneurs orphelins (non-prod)
Ancien stack prod `da-fares` (une fois validé) :
```bash
docker stop da-fares-frontend da-fares-backend da-fares-postgres da-fares-redis
docker rm   da-fares-frontend da-fares-backend da-fares-postgres da-fares-redis
```

Stacks de dev/test restants (certainement inutiles en prod) :
```bash
docker rm -f da-test-mailhog da-test-redis da-test-postgres
docker rm -f da-saas-postgres
docker rm -f nestjs_devops_db nestjs_devops_redis
docker rm -f modest_thompson confident_jackson redis
```

## 2. Répertoire temporaire `/tmp` (ayant contenu les données)
```bash
sudo rm -rf /tmp/da-instances /tmp/data
```

## 3. Images inutiles (doublons + anciennes)
Garde uniquement celles utilisées par `sovrack` en prod. Supersede :
- `registry.gitlab.com/deploy-automation/deploy-automation-frontend:latest`
- `registry.gitlab.com/deploy-automation/deploy-automation-backend:latest`
- `mailhog/mailhog`
- `sovrack-*`, `deploy-automation-*` (tags locaux orphelins)

```bash
docker rmi registry.gitlab.com/deploy-automation/deploy-automation-frontend:latest \
            registry.gitlab.com/deploy-automation/deploy-automation-backend:latest \
            mailhog/mailhog sovrack-frontend sovrack-backend \
            deploy-automation-frontend deploy-automation-backend
```

> NB : `docker rmi` sur une image utilisée par un conteneur en cours => refusé.
> Supprime d'abord le conteneur (étape 1).

## 4. Volumes / cache
```bash
docker volume prune -f        # supprime les volumes non montés (32 orphelins)
docker system prune -f        # conteneurs arrêtés + réseaux + images dangling
docker builder prune -f       # cache de build (~9,6 Go)
```

## 5. Vérification finale
```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}"   # seulement sovrack-*
docker images                                                   # seulement l'essentiel
df -h /                          # place libérée
```

## 6. (réf.) montage
Redémarre si besoin et vérifie la stack `sovrack` revient (`restart: unless-stopped`).