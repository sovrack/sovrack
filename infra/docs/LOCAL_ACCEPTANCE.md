# Recette sur la VM locale

La VM locale est l'environnement d'acceptation. Le poste hôte reste consacré au
développement et ne doit héberger ni surveillance permanente ni sauvegarde de
production de référence.

## Flux

1. Cloner les trois dépôts sur la VM et sélectionner les commits candidats.
2. Lancer `make local-up` depuis le dépôt infra.
3. Vérifier les trois plans sur leurs vrais noms d'hôte locaux :
   `http://sovrack.localhost:13080`,
   `http://app.sovrack.localhost:13080` et
   `http://staff.sovrack.localhost:13080`. Le suffixe `.localhost` pointe vers
   la boucle locale sans modification de `/etc/hosts`. Mailpit reste sur
   `http://localhost:18025`.
4. Tester inscription personnelle, inscription organisation, conversion,
   invitations, rôles projet, activation/récupération staff, enrôlement TOTP,
   codes de secours et impersonation. Pour l'impersonation, vérifier le motif
   obligatoire, le bandeau, la lecture autorisée, les écritures/WebSockets
   refusés, la révocation serveur à la sortie et la préservation de la session
   réelle du client.
5. Exécuter les tests frontend/backend ainsi que `make test-scripts`.
   Depuis le dépôt frontend, `npm run test:browser` valide les domaines, les
   redirections, l'isolation des cookies, les comptes client/staff et les trois
   thèmes. `npm run perf:local` mesure les pages Mon compte et Workspaces et
   écrit son rapport sous `test-results/`.
6. Arrêter avec `make local-down`; conserver les volumes seulement pour le
   diagnostic. `make local-reset` ne vise que la stack `sovrack-local`.

Les mots de passe du seed sont exclusivement des fixtures locales. La recette
n'envoie aucun email Internet et ne contacte jamais le VPS de production.

## Comptes de recette locaux

- Client propriétaire : `owner@sovrack.test` / `Local-Client-2026!`.
- Administrateur back-office : `admin.staff@sovrack.test` /
  `Local-Admin-2026!`.
- Le secret TOTP de recette pour ROOT et ADMIN est
  `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP`. Il peut être ajouté manuellement dans
  une application d'authentification compatible TOTP.

Ces identifiants sont fixes afin que la recette navigateur soit reproductible.
Ils ne doivent jamais être copiés dans un environnement distant ou de
production. `make local-up` réinitialise uniquement les comptes fixtures avec
ces valeurs et remet leur compteur TOTP local à zéro.

La recette réussie autorise la création d'un tag candidat, pas la production.
La promotion stable exige encore la checklist, les sauvegardes hors site et une
décision humaine dans GitLab.

Le périmètre fonctionnel accepté est figé dans
[`V1_PRODUCT_SCOPE.md`](V1_PRODUCT_SCOPE.md). Les pages publiques (tarifs,
documentation, statut, sécurité et juridique) doivent être accessibles sur le
domaine public, tandis que les consoles client et staff restent non indexables.
