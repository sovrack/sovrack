# Préparation de la release Sovrack v3.1.0

Qualification locale initiale : 19 septembre 2026.

État GitLab, DNS et artefacts revérifié : 25 septembre 2026.

Ce document distingue les preuves reproductibles déjà obtenues des contrôles
qui nécessitent encore la messagerie ou la VM de production. Il ne remplace ni
la checklist de production ni l'approbation explicite du job de promotion.

## Sources et artefacts immuables

- backend `main` : `6704ebd093d6ac10684f6469e82d96085c83ee71` ;
- image backend :
  `registry.gitlab.com/deploy-automation/deploy-automation-backend:6704ebd093d6ac10684f6469e82d96085c83ee71` ;
- digest observé de l'image backend :
  `sha256:3bfb73d431ae0e91af7d5de77fc116d05ad35ffbecad0cf023aed2f088c5bb5c` ;
- frontend `main` : `1918b9c0e3ac5d6841566159fcacba7be1105938` ;
- image frontend :
  `registry.gitlab.com/deploy-automation/deploy-automation-frontend:1918b9c0e3ac5d6841566159fcacba7be1105938` ;
- digest observé de l'image frontend :
  `sha256:004ea48112c20b3da628cbffa39a53a784cb6961ffb97e76b3c079f68451a544` ;
- baseline technique infrastructure qualifiée avant le gel documentaire :
  `5d26f8b2ef900901c9a29833d3ea0ed314566136` ;
- dernière migration attendue :
  `20260918130000_disable_unsigned_legacy_webhooks` ;
- SHA-256 du contrat OpenAPI :
  `3b1293de0628f44241ee7144900c1a15a17d1a5694947794ac584cd029ff1ca8` ;
- version applicative : `3.1.0` ;
- topologie cible sur le VPS actuel : `compact`.

Les variables GitLab protégées `BACKEND_COMMIT`, `BACKEND_IMAGE`,
`FRONTEND_COMMIT`, `FRONTEND_IMAGE`, `OPENAPI_SHA256`, `SCHEMA_MIGRATION` et
`RUNTIME_TOPOLOGY` ont été alignées sur ces valeurs le 25 septembre 2026. Les
images locales ne sont jamais promues.

## Pipelines et preuves archivées

- backend pipeline `2863795382` : réussi sur le commit exact ;
- frontend pipeline `2863710629` : réussi sur le commit exact ;
- infrastructure pipeline `2864093335` : réussi sur `main` ;
- OpenAPI : artefact du job backend `16603956114`, hash identique à celui du
  manifeste ;
- SBOM backend CycloneDX 1.7 : artefact du job `16603956117`, 429 composants,
  SHA-256
  `b7b644ff1b7b5d3505dbc4d452736d8ba342fe3c6dae95a6cccea3295f29e813` ;
- SBOM frontend CycloneDX 1.7 : artefact du job `16603507278`, 149 composants,
  SHA-256
  `ac259d37a6569a0879e4026e500e2633815d35dcb4d35d588105ba7c100c8d11` ;
- les deux SBOM sont conservés comme artefacts GitLab pendant un an ;
- les scans des deux images n'ont trouvé aucune vulnérabilité HIGH/CRITICAL
  bloquante et les deux jobs `security:image` ont réussi.

## Contrôles réussis

- backend : architecture, lint, formatage, compilation et export OpenAPI ;
- backend : 243 suites et 2 080 tests unitaires/intégration réussis avec les
  tests PostgreSQL activés, sans test ignoré ;
- backend E2E : 13 suites et 58 tests réussis ;
- migrations : 122 migrations rejouées sur base vide, mise à niveau d'une base
  historique, retrait de `SUPER_ADMIN` et échec transactionnel contrôlé ;
- frontend : architecture, lint, types, 58 fichiers et 307 tests réussis ;
- couverture frontend : 78,67 % déclarations, 73,24 % branches, 78,37 %
  fonctions et 80,5 % lignes ;
