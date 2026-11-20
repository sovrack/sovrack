# Documentation Officielle Sovrack

Bienvenue dans le centre de documentation unifié de **Sovrack**, la plateforme opencore de déploiement et d'exploitation applicative sur vos propres serveurs.

---

## 📂 Structure documentaire

Tous les documents d'architecture, de déploiement, de sécurité et d'exploitation du projet sont centralisés ici :

```text
docs/
├── architecture/
│   ├── overview.md                  # Architecture globale multi-hôtes et modèle v3
│   ├── cookie-inventory.md          # Inventaire et politique des cookies host-only
│   └── workspace-authorization.md   # Modèle de permissions et isolation Personal vs Org
├── deployment/
│   ├── host-provisioning.md         # Préparation d'un hôte Ubuntu vierge via Ansible
│   ├── host-hardening.md            # Durcissement sécurité système, UFW, fail2ban
│   ├── runner-hardening.md          # Isolation des exécuteurs de build Docker
│   ├── production-checklist.md      # Liste de contrôle pré-production
│   └── release-runbook.md           # Procédure de release et mise en production
├── guides/
│   ├── local-acceptance.md          # Guide de recette et tests locaux
│   ├── migration.md                 # Guides de migration de base de données
│   └── staging-vm.md                # Configuration de la VM de staging locale (VMware)
└── README.md                        # Cet index
```

---

## 🚀 Démarrage rapide

- **Architecture générale** : Lire [architecture/overview.md](file:///D:/Workspace/deploy-automation/sovrack/docs/architecture/overview.md).
- **Préparer un serveur** : Suivre [deployment/host-provisioning.md](file:///D:/Workspace/deploy-automation/sovrack/docs/deployment/host-provisioning.md).
- **Environnement de test staging** : Consulter [guides/staging-vm.md](file:///D:/Workspace/deploy-automation/sovrack/docs/guides/staging-vm.md).
