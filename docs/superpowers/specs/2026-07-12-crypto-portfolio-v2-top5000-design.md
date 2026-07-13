# Portefeuille Crypto V2 Top5000 Design

## Objectif

`Portefeuille Crypto V2` est le portefeuille crypto automatisé principal, aligné avec le fonctionnement de `Portefeuille Action`, tout en conservant les spécificités crypto utiles de l'ancien `Portefeuille Crypto`.

Statut migration live 2026-07-13 : les onglets legacy `Portefeuille Crypto` et `Portefeuille Crypto Details` ont été supprimés après audit des dépendances externes. Les seules références restantes avant suppression étaient internes à ces deux onglets legacy.

## Source principale

- L'API WCORE alimente `Portefeuille Crypto V2!A:E` avec le Top 5000 crypto par CMC Rank.
- Les lignes API couvrent les rangs `1..5000`.
- Le refresh suit le modèle de `Portefeuille Action` : checkbox `A1`, statut `B1`, trigger horaire, fonction de réparation des formules.

## Lignes manuelles 5002

- `Portefeuille Crypto Details V2!C:C` est la source des symboles détenus ou référencés hors Top 5000.
- Tout symbole présent dans `Details V2` mais absent du Top 5000 est ajouté dans `Portefeuille Crypto V2` avec `CMC Rank = 5002`.
- Ces lignes ne doivent pas influencer artificiellement la borne de rang `J1`.
- Prix : dérivé de `Portefeuille Crypto Details V2!D:D` quand possible, sinon laissé à `0`/fallback explicite selon la disponibilité. `K:K` est une quantité et ne doit pas être utilisé comme prix.
- Market cap : `0`.
- Nom : symbole si aucun nom fiable n'est disponible.

## J1 et cible Strat

`J1` n'est pas une borne manuelle arbitraire. Elle doit représenter le CMC Rank maximum nécessaire pour respecter la valeur cible définie dans `Strat!F18`.

La formule `E1` doit dépendre de `J1`, pas de `F1`, afin que la valeur couverte reflète la borne calculée effective. Cette règle vaut pour `Portefeuille Crypto V2` et pour `Portefeuille Action`.

Le calcul doit :

- considérer les actifs par ordre de CMC Rank ;
- exclure les lignes `Exclude = 1` ;
- inclure les lignes `Include = 1`, même si leur rang est supérieur à la borne naturelle ;
- tenir compte de la position des inclusions et exclusions ;
- trouver la plus petite borne de CMC Rank qui permet de respecter la cible `Strat!F18` ;
- ne pas laisser les lignes `5002` déplacer la borne, sauf pour leur présence effective dans les calculs d'allocation si elles sont détenues ou forcées.

## Détails V2

`Portefeuille Crypto Details V2` est une copie câblée sur V2 :

- rang/prix lus depuis `Portefeuille Crypto V2` ;
- réconciliation lue depuis `Portefeuille Crypto V2!G:G` ;
- `Portefeuille Crypto V2!G:G` lit les soldes depuis `Portefeuille Crypto Details V2`.

## Colonnes à droite

`A:T` reste harmonisé avec `Portefeuille Action`. Les colonnes à droite reprennent les blocs crypto utiles de l'ancien `Portefeuille Crypto`, adaptés au mapping V2 et à `Details V2`.

Les plages doivent rester finies, avec une hauteur standard `6012`, jamais en colonnes infinies pour les formats conditionnels.

## Graphique

Le graphique de l'ancien `Portefeuille Crypto` est recréé sur `Portefeuille Crypto V2` avec les plages adaptées aux colonnes V2.

Le graphique doit rester positionné à droite, sans modifier `Portefeuille Action`.

## Contraintes

- Ne pas toucher à la mise en forme de `Portefeuille Action`.
- Ne pas masquer automatiquement la colonne `T` dans V2.
- Utiliser des plages finies pour formats et règles conditionnelles, cible `6012` lignes.
- Après déploiement GAS, l'auto-heal devra être relancé manuellement via Apps Script si nécessaire, car `clasp run` est indisponible dans ce projet.

## Vérification

- API retourne 5000 lignes classées.
- V2 contient Top 5000 + lignes `5002` issues de `Details V2`.
- `J1` correspond à la borne calculée pour `Strat!F18`.
- `G` de V2 lit `Details V2`.
- `Details V2` lit V2.
- Les règles conditionnelles et formats ne dépassent pas `6012` lignes.
- Graphique présent et alimenté par V2.
