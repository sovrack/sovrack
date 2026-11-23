# Certificats SSL Wildcard & Challenge DNS-01 Let's Encrypt

Sovrack intègre la génération automatisée de certificats SSL/TLS gratuits délivrés par l'autorité **Let's Encrypt**.

Pour les domaines simples (`app.mondomaine.com`), le challenge standard **HTTP-01** est utilisé via Traefik. Pour sécuriser l'ensemble de vos sous-domaines à la volée avec un certificat **Wildcard (`*.mondomaine.com`)**, Sovrack prend en charge le challenge **DNS-01**.

---

## 🛡️ HTTP-01 vs DNS-01

| Critère | Challenge HTTP-01 | Challenge DNS-01 (Recommandé) |
| :--- | :--- | :--- |
| **Certificats Wildcard (`*.domaine.com`)** | ❌ Impossible | ✅ **Supporté à 100%** |
| **Serveurs privés / sans port 80 ouvert** | ❌ Échoue (Let's Encrypt doit joindre le port 80) | ✅ **Fonctionne sans aucun port ouvert** |
| **Validation** | Fichier webroot `/.well-known/acme-challenge/` | Création temporaire d'un enregistrement TXT DNS |
| **Fournisseurs supportés** | Tous | **Cloudflare, OVH, DigitalOcean, Route53** |

---

## ⚙️ Configuration d'un Fournisseur DNS

### 1. Cloudflare
1. Connectez-vous sur votre tableau de bord Cloudflare.
2. Rendez-vous dans **Mon Profil > Jetons d'API (API Tokens) > Créer un jeton**.
3. Utilisez le modèle **Modifier la zone DNS (Edit zone DNS)** avec les permissions :
   - `Zone - DNS - Edit`
   - `Zone - Zone - Read`
4. Dans Sovrack :
   - Rendez-vous dans **Réglages > Fournisseurs DNS**.
   - Cliquez sur **Nouveau Fournisseur** et sélectionnez `CLOUDFLARE`.
   - Collez votre `apiToken`.

### 2. OVH Telecom
Pour OVH, générez vos clés d'API via [OVH Token Generator](https://api.ovh.com/createToken/) :
- `Application Key`
- `Application Secret`
- `Consumer Key`

### 3. DigitalOcean
Générez un **Personal Access Token** avec les droits d'écriture sur les domaines dans l'espace Networking.

---

## 🚀 Génération du Certificat Wildcard

Une fois votre fournisseur DNS configuré :
1. Accédez à votre Service > Onglet **Domaines**.
2. Entrez votre domaine wildcard : `*.mondomaine.com`.
3. Cliquez sur **Ajouter**.
4. Sovrack communique avec l'API DNS pour publier automatiquement le record `_acme-challenge.mondomaine.com`, valide le challenge auprès de Let's Encrypt et injecte le certificat dans Traefik.
5. Tous les sous-domaines (ex: `api.mondomaine.com`, `admin.mondomaine.com`, `pr-1.mondomaine.com`) sont instantanément sécurisés en HTTPS sans action manuelle supplémentaire.
