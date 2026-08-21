# Phase 1 — vérité produit et exposition des fonctionnalités

## Objectif

Tant que Sovrack est en développement privé, aucune surface publique ne doit
transformer une fonctionnalité partielle, simulée ou seulement modélisée en
promesse produit.

La source de vérité exécutable est
`src/shared/config/product-capabilities.ts`. Une capacité `beta` peut être
utilisée dans les tests privés. Une capacité `planned` ne doit pas ouvrir un
parcours utilisateur ni être présentée comme disponible.

## Décisions de cette phase

- Le contenu marketing, la documentation publique et les tarifs historiques
  restent dans le code pour leur réécriture ultérieure, mais ne sont plus
  rendus.
- La souscription en libre-service est masquée de la navigation et sa route est
  neutralisée. Le frontend ne peut donc plus appeler les mutations de
  souscription ou d'annulation depuis cette page.
- L'authentification Google est masquée tant que son parcours complet n'est pas
  configuré et testé.
- Les affirmations relatives aux serveurs managés sont retirées du formulaire
  d'inscription.
- Les capacités non livrées (Compose, previews de merge request, DNS automatisé,
  volumes, sauvegardes, webhooks sortants, Discord, jetons API personnels et
  page de statut) sont explicitement marquées `planned`.

## Limite volontaire

Ces drapeaux protègent l'exposition produit, pas la sécurité. Les permissions,
les contrôles multi-tenant et la validation des entrées restent la
responsabilité du backend et seront traités dans les phases correspondantes.

## Condition de réactivation

Une capacité ne passe de `planned` à `beta` ou `available` qu'après :

1. un parcours fonctionnel complet ;
2. des tests automatisés et un test d'acceptation sur infrastructure jetable ;
3. des états d'erreur et de reprise explicites ;
4. une documentation fidèle à l'implémentation ;
5. une décision produit explicite sur son niveau de support.
