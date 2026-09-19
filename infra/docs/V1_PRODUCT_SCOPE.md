# Périmètre produit V1

Ce document fixe le contrat fonctionnel public de Sovrack. Une fonction n'est
annoncée que si son parcours est disponible dans l'interface, protégé côté API,
documenté et couvert par la recette locale.

## Identité et espaces de travail

- inscription, vérification d'adresse, connexion et récupération par email ;
- l'email et le mot de passe suffisent pour un compte client ; le MFA client
  n'est jamais une condition d'accès ;
- espace `PERSONAL` pour une personne, sans invitation ;
- espace `ORGANIZATION` avec invitations et rôles ;
- conversion explicite et irréversible d'un espace personnel en organisation ;
- rôles workspace `OWNER`, `ADMIN`, `MEMBER`, permission de facturation
  indépendante et rôles projet `MAINTAINER`, `DEVELOPER`, `VIEWER` ;
- sessions client et back-office isolées sur des domaines et cookies distincts.

## Déploiement V1

- projets et environnements créés explicitement ;
- GitLab et GitHub, GitHub en Personal Access Token uniquement ;
- Dockerfile ou image Docker, y compris registre privé ;
- PostgreSQL, Redis, MySQL, MongoDB et RabbitMQ sous forme de conteneurs sur le
  serveur du client, avec stockage local, identifiants chiffrés et connexion
  interne aux applications du projet ; la sauvegarde, la restauration, la
  capacité disque, la haute disponibilité et la reprise restent explicitement
  sous la responsabilité du client ;
- serveur Ubuntu fourni par le client et accessible par SSH ;
- validation et préparation guidée du serveur ;
- déclenchement par webhook entrant ;
- domaine personnalisé et HTTPS après configuration DNS manuelle ;
- suivi d'état, logs, métriques disponibles et terminal selon le rôle.

## Site et assistance

- site public, documentation, page de sécurité, état instantané et pages
  juridiques ;
- accès gratuit V1 affiché sans carte bancaire ni abonnement automatique ;
- `contact@sovrack.tech` est l'unique adresse de contact publique.

## Fonctions planifiées et non exposées

- paiement et facturation en libre-service ;
- Google, Gitea et GitHub OAuth ;
- infrastructure managée par Sovrack ;
- modèles de services ;
- Docker Compose, workers, cron et environnements éphémères ;
- automatisation serveur générale et automatisation DNS ;
- volumes ou sauvegardes vendus comme services ;
- rollback public, notifications client Slack/email, webhooks sortants,
  Discord et jetons API personnels.

## Règles de promotion

Une fonction planifiée devient disponible uniquement après validation du
parcours complet, tests automatisés, recette sur infrastructure jetable,
documentation et décision produit écrite. La production reste une opération
humaine distincte de la recette locale.
