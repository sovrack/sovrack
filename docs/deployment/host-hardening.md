# Durcissement du VPS applicatif

Effectuer ces opérations dans une fenêtre distincte du déploiement applicatif.
Conserver une console OVH ouverte et une seconde session SSH avant toute
modification de `sshd` ou du pare-feu.

## SSH

1. Créer un utilisateur de déploiement dédié et installer sa nouvelle clé.
2. Tester une connexion complète dans une seconde session.
3. Configurer au minimum : `PasswordAuthentication no`,
   `PermitRootLogin no`, `X11Forwarding no`, `MaxAuthTries 3`.
4. Vérifier avec `sshd -t` avant le reload.
5. Revalider la nouvelle connexion avant de fermer l'ancienne session.

Ne jamais automatiser l'étape 3 tant que l'accès par clé et la console OVH
n'ont pas été prouvés.

## Réseau

Les seuls ports Internet attendus sont 22, 80 et 443. PostgreSQL et Redis
restent liés à `127.0.0.1`.

Docker programme directement des règles netfilter ; une politique UFW seule ne
suffit donc pas toujours. Vérifier les règles `DOCKER-USER` et tester les ports
depuis une machine externe après chaque modification.

## Mises à jour et redémarrage

Appliquer les mises à jour système, redémarrer si requis, puis vérifier :

- retour automatique de Docker ;
- état des conteneurs ;
- montage des volumes ;
- HTTPS et certificat ;
- timers backup/TLS ;
- absence d'OOM et espace disque.

## Supervision

Mettre en place des contrôles externes sur la page publique et
`/backend-api/health`, plus des alertes authentifiées pour :

- échec de readiness ;
- erreurs répétées backend/worker ;
- disque supérieur à 80 puis 90 % ;
- mémoire/swap et événements OOM ;
- backup trop ancien ou timer en échec ;
- expiration TLS ;
- conteneur redémarré ou unhealthy.
