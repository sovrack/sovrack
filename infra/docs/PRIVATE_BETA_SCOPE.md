# Périmètre de la première bêta privée

Ce document est la décision produit de référence pour la première bêta de
Sovrack. La bêta reste un environnement de tests contrôlés : elle ne constitue
ni une offre commerciale, ni un SLA, ni une garantie de conservation des
données. Toute extension de ce périmètre exige une décision écrite, des tests et
une nouvelle release.

## Parcours inclus

### Identité et espaces de travail

- inscription et connexion par email, vérification d'adresse et récupération du
  mot de passe ;
- espace `PERSONAL` pour une seule personne, sans invitation ;
- espace `ORGANIZATION` pour collaborer avec invitations et rôles ;
- conversion irréversible d'un espace personnel en organisation ;
- rôles workspace `OWNER`, `ADMIN`, `MEMBER`, `BILLING` et rôles projet
  `MAINTAINER`, `DEVELOPER`, `VIEWER` ;
- sessions client séparées des sessions du back-office.

### Déploiement

- projets et environnements créés explicitement ;
- dépôts GitLab et GitHub ;
- connexion à un registre de conteneurs ;
- service depuis une image Docker ou un Dockerfile pris en charge par le
  parcours actuel ;
- serveur Ubuntu fourni par le testeur et accessible par SSH ;
- validation du serveur et automatisations Ansible prévues dans le produit ;
- déclenchement par webhook entrant ;
- domaines personnalisés et TLS après configuration DNS manuelle ;
- état, logs, métriques, terminal réservé aux rôles autorisés et retour arrière
  prévu par le moteur de déploiement ;
- catalogue de bases de données et modèles de services uniquement sur une
  infrastructure de test jetable.

### Exploitation et back-office

- notifications email/Slack dans le cadre des tests privés ;
- comptes staff `ROOT`, `ADMIN`, `OPERATOR`, séparés des utilisateurs clients ;
- invitation/activation staff, récupération du mot de passe, sessions
  révocables, journal d'audit et MFA selon la politique de rôle ;
- assistance staff en lecture seule, avec motif, durée limitée et audit.

## Explicitement hors périmètre

- souscription, paiement, facturation commerciale et quotas contractuels ;
- tarifs publics ;
- documentation publique historique ;
- mentions légales, conditions et politique de confidentialité non validées ;
- authentification Google ;
- Gitea ;
- infrastructure cloud achetée ou provisionnée par Sovrack ;
- environnements éphémères automatiques de merge request ;
- services Docker Compose, workers et cron en libre-service ;
- automatisation d'un fournisseur DNS ;
- volumes persistants et sauvegardes applicatives vendus comme un service ;
- webhooks sortants génériques, Discord et jetons API personnels ;
- page de statut publique.

## Règles d'interface

- le site public peut décrire factuellement les parcours inclus et doit afficher
  clairement « Bêta privée » ;
- `/pricing`, `/docs` et `/legal` restent des pages neutralisées tant que leur
  contenu n'est pas validé ;
- une fonctionnalité hors périmètre ne doit pas être présentée comme disponible,
  facturable ou garantie ;
- « Enterprise » pourra devenir un niveau d'offre, mais n'est jamais un type
  d'identité ou de workspace ;
- l'enum des workspaces reste uniquement `PERSONAL | ORGANIZATION`.

## Critères de sortie de bêta

La bêta ne peut évoluer vers une ouverture générale qu'après : validation des
contenus juridiques et commerciaux, rotation des secrets, 2FA GitLab, sauvegarde
hors site restaurée en exercice, alertes réellement reçues, test de rollback,
E2E navigateur sur les trois domaines, correction des vulnérabilités bloquantes
et décision formelle de release.
