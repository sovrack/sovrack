# Inventaire cookies et consentement

Sovrack utilise deux cookies strictement nécessaires :

| Cookie | Hôte | But | Durée maximale | JavaScript |
|---|---|---|---:|---|
| `deploy_automation_token` | `app.sovrack.com` | session client | 24 h | inaccessible (`HttpOnly`) |
| `deploy_staff_token` | `staff.sovrack.com` | session back-office | 12 h | inaccessible (`HttpOnly`) |

Ils sont `Secure`, `HttpOnly`, `SameSite=Lax` côté client et `SameSite=Strict`
côté staff. Aucun attribut `Domain` n'est défini. Le choix de thème et la langue
sont des préférences stockées dans `localStorage`, pas des cookies.

Tant qu'aucun traceur publicitaire, outil analytics non essentiel ou contenu
tiers ne dépose de cookie, une bannière « Accepter/Refuser » n'apporte pas de
choix réel. La bonne pratique est une information claire dans la politique de
confidentialité. Si un outil non essentiel est ajouté, il devra être bloqué par
défaut et une CMP devra recueillir le consentement avant son chargement. Ce
document est un inventaire technique et ne remplace pas la validation juridique.
