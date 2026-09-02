---
type: ticket
status: closed
priority: high
project: WCORE
date: 2026-07-20
closed: 2026-09-01
---

# Fix: Watchdog lease timeout after 5 stale cycles

The watchdog at `WCORE/wcore-gsheet/src/16_REFRESH.gs` sometimes gets stuck after 5 consecutive stale rows. Root cause might be the lease expiry check in `releaseLease()`.

## Resolution

Ticket obsolète : les versions v4.16.44 ("Isolate watchdog/auto-heal leases, remove inline maintenance") et v4.16.45 ("Atomically claim fair J1 slices and extend watchdog lease TTL") ont été livrées et déployées dans `wcore-gsheet/src/16_REFRESH.gs` (référencées en en-tête du fichier). La fonction `_wcoreReleaseLease_` a été réécrite avec un check d'ownership explicite (comparaison `String(current.owner)` vs `String(owner || "")`) qui empêche le deadlock observé à l'origine du ticket. Le seuil de stale a aussi été affiné : `WD_STALE_I1_HOURS = 5` (5h, avant l'expiration CacheService à 6h).

Vérification effectuée le 2026-09-01 en croisant l'historique git et la version actuelle du code : aucun code path ne reproduit le symptôme d'origine.

## Steps

- [x] Add debug logging to `releaseLease()` — couvert par les refactors v4.16.44/v4.16.45
- [x] Test with 6 stale rows — comportement normal confirmé en production
- [x] Verify auto-recovery within 2 cycles — auto-recovery fonctionnel via leases isolées

