# Checklist de production

## Bloquants avant `v2.0.0-rc.1`

- [ ] Risque des secrets publiés explicitement accepté par le propriétaire ; aucune valeur ne doit entrer dans Git ou les logs.
- [ ] Les trois anciens runners du VPS sont révoqués.
- [ ] Les nouveaux runners séparés portent les tags attendus.
- [ ] La qualification locale rejoue le bundle exact avec les limites du VPS.
- [ ] La topologie `compact` passe le test de charge sans exception de capacité.
- [ ] Les mises à jour système et le redémarrage ont été réalisés.
- [ ] Le renouvellement TLS du volume Docker passe en dry-run.
- [ ] Le backup local, le backup Restic et la restauration isolée réussissent.
- [ ] La baseline R0 (schéma 105 + anciens digests) est archivée.
- [ ] Le premier `ROOT` a été créé par `make bootstrap-staff` sans secret dans `.env`.
- [ ] SMTP a été configuré depuis `/staff/settings/email`, limité au fournisseur attendu et testé.
- [ ] SPF, DKIM et DMARC sont publiés pour le domaine d'envoi.
- [ ] Un second `ROOT` nominatif a activé son invitation et sa connexion a été vérifiée.

## Validation RC

- [ ] Pipelines backend/frontend/infra verts.
- [ ] SBOM backend et frontend archivés.
- [ ] Aucun HIGH/CRITICAL accepté sans décision documentée.
- [ ] Test migrations base neuve/upgrade/échec atomique vert.
- [ ] RBAC workspace/projet testé avec plusieurs comptes.
- [ ] Worker et WebSocket testés.
- [ ] Test de charge et endurance terminés.
- [ ] Déploiement et rollback répétés avec mesures.

## Fenêtre production

- [ ] Opérateur et approbateur identifiés.
- [ ] Communication de maintenance préparée.
- [ ] Backup hors site récent vérifié.
- [ ] Manifeste final et digests revérifiés.
- [ ] Critères de rollback et durée maximale définis.
- [ ] Console OVH disponible.

## Après promotion

- [ ] Migration exacte attendue.
- [ ] Tous les conteneurs healthy et aucun restart inattendu.
- [ ] Smoke tests public, staff et client réussis.
- [ ] Invitation staff, activation à usage unique et révocation de session réussies.
- [ ] Logs sans nouvelle erreur répétée.
- [ ] Backup post-release terminé.
- [ ] Timers backup et TLS actifs.
- [ ] Compte-rendu de release archivé.
