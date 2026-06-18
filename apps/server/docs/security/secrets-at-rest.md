# Secrets at rest — platform backend

Audit du chiffrement des secrets stockés en base (T5). Schéma de chiffrement :
`CryptoService` (`src/core/crypto/crypto.service.ts`) — AES-256-CBC, clé dérivée
en SHA-256 de `CONFIG_SECRET`, IV aléatoire de 16 octets par valeur, sortie
base64. Fallback de déchiffrement legacy (CryptoJS) pour les anciennes valeurs.

## Champs chiffrés (vérifié dans le code)

| Modèle.champ | Service (write → encrypt / read → decrypt) |
|--------------|--------------------------------------------|
| `Server.sshKey` | `servers-crypto.service.ts:31` (encrypt) / `:35` (decrypt) |
| `SshKey.encryptedPrivateKey` | `ssh-keys.service.ts` (CryptoService) |
| `GitProviderConfig.applicationSecret` | `git-provider-config.service.ts:203,333` (`encryptOptional`) |
| `GitProviderConfig.adminToken` | `git-provider-config.service.ts:205,335` / decrypt `:167` |
| `GitProviderConfig.oauthAccessToken` | git-provider-config / oauth service / decrypt `:160` |
| `GitProviderConfig.oauthRefreshToken` | git-provider-oauth service |
| `GitProviderRepo.webhookSecret` | `gitlab.adapter.ts:178,183` (`crypto.encrypt`) |
| `DnsProvider.apiToken` | `domains.service.ts:54` (`crypto.encrypt`) |
| `RegistryConfig.password` | `container-registries.service.ts:77,94` / decrypt `:172,200` |
| `DockerConnection.tlsCaCert` | `docker-connections.service.ts` (`crypto.encrypt`) |
| `DockerConnection.tlsClientCert` | idem |
| `DockerConnection.tlsClientKey` | idem |

Couvert par `src/core/crypto/crypto-at-rest.spec.ts` (tests d'intégration gated
`RUN_DB_TESTS=1`).

## ⚠️ Lacunes connues (NON chiffré au repos)

| Modèle.champ | État | Risque |
|--------------|------|--------|
| `Service.secretsEnv` | **plaintext JSON** | secrets applicatifs lisibles en clair en base |
| `Environment.secretsEnv` | **plaintext JSON** | idem |
| `ServiceEnvironment.secretsEnv` | **plaintext JSON** | idem |
| `Service.databaseCredentials` (Json) | **plaintext** | identifiants BDD managée en clair |

Le commentaire du schéma Prisma indique « chiffré au repos » pour `secretsEnv`,
mais **aucun** chemin d'écriture n'appelle `CryptoService.encrypt()` et le moteur
de déploiement lit ces champs en `JSON.parse` direct (sans `decrypt`).
Documenté par le test `Service.secretsEnv is currently stored PLAINTEXT (known gap)`.

**Correction (hors périmètre T5 — feature à part)** : chiffrer `secretsEnv` à
l'écriture (services catalog) et déchiffrer dans `resolveEnvVars` (le résolveur
`env-resolver.util.ts` attend déjà du JSON déchiffré côté appelant — voir sa note
d'en-tête). À faire avec une migration de re-chiffrement des données existantes.

## Rotation de `CONFIG_SECRET`

`CONFIG_SECRET` (≥ 32 caractères) est la **clé maîtresse**. Toute valeur chiffrée
l'est avec une clé dérivée de ce secret.

### Procédure de rotation (à froid, recommandée)
1. **Backup** complet de la base (`pg_dump`).
2. Écrire un script de re-chiffrement : pour chaque champ chiffré, `decrypt`
   avec l'ANCIEN `CONFIG_SECRET` puis `encrypt` avec le NOUVEAU, en transaction.
3. Déployer le backend avec le NOUVEAU `CONFIG_SECRET`.
4. Vérifier qu'un déchiffrement témoin (ex. un `RegistryConfig.password`) réussit.

### ⚠️ Si `CONFIG_SECRET` change SANS re-chiffrement
Toutes les valeurs chiffrées avec l'ancienne clé deviennent **illisibles** :
`CryptoService.decrypt` échoue (puis le fallback legacy lève
`InternalServerErrorException: « Décryptage échoué. Vérifiez CONFIG_SECRET. »`).
Conséquences concrètes : impossibilité de cloner les repos (tokens Git),
de pull les images (registres), de se connecter en SSH/Docker aux serveurs.

**Procédure d'urgence** : restaurer l'ancien `CONFIG_SECRET`, redémarrer, puis
exécuter la rotation à froid ci-dessus. Si l'ancien secret est perdu, les
secrets doivent être re-saisis manuellement (ils sont irrécupérables).
