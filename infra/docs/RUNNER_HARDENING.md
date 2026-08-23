# Architecture et durcissement GitLab Runner

## Séparation obligatoire

Le VPS applicatif ne doit exécuter aucun runner GitLab. Utiliser au minimum :

| Tag | Usage | Privilèges |
|---|---|---|
| `sovrack-ci` | lint, tests, BuildKit rootless | non privilégié, aucun socket hôte |
| `sovrack-docker-tests` | migrations sur Docker-in-Docker | runner jetable/dédié, jamais le VPS applicatif |
| `sovrack-deploy` | transfert SSH du bundle | non privilégié, aucun Docker, projets protégés seulement |

Le runner de déploiement n'a besoin que de joindre GitLab et les ports SSH des
hôtes staging/production. Sa clé SSH doit appartenir à un utilisateur `deploy`
limité au répertoire Sovrack et aux commandes Docker nécessaires.

## Paramètres GitLab

- runners verrouillés aux projets concernés ;
- tags obligatoires, `Run untagged jobs` désactivé ;
- runners de déploiement et Docker-tests marqués `Protected` ;
- concurrence 1 pour le déploiement, 1 ou 2 pour les tests Docker ;
- aucun montage `/var/run/docker.sock` ;
- aucun montage de `/root/.docker/config.json` ou d'un répertoire applicatif ;
- cache borné et politique de rétention ;
- token différent par runner et rotation après déplacement ;
- variables staging/production protégées, masquées et à portée d'environnement.

## Environnements

Configurer dans GitLab :

- `staging` protégé, accessible aux mainteneurs ;
- `production` protégé, déploiement manuel ;
- approbation obligatoire d'au moins une autre personne lorsque l'équipe le
  permet ;
- branches et tags protégés ;
- `resource_group` pour empêcher deux promotions concurrentes.

## Retrait de l'ancien runner

Après validation des nouveaux runners : mettre les anciens en pause dans
GitLab, attendre la fin des jobs, arrêter le service sur le VPS applicatif,
révoquer leurs tokens, puis supprimer leurs configurations. Vérifier ensuite
qu'aucun processus runner, montage de socket ou volume cache ne subsiste.
