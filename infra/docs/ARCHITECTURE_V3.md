# Architecture cible Sovrack v3

## Séparation des plans web

Une seule release frontend peut servir trois hôtes, mais chaque hôte a une
responsabilité et des cookies host-only distincts :

```text
sovrack.tech        site public, documentation et pages légales
app.sovrack.tech    authentification et console des clients
staff.sovrack.tech  authentification et back-office Sovrack
```

Nginx termine TLS pour les trois domaines avec un certificat SAN, refuse les
Host headers inattendus et transmet l'hôte original à Next.js. Le middleware
Next.js impose ensuite le plan correspondant. `www.sovrack.tech` est seulement
une redirection vers le domaine public canonique.

`AUTH_COOKIE_DOMAIN` et `STAFF_AUTH_COOKIE_DOMAIN` doivent rester absents : le
navigateur crée alors des cookies host-only. Une session client ne voyage pas
vers le back-office et une session staff ne voyage pas vers le site public.

L'impersonation ne partage aucun cookie. Le staff crée un grant aléatoire de
60 secondes, accompagné d'un motif obligatoire, dont seul le hash est en base.
Le jeton brut est transporté dans un fragment d'URL, échangé une fois sur
`app.sovrack.tech`, puis remplacé par une session client limitée à 15 minutes.
Cette session est en lecture seule, ne peut pas ouvrir un canal WebSocket et
affiche un bandeau permanent. Sa création, son échange et sa fin sont
journalisés. « Quitter la session » la termine aussi côté serveur sans révoquer
les sessions légitimes du client.

## Modèle métier

```text
User (identité)
  └─ Team/Workspace
       ├─ PERSONAL      un propriétaire, aucune invitation
       └─ ORGANIZATION  collaboration et invitations
             └─ Projects ─ Environments ─ Services ─ Deployments
```

Un utilisateur possède au maximum un workspace `PERSONAL`, mais peut appartenir
à plusieurs organisations. La conversion `PERSONAL -> ORGANIZATION` est
explicite et irréversible ; elle active la collaboration. `Enterprise` est un
plan commercial, jamais un type d'identité ou de workspace.

Les rôles workspace sont `OWNER`, `ADMIN`, `BILLING`, `MEMBER`. Les rôles projet
sont `MAINTAINER`, `DEVELOPER`, `VIEWER`. Un `ADMIN` workspace administre les
opérations, mais ne lit pas automatiquement les secrets : cette action exige une
affectation projet `MAINTAINER`. Le back-office utilise un modèle entièrement
séparé : `ROOT`, `ADMIN`, `OPERATOR`.

## Runtime et données

```text
Internet -> Nginx :80/:443 -> Frontend Next.js
                              Backend NestJS -> PostgreSQL
                                             -> Redis/BullMQ
```

Le mode `compact` réunit API et tâches asynchrones pour un petit VPS. Le mode
`split` ajoute un worker lorsque la RAM et la charge le permettent. PostgreSQL
et Redis ne sont joignables que par le réseau Docker et les ports loopback de
l'hôte. Le migrateur est un conteneur one-shot exécuté avant la promotion.

## Chaîne de livraison

Le code est validé dans les dépôts backend/frontend. Les images sont publiées
avec un tag de commit immuable. Le dépôt infra produit un bundle liant : commits,
digests d'images, migration cible et hash OpenAPI. Seul un tag stable SemVer peut
déclencher manuellement la production. La recette s'effectue d'abord sur la VM
locale avec `docker-compose.dev.yml`; aucune pseudo-staging publique n'est
nécessaire dans l'organisation actuelle.
