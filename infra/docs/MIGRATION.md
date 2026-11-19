# Transition du layout historique vers les releases versionnées

Cette transition concerne la stack `sovrack` déjà installée à plat dans
`/srv/sovrack`. Elle n'est pas un déploiement zéro-downtime : la phase 2
modifie le schéma et exige une fenêtre de maintenance.

## Règles

- Ne supprimer ni déplacer le `.env`, les volumes ou l'ancienne stack.
- Préparer d'abord une release de référence R0 correspondant exactement aux
  images et au schéma actuels.
- Créer un nouveau dump `.sql.gz` avec checksum avant toute migration.
- Répéter la transition sur l'environnement de qualification local avant
  production lorsqu'aucun staging distant n'est disponible.

## Préparation R0

Documenter :

- digest actuel du backend ;
- digest actuel du frontend ;
- commit des trois dépôts correspondant aux images ;
- dernière migration appliquée (`20260806200000_add_google_oauth` lors de
  l'audit initial) ;
- SHA-256 du contrat OpenAPI correspondant.

Créer un manifeste `v1-baseline` et archiver une copie du code infrastructure
capable de redémarrer cette version. Ce couple constitue la cible de rollback.
Le manifeste baseline doit utiliser `RUNTIME_TOPOLOGY=legacy-single` ; démarrer
un worker séparé avec l'ancienne image créerait deux consommateurs concurrents.

## Initialisation du nouveau layout

Après installation du premier bundle dans
`/srv/sovrack/releases/<release-id>` :

```bash
SOVRACK_BASE_DIR=/srv/sovrack \
  /srv/sovrack/releases/<release-id>/scripts/bootstrap.sh
```

Le bootstrap copie l'ancien `/srv/sovrack/.env` vers
`/srv/sovrack/shared/.env` sans supprimer l'original. Compléter ensuite les
nouvelles variables, sans modifier `CONFIG_SECRET`.

## Répétition obligatoire sur le PC de qualification

Avec les mêmes images immuables et des limites identiques au VPS :

1. restaurer une copie récente de la base 105 ;
2. promouvoir localement `v3.0.0-rc.1` en topologie `compact` ;
3. vérifier le passage exact à la migration déclarée dans le manifeste ;
4. exécuter les tests métier ;
5. restaurer le dump 105 avec la baseline R0 ;
6. vérifier que l'ancienne version redémarre ;
7. mesurer les temps d'arrêt et de restauration.

La production ne commence qu'après réussite des deux directions.

## Bascule de production

Utiliser exclusivement le job GitLab protégé `deploy:production`. Le script
ouvre la maintenance, arrête les writers, crée le backup final, migre et ne
bascule `current` qu'après les contrôles.

L'ancien layout plat reste en place pendant la période d'observation. Son
nettoyage est une opération ultérieure et ciblée décrite dans `CLEANUP.md`.