- frontend : build de production réussi, 58 routes générées ;
- contrat : types frontend régénérés à partir du contrat backend ;
- recette navigateur locale : 10 parcours réussis sur `sovrack.localhost`,
  `app.sovrack.localhost` et `staff.sovrack.localhost` ;
- performances locales : Mon compte p95 331,27 ms et Workspaces p95
  326,33 ms, pour un budget de 3 000 ms ;
- runtime : migrations, healthchecks, racines en lecture seule, suppression des
  capabilities, `no-new-privileges`, limites PID, en-têtes de sécurité et
  limitation de débit d'authentification validés ;
- dépendances et images : audits npm et scans Trivy HIGH/CRITICAL réussis ;
- infrastructure : syntaxe, manifeste, maintenance Nginx, promotion immuable,
  durcissement des conteneurs et sauvegarde/restauration jetables réussis ;
- les Merge Requests backend `!9`, frontend `!6` et infrastructure `!13` sont
  fusionnées dans leurs branches `main` protégées.

Les parcours navigateur confirment notamment la séparation des trois domaines,
les cookies client/staff host-only, les espaces personnels et organisations,
la MFA client facultative, le back-office isolé, GitHub PAT, GitLab, les bases
de données conteneurisées et l'absence d'Automation dans la V1 publique.

## État DNS et messagerie observé

- les enregistrements A et AAAA de l'apex, `app` et `staff` pointent vers la
  cible annoncée ;
- le certificat public actuel couvre l'apex, `www`, `app` et `staff` ;
- SPF, MX et les deux sélecteurs DKIM OVH sont publiés ;
- `_dmarc.sovrack.tech` est publié sur les serveurs OVH et résolu par
  Cloudflare et Google avec la politique de surveillance suivante :
  `v=DMARC1; p=none; rua=mailto:contact@sovrack.tech; adkim=s; aspf=s; pct=100` ;
- les MX OVH `mx0`, `mx1`, `mx2` et `mx3` sont résolus ;
- la version actuellement servie n'est pas encore v3.1.0.

La présence de DNS valides ne prouve pas un envoi et une réception de bout en
bout. Ce contrôle exige l'accès réel à la boîte `contact@sovrack.tech`.

## Contrôles restant avant production

1. Tester réellement `contact@sovrack.tech` : réception externe, envoi SMTP,
   vérification d'adresse et récupération du compte ROOT. Conserver les
   en-têtes du message reçu pour contrôler SPF, DKIM et DMARC.
2. Fournir et valider le nom légal complet de l'éditeur, son adresse, son
   identifiant légal éventuel et l'identité/adresse de l'hébergeur. Ces données
   doivent remplacer les mentions génériques sans être inventées.
3. Confirmer sur la VM que les cinq secrets de production sont présents,
   suffisamment longs et distincts, sans afficher leurs valeurs. Les runners
   et deploy tokens séparés sont déjà opérationnels dans les pipelines.
4. Exécuter sur la VM la qualification de capacité/topologie `compact`, le
   test de charge, le renouvellement TLS en dry-run et la restauration d'une
   sauvegarde chiffrée hors VPS.
5. `v3.1.0-rc.1` a été rejetée car le daemon de qualification ne recevait
   pas l'authentification du registre privé. `v3.1.0-rc.2` a ensuite validé
   le pull, les migrations et les healthchecks, mais sa sonde HTTPS visait le
   loopback du job au lieu du daemon DinD. Produire et qualifier
   `v3.1.0-rc.3` après correction, sans remplacer les tags RC rejetés.
6. Créer `v3.1.0` seulement après validation de la RC, puis approuver le job
   GitLab manuel `deploy:production`.
7. Exécuter les smoke tests et archiver le compte-rendu post-release prévu par
   `PRODUCTION_CHECKLIST.md`.

Tant que les contrôles 1 à 4 ne sont pas clos, la RC peut être construite et
qualifiée, mais la promotion de production ne doit pas être lancée.
