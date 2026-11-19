# Contrat produit V1

## Objectif

Sovrack est présenté comme un produit public normal. Le site, la console et
l'API doivent décrire uniquement des parcours disponibles, testés et maintenus.
Il n'existe aucun badge « bêta » ou « produit final » dans l'interface.

La source de vérité exécutable est
`src/shared/config/product-capabilities.ts`. Une capacité `available` peut être
présentée et utilisée. Une capacité `planned` reste masquée dans l'interface et
refusée côté API lorsqu'une ancienne route existe encore.

## Périmètre public

- compte par email et mot de passe, vérification et récupération par email ;
- MFA client non obligatoire : email et mot de passe suffisent toujours ;
- espaces personnels et organisations ;
- projets, environnements et serveurs fournis par le client ;
- GitHub par Personal Access Token et GitLab par jeton d'accès ;
- applications issues d'un dépôt, d'un Dockerfile ou d'une image Docker ;
- PostgreSQL, Redis, MySQL, MongoDB et RabbitMQ avec volume persistant interne,
  identifiants générés et connexion automatique aux applications du projet ;
- registres privés, domaines avec DNS manuel, HTTPS, déploiements, logs,
  métriques disponibles et terminal selon les permissions ;
- site, documentation, sécurité, tarifs, statut et pages juridiques publics.

## Capacités planifiées et masquées

- facturation en libre-service et plans payants ;
- authentification Google, Gitea et GitHub OAuth ;
- infrastructure achetée ou provisionnée par Sovrack ;
- modèles, Docker Compose, workers et cron ;
- automatisation serveur générale, automatisation DNS et previews de merge
  request ;
- volumes persistants vendus comme service et sauvegardes applicatives ;
- rollback public tant que sa reprise durable n'est pas qualifiée ;
- notifications client Slack/email, webhooks sortants, Discord et jetons API
  personnels.

## Condition d'activation

Une capacité ne passe de `planned` à `available` qu'après :

1. un parcours fonctionnel complet ;
2. des tests automatisés et un test d'acceptation sur infrastructure jetable ;
3. des états d'erreur et de reprise explicites ;
4. une documentation fidèle à l'implémentation ;
5. une décision produit explicite sur son niveau de support.
