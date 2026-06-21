# Mobile UI Audit — WCORE Web

> **Historical/completed design.** Kept for implementation history only; verify current UI behavior before acting on it.

**Date** : 2026-05-18
**Version** : v0.2.10
**Objectif** : WCORE utilisable sur mobile au quotidien, sans perdre la qualité desktop

---

## Contexte

Le projet WCORE Web est desktop-first. Les pages data (WalletContent, History, Leaderboard) utilisent `w-full` sans max-width. La navigation repose sur une sidebar fixe 200px et un TopBar avec 5-6 éléments. Aucun composant n'a de hook de détection de taille d'écran — tout est délégué à Tailwind.

**Problèmes bloquants identifiés** :
1. SidebarLayout : sidebar fixe 200px sur écran 375px → contenu illisible (175px restants)
2. TopBar : 6 éléments compressés sans wrapping → overflow horizontal
3. NotificationsBell : panel `w-80` (320px) fixe → dépasse sur iPhone SE
4. TokenTable : colonnes 15% = ~50px sur mobile → valeurs illisibles

**Principe directeur** : aucun changement de rendu desktop. Tous les changements sont gardés par des breakpoints Tailwind (`sm:`, `md:`, `hidden sm:block`).

---

## Architecture

### Phase 1 : 4 fixes critiques (6 fichiers)

#### 1. SidebarLayout → Drawer mobile

**Fichiers** : `SidebarLayout.tsx`, `Sidebar.tsx`, `TopBar.tsx`

**État actuel** :
```tsx
// SidebarLayout.tsx — valeurs réelles
<aside className={`fixed left-0 top-0 bottom-0 z-20 ${collapsed ? 'w-[56px]' : 'w-[200px]'}`}>
<main className={`ml-[${collapsed ? '56px' : '200px'}]`}>
```

**Changement** :
- Ajouter un state `sidebarOpen` (boolean) dans `SidebarLayout`
- Sidebar mobile : `fixed inset-y-0 left-0 z-40 w-[200px] -translate-x-full transition-transform duration-200 sm:translate-x-0`
- Overlay : `fixed inset-0 bg-black/50 z-30 sm:hidden` visible quand `sidebarOpen=true`, clic ferme
- Contenu mobile : `ml-0 sm:ml-[200px]` (collapsed : `sm:ml-[56px]`)
- Le state `sidebarOpen` n'est utilisé que sur mobile — sur desktop (`sm:`) la sidebar est toujours visible via CSS
- Passer `onMenuToggle` au TopBar pour ouvrir/fermer depuis le hamburger

**Sidebar.tsx** :
- Ajouter un bouton `×` en haut à droite, visible uniquement sur mobile (`sm:hidden`)
- Le bouton appelle `onClose` (prop optionnelle, noop sur desktop)

**TopBar.tsx** :
- Ajouter une prop `onMenuToggle?: () => void`
- Bouton hamburger `☰` à gauche : `sm:hidden p-2` — appelle `onMenuToggle`
- Éléments actuels : GM et X restent visibles sur `sm:`, Settings et Notifications dans un menu overflow `⋮` sur mobile

#### 2. TopBar compact

**Fichier** : `TopBar.tsx`

**État actuel** :
```tsx
<header className="sticky top-0 z-30 h-12 px-4 flex items-center justify-between">
  <GmButton /> <XLink /> <SettingsBar /> <ConnectButton />
</header>
```

**Changement** :
- Structure mobile (`sm:hidden`) : `[☰ hamburger] [logo WCORE centré] [⋮ menu]`
- Structure desktop (`sm:flex`) : `[GM] [X] [Settings] [Notifications] [ConnectButton]` — layout actuel
- Menu overflow mobile : state `mobileMenuOpen` (boolean), dropdown `absolute right-0 top-10 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl` avec Settings (currency + lang) + NotificationsBell
- Le menu se ferme au clic sur un élément ou en dehors
- Desktop : aucun changement, le menu overflow n'existe pas (`sm:hidden`)

#### 3. NotificationsBell adaptatif

**Fichier** : `NotificationsBell.tsx`

