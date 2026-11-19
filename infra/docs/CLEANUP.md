# Nettoyage contrôlé du VPS

Ne jamais utiliser `docker volume prune`, `docker system prune`, un glob de
conteneurs ou `rm -rf /tmp` dans la procédure normale. Un volume « inutilisé »
peut être la seule copie d'une ancienne base ou d'un cache nécessaire.

## 1. Inventaire en lecture seule

```bash
docker ps -a --no-trunc
docker image ls --digests --no-trunc
docker volume ls
docker system df -v
df -h / /var/lib/docker
```

Conserver la sortie dans le ticket de maintenance et associer chaque objet à :

- release active ;
- release de rollback ;
- runner CI ;
- environnement de test connu ;
- objet inconnu à investiguer.

## 2. Protection avant suppression

Vérifier que :

1. `current` pointe vers la release saine ;
2. le dernier backup local passe son checksum ;
3. sa copie hors site existe ;
4. une restauration a été testée ;
5. la release précédente et ses deux images restent disponibles.

## 3. Suppression ciblée

Résoudre l'identifiant exact avant chaque commande :

```bash
docker inspect <container-id>
docker image inspect <image-id>
docker volume inspect <volume-name>
```

Supprimer ensuite un seul objet explicitement approuvé :

```bash
docker container rm <container-id>
docker image rm <image-id>
docker volume rm <volume-name>
```

Ne jamais supprimer `sovrack_pgdata`, `sovrack_redisdata`,
`sovrack-certbot-certs` ou `sovrack-certbot-webroot` pendant un nettoyage.

## 4. Anciennes releases

Garder au minimum la release active et la précédente. Une release plus ancienne
peut être supprimée uniquement si son manifeste est archivé et si aucune
procédure de rollback ne la référence.

Déplacer d'abord le répertoire candidat dans un dossier de quarantaine du même
filesystem, attendre une période d'observation, puis le supprimer lors d'une
maintenance ultérieure.

## 5. Cache des runners

Le cache runner doit être nettoyé sur l'hôte CI séparé, jamais sur le VPS de
production. Utiliser la politique de rétention du runner ou cibler précisément
le volume après inspection.
