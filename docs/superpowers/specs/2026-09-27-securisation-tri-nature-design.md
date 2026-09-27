# Sécurisation — tri décroissant et nature des flux

## Objectif

Corriger l'onglet `Sécurisation` du classeur `Invest 2.0` : les besoins et les sources doivent être affichés et utilisés par la cascade dans l'ordre décroissant de leur montant. Une colonne `Nature` indique le canal réel du besoin ou de la source. Le plan d'exécution reste indicatif et ne déclenche aucun virement.

## Situation observée

Les besoins visibles sont dans un ordre fixe : RealT, Bricks, Actions, Crypto, Report S + T, Fortuneo, alors que Fortuneo est actuellement le plus gros besoin. Les treize comptes internes sont triés, mais `Caisse d'Épargne`, aujourd'hui la plus grosse source, est ajoutée à la fin. La matrice et le plan reprennent ces ordres et allouent donc dans le mauvais ordre. Le modèle financier présente encore des besoins non couverts : ce travail ne prétend pas le réconcilier.

## Conception retenue

1. Conserver les formules de montants existantes et les calculs d'origine. Construire un ordre dynamique par montant numérique décroissant pour **tous** les besoins actifs et **toutes** les sources, y compris `Caisse d'Épargne`. Les égalités conservent un ordre stable et documenté ; aucune approximation d'affichage à deux décimales ne sert de clé de tri.
2. Les lignes visibles des deux tableaux suivent cet ordre. Les en-têtes et les besoins de la matrice reprennent les lignes ordonnées, et les sources de la matrice suivent l'ordre des sources visibles. Le plan compact découle exclusivement de la matrice. Une ligne vide ou à zéro ne devient pas un ordre de transfert.
3. Ajouter une colonne `Nature` distincte du champ `Origine / détail du calcul` pour les besoins et les sources. Valeurs : `on-chain`, `bancaire`, `CEX`, `à préciser`. Classification certaine : RealT = `on-chain`, Bricks = `bancaire`, Fortuneo = `bancaire`, Caisse d'Épargne = `bancaire`, comptes CEX (y compris Bitpanda Fiat) = `CEX`, wallets Ledger, UniSwap, Layer3, Binance Web3 Wallet et Seeker = `on-chain`. Pour les besoins génériques Actions, Crypto et Report S + T, utiliser `à préciser` tant que le compte de destination n'est pas identifié ; ne pas inférer le canal à partir du nom de la stratégie.
4. Ne pas transformer automatiquement `à préciser` en compte ou en chemin de virement. Garder la séparation explicite RealT/Bricks et la distinction entre source bancaire et solde chez un dépositaire.

## Vérification et sécurité

- Avant/après : capturer les formules et les totaux du bloc concerné. Après mise à jour, vérifier la monotonie décroissante des valeurs brutes des deux tableaux, l'unicité des lignes ordonnées et la propagation exacte de cet ordre à la matrice et au plan.
- Contrôler les cas de montants égaux, zéros, changement de session et variation du rang de Caisse d'Épargne. Vérifier que les montants, le total de chaque côté et les détails d'origine demeurent cohérents sans `#REF!`, `#VALUE!` ni double comptage.
- Ne modifier ni `Budget` ni `Strat`, ne lancer aucun transfert réel. Le plan reste marqué **PARTIEL — ne pas exécuter** tant que ses besoins ne sont pas intégralement couverts et que ses flux financiers ne sont pas réconciliés ; un tri réussi ne vaut pas validation des virements.
