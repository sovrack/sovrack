# Architecture des runners Sovrack

La VM CI locale exécute quatre runners logiques avec cinq workers globaux afin
que le long polling d'un runner inactif ne bloque pas les autres files. Les
limites par runner restent la vraie borne d'exécution : deux jobs de validation
ordinaires, un build d'image, un test Docker et un déploiement. Sur la VM à deux
vCPU et 8 Gio de RAM, les promotions des trois dépôts sont séquencées afin de
ne pas cumuler tous ces maxima. Aucun runner ne monte `/var/run/docker.sock`
dans les jobs.

- `sovrack-ci` : validations, tests et scans ordinaires, non privilégié.
- `sovrack-image-build` : BuildKit rootless, non privilégié, profil seccomp et
  AppArmor requis par BuildKit.
- `sovrack-docker-tests` : job non privilégié ; seul le service Docker-in-
  Docker rootless explicitement autorisé peut être privilégié.
- `sovrack-deploy` : tags protégés uniquement, image Alpine, aucun service.

Les modèles de configuration versionnés dans `runner/*.template.toml` ne
contiennent aucun jeton. Les jetons d'authentification restent exclusivement
dans `/etc/gitlab-runner/config.toml`, lisibles uniquement par root et le
compte de service `gitlab-runner`, sur la VM.

Le compte de service appartient au groupe Docker, mais les conteneurs de jobs
ne reçoivent jamais la socket Docker de l'hôte. Le démon conserve ses journaux
avec rotation et `live-restore`. SSH accepte uniquement les clés publiques.
UFW autorise le port 22 depuis le réseau libvirt local et, lorsque la cible de
staging est cette même VM, depuis le sous-réseau exact du bridge Docker utilisé
par le runner de déploiement. Ne pas ouvrir globalement `172.16.0.0/12` : les
réseaux applicatifs n'ont pas à joindre le SSH de l'hôte.

Le client SSH des jobs utilise des délais bornés, le mode non interactif et la
vérification stricte de la clé hôte. Une erreur de routage ou de pare-feu échoue
donc rapidement au lieu de bloquer une promotion pendant plusieurs minutes.

## Cache local

Les runners de validation utilisent le cache Docker local monté sur `/cache`.
La section `[runners.cache]` est réservée aux adaptateurs distribués S3, GCS ou
Azure : elle doit être absente lorsqu'aucun de ces adaptateurs n'est configuré.
Une section distribuée vide provoque des erreurs trompeuses dans le journal du
runner sans apporter de cache partagé.

Les volumes de cache sans conteneur attaché ne sont pas nécessairement
orphelins : le runner les rattache au prochain job. Contrôler leur nom, leur
âge et leur taille avant toute suppression. Effectuer le nettoyage uniquement
quand aucun job ne s'exécute, et conserver les volumes de données de la
préproduction.

## Paramètres GitLab

- runners verrouillés aux projets concernés ;
- tags obligatoires, `Run untagged jobs` désactivé ;
- runners de déploiement et Docker-tests marqués `Protected` ;
- concurrence 1 pour le déploiement et chaque job lourd ;
- aucun montage `/var/run/docker.sock` ni d'un répertoire applicatif ;
- token différent par runner ;
- variables staging/production protégées, masquées et à portée
  d'environnement ;
- environnements `staging` et `production` protégés ;
- tags de release protégés ;
- `resource_group` pour empêcher deux promotions concurrentes.

## Retrait d'un ancien runner

Mettre le runner en pause dans GitLab, attendre la fin de ses jobs, arrêter sa
configuration locale, puis révoquer son token. Supprimer ses volumes de cache
uniquement après avoir confirmé qu'aucun runner actif ne porte le même identifiant.
Le VPS applicatif ne doit exécuter aucun runner GitLab.
