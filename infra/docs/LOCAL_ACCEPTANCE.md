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

La recette réussie autorise la création d'un tag candidat, pas la production.
La promotion stable exige encore la checklist, les sauvegardes hors site et une
décision humaine dans GitLab.

Le périmètre fonctionnel accepté est figé dans
[`PRIVATE_BETA_SCOPE.md`](PRIVATE_BETA_SCOPE.md). Les pages tarifs,
documentation et juridique doivent conserver leur écran neutralisé pendant
toute cette recette.
