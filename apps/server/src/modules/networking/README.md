# networking/

CRUD de configuration réseau : `domains/` (Domain → DnsRecord), `proxy/`
(ProxyRule), `ssl/` (SslCertificate). Ces sous-modules exposent des endpoints
REST classiques pour créer/lister/modifier/supprimer ces enregistrements.

**Ce module ne fait PAS l'orchestration automatique domaine → Traefik →
SSL au déploiement.** Cette logique vit dans `deployments/core/` :

- `deployments/core/deploy-routing.service.ts` — décide, au moment d'un
  déploiement, quelles routes doivent exister pour le service/environnement
  concerné et écrit la configuration cible.
- `deployments/core/traefik-route.service.ts` — traduit cette configuration
  en fichiers de règles Traefik (provider-fichier) posés sur le serveur cible,
  déclenchant l'émission automatique de certificats Let's Encrypt via
  l'intégration ACME de Traefik.

`networking/` est le CRUD de vérité pour ce qui existe (quels domaines, quelles
règles proxy, quels certificats), mais c'est `deployments/core/` qui décide
QUAND et COMMENT ces enregistrements se traduisent en routage HTTPS réel sur
un serveur.
