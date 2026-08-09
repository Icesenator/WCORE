---
type: raw
status: distilled
project: web
date: 2026-07-22
---

# Bridge Citrea - constats bruts du 22 juillet 2026

Objectif utilisateur observe : obtenir du cBTC natif sur Citrea, principalement pour disposer du gas. La recherche d'un bridge par chaine ou par protocole peut facilement detourner de cet objectif : une route Base vers Citrea visible dans Stargate proposait CTR, mais CTR reste CTR apres le bridge et ne devient pas du cBTC.

Citrea utilise cBTC comme monnaie native. Il n'existe donc pas de contrat ERC-20 cBTC a selectionner comme token de destination. Le token enveloppe correspondant est wcBTC. Le bridge canonique Clementine convertit BTC vers cBTC, mais uniquement par depots fixes de 10 BTC. Pour les montants inferieurs, la documentation Citrea renvoie vers Atomiq et Symbiosis.

Stargate documente une option Gas on Destination, niveau Medium, donnant environ 2,50 USD de gas natif sur Citrea. Cette option ne doit jamais etre supposee disponible : il faut verifier que l'interface et le devis de la route precise annoncent explicitement le gas de destination avant de signer. Sans ce refuel, bridger CTR vers Citrea laisse l'utilisateur avec du CTR mais potentiellement aucun cBTC pour effectuer le swap CTR vers cBTC.

Le CTR officiel sur Base peut etre achete sur Aerodrome. Le contrat officiel Base est 0x11030f79109269d796fd0fb956d6244e502757f7. Sur Citrea, le contrat CTR est 0x547AfD93B9c47D552059FEb556909e017f8a9b25. Une fois CTR arrive sur Citrea et un peu de cBTC disponible pour le gas, CTR peut etre echange contre cBTC via le swap officiel Citrea ou Satsuma.

Le futur bridge WCORE ne doit pas seulement presenter un protocole ou une chaine de destination. Il doit partir de l'actif final voulu, distinguer l'actif transfere du gas natif recu, afficher la route complete et empecher une execution qui aboutit a un actif intermediaire inutilisable faute de gas.

Ces disponibilites et devis sont dynamiques. Toutes les routes doivent etre redemandees au fournisseur au moment de l'utilisation et ne doivent pas etre codees comme garanties permanentes.