**État actuel** :
```tsx
<div className="absolute right-0 mt-2 w-80 ...">
```

**Changement** :
- Panel : `w-80` → `w-80 max-w-[calc(100vw-1rem)]`
- Sur mobile très étroit (< 340px), le panel prend toute la largeur disponible moins 1rem de marge
- Pas de changement sur desktop (max-w non atteint)

#### 4. Tables optimisées

**Fichiers** : `TokenTable.tsx`, `WalletContent.tsx`

**État actuel** :
```tsx
// TokenTable.tsx
<table className="table-fixed w-full">
  <th className="w-[55%]">Token</th>
  <th className="w-[15%]">Name</th>
  <th className="w-[15%]">Balance</th>
  <th className="w-[15%]">Value</th>
</table>
```

**Changement** :
- Colonne "Name" : `<td className="hidden sm:table-cell">` + `<th className="hidden sm:table-cell">`
- Colonne "Contract" (si présente) : idem `hidden sm:table-cell`
- Colonne "Token" (Symbol) : reprend l'espace libéré sur mobile
- Le `overflow-x-auto` du parent reste pour les cas extrêmes
- Dans WalletContent : dropdown filtrage `w-52` → `w-52 max-w-[calc(100vw-2rem)]`, input recherche `w-36 sm:w-48`

### Phase 2 : Pages P0 (4 fichiers)

**HomePageClient.tsx** :
- Vérifier que le bouton "Scan" ne se retrouve pas isolé sur mobile
- Ajouter `min-h-[44px]` sur le bouton pour le tap target

**WalletContent.tsx** :
- Tabs navigation : vérifier `flex-wrap` pour éviter l'overflow
- ValueDistribution : `w-28` → `w-20 sm:w-28` sur mobile
- ChainCards : `space-y-4` déjà OK

**GmPageClient.tsx** :
- Boutons "Say GM" / "GM Done" : ajouter `min-h-[44px]` pour tap target
- Grille déjà responsive ✅

### Phase 3 : Pages P1 (5 fichiers)

**ProfileClient.tsx** :
- Sous-composants à auditer : LinkedWallets, CustomTokens, RecentScans
- Ajouter `sm:` sur padding et font-size si absent

**ScansClient.tsx** :
- Cartes de scan : ajouter `sm:` sur padding et text-size
- Adresses tronquées : déjà `truncate` ✅

### Phase 4 : Pages P2 (vérification)

8 pages à vérifier rapidement : Pricing, Stats, Leaderboard, Support, About, Admin, Creator, Dev/Deploy. Probablement rien à faire car les `page.tsx` parents gèrent déjà le grid responsive.

---

## Contraintes

- **Desktop inchangé** : tous les changements gardés par `sm:` ou `hidden sm:block`
- **Pas de hook JS** pour la taille d'écran — tout en CSS Tailwind
- **Tap targets** : min 44px de hauteur sur les boutons interactifs mobile
- **Dropdowns** : jamais plus larges que `calc(100vw - 1rem)`
- **Tables** : colonnes secondaires masquables, jamais de données critiques cachées

---

## Risques

| Risque | Mitigation |
|--------|-----------|
| Régression visuelle desktop | Tester chaque composant à ≥1024px après changement |
| Sidebar state désync sur resize | Le CSS `sm:` gère la visibilité, le state ne sert qu'à l'overlay mobile |
| Dropdowns qui dépassent à droite | `max-w-[calc(100vw-1rem)]` + `right-0` sur tous les dropdowns |
| Tables illisibles sur mobile | Colonnes Symbol/Balance/Value toujours visibles, Name/Contract masquables |

---

## Métriques de succès

- [ ] Sidebar ne bloque pas le contenu sur < 640px
- [ ] TopBar sans overflow horizontal sur 375px
- [ ] Notifications panel visible entièrement sur 320px
- [ ] TokenTable : Symbol/Balance/Value lisibles sans scroll horizontal sur 375px
- [ ] Desktop (≥1024px) : rendu identique à avant
- [ ] Tous les boutons interactifs ≥ 44px de hauteur sur mobile
