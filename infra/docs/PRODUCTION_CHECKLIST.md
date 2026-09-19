# Checklist de production

## Bloquants avant la prochaine release candidate

- [ ] Tous les secrets publiés hors de leur mécanisme secret ont été renouvelés ; aucune valeur ne doit entrer dans Git ou les logs.
- [ ] `JWT_SECRET`, `STAFF_JWT_SECRET`, `STAFF_OTP_SECRET`, `CUSTOMER_MFA_SECRET` et `CONFIG_SECRET` sont tous présents, suffisamment longs et distincts.
- [ ] Tous les anciens runners sont révoqués et aucun runner ne tourne sur le VPS applicatif.
- [ ] Les nouveaux runners séparés portent les tags attendus.
- [ ] La qualification locale rejoue le bundle exact avec les limites du VPS.
- [ ] La topologie `compact` passe le test de charge sans exception de capacité.
- [ ] Les mises à jour système et le redémarrage ont été réalisés.
- [ ] Le renouvellement TLS du volume Docker passe en dry-run.
- [ ] Le backup local, le backup Restic et la restauration isolée réussissent.
- [ ] La baseline R0 (schéma 105 + anciens digests) est archivée.
- [ ] L'état du `ROOT` existant a été contrôlé sans l'écraser ; `bootstrap-staff` n'est utilisé que s'il est réellement absent.
- [ ] SMTP a été configuré depuis `/staff/settings/email`, limité au fournisseur attendu et testé.
- [ ] La récupération du `ROOT` via `contact@sovrack.tech` et sa redirection OVH a été testée de bout en bout.
- [ ] SPF, DKIM et DMARC sont publiés pour le domaine d'envoi.
- [ ] L'identité légale de l'éditeur, son adresse et les informations d'hébergement ont été validées puis reportées dans les mentions légales ; aucune donnée n'est inventée par l'équipe technique.
- [ ] Les DNS `sovrack.tech`, `app.sovrack.tech` et `staff.sovrack.tech` pointent vers la cible et le certificat SAN couvre les quatre noms avec `www`.
- [ ] Les cookies client/staff sont host-only ; aucun `AUTH_COOKIE_DOMAIN` global n'est défini.
- [ ] Le ROOT a validé la récupération par code ; l'ouverture publique reste conditionnée à une MFA staff effective.

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
