# Préparation de la release Sovrack v3.1.0

Qualification locale initiale : 19 septembre 2026.

État GitLab, DNS et artefacts revérifié : 29 septembre 2026.

Ce document distingue les preuves reproductibles obtenues avant la release, la
promotion effectivement réalisée et les contrôles externes qui nécessitent
encore la messagerie, l'identité légale ou la VM de sauvegarde hors VPS.

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
- infrastructure qualifiée par la release candidate :
  `4acc4697d25a9b458f2ef0ce8838b7579884affc` ;
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
- infrastructure pipeline `2883384969` : réussi sur `main` ;
- release candidate `v3.1.0-rc.3`, pipeline `2883393015` : les cinq jobs
  Compose, shell, intégration Docker, qualification runtime et packaging ont
  réussi sur le commit exact ;
- bundle du job `16742819241` : SHA-256
  `840a5811cd23938b6a0a8ecd7bd97828089686f94b4062c6d282d7c8d0677053`,
  manifeste extrait et revérifié ;
- tag final protégé `v3.1.0` : commit infrastructure
  `d3a4deea1ca964a204b6b86eec947c2783ecd05d` ;
- pipeline finale `2893047256` : qualification et packaging réussis ;
- bundle final du job `16805633719` : SHA-256
  `661e43aa1913d005011b22c5bcb4061d1520d66aba2550c95b0c3ffc5171eedb`,
  manifeste extrait et vérifié ;
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
- les Merge Requests backend `!9`, frontend `!6` et infrastructure `!13`,
  `!14`, `!15` et `!16` sont fusionnées dans leurs branches `main`
  protégées ;
- `v3.1.0-rc.1` et `v3.1.0-rc.2` restent conservées comme RC rejetées ;
  `v3.1.0-rc.3` corrige leurs deux causes d'échec sans remplacer leurs tags.

Les parcours navigateur confirment notamment la séparation des trois domaines,
les cookies client/staff host-only, les espaces personnels et organisations,
la MFA client facultative, le back-office isolé, GitHub PAT, GitLab, les bases
de données conteneurisées et l'absence d'Automation dans la V1 publique.

## État DNS et messagerie observé

- les enregistrements A et AAAA de l'apex, `app` et `staff` pointent vers la
  cible annoncée ;
- le certificat public actuel couvre l'apex, `www`, `app` et `staff` ;
- SPF, MX et les deux sélecteurs DKIM OVH sont publiés ;
- `_dmarc.sovrack.com` est publié sur les serveurs OVH et résolu par
  Cloudflare et Google avec la politique de surveillance suivante :
  `v=DMARC1; p=none; rua=mailto:contact@sovrack.com; adkim=s; aspf=s; pct=100` ;
- les MX OVH `mx0`, `mx1`, `mx2` et `mx3` sont résolus ;
- la version servie est `v3.1.0` depuis le 29 septembre 2026.

La présence de DNS valides ne prouve pas un envoi et une réception de bout en
bout. Ce contrôle exige l'accès réel à la boîte `contact@sovrack.com`.

## Promotion de production du 29 septembre 2026

- job protégé `deploy:production` `16805888615` réussi ;
- préflight réel : manifeste strict, secrets présents, distincts et
  suffisamment longs, Docker valide, 3 819 MiB de RAM et 23 991 MiB de disque
  disponibles ;
- sauvegarde pré-release
  `sovrack-20260929-113616Z-08HcRa.sql.gz` validée par checksum et test gzip ;
- migrations appliquées jusqu'à
  `20260918130000_disable_unsigned_legacy_webhooks` ;
- backend, frontend, Nginx, PostgreSQL et Redis healthy, avec zéro redémarrage
  et une racine en lecture seule ;
- maintenance retirée et release `v3.1.0` activée atomiquement ;
- dry-run Let's Encrypt réussi pour `sovrack.com`, `www`, `app` et `staff`,
  puis Nginx revenu healthy ;
- smoke tests HTTP/TLS réussis sur les trois domaines et l'API ;
- trois parcours Playwright de production réussis : site public, isolation des
  trois hôtes et contrat d'inscription Personnel/Organisation ;
- charge post-release bornée : 60/60 requêtes publiques réussies (p95 605 ms)
  et 60/60 healthchecks réussis (p95 235 ms), concurrence 5 ;
- timers locaux de sauvegarde PostgreSQL et de renouvellement TLS actifs ;
- release GitLab `Sovrack v3.1.0` publiée.

## Contrôles externes restant à clôturer

1. Tester réellement `contact@sovrack.com` : réception externe, envoi SMTP,
   vérification d'adresse et récupération du compte ROOT. Conserver les
   en-têtes du message reçu pour contrôler SPF, DKIM et DMARC.
2. Fournir et valider le nom légal complet de l'éditeur, son adresse, son
   identifiant légal éventuel et l'identité/adresse de l'hébergeur. Ces données
   doivent remplacer les mentions génériques sans être inventées.
3. Exécuter et archiver depuis la VM d'exploitation distincte la copie Restic
   chiffrée hors VPS, `restic check` et la restauration isolée. Ce timer ne doit
   pas être installé sur le VPS applicatif lui-même.
4. Compléter la mesure courte par un test d'endurance planifié avec seuils
   d'alerte, sans utiliser de comptes ou données clients.

Ces points ne modifient pas l'identité du bundle promu. Les points 1 et 2
exigent des informations humaines qui ne peuvent pas être inventées ; le point
3 exige l'accès à une machine physiquement distincte du VPS applicatif.
