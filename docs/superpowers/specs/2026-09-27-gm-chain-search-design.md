# Recherche de chaînes sur `/gm`

## Objectif

Permettre de retrouver une chaîne dans la grille GM sans modifier les actions GM ou l'état du wallet. Le filtre inclut les chaînes utilisables et celles affichées « Coming Soon » (choix explicite de l'utilisateur).

## Interface et comportement

- Ajouter un champ de recherche visible au-dessus de la grille de cartes dans `GmPageClient`, qu'un wallet soit connecté ou non.
- Filtrer immédiatement les cartes par nom ou clé de chaîne, sans distinction de casse et en ignorant les espaces en début/fin de requête. Une requête vide restaure toutes les cartes ; le filtre ne modifie pas l'ordre d'origine.
- Conserver les états et les boutons de chaque carte sans les altérer ; afficher « No chains found » si aucune carte ne correspond. Libellé du champ : « Search chains » ; placeholder : « Search chains... » (langue de la page).
- La recherche est locale aux chaînes de `/gm`, sans appel réseau, navigation ni persistance.

## Architecture

- Calculer l'ensemble affichable à partir de `GM_CHAINS` ayant une factory active et de `SOON_CHAINS`, exactement comme le rendu existant.
- Conserver la requête dans un état local de `GmPageClient` et utiliser le même filtre pour les branches authentifiée et non authentifiée ; ne pas dupliquer la logique de correspondance.
- Ne pas intégrer `ChainSelector` : ce composant sert à la sélection multiple de chaînes pour un autre flux, tandis que `/gm` demande seulement un filtrage visuel.

## Cas limites et vérification

- Nom et clé recherchables, casse insensible, espaces extérieurs ignorés, requête vide et aucun résultat.
- Les chaînes « Coming Soon » restent recherchables dans les deux états d'authentification.
- Tester la logique de filtrage et vérifier que le rendu initial ainsi que les actions GM ne changent pas. Typecheck et tests web ciblés ; aucune opération on-chain ni déploiement dans cette tâche.
