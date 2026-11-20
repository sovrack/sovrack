# Guide de l'Environnement de Staging Local (VMware)

Ce guide détaille la mise en route et l'utilisation de la machine virtuelle Ubuntu locale comme environnement de staging pour Sovrack, avant déploiement sur VPS de production.

---

## 1. Caractéristiques de la VM Staging

| Propriété | Valeur |
| :--- | :--- |
| **Hyperviseur** | VMware Workstation / VMware Player |
| **Système d'exploitation** | Ubuntu 22.04 LTS (x86_64) |
| **Adresse IP locale** | `192.168.100.135` |
| **Port SSH** | `22` |
| **Utilisateur standard** | `ubuntu` |
| **Mot de passe initial** | `ubuntu` (avec privilèges `sudo`) |
| **Mémoire vive (RAM)** | 4 Go |
| **Disque alloué** | 10 Go (LVM) |

---

## 2. Préparation du système sur la VM

Connectez-vous en SSH à la VM :

```bash
ssh ubuntu@192.168.100.135
# Mot de passe : ubuntu
```

### 2.1. Mise en place du fichier Swap (2 Go)

Pour éviter tout incident OOM (*Out Of Memory*) lors des builds Docker :

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 2.2. Installation de Docker et Docker Compose

```bash
# Mise à jour et paquets de base
sudo apt-get update && sudo apt-get install -y ca-certificates curl gnupg lsb-release

# Ajout du dépôt officiel Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Installation du moteur Docker
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Ajout de l'utilisateur ubuntu au groupe docker
sudo usermod -aG docker ubuntu
```

---

## 3. Connexion du serveur dans Sovrack

1. Accédez à votre tableau de bord Sovrack local : `http://localhost:3000/dashboard`.
2. Cliquez sur l'onglet **Serveurs** dans le menu latéral.
3. Cliquez sur **Ajouter un serveur**.
4. Renseignez les informations de la VM :
   - **Nom** : `vm-staging-local`
   - **Adresse IP / Hôte** : `192.168.100.135`
   - **Port SSH** : `22`
   - **Utilisateur SSH** : `ubuntu`
   - **Authentification** : Clé privée SSH (générée dans Sovrack) ou mot de passe temporaire `ubuntu`.
5. Validez pour lancer le test de connectivité Docker.

---

## 4. Workflow de validation avant VPS de production

```text
[Développement Local] ──> [Tests Unitaires (58 suites / 307 tests)]
                              │
                              ▼
                     [Staging VM 192.168.100.135]
                     (Validation SSH, agent Docker, déploiement conteneur)
                              │
                              ▼
                     [VPS Production OVH / Hetzner]
                     (Déploiement final avec domaine public & TLS Let's Encrypt)
```
