# Sovrack Agent : Guide d'Installation et Architecture

L'Agent Sovrack est un démon ultra-léger développé en **Go** (binaire autonome de ~15 Mo, empreinte mémoire < 20 Mo) conçu pour piloter les serveurs et flottes VPS sans aucune dépendance SSH entrante.

---

## 🎯 Pourquoi l'Agent Sovrack ?

Traditionnellement, les outils d'orchestration et PaaS (Ansible, CapRover) imposent d'ouvrir le **port SSH entrant (port 22)** et d'attribuer une adresse IP publique routable au serveur.

Ce modèle présente des limitations critiques en environnement professionnel :
- **Serveurs derrière NAT / BOX opérateur** : Inaccessibles directement depuis l'extérieur.
- **Pare-feux d'entreprise stricts** : Blocage de tous les ports entrants non autorisés.
- **Réseaux privés et VPN** : Nécessite la configuration complexe de tunnels VPN ou de bastions SSH.

### La Solution Sovrack Agent
L'Agent Sovrack fonctionne en **mode sortant strict (Outbound Only)** :
1. Dès son démarrage, l'agent établit une connexion **WebSocket sécurisée (WSS sur port standard 443)** vers la passerelle Sovrack (`wss://app.sovrack.com/agent-tunnel`).
2. Aucun port n'est ouvert sur le serveur client.
3. Toutes les commandes de déploiement, streaming de logs Docker et remontées de métriques transitent dans ce tunnel chiffré TLS bidirectionnel.

```
+-----------------------------------------------------------+
|                      SOVRACK PLATFORM                     |
|                   (app.sovrack.com:443)                   |
+-----------------------------------------------------------+
                             ▲
                             │ WSS /agent-tunnel (Port 443 Sortant)
                             │ Chiffré TLS 1.3 + Token Bearer
+-----------------------------------------------------------+
|                     SERVEUR CLIENT                        |
|                                                           |
|    +------------------+         +--------------------+    |
|    |  Sovrack Agent   | <-----> |   Docker Socket    |    |
|    |     (Go Bin)     |         |  /var/run/docker   |    |
|    +------------------+         +--------------------+    |
|             │                                             |
|             ▼                                             |
|     Métriques Système                                     |
|    (CPU, RAM, Disque)                                     |
+-----------------------------------------------------------+
```

---

## 🚀 Installation Rapide (1-Liner)

Sur votre serveur Linux (Ubuntu 20.04+, Debian 11+, Rocky Linux, Alpine) :

```bash
curl -fsSL https://raw.githubusercontent.com/sovrack/agent/main/install.sh | sudo bash -s -- \
  --server=https://app.sovrack.com \
  --token=VOTRE_TOKEN_SERVEUR
```

### Ce que fait le script d'installation :
1. Télécharge la dernière version binaire précompilée selon votre architecture (`x86_64` ou `arm64`).
2. Installe le binaire dans `/usr/local/bin/sovrack-agent`.
3. Configure et active le service systemd `/etc/systemd/system/sovrack-agent.service`.
4. Démarre l'agent et valide la liaison avec votre cluster Sovrack.

---

## ⚙️ Déploiement via Docker

Si vous préférez exécuter l'agent dans un conteneur isolé :

```bash
docker run -d \
  --name sovrack-agent \
  --restart unless-stopped \
  --network host \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e SOVRACK_SERVER_URL=https://app.sovrack.com \
  -e SOVRACK_TOKEN=VOTRE_TOKEN_SERVEUR \
  ghcr.io/sovrack/agent:latest
```

---

## 🔍 Commandes Utiles & Supervision

Vérifier le statut du service :
```bash
sudo systemctl status sovrack-agent
```

Consulter les journaux en direct :
```bash
sudo journalctl -u sovrack-agent -f
```

Redémarrer l'agent :
```bash
sudo systemctl restart sovrack-agent
```

---

## 🛡️ Sécurité & Permissions

- **Chiffrement de bout en bout** : Toutes les communications utilisent TLS 1.3 avec validation de certificat X.509.
- **Authentification forte** : Chaque requête WebSocket présente un Bearer Token unique généré lors de la déclaration du serveur dans Sovrack.
- **Isolation des commandes** : L'agent exécute les commandes dans un contexte d'exécution supervisé avec timeout automatique de 30 minutes par tâche.
