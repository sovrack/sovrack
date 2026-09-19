# Préparation de la release Sovrack v3.1.0

Date de qualification locale : 19 septembre 2026.

Ce document sépare les contrôles reproductibles déjà réussis des opérations
externes qui nécessitent GitLab, OVH, la messagerie ou la VM de production. Il
ne remplace ni la checklist de production ni l'approbation humaine du job de
promotion.

## Sources candidates

- backend : `3247879` (branche candidate incluant
  `feat(v3.1): finalize GA identity and security`) ;
- frontend : `a7d87c9` (branche candidate incluant
  `feat(v3.1): finalize public and workspace experience`) ;
- infrastructure : branche `release/v3.1.0-ga` ;
- dernière migration attendue :
  `20260918130000_disable_unsigned_legacy_webhooks` ;
- version applicative : `3.1.0` ;
- topologie cible sur le VPS actuel : `compact`.

Les deux images applicatives doivent être reconstruites par GitLab depuis les
commits ci-dessus et référencées dans le manifeste par leur tag SHA Git de
40 caractères. Les images locales ne doivent jamais être promues.

## Contrôles réussis localement

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
- contrat : OpenAPI exporté depuis le backend puis types frontend régénérés ;
- recette navigateur : 10 parcours réussis sur `sovrack.localhost`,
  `app.sovrack.localhost` et `staff.sovrack.localhost` ;
- performances locales : Mon compte p95 331,27 ms et Workspaces p95
  326,33 ms, pour un budget de 3 000 ms ;
- runtime : migrations, healthchecks, racines en lecture seule, suppression des
  capabilities, `no-new-privileges`, limites PID, en-têtes de sécurité et
  limitation de débit d'authentification validés ;
- dépendances et images : audits npm et scans Trivy HIGH/CRITICAL sans résultat ;
- scripts infrastructure : syntaxe, manifeste, maintenance Nginx, promotion
  immuable et sauvegarde/restauration jetables réussis.

Les parcours navigateur confirment notamment la séparation des trois domaines,
les cookies client/staff host-only, les espaces personnels et organisations,
la MFA client facultative, le back-office isolé, GitHub PAT, GitLab, les bases
de données conteneurisées et l'absence d'Automation dans la V1 publique.

## État externe observé avant promotion

- les enregistrements A et AAAA de l'apex, `app` et `staff` pointent vers la
  cible annoncée ;
- le certificat public couvre l'apex, `www`, `app` et `staff` ;
- les endpoints publics actuels répondent et le backend est prêt ;
- SPF, MX et les deux sélecteurs DKIM OVH sont publiés ;
- aucun enregistrement DMARC n'a été observé lors de la qualification ;
- la version actuellement servie n'est pas cette release candidate.

## Bloquants externes avant RC et production

1. Faire approuver et fusionner les Merge Requests backend, frontend et
   infrastructure après réussite de leurs pipelines GitLab.
2. Archiver les SBOM et confirmer qu'aucun résultat HIGH/CRITICAL n'est accepté
   sans décision écrite.
3. Fournir puis valider le nom légal complet de l'éditeur, son adresse, son
   identifiant légal éventuel et l'identité/adresse de l'hébergeur. Ces données
   doivent remplacer les mentions génériques sans être inventées.
4. Publier une politique DMARC de surveillance adaptée à la boîte qui recevra
   les rapports, puis contrôler sa résolution DNS.
5. Tester réellement `contact@sovrack.tech` : réception, envoi SMTP,
   vérification d'adresse, récupération client et récupération ROOT.
6. Vérifier les cinq secrets de production distincts, les runners séparés et
   les deploy tokens `read_registry` limités et expirables.
7. Exécuter sur la VM la qualification de capacité/topologie `compact`, le test
   de charge, le renouvellement TLS en dry-run et la restauration d'une
   sauvegarde chiffrée hors VPS.
8. Produire et qualifier `v3.1.0-rc.1` avec les images SHA exactes. Corriger par
   une nouvelle RC en cas d'échec ; ne jamais remplacer une RC existante.
9. Créer `v3.1.0` seulement après validation de la RC, puis faire approuver le
   job GitLab manuel `deploy:production`.
10. Exécuter les smoke tests et archiver le compte-rendu post-release prévu par
    `PRODUCTION_CHECKLIST.md`.

Tant que ces points ne sont pas clos, le candidat est techniquement qualifié en
local mais ne doit pas être présenté comme déployé en production.
