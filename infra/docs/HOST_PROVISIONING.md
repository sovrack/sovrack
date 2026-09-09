# Préparer un nouveau VPS depuis le dépôt infra

Le playbook `ansible/playbooks/prepare-host.yml` transforme une Ubuntu 22.04+
vierge en hôte Sovrack reproductible. Il installe Docker depuis le dépôt
officiel, Compose, UFW, fail2ban, les mises à jour automatiques, une swap bornée,
un opérateur dédié et l'arborescence de releases.

## 1. Préparer l'accès sans secret dans Git

Copier `ansible/inventory.example.yml` en dehors du dépôt ou vers un fichier
ignoré, remplacer l'adresse et l'utilisateur de bootstrap, puis conserver la
clé privée hors du workspace. Ajouter la clé publique de l'opérateur via une
variable Ansible (`--extra-vars @fichier-prive.yml`), jamais dans l'inventaire
versionné.

## 2. Vérifier puis appliquer

```bash
make host-dependencies
make host-syntax
make host-prepare INVENTORY=/chemin/inventory.yml PRIVATE_KEY=/chemin/bootstrap_ed25519
```

Faire un premier passage avec `sovrack_disable_ssh_password_auth=false`.
Tester une nouvelle connexion SSH avec la clé du compte `sovrack`. Faire
ensuite un second passage avec la variable à `true`. Cette séquence évite de se
verrouiller hors du VPS.

## 3. Installer l'état applicatif

Créer `/srv/sovrack/shared/.env` en mode `0600` par un mécanisme secret, puis
laisser la pipeline envoyer uniquement le bundle de release. Le dépôt et le
bundle ne contiennent jamais les valeurs de JWT, SMTP, base, Restic ou registre.

Le playbook ne touche pas à DNS, à OVH ou à GitLab. Les DNS des trois domaines,
les variables CI protégées et les destinataires d'alerte restent des opérations
de contrôle séparées.

## 4. Idempotence et contrôle

Le playbook peut être rejoué après une reconstruction. Avant toute production,
exécuter `--check --diff`, relire les changements Docker/SSH/UFW, puis appliquer.
Un clone du dépôt suffit donc à retrouver les déclarations, tests et runbooks ;
les secrets et sauvegardes restent volontairement externes.
