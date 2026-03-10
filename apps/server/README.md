# 🚀 DevOps Platform — Backend

Plateforme web interne permettant à tout développeur de déployer
une application sur un VPS en quelques clics.

## 🛠️ Stack technique

- **Runtime** : Node.js v20
- **Framework** : NestJS 11 (TypeScript)
- **Base de données** : PostgreSQL 16
- **ORM** : TypeORM
- **Auth** : JWT + Passport
- **Temps réel** : WebSocket (Socket.io)

## ⚙️ Installation

### Prérequis

- Node.js v20+
- PostgreSQL 16
- NestJS CLI v11

### Cloner le projet

git clone https://gitlab.com/internal-devops-platform/devops-platform-backend.git
cd devops-platform-backend

### Installer les dépendances

npm install

### Configurer l'environnement

Copier le fichier `.env.example` et le remplir :
cp .env.example .env

### Variables d'environnement

DB_HOST=localhost
DB_PORT=5432
DB_USER=devops_platform_user
DB_PASSWORD=your_password
DB_NAME=devops_platform
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=24h

### Lancer en développement

npm run start:dev

## 📁 Structure du projet

src/
├── auth/ → Authentification JWT
├── users/ → Gestion des utilisateurs
├── projects/ → Gestion des projets
├── deployments/ → Gestion des déploiements
└── app.module.ts → Module principal

## 🗺️ Sprints

| Sprint | Objectif                | Statut      |
| ------ | ----------------------- | ----------- |
| S1     | Setup + Auth            | 🔄 En cours |
| S2     | CRUD Projets            | ⏳ À venir  |
| S3     | Intégration GitLab      | ⏳ À venir  |
| S4     | Déploiement + WebSocket | ⏳ À venir  |
| S5     | Config + Variables      | ⏳ À venir  |
| S6     | Rollback + Finalisation | ⏳ À venir  |

## 👤 Auteur

Projet de stage DevOps/Fullstack
